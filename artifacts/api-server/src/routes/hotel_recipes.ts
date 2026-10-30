import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { calculateRecipeCost, type RecipeUnit } from "../lib/hotel-recipe-cost.js";

const router: IRouter = Router();
const uuid = z.string().uuid();
const recipeInput = z.object({
  title: z.string().trim().min(1).max(200),
  menuItemId: uuid.nullable().optional(),
  instructions: z.string().max(15000).optional(),
  portions: z.number().int().positive().max(100000),
  preparationMinutes: z.number().int().nonnegative().optional(),
  allergens: z.array(z.string().min(1).max(80)).max(30).default([]),
  ingredients: z.array(z.object({
    productId: uuid,
    quantityGross: z.number().positive(),
    quantityUnit: z.enum(["g","kg","ml","l","un"]),
    yieldFactor: z.number().positive().max(1).default(1),
  }).strict()).min(1).max(100),
}).strict();

function authorized(req: Express.Request, tenantId: string) {
  const u = req.user;
  return Boolean(u?.sub && u?.tenantId === tenantId && u?.actorType !== "ai" && u?.actorType !== "system");
}
function editor(req: Express.Request) {
  const u = req.user;
  return u?.platformRole === "tenant_admin" || u?.userFunction === "administrador" || u?.role === "admin";
}

router.get("/tenants/:tenantId/hotelaria/receitas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const result = await client.query(
      "SELECT id, menu_item_id, title, yield_quantity, yield_unit, status, allergens, updated_at FROM hotel_recipe_cards WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT 100",
      [tenantId]);
    await client.query("COMMIT");
    return res.json(result.rows);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[hotel-recipes] list failed", err);
    return res.status(500).json({ error: "Failed to list recipes" });
  } finally { client.release(); }
});

router.post("/tenants/:tenantId/hotelaria/receitas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId) || !editor(req)) return res.status(403).json({ error: "Forbidden" });
  const parsed = recipeInput.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Invalid recipe", details: parsed.error.issues });
  const client = await pool.connect();
  const recipeId = crypto.randomUUID();
  const v = parsed.data;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const products = [...new Set(v.ingredients.map(i => i.productId))];
    if (products.length !== v.ingredients.length) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Repeated ingredient; aggregate quantities first" });
    }
    const validProducts = await client.query(
      "SELECT id FROM produtos_catalogo WHERE tenant_id=$1 AND id=ANY($2::text[])",
      [tenantId, products]);
    if (validProducts.rowCount !== products.length) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Unknown ingredient product" });
    }
    await client.query(
      `INSERT INTO hotel_recipe_cards
      (id, tenant_id, menu_item_id, title, instructions, yield_quantity, yield_unit, preparation_minutes, allergens)
      VALUES ($1,$2,$3,$4,$5,$6,'porcao',$7,$8)`,
      [recipeId, tenantId, v.menuItemId ?? null, v.title, v.instructions ?? null,
        v.portions, v.preparationMinutes ?? null, v.allergens]);
    for (const i of v.ingredients) {
      await client.query(
        `INSERT INTO hotel_recipe_ingredients
        (id, tenant_id, recipe_id, product_id, quantity_gross, quantity_unit, yield_factor)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [crypto.randomUUID(), tenantId, recipeId, i.productId, i.quantityGross, i.quantityUnit, i.yieldFactor]);
    }
    await client.query("COMMIT");
    return res.status(201).json({ id: recipeId, status: "draft" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[hotel-recipes] create failed", err);
    return res.status(500).json({ error: "Failed to create recipe" });
  } finally { client.release(); }
});

router.get("/tenants/:tenantId/hotelaria/receitas/:id/custo", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const recipeId = String(req.params.id);
  if (!uuid.safeParse(recipeId).success) return res.status(422).json({ error: "Invalid recipe id" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const cards = await client.query(
      "SELECT yield_quantity, status FROM hotel_recipe_cards WHERE tenant_id=$1 AND id=$2",
      [tenantId, recipeId]);
    if (!cards.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Recipe not found" });
    }
    const result = await client.query(
      `SELECT i.product_id, i.quantity_gross, i.quantity_unit, i.yield_factor,
         c.purchase_quantity, c.unit AS purchase_unit, c.total_cost AS purchase_total_cost
       FROM hotel_recipe_ingredients i
       LEFT JOIN LATERAL (
          SELECT purchase_quantity, unit, total_cost
          FROM hotel_ingredient_costs
          WHERE tenant_id=i.tenant_id AND product_id=i.product_id
            AND effective_at <= now()
          ORDER BY effective_at DESC, created_at DESC, id DESC LIMIT 1
       ) c ON TRUE
       WHERE i.tenant_id=$1 AND i.recipe_id=$2
       ORDER BY i.id`,
      [tenantId, recipeId]);
    await client.query("COMMIT");
    if (result.rows.length === 0) return res.status(422).json({ error: "Recipe has no ingredients" });
    const missing = result.rows.filter(r => r.purchase_quantity === null).map(r => r.product_id);
    if (missing.length) return res.status(422).json({ error: "Missing acquisition costs", productIds: missing });
    try {
      const calculated = calculateRecipeCost(result.rows.map(r => ({
        productId: r.product_id,
        quantityGross: Number(r.quantity_gross),
        quantityUnit: r.quantity_unit as RecipeUnit,
        yieldFactor: Number(r.yield_factor),
        purchaseQuantity: Number(r.purchase_quantity),
        purchaseUnit: r.purchase_unit as RecipeUnit,
        purchaseTotalCost: Number(r.purchase_total_cost),
      })), Number(cards.rows[0].yield_quantity));
      return res.json({ recipeId, currency: "BRL", ...calculated });
    } catch (e) {
      return res.status(422).json({ error: "Unusable ingredient cost or unit conversion", detail: String(e) });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[hotel-recipes] cost failed", err);
    return res.status(500).json({ error: "Failed to calculate recipe cost" });
  } finally { client.release(); }
});

export default router;
