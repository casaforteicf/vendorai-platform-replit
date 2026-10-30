import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import pdfParse from "pdf-parse";

const router: IRouter = Router();
const schema = z.object({base64:z.string().min(1).max(7_000_000)}).strict();
router.post("/tenants/:tenantId/hotelaria/cardapios/importar-pdf", async(req,res)=>{
 const tenantId=String(req.params.tenantId),u=req.user;
 if(!u?.sub || u.tenantId!==tenantId || u.actorType==="ai" || u.actorType==="system" ||
   !(u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador"))
  return res.status(403).json({error:"Forbidden"});
 const parsed=schema.safeParse(req.body);
 if(!parsed.success)return res.status(422).json({error:"Invalid PDF payload"});
 const bytes=Buffer.from(parsed.data.base64,"base64");
 if(bytes.length>5_000_000||bytes.length<8||bytes.subarray(0,5).toString("ascii")!=="%PDF-")
  return res.status(422).json({error:"PDF inválido ou maior que 5 MB"});
 try{
  const doc=await pdfParse(bytes,{max:30});
  const text=doc.text?.trim().slice(0,100_000)??"";
  if(!text)return res.status(422).json({error:"PDF sem texto extraível; exige conferência ou OCR externo"});
  return res.json({text,pages:doc.numpages,requiresReview:true,recipesLinked:0,ordersCreated:0});
 }catch(error){
  console.error("[hotel-menus] pdf import failure",error);
  return res.status(422).json({error:"Não foi possível extrair texto do PDF"});
 }
});
export default router;
