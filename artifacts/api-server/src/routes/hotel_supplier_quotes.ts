import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter=Router();
const ids=z.object({
 supplierIds:z.array(z.string().uuid()).min(1).max(100),
}).strict();
router.post("/tenants/:tenantId/hotelaria/compras/semanais/:id/fornecedores",async(req,res)=>{
 const tenantId=String(req.params.tenantId),requestId=String(req.params.id),u=req.user;
 if(!u?.sub||u.tenantId!==tenantId||u.actorType==="ai"||u.actorType==="system"||
   !(u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador"))
   return res.status(403).json({error:"Forbidden"});
 const parsed=ids.safeParse(req.body);
 if(!z.string().uuid().safeParse(requestId).success||!parsed.success||
    new Set(parsed.data.supplierIds).size!==parsed.data.supplierIds.length)
   return res.status(422).json({error:"Invalid supplier selection"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const request=await client.query(
   "SELECT id FROM hotel_weekly_purchase_requests WHERE tenant_id=$1 AND id=$2 AND status='reviewed' FOR UPDATE",
   [tenantId,requestId]);
  if(!request.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Review purchase request before selecting suppliers"});}
  const suppliers=await client.query(
   "SELECT id FROM fornecedores WHERE tenant_id=$1 AND ativo=true AND id=ANY($2::text[])",
   [tenantId,parsed.data.supplierIds]);
  if(suppliers.rowCount!==parsed.data.supplierIds.length){
   await client.query("ROLLBACK");return res.status(422).json({error:"One or more suppliers not available for this tenant"});
  }
  for(const supplierId of parsed.data.supplierIds) {
   await client.query(
    "INSERT INTO hotel_weekly_supplier_quotes(id,tenant_id,request_id,supplier_id,status) VALUES($1,$2,$3,$4,'selected') ON CONFLICT (tenant_id,request_id,supplier_id) DO NOTHING",
    [crypto.randomUUID(),tenantId,requestId,supplierId]);
  }
  await client.query("COMMIT");
  return res.json({requestId,selectedSuppliers:parsed.data.supplierIds.length,dispatchStatus:"not_sent",ordersCreated:0});
 }catch(error){
  await client.query("ROLLBACK");console.error("[hotel-purchases] supplier selection",error);
  return res.status(500).json({error:"Could not select suppliers"});
 }finally{client.release();}
});

router.get("/tenants/:tenantId/hotelaria/compras/semanais/:id/cotacoes",async(req,res)=>{
 const tenantId=String(req.params.tenantId),id=String(req.params.id),u=req.user;
 if(!u?.sub||u.tenantId!==tenantId||u.actorType==="ai"||u.actorType==="system")
  return res.status(403).json({error:"Forbidden"});
 if(!z.string().uuid().safeParse(id).success)return res.status(422).json({error:"Invalid request"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const request=await client.query(
   "SELECT id,status FROM hotel_weekly_purchase_requests WHERE tenant_id=$1 AND id=$2",[tenantId,id]);
  if(!request.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Not found"});}
  const quotes=await client.query(
   `SELECT q.id,q.status,q.currency,q.total_amount,q.delivery_days,q.payment_terms,
           q.responded_at,s.nome AS supplier_name
    FROM hotel_weekly_supplier_quotes q
    JOIN fornecedores s ON s.tenant_id=q.tenant_id AND s.id=q.supplier_id
    WHERE q.tenant_id=$1 AND q.request_id=$2 ORDER BY s.nome`,[tenantId,id]);
  const items=await client.query(
   "SELECT product_id,unit,quantity_suggested FROM hotel_weekly_purchase_request_lines WHERE tenant_id=$1 AND request_id=$2",
   [tenantId,id]);
  await client.query("COMMIT");
  return res.json({requestId:id,requestStatus:request.rows[0].status,items:items.rows,
   suppliers:quotes.rows,dispatchConfirmed:false,purchaseOrderCreated:false});
 }catch(error){
  await client.query("ROLLBACK");console.error("[hotel-purchases] comparisons",error);
  return res.status(500).json({error:"Could not load quote comparison"});
 }finally{client.release();}
});


router.post("/tenants/:tenantId/hotelaria/cotacoes/:quoteId/resposta",async(req,res)=>{
 const tenantId=String(req.params.tenantId),quoteId=String(req.params.quoteId),u=req.user;
 if(!u?.sub||u.tenantId!==tenantId||u.actorType==="ai"||u.actorType==="system"||
 !(u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador"))
  return res.status(403).json({error:"Forbidden"});
 const parsed=z.object({
  totalAmount:z.number().finite().positive().max(1000000000),
  deliveryDays:z.number().int().min(0).max(365),
  paymentTerms:z.string().max(500),
  notes:z.string().max(2000).optional()
 }).strict().safeParse(req.body);
 if(!parsed.success||!z.string().uuid().safeParse(quoteId).success)
  return res.status(422).json({error:"Invalid quotation response"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const result=await client.query(
   `UPDATE hotel_weekly_supplier_quotes q
    SET status='responded',total_amount=$3,delivery_days=$4,payment_terms=$5,notes=$6,responded_at=now()
    WHERE q.tenant_id=$1 AND q.id=$2 AND q.status='invited'
      AND EXISTS (SELECT 1 FROM hotel_supplier_quote_deliveries d
                  WHERE d.tenant_id=q.tenant_id AND d.quote_id=q.id AND d.status='sent')
    RETURNING q.id,q.status,q.total_amount,q.delivery_days,q.payment_terms`,
   [tenantId,quoteId,parsed.data.totalAmount,parsed.data.deliveryDays,parsed.data.paymentTerms,parsed.data.notes??null]);
  if(!result.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Quote must have a confirmed invitation before recording a response"});}
  await client.query("COMMIT");
  return res.json({...result.rows[0],recordedBy:u.sub,purchaseOrderCreated:false});
 }catch(error){
  await client.query("ROLLBACK");console.error("[hotel-purchases] quote response",error);
  return res.status(500).json({error:"Could not record supplier quote"});
 }finally{client.release();}
});

export default router;
