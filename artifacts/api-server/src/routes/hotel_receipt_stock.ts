import {Router,type IRouter} from "express";
import {pool} from "@workspace/db";
import {z} from "zod/v4";
const router:IRouter=Router();
router.post("/tenants/:tenantId/hotelaria/compras/recebimentos/:eventId/entrada-estoque",async(req,res)=>{
 const tenantId=String(req.params.tenantId),eventId=String(req.params.eventId),u=req.user;
 if(!u?.sub||u.tenantId!==tenantId||u.actorType==="ai"||u.actorType==="system"||
 !(u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador"))
  return res.status(403).json({error:"Forbidden"});
 if(!z.string().uuid().safeParse(eventId).success)return res.status(422).json({error:"Invalid receipt event"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const receipt=await client.query(
   `SELECT e.id,e.received_quantity,l.product_id,l.unit,o.status,w.location_id
    FROM hotel_purchase_receipt_events e
    JOIN hotel_purchase_order_lines l ON l.tenant_id=e.tenant_id AND l.id=e.order_line_id
    JOIN hotel_purchase_orders o ON o.tenant_id=l.tenant_id AND o.id=l.order_id
    JOIN hotel_weekly_purchase_requests w ON w.tenant_id=o.tenant_id AND w.id=o.request_id
    WHERE e.tenant_id=$1 AND e.id=$2
    FOR UPDATE OF e`,[tenantId,eventId]);
  if(!receipt.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Receipt not found"});}
  const row=receipt.rows[0];
  if(!["received","partially_received"].includes(row.status)){
   await client.query("ROLLBACK");return res.status(409).json({error:"Receipt must belong to a received order"});
  }
  const posted=await client.query(
   "SELECT id FROM hotel_purchase_receipt_stock_posts WHERE tenant_id=$1 AND receipt_event_id=$2",[tenantId,eventId]);
  if(posted.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Receipt already posted to stock"});}
  const items=await client.query(
   `SELECT id,unidade FROM inventory_items
    WHERE tenant_id=$1 AND produto_id=$2 FOR UPDATE`,[tenantId,row.product_id]);
  if(items.rowCount!==1){await client.query("ROLLBACK");return res.status(422).json({error:"Inventory item mapping must be unique"});}
  const item=items.rows[0];
  const normalize=(v:string)=>v==="kg"?"g":v==="l"?"ml":v;
  const factor=(v:string)=>v==="kg"||v==="l"?1000:1;
  if(normalize(item.unidade)!==row.unit){
   await client.query("ROLLBACK");return res.status(422).json({error:"Incompatible inventory unit"});
  }
  const quantity=Number(row.received_quantity)/factor(item.unidade);
  if(!Number.isFinite(quantity)||quantity<=0||Number(quantity.toFixed(4))!==quantity){
   await client.query("ROLLBACK");return res.status(422).json({error:"Quantity conversion precision unsupported"});
  }
  await client.query(
   `INSERT INTO hotel_purchase_receipt_stock_posts
    (id,tenant_id,receipt_event_id,location_id,inventory_item_id,quantity,posted_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(),tenantId,eventId,row.location_id,item.id,quantity,u.sub]);
  await client.query(
   `INSERT INTO hotel_stock_location_balances(tenant_id,location_id,inventory_item_id,quantity)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(tenant_id,location_id,inventory_item_id)
    DO UPDATE SET quantity=hotel_stock_location_balances.quantity+EXCLUDED.quantity,updated_at=now()`,
    [tenantId,row.location_id,item.id,quantity]);
  await client.query("COMMIT");
  return res.json({receiptEventId:eventId,posted:true,locationId:row.location_id,inventoryItemId:item.id,quantity,unit:item.unidade});
 }catch(error){
  await client.query("ROLLBACK");console.error("[hotel-receipts] stock posting",error);
  return res.status(500).json({error:"Unable to post receipt to stock"});
 }finally{client.release();}
});
export default router;
