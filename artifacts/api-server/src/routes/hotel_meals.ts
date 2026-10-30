import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { forecastIngredientDemand, compareDemandWithStock, type MealPlanIngredient } from "../lib/hotel-meal-planning.js";
const router: IRouter = Router();
const uuid = z.string().uuid();
const forecastInput = z.object({
  serviceDate: z.iso.date(),
  mealType: z.enum(["breakfast","morning_snack","lunch","afternoon_snack","dinner"]),
  serviceTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
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
      "SELECT id, service_date, meal_type, service_time, guest_count, staff_meals, source_type FROM hotel_meal_forecasts WHERE tenant_id=$1 ORDER BY service_date DESC LIMIT 100",
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
      "INSERT INTO hotel_meal_forecasts(id,tenant_id,service_date,meal_type,guest_count,staff_meals,source_type,service_time) VALUES($1,$2,$3,$4,$5,$6,'manual',$7)",
      [id,tenantId,v.serviceDate,v.mealType,v.guestCount,v.staffMeals,v.serviceTime ?? null]);
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

router.get("/tenants/:tenantId/hotelaria/refeicoes/previsoes/:id/faltas", async (req,res) => {
  const tenantId = String(req.params.tenantId), id = String(req.params.id);
  const locationId = String(req.query.locationId ?? "");
  if (!authorized(req,tenantId)) return res.status(403).json({error:"Forbidden"});
  if (!uuid.safeParse(id).success || !uuid.safeParse(locationId).success)
    return res.status(422).json({error:"Valid forecast and stock location IDs required"});
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const location = await client.query(
      "SELECT id FROM hotel_stock_locations WHERE tenant_id=$1 AND id=$2 AND active=true",
      [tenantId,locationId]);
    const forecast = await client.query(
      "SELECT id FROM hotel_meal_forecasts WHERE tenant_id=$1 AND id=$2",[tenantId,id]);
    if (!location.rowCount || !forecast.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({error:"Forecast or location not found"});
    }
    const ingredients = await client.query(
      `SELECT l.planned_portions, r.yield_quantity, i.product_id, i.quantity_gross, i.quantity_unit
       FROM hotel_meal_plan_lines l
       JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id AND r.status='approved'
       JOIN hotel_recipe_ingredients i ON i.tenant_id=l.tenant_id AND i.recipe_id=l.recipe_id
       WHERE l.tenant_id=$1 AND l.forecast_id=$2`,[tenantId,id]);
    const physical = await client.query(
      `SELECT inv.produto_id AS product_id, inv.id AS item_id, inv.unidade AS unit,
         b.quantity
       FROM inventory_items inv
       JOIN hotel_stock_location_balances b
         ON b.tenant_id=inv.tenant_id AND b.inventory_item_id=inv.id
       WHERE inv.tenant_id=$1 AND b.location_id=$2`,[tenantId,locationId]);
    await client.query("COMMIT");
    const demand = forecastIngredientDemand(ingredients.rows.map(r=>({
      productId:r.product_id, grossQuantityPerBatch:Number(r.quantity_gross),
      batchPortions:Number(r.yield_quantity), plannedPortions:Number(r.planned_portions),
      unit:r.quantity_unit,
    })));
    const comparison = compareDemandWithStock(demand,physical.rows.map(r=>({
      productId:r.product_id,itemId:r.item_id,unit:r.unit,quantity:Number(r.quantity),
    })));
    return res.json({
      forecastId:id,locationId,lines:comparison,
      complete:comparison.every(c=>c.status==="ready"),
      purchaseSuggestionsCreated:false,
      notice:"Only reconciled stock at the requested location is considered. Unmapped items cannot generate automatic shortages.",
    });
  } catch(e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] shortages",e);
    return res.status(500).json({error:"Could not compare ingredient stock"});
  } finally { client.release(); }
});

const suggestionInput = z.object({ locationId: uuid }).strict();
router.post("/tenants/:tenantId/hotelaria/refeicoes/previsoes/:id/sugestoes", async (req,res) => {
  const tenantId=String(req.params.tenantId), forecastId=String(req.params.id);
  if (!authorized(req,tenantId) || !editor(req)) return res.status(403).json({error:"Forbidden"});
  if (!uuid.safeParse(forecastId).success) return res.status(422).json({error:"Invalid forecast ID"});
  const parsed=suggestionInput.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({error:"Valid stock location required"});
  const locationId=parsed.data.locationId;
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const forecast=await client.query("SELECT id FROM hotel_meal_forecasts WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[tenantId,forecastId]);
    const location=await client.query("SELECT id FROM hotel_stock_locations WHERE tenant_id=$1 AND id=$2 AND active=true",[tenantId,locationId]);
    if (!forecast.rowCount || !location.rowCount) {
      await client.query("ROLLBACK"); return res.status(404).json({error:"Forecast or location not found"});
    }
    const existing=await client.query("SELECT id FROM hotel_purchase_suggestions WHERE tenant_id=$1 AND forecast_id=$2 AND location_id=$3",[tenantId,forecastId,locationId]);
    if (existing.rowCount) {
      await client.query("ROLLBACK"); return res.status(409).json({error:"Suggestion already exists for this forecast and location"});
    }
    const recipeLines=await client.query(
      `SELECT l.planned_portions,r.yield_quantity,i.product_id,i.quantity_gross,i.quantity_unit
       FROM hotel_meal_plan_lines l
       JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id AND r.status='approved'
       JOIN hotel_recipe_ingredients i ON i.tenant_id=l.tenant_id AND i.recipe_id=l.recipe_id
       WHERE l.tenant_id=$1 AND l.forecast_id=$2`,[tenantId,forecastId]);
    const physical=await client.query(
      `SELECT inv.produto_id AS product_id,inv.id AS item_id,inv.unidade AS unit,b.quantity
       FROM inventory_items inv JOIN hotel_stock_location_balances b
        ON b.tenant_id=inv.tenant_id AND b.inventory_item_id=inv.id
       WHERE inv.tenant_id=$1 AND b.location_id=$2`,[tenantId,locationId]);
    const demand=forecastIngredientDemand(recipeLines.rows.map(r=>({
      productId:r.product_id,grossQuantityPerBatch:Number(r.quantity_gross),
      batchPortions:Number(r.yield_quantity),plannedPortions:Number(r.planned_portions),unit:r.quantity_unit,
    })));
    if (!demand.length) {
      await client.query("ROLLBACK"); return res.status(422).json({error:"No approved recipe ingredients in forecast"});
    }
    const comparison=compareDemandWithStock(demand,physical.rows.map(r=>({
      productId:r.product_id,itemId:r.item_id,unit:r.unit,quantity:Number(r.quantity),
    })));
    if (comparison.some(r=>r.status!=="ready")) {
      await client.query("ROLLBACK");
      return res.status(422).json({error:"Unreconciled inventory; suggestion not created",lines:comparison});
    }
    const id=crypto.randomUUID();
    await client.query("INSERT INTO hotel_purchase_suggestions(id,tenant_id,forecast_id,location_id) VALUES ($1,$2,$3,$4)",
      [id,tenantId,forecastId,locationId]);
    for (const line of comparison) {
      await client.query(
        `INSERT INTO hotel_purchase_suggestion_lines
         (id,tenant_id,suggestion_id,product_id,quantity_required,quantity_available,quantity_suggested,unit)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [crypto.randomUUID(),tenantId,id,line.productId,line.required,line.available,line.suggested,line.unit]);
    }
    await client.query("COMMIT");
    return res.status(201).json({id,status:"draft",lines:comparison,orderCreated:false});
  } catch(e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] suggestion create",e);
    return res.status(500).json({error:"Could not create purchase suggestion"});
  } finally { client.release(); }
});
router.post("/tenants/:tenantId/hotelaria/compras/sugestoes/:id/revisar", async (req,res) => {
  const tenantId=String(req.params.tenantId), id=String(req.params.id);
  if (!authorized(req,tenantId) || !editor(req)) return res.status(403).json({error:"Forbidden"});
  if (!uuid.safeParse(id).success) return res.status(422).json({error:"Invalid suggestion ID"});
  const parsed=z.object({decision:z.enum(["reviewed","dismissed"])}).strict().safeParse(req.body);
  if (!parsed.success) return res.status(422).json({error:"Invalid decision"});
  const actorId=req.user?.sub;
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const updated=await client.query(
      `UPDATE hotel_purchase_suggestions SET status=$3,reviewed_by=$4,reviewed_at=now()
       WHERE tenant_id=$1 AND id=$2 AND status='draft'
        AND EXISTS (SELECT 1 FROM users WHERE tenant_id=$1 AND id=$4 AND active=true)
       RETURNING id,status,reviewed_at`,
      [tenantId,id,parsed.data.decision,actorId]);
    if (!updated.rowCount) {
      await client.query("ROLLBACK"); return res.status(409).json({error:"Suggestion is not reviewable"});
    }
    await client.query("COMMIT");
    return res.json({...updated.rows[0],orderCreated:false});
  } catch(e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] suggestion review",e);
    return res.status(500).json({error:"Could not review suggestion"});
  } finally { client.release(); }
});


const periodSchema = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
}).strict();

router.get("/tenants/:tenantId/hotelaria/refeicoes/consolidado", async (req,res) => {
  const tenantId=String(req.params.tenantId);
  if (!authorized(req,tenantId)) return res.status(403).json({error:"Forbidden"});
  const parsed=periodSchema.safeParse({start:req.query.start,end:req.query.end});
  if (!parsed.success) return res.status(422).json({error:"Use start/end as ISO dates"});
  const {start,end}=parsed.data;
  const dayDiff=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000;
  if (!Number.isInteger(dayDiff) || dayDiff<0 || dayDiff>6)
    return res.status(422).json({error:"Period must span 1 to 7 days"});
  const client=await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const forecasts=await client.query(
      `SELECT f.id, to_char(f.service_date,'YYYY-MM-DD') AS service_date,
       f.meal_type, f.guest_count, f.staff_meals
       FROM hotel_meal_forecasts f
       WHERE f.tenant_id=$1 AND f.service_date BETWEEN $2::date AND $3::date
       ORDER BY f.service_date,f.meal_type`,[tenantId,start,end]);
    const recipes=await client.query(
      `SELECT f.id AS forecast_id, l.recipe_id, l.planned_portions,
       r.status AS recipe_status,r.yield_quantity
       FROM hotel_meal_forecasts f
       JOIN hotel_meal_plan_lines l ON l.tenant_id=f.tenant_id AND l.forecast_id=f.id
       JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id
       WHERE f.tenant_id=$1 AND f.service_date BETWEEN $2::date AND $3::date`,
      [tenantId,start,end]);
    const ingredients=await client.query(
      `SELECT f.id AS forecast_id,l.recipe_id,l.planned_portions,
       r.yield_quantity,i.product_id,i.quantity_gross,i.quantity_unit
       FROM hotel_meal_forecasts f
       JOIN hotel_meal_plan_lines l ON l.tenant_id=f.tenant_id AND l.forecast_id=f.id
       JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id
       JOIN hotel_recipe_ingredients i ON i.tenant_id=l.tenant_id AND i.recipe_id=l.recipe_id
       WHERE f.tenant_id=$1 AND f.service_date BETWEEN $2::date AND $3::date`,
      [tenantId,start,end]);
    await client.query("COMMIT");
    if (recipes.rows.some(r=>r.recipe_status!=="approved"))
      return res.status(409).json({error:"Planned recipe no longer approved; review the meal plan"});
    const withIngredients=new Set(ingredients.rows.map(r=>r.forecast_id+":"+r.recipe_id));
    if (recipes.rows.some(r=>Number(r.planned_portions)>0 && !withIngredients.has(r.forecast_id+":"+r.recipe_id)))
      return res.status(422).json({error:"Planned recipe is missing ingredients"});
    const lines: MealPlanIngredient[]=ingredients.rows.map(r=>({
      productId:r.product_id,grossQuantityPerBatch:Number(r.quantity_gross),
      batchPortions:Number(r.yield_quantity),plannedPortions:Number(r.planned_portions),
      unit:r.quantity_unit,
    }));
    const demand=forecastIngredientDemand(lines);
    return res.json({
      start,end,forecasts:forecasts.rows,demand,
      occupancySource:"recorded_forecasts",
      stockDeducted:false,purchaseOrderCreated:false,
      notice:"Demand is consolidated across meals and dates. Physical stock must be deducted only once for the selected planning period.",
    });
  } catch(e) {
    await client.query("ROLLBACK"); console.error("[hotel-meals] consolidated forecast",e);
    return res.status(500).json({error:"Could not consolidate meal plans"});
  } finally { client.release(); }
});

export default router;
