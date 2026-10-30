import {Router,type IRouter} from "express";
import {pool} from "@workspace/db";
import {z} from "zod/v4";
const router:IRouter=Router();
function permitted(req:Express.Request,tid:string){
 const u=req.user;
 return !!u?.sub&&u.tenantId===tid&&u.actorType!=="ai"&&u.actorType!=="system"&&
 (u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador");
}
router.post("/tenants/:tenantId/hotelaria/compras/semanais/:requestId/pedido",async(req,res)=>{
 const tenantId=String(req.params.tenantId),requestId=String(req.params.requestId);
 if(!permitted(req,tenantId))return res.status(403).json({error:"Forbidden"});
 if(!z.string().uuid().safeParse(requestId).success)return res.status(422).json({error:"Invalid request"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const award=await client.query(
   `SELECT a.id FROM hotel_weekly_quote_awards a
    JOIN hotel_weekly_purchase_requests w ON w.tenant_id=a.tenant_id AND w.id=a.request_id
    WHERE a.tenant_id=$1 AND a.request_id=$2 AND w.status='reviewed' FOR UPDATE OF w`,[tenantId,requestId]);
  if(!award.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Approved supplier is required"});}
  const items=await client.query(
   "SELECT product_id,unit,quantity_suggested FROM hotel_weekly_purchase_request_lines WHERE tenant_id=$1 AND request_id=$2 AND quantity_suggested>0",
   [tenantId,requestId]);
  if(!items.rowCount){await client.query("ROLLBACK");return res.status(422).json({error:"No items to order"});}
  const id=crypto.randomUUID();
  const created=await client.query(
   "INSERT INTO hotel_purchase_orders(id,tenant_id,request_id,award_id,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,request_id) DO NOTHING RETURNING id",
   [id,tenantId,requestId,award.rows[0].id,req.user?.sub]);
  if(!created.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Order already exists"});}
  for(const item of items.rows)await client.query(
   "INSERT INTO hotel_purchase_order_lines(id,tenant_id,order_id,product_id,unit,ordered_quantity) VALUES($1,$2,$3,$4,$5,$6)",
   [crypto.randomUUID(),tenantId,id,item.product_id,item.unit,item.quantity_suggested]);
  await client.query("COMMIT");
  return res.status(201).json({id,status:"draft",itemCount:items.rowCount,supplierApproved:true,externallyIssued:false,stockMoved:false});
 }catch(e){await client.query("ROLLBACK");console.error("[hotel-orders] create",e);return res.status(500).json({error:"Could not create order"});}
 finally{client.release();}
});
router.get("/tenants/:tenantId/hotelaria/compras/pedidos",async(req,res)=>{
 const tenantId=String(req.params.tenantId);
 if(!permitted(req,tenantId))return res.status(403).json({error:"Forbidden"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const rows=await client.query(
   `SELECT o.id,o.request_id,o.status,o.created_at,l.product_id,l.unit,l.ordered_quantity,l.received_quantity
    FROM hotel_purchase_orders o JOIN hotel_purchase_order_lines l ON l.tenant_id=o.tenant_id AND l.order_id=o.id
    WHERE o.tenant_id=$1 ORDER BY o.created_at DESC LIMIT 500`,[tenantId]);
  await client.query("COMMIT");
  return res.json(rows.rows);
 }catch(e){await client.query("ROLLBACK");return res.status(500).json({error:"Could not list orders"});}
 finally{client.release();}
});

router.post("/tenants/:tenantId/hotelaria/compras/pedidos/:orderId/receber",async(req,res)=>{
 const tenantId=String(req.params.tenantId),orderId=String(req.params.orderId);
 if(!permitted(req,tenantId))return res.status(403).json({error:"Forbidden"});
 const parsed=z.object({lineId:z.string().uuid(),quantity:z.number().finite().positive()}).strict().safeParse(req.body);
 if(!z.string().uuid().safeParse(orderId).success||!parsed.success)return res.status(422).json({error:"Invalid receipt"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const order=await client.query(
   "SELECT id FROM hotel_purchase_orders WHERE tenant_id=$1 AND id=$2 AND status IN ('issued','partially_received') FOR UPDATE",
   [tenantId,orderId]);
  if(!order.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Order must be issued before receiving"});}
  const updated=await client.query(
   `UPDATE hotel_purchase_order_lines SET received_quantity=received_quantity+$4
    WHERE tenant_id=$1 AND order_id=$2 AND id=$3 AND received_quantity+$4<=ordered_quantity
    RETURNING id,ordered_quantity,received_quantity`,
   [tenantId,orderId,parsed.data.lineId,parsed.data.quantity]);
  if(!updated.rowCount){await client.query("ROLLBACK");return res.status(422).json({error:"Line not found or quantity exceeds order"});}
  await client.query(
   "INSERT INTO hotel_purchase_receipt_events(id,tenant_id,order_line_id,received_quantity,recorded_by) VALUES($1,$2,$3,$4,$5)",
   [crypto.randomUUID(),tenantId,parsed.data.lineId,parsed.data.quantity,req.user?.sub]);
  const pending=await client.query(
   "SELECT count(*)::int AS pending FROM hotel_purchase_order_lines WHERE tenant_id=$1 AND order_id=$2 AND received_quantity<ordered_quantity",
   [tenantId,orderId]);
  const status=Number(pending.rows[0].pending)===0?"received":"partially_received";
  await client.query("UPDATE hotel_purchase_orders SET status=$3 WHERE tenant_id=$1 AND id=$2",[tenantId,orderId,status]);
  await client.query("COMMIT");
  return res.json({orderId,line:updated.rows[0],status,inventoryPosted:false});
 }catch(error){await client.query("ROLLBACK");console.error("[hotel-orders] receipt",error);return res.status(500).json({error:"Could not register receipt"});}
 finally{client.release();}
});

export default router;
