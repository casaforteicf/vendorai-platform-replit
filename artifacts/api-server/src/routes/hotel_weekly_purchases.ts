import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { forecastIngredientDemand, compareDemandWithStock } from "../lib/hotel-meal-planning.js";

const router: IRouter = Router();
const input = z.object({
  start: z.iso.date(), end: z.iso.date(), locationId: z.string().uuid(),
}).strict();

router.post("/tenants/:tenantId/hotelaria/compras/semanais", async (req,res) => {
  const tenantId = String(req.params.tenantId);
  const user = req.user;
  if (!user?.sub || user.tenantId !== tenantId ||
      !["tenant_admin","super_admin"].includes(user.platformRole))
    return res.status(403).json({error:"Forbidden"});
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({error:"Invalid period or location"});
  const {start,end,locationId}=parsed.data;
  const days=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000;
  if (!Number.isInteger(days) || days<0 || days>6)
    return res.status(422).json({error:"Select a period of up to seven days"});
  const client=await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const loc=await client.query("SELECT id FROM hotel_stock_locations WHERE tenant_id=$1 AND id=$2 AND active=true",[tenantId,locationId]);
    if (!loc.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({error:"Stock location not found"}); }
    const forecasts=await client.query(
      "SELECT id FROM hotel_meal_forecasts WHERE tenant_id=$1 AND service_date BETWEEN $2::date AND $3::date",[tenantId,start,end]);
    if (!forecasts.rowCount) { await client.query("ROLLBACK"); return res.status(422).json({error:"No forecasts for period"}); }
    const recipes=await client.query(
      `SELECT l.forecast_id,l.recipe_id,l.planned_portions,r.status,r.yield_quantity
       FROM hotel_meal_plan_lines l JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id
       JOIN hotel_meal_forecasts f ON f.tenant_id=l.tenant_id AND f.id=l.forecast_id
       WHERE l.tenant_id=$1 AND f.service_date BETWEEN $2::date AND $3::date`,[tenantId,start,end]);
    if (!recipes.rowCount || recipes.rows.some(r=>r.status!=="approved")) {
      await client.query("ROLLBACK"); return res.status(422).json({error:"Unapproved or missing recipes"});
    }
    const ingredients=await client.query(
      `SELECT l.forecast_id,l.recipe_id,l.planned_portions,r.yield_quantity,
              i.product_id,i.quantity_gross,i.quantity_unit
       FROM hotel_meal_plan_lines l
       JOIN hotel_meal_forecasts f ON f.tenant_id=l.tenant_id AND f.id=l.forecast_id
       JOIN hotel_recipe_cards r ON r.tenant_id=l.tenant_id AND r.id=l.recipe_id
       JOIN hotel_recipe_ingredients i ON i.tenant_id=l.tenant_id AND i.recipe_id=l.recipe_id
       WHERE l.tenant_id=$1 AND f.service_date BETWEEN $2::date AND $3::date`,[tenantId,start,end]);
    const covered=new Set(ingredients.rows.map(r=>r.forecast_id+":"+r.recipe_id));
    if (recipes.rows.some(r=>Number(r.planned_portions)>0&&!covered.has(r.forecast_id+":"+r.recipe_id))) {
      await client.query("ROLLBACK");return res.status(422).json({error:"Recipe without ingredients"});
    }
    const stock=await client.query(
      `SELECT inv.produto_id AS product_id,inv.id AS item_id,inv.unidade AS unit,b.quantity
       FROM inventory_items inv JOIN hotel_stock_location_balances b
       ON b.tenant_id=inv.tenant_id AND b.inventory_item_id=inv.id
       WHERE inv.tenant_id=$1 AND b.location_id=$2`,[tenantId,locationId]);
    const demand=forecastIngredientDemand(ingredients.rows.map(r=>({
      productId:r.product_id,grossQuantityPerBatch:Number(r.quantity_gross),
      batchPortions:Number(r.yield_quantity),plannedPortions:Number(r.planned_portions),unit:r.quantity_unit,
    })));
    if (!demand.length) {await client.query("ROLLBACK");return res.status(422).json({error:"No ingredient demand"});}
    const lines=compareDemandWithStock(demand,stock.rows.map(r=>({
      productId:r.product_id,itemId:r.item_id,unit:r.unit,quantity:Number(r.quantity),
    })));
    if (lines.some(x=>x.status!=="ready")) {
      await client.query("ROLLBACK");
      return res.status(422).json({error:"Stock reconciliation required",lines});
    }
    const id=crypto.randomUUID();
    await client.query(
      "INSERT INTO hotel_weekly_purchase_requests(id,tenant_id,location_id,period_start,period_end,requested_by) VALUES($1,$2,$3,$4,$5,$6)",
      [id,tenantId,locationId,start,end,user.sub]);
    for (const line of lines) {
      await client.query(
        `INSERT INTO hotel_weekly_purchase_request_lines
         (id,tenant_id,request_id,product_id,unit,quantity_required,quantity_available,quantity_suggested)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
         [crypto.randomUUID(),tenantId,id,line.productId,line.unit,line.required,line.available,line.suggested]);
    }
    await client.query("COMMIT");
    return res.status(201).json({id,status:"draft",orderCreated:false,lines});
  } catch(e) {
    await client.query("ROLLBACK");
    console.error("[hotel-purchases] weekly request",e);
    return res.status(500).json({error:"Could not generate weekly request"});
  } finally {client.release();}
});

export default router;
