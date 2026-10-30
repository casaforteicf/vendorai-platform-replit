import {Router,type IRouter} from "express";
import {pool} from "@workspace/db";
import {z} from "zod/v4";
import {sendJarvisEmail} from "../services/jarvis-email-provider.js";
import {sendDirectWhatsAppMessage} from "../services/omnichannel.js";
const router:IRouter=Router();
const input=z.object({channel:z.enum(["email","whatsapp"])}).strict();
router.post("/tenants/:tenantId/hotelaria/cotacoes/:quoteId/enviar",async(req,res)=>{
 const tenantId=String(req.params.tenantId),quoteId=String(req.params.quoteId),user=req.user;
 if(!user?.sub||user.tenantId!==tenantId||user.actorType==="ai"||user.actorType==="system"||
 !(user.platformRole==="tenant_admin"||user.role==="admin"||user.userFunction==="administrador"))
  return res.status(403).json({error:"Forbidden"});
 const parsed=input.safeParse(req.body);
 if(!parsed.success||!z.string().uuid().safeParse(quoteId).success)
  return res.status(422).json({error:"Invalid quote or channel"});
 const channel=parsed.data.channel;
 const client=await pool.connect();
 let deliveryId:string, destination:string, subject:string, message:string;
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const quote=await client.query(
   `SELECT q.id,q.status,s.nome,s.email,s.telefone,
      w.period_start,w.period_end,w.id AS request_id
    FROM hotel_weekly_supplier_quotes q
    JOIN fornecedores s ON s.id=q.supplier_id AND s.tenant_id=q.tenant_id AND s.ativo=true
    JOIN hotel_weekly_purchase_requests w ON w.id=q.request_id AND w.tenant_id=q.tenant_id
    WHERE q.tenant_id=$1 AND q.id=$2 AND w.status='reviewed' FOR UPDATE OF q`,[tenantId,quoteId]);
  if(!quote.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Reviewed quote not found"});}
  const row=quote.rows[0];
  if(row.status!=="selected"){await client.query("ROLLBACK");return res.status(409).json({error:"Quote has already been processed"});}
  destination=String(channel==="email"?row.email??"":row.telefone??"").trim();
  if(channel==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination) ||
     channel==="whatsapp"&&destination.replace(/\D/g,"").length<10){
    await client.query("ROLLBACK");return res.status(422).json({error:"Supplier lacks valid contact for selected channel"});
  }
  const lines=await client.query(
   `SELECT p.nome,l.quantity_suggested,l.unit FROM hotel_weekly_purchase_request_lines l
    JOIN produtos_catalogo p ON p.id=l.product_id AND p.tenant_id=l.tenant_id
    WHERE l.tenant_id=$1 AND l.request_id=$2 AND l.quantity_suggested>0
    ORDER BY p.nome`,[tenantId,row.request_id]);
  if(!lines.rowCount){await client.query("ROLLBACK");return res.status(422).json({error:"No missing stock to quote"});}
  subject="Cotação de insumos - hotelaria";
  message="Solicitação de cotação de insumos\nPeríodo: "+String(row.period_start).slice(0,10)+" a "+String(row.period_end).slice(0,10)+"\n"+lines.rows.map(p=>"- "+p.nome+": "+p.quantity_suggested+" "+p.unit).join("\n")+"\nInforme preços, prazos e condições de fornecimento.";
  deliveryId=crypto.randomUUID();
  await client.query(
   "INSERT INTO hotel_supplier_quote_deliveries(id,tenant_id,quote_id,channel,destination,status) VALUES($1,$2,$3,$4,$5,'pending')",
   [deliveryId,tenantId,quoteId,channel,destination]);
  await client.query("UPDATE hotel_weekly_supplier_quotes SET status='sending' WHERE tenant_id=$1 AND id=$2",
    [tenantId,quoteId]);
  await client.query("COMMIT");
 }catch(error){
  await client.query("ROLLBACK");console.error("[hotel-quotation] prepare",error);
  return res.status(500).json({error:"Could not prepare supplier dispatch"});
 }finally{client.release();}
 try{
  let providerId:string|null=null;
  if(channel==="email"){
   providerId=(await sendJarvisEmail({to:destination!,subject:subject!,body:message!})).id;
  }else{
   const logger={info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}} as any;
   providerId=(await sendDirectWhatsAppMessage(tenantId,destination!,message!,logger))??null;
   // Evolution API completes successfully without returning an external message ID.
  }
  await pool.query("UPDATE hotel_weekly_supplier_quotes SET status='invited',invited_at=now() WHERE id=$1 AND tenant_id=$2",[quoteId,tenantId]);
  await pool.query(
   "UPDATE hotel_supplier_quote_deliveries SET status='sent',provider_message_id=$1,finished_at=now() WHERE id=$2 AND tenant_id=$3",
   [providerId,deliveryId!,tenantId]);
  return res.status(201).json({deliveryId:deliveryId!,status:"sent",providerId});
 }catch(error){
  const reason=error instanceof Error?error.message:"Dispatch failed";
  await pool.query(
   "UPDATE hotel_supplier_quote_deliveries SET status='failed',error_message=$1,finished_at=now() WHERE id=$2 AND tenant_id=$3",
   [reason,deliveryId!,tenantId]);
  await pool.query("UPDATE hotel_weekly_supplier_quotes SET status='selected',invited_at=NULL WHERE id=$1 AND tenant_id=$2",
   [quoteId,tenantId]);
  return res.status(502).json({error:"Supplier dispatch failed",deliveryId:deliveryId!,status:"failed"});
 }
});
export default router;
