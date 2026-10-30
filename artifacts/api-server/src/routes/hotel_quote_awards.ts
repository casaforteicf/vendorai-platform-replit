import {Router,type IRouter} from "express";
import {pool} from "@workspace/db";
import {z} from "zod/v4";
const router:IRouter=Router();
router.post("/tenants/:tenantId/hotelaria/compras/semanais/:requestId/adjudicar",async(req,res)=>{
 const tenantId=String(req.params.tenantId),requestId=String(req.params.requestId),u=req.user;
 if(!u?.sub||u.tenantId!==tenantId||u.actorType==="ai"||u.actorType==="system"||
 !(u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador"))
 return res.status(403).json({error:"Forbidden"});
 const parsed=z.object({quoteId:z.string().uuid(),notes:z.string().max(1000).optional()}).strict().safeParse(req.body);
 if(!z.string().uuid().safeParse(requestId).success||!parsed.success)return res.status(422).json({error:"Invalid approval"});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const request=await client.query(
   "SELECT id FROM hotel_weekly_purchase_requests WHERE tenant_id=$1 AND id=$2 AND status='reviewed' FOR UPDATE",
   [tenantId,requestId]);
  if(!request.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Request must be reviewed"});}
  const quote=await client.query(
   "SELECT id FROM hotel_weekly_supplier_quotes WHERE tenant_id=$1 AND request_id=$2 AND id=$3 AND status='responded' AND total_amount>0",
   [tenantId,requestId,parsed.data.quoteId]);
  if(!quote.rowCount){await client.query("ROLLBACK");return res.status(422).json({error:"Only received proposals for this request may be selected"});}
  const award=await client.query(
   "INSERT INTO hotel_weekly_quote_awards(id,tenant_id,request_id,quote_id,approved_by,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,request_id) DO NOTHING RETURNING id,quote_id,approved_at",
   [crypto.randomUUID(),tenantId,requestId,parsed.data.quoteId,u.sub,parsed.data.notes??null]);
  if(!award.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"This request already has an approved supplier"});}
  await client.query("COMMIT");
  return res.status(201).json({...award.rows[0],approvedBy:u.sub,purchaseOrderCreated:false,stockMoved:false});
 }catch(error){
  await client.query("ROLLBACK");console.error("[hotel-purchases] quote award",error);
  return res.status(500).json({error:"Could not approve supplier"});
 }finally{client.release();}
});
export default router;
