import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { forecastIngredientDemand, type MealPlanIngredient } from "../lib/hotel-meal-planning.js";
const router: IRouter = Router();
const uuid = z.string().uuid();
const forecastInput = z.object({
  serviceDate: z.iso.date(),
  mealType: z.enum(["breakfast","lunch","dinner"]),
  guestCount: z.number().int().min(0).max(100000),
  staffMeals: z.number().int().min(0).max(100000).default(0),
  recipeLines: z.array(z.object({ recipeId: uuid, plannedPortions: z.number().int().min(0).max(100000) }).strict()).min(1).max(100),
}).strict();
function authorized(req: Express.Request, tenantId: string) {
  const u = req.user;
  return !!u?.sub && u.tenantId === tenantId && u.actorType !== "ai" && u.actorType !== "system";
}
function editor(req: Express.Request) {
  const u = req.user;
  return u?.platformRole === "tenant_admin" || u?.role === "admin" || u?.userFunction === "administrador";
}
router.get("/tenants/:tenantId/hotelaria/refeicoes/previsoes", async (req,res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req,tenantId)) return res.status(403).json({error:"Forbidden"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const rows = await client.query(
      "SELECT id, service_date, meal_type, guest_count, staff_meals, source_type FROM hotel_meal_forecasts WHERE tenant_id=$1 ORDER BY service_date DESC LIMIT 100",
      [tenantId]);
    await client.query("COMMIT");
    return res.json(rows.rows);
  } catch (e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] list",e);
    return res.status(500).json({error:"Could not list forecasts"});
  } finally { client.release(); }
});
router.post("/tenants/:tenantId/hotelaria/refeicoes/previsoes", async (req,res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req,tenantId) || !editor(req)) return res.status(403).json({error:"Forbidden"});
  const parsed = forecastInput.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({error:"Invalid forecast",details:parsed.error.issues});
  const v = parsed.data;
  if (new Set(v.recipeLines.map(x=>x.recipeId)).size !== v.recipeLines.length)
    return res.status(422).json({error:"Duplicate recipes"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const ids = v.recipeLines.map(x=>x.recipeId);
    const recipes = await client.query(
      "SELECT id FROM hotel_recipe_cards WHERE tenant_id=$1 AND id=ANY($2::text[]) AND status='approved'",
      [tenantId,ids]);
    if (recipes.rowCount !== ids.length) {
      await client.query("ROLLBACK"); return res.status(422).json({error:"Only approved tenant recipes can be planned"});
    }
    const existing = await client.query(
      "SELECT id FROM hotel_meal_forecasts WHERE tenant_id=$1 AND service_date=$2 AND meal_type=$3",
      [tenantId,v.serviceDate,v.mealType]);
    if (existing.rowCount) {
      await client.query("ROLLBACK"); return res.status(409).json({error:"Forecast already exists for this meal"});
    }
    const id = crypto.randomUUID();
    await client.query(
      "INSERT INTO hotel_meal_forecasts(id,tenant_id,service_date,meal_type,guest_count,staff_meals,source_type) VALUES($1,$2,$3,$4,$5,$6,'manual')",
      [id,tenantId,v.serviceDate,v.mealType,v.guestCount,v.staffMeals]);
    for (const line of v.recipeLines) await client.query(
      "INSERT INTO hotel_meal_plan_lines(id,tenant_id,forecast_id,recipe_id,planned_portions) VALUES($1,$2,$3,$4,$5)",
      [crypto.randomUUID(),tenantId,id,line.recipeId,line.plannedPortions]);
    await client.query("COMMIT");
    return res.status(201).json({id, status:"planned"});
  } catch(e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] create",e);
    return res.status(500).json({error:"Could not create forecast"});
  } finally { client.release(); }
});
router.get("/tenants/:tenantId/hotelaria/refeicoes/previsoes/:id/demanda", async (req,res) => {
  const tenantId = String(req.params.tenantId), id = String(req.params.id);
  if (!authorized(req,tenantId)) return res.status(403).json({error:"Forbidden"});
  if (!uuid.safeParse(id).success) return res.status(422).json({error:"Invalid forecast id"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const rows = await client.query(
      `SELECT l.planned_portions, r.yield_quantity, i.product_id, i.quantity_gross, i.quantity_unit
       FROM hotel_meal_plan_lines l
       JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id AND r.status='approved'
       JOIN hotel_recipe_ingredients i ON i.tenant_id=l.tenant_id AND i.recipe_id=l.recipe_id
       WHERE l.tenant_id=$1 AND l.forecast_id=$2`,
      [tenantId,id]);
    const forecast = await client.query(
      "SELECT id FROM hotel_meal_forecasts WHERE tenant_id=$1 AND id=$2",[tenantId,id]);
    await client.query("COMMIT");
    if (!forecast.rowCount) return res.status(404).json({error:"Forecast not found"});
    const lines: MealPlanIngredient[] = rows.rows.map(r=>({
      productId:r.product_id, grossQuantityPerBatch:Number(r.quantity_gross),
      batchPortions:Number(r.yield_quantity), plannedPortions:Number(r.planned_portions),
      unit:r.quantity_unit,
    }));
    try { return res.json({forecastId:id, demand:forecastIngredientDemand(lines), purchaseSuggestionsCreated:false}); }
    catch (e) { return res.status(422).json({error:"Invalid recipe units or yields",detail:String(e)}); }
  } catch(e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] demand",e);
    return res.status(500).json({error:"Could not calculate demand"});
  } finally { client.release(); }
});
export default router;
