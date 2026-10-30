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
export default router;
