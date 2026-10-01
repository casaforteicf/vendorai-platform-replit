import { Router, type IRouter } from "express";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { vendorPool } from "../lib/vendorDb";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}
function actorId(req: Express.Request) {
  const user = (req as any).user;
  return String(user?.id || user?.sub || "") || null;
}
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function secureEqual(a: string, b: string) {
  const aa=Buffer.from(a),bb=Buffer.from(b); return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function unique<T>(items:T[]){ return [...new Set(items)]; }

async function loadPolicy(tenantId:string){
  const q=await vendorPool.query(`SELECT * FROM vendor_shield_validation_policies WHERE tenant_id=$1`,[tenantId]);
  if(q.rowCount) return q.rows[0];
  return {
    enabled:true,first_purchase_otp:true,first_purchase_3ds_over_centavos:150000,
    high_value_centavos:300000,high_value_require_otp:true,high_value_require_3ds:true,
    selfie_risk_threshold:70,document_risk_threshold:76,manual_review_threshold:76,block_threshold:90,
    require_address_confirmation:true,require_terms_acceptance:true,validation_ttl_minutes:30,
  };
}

router.post("/tenants/:tenantId/praca-orders/:orderId/purchase-validation/start",async(req,res)=>{
  const tenantId=String(req.params.tenantId),orderId=String(req.params.orderId);
  if(!canAccess(req,tenantId)) return res.status(403).json({error:"Forbidden"});
  const [orderQ,policy,assessmentQ]=await Promise.all([
    vendorPool.query(`SELECT id,total_centavos,cliente_id,cliente_documento,cliente_email,cliente_whatsapp,endereco_entrega,status
      FROM praca_pedidos WHERE tenant_id=$1 AND id=$2`,[tenantId,orderId]),
    loadPolicy(tenantId),
    vendorPool.query(`SELECT id,score,risk_level,decision,reasons,signals FROM vendor_shield_assessments
      WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC LIMIT 1`,[tenantId,orderId]),
  ]);
  if(!orderQ.rowCount)return res.status(404).json({error:"Pedido não encontrado."});
  const order=orderQ.rows[0];
  if(!policy.enabled)return res.json({required:false,status:"disabled"});

  const priorQ=await vendorPool.query(`SELECT count(*)::int total FROM praca_pedidos
    WHERE tenant_id=$1 AND id<>$2 AND status IN ('pago','em_separacao','pronto_coleta','coleta_agendada','coletado','em_rota','entregue')
      AND (($3::text IS NOT NULL AND cliente_id=$3) OR ($4::text IS NOT NULL AND cliente_documento=$4))`,
    [tenantId,orderId,order.cliente_id||null,order.cliente_documento||null]);
  const firstPurchase=Number(priorQ.rows[0]?.total||0)===0;
  const score=Number(assessmentQ.rows[0]?.score||0);
  const riskLevel=assessmentQ.rows[0]?.risk_level||"low";
  const highValue=Number(order.total_centavos)>=Number(policy.high_value_centavos);
  const methods:string[]=[];
  if(policy.require_terms_acceptance)methods.push("terms");
  if(policy.require_address_confirmation)methods.push("address_confirmation");
  if(firstPurchase&&policy.first_purchase_otp)methods.push("otp");
  if(firstPurchase&&Number(order.total_centavos)>=Number(policy.first_purchase_3ds_over_centavos))methods.push("3ds");
  if(highValue&&policy.high_value_require_otp)methods.push("otp");
  if(highValue&&policy.high_value_require_3ds)methods.push("3ds");
  if(score>=Number(policy.selfie_risk_threshold))methods.push("selfie");
  if(score>=Number(policy.document_risk_threshold))methods.push("identity_document");
  if(score>=Number(policy.manual_review_threshold))methods.push("manual_review");
  const requiredMethods=unique(methods);
  const immediateReject=score>=Number(policy.block_threshold)||assessmentQ.rows[0]?.decision==="block";
  const expiresAt=new Date(Date.now()+Number(policy.validation_ttl_minutes)*60000);

  const client=await vendorPool.connect();
  try{
    await client.query("BEGIN");
    const existing=await client.query(`SELECT id,status,required_methods AS "requiredMethods",expires_at AS "expiresAt"
      FROM vendor_shield_purchase_validations WHERE tenant_id=$1 AND order_id=$2 AND status IN ('pending','in_progress','manual_review')
      ORDER BY created_at DESC LIMIT 1`,[tenantId,orderId]);
    if(existing.rowCount){ await client.query("COMMIT"); return res.json({...existing.rows[0],reused:true}); }
    const inserted=await client.query(`INSERT INTO vendor_shield_purchase_validations
      (tenant_id,order_id,assessment_id,status,risk_score,risk_level,first_purchase,high_value,required_methods,reasons,context_snapshot,expires_at,rejection_reason,rejected_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,CASE WHEN $4='rejected' THEN now() ELSE NULL END)
      RETURNING id,status,risk_score AS "riskScore",risk_level AS "riskLevel",first_purchase AS "firstPurchase",high_value AS "highValue",required_methods AS "requiredMethods",expires_at AS "expiresAt"`,
      [tenantId,orderId,assessmentQ.rows[0]?.id||null,immediateReject?"rejected":requiredMethods.includes("manual_review")?"manual_review":"pending",
       score,riskLevel,firstPurchase,highValue,requiredMethods,JSON.stringify(assessmentQ.rows[0]?.reasons||[]),
       JSON.stringify({amountCentavos:Number(order.total_centavos),signals:assessmentQ.rows[0]?.signals||{},paymentStatus:order.status}),expiresAt,
       immediateReject?"Bloqueado pela política de risco do Vendor Shield.":null]);
    const validation=inserted.rows[0];
    for(const method of requiredMethods){
      await client.query(`INSERT INTO vendor_shield_validation_steps (tenant_id,validation_id,order_id,method,status,expires_at)
        VALUES ($1,$2,$3,$4,'pending',$5) ON CONFLICT (validation_id,method) DO NOTHING`,[tenantId,validation.id,orderId,method,expiresAt]);
    }
    await client.query(`INSERT INTO vendor_shield_validation_events (tenant_id,validation_id,order_id,event_type,actor_id,metadata)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,[tenantId,validation.id,orderId,immediateReject?"validation_rejected":"validation_created",actorId(req),JSON.stringify({requiredMethods,score,firstPurchase,highValue})]);
    await client.query("COMMIT");
    return res.status(201).json({required:requiredMethods.length>0,...validation});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
});

router.post("/tenants/:tenantId/purchase-validations/:validationId/otp/send",async(req,res)=>{
  const tenantId=String(req.params.tenantId),validationId=String(req.params.validationId);
  if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const q=await vendorPool.query(`SELECT v.order_id,o.cliente_whatsapp,o.cliente_email,s.id step_id,s.attempts,s.max_attempts,v.expires_at
    FROM vendor_shield_purchase_validations v JOIN praca_pedidos o ON o.id=v.order_id AND o.tenant_id=v.tenant_id
    JOIN vendor_shield_validation_steps s ON s.validation_id=v.id AND s.method='otp'
    WHERE v.tenant_id=$1 AND v.id=$2 AND v.status IN ('pending','in_progress','manual_review')`,[tenantId,validationId]);
  if(!q.rowCount)return res.status(404).json({error:"Validação OTP não encontrada."});
  const row=q.rows[0]; if(Number(row.attempts)>=Number(row.max_attempts))return res.status(429).json({error:"Limite de tentativas atingido."});
  const deliveryUrl=String(process.env.VENDOR_SHIELD_OTP_DELIVERY_WEBHOOK||"").trim();
  if(!deliveryUrl)return res.status(503).json({error:"Canal de entrega OTP ainda não configurado."});
  const code=String(randomInt(100000,1000000));
  const challengeHash=sha256(`${validationId}:${code}:${process.env.VENDOR_SHIELD_OTP_SECRET||"vendor-shield"}`);
  const channel=req.body?.channel==="email"?"email":"whatsapp";
  const destination=channel==="email"?row.cliente_email:row.cliente_whatsapp;
  if(!destination)return res.status(422).json({error:`Cliente sem ${channel} para confirmação.`});
  const providerResponse=await fetch(deliveryUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantId,validationId,orderId:row.order_id,channel,destination,code,purpose:"purchase_validation",expiresInMinutes:10})});
  if(!providerResponse.ok)return res.status(502).json({error:"Falha ao enviar código de validação."});
  await vendorPool.query(`UPDATE vendor_shield_validation_steps SET status='sent',attempts=attempts+1,challenge_hash=$1,provider='webhook',expires_at=LEAST($2,now()+interval '10 minutes'),updated_at=now() WHERE id=$3`,[challengeHash,row.expires_at,row.step_id]);
  await vendorPool.query(`INSERT INTO vendor_shield_validation_events (tenant_id,validation_id,order_id,event_type,method,actor_id,metadata) VALUES ($1,$2,$3,'otp_sent','otp',$4,$5::jsonb)`,[tenantId,validationId,row.order_id,actorId(req),JSON.stringify({channel,destinationMasked:String(destination).replace(/.(?=.{4})/g,"*")})]);
  return res.json({sent:true,channel,expiresInMinutes:10});
});

router.post("/tenants/:tenantId/purchase-validations/:validationId/steps/:method/verify",async(req,res)=>{
  const tenantId=String(req.params.tenantId),validationId=String(req.params.validationId),method=String(req.params.method);
  if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const allowed=new Set(["otp","terms","address_confirmation","3ds","selfie","identity_document","manual_review"]);
  if(!allowed.has(method))return res.status(422).json({error:"Método inválido."});
  const q=await vendorPool.query(`SELECT s.*,v.order_id,v.status validation_status,v.expires_at validation_expires
    FROM vendor_shield_validation_steps s JOIN vendor_shield_purchase_validations v ON v.id=s.validation_id
    WHERE s.tenant_id=$1 AND s.validation_id=$2 AND s.method=$3`,[tenantId,validationId,method]);
  if(!q.rowCount)return res.status(404).json({error:"Etapa não encontrada."});
  const step=q.rows[0]; if(new Date(step.validation_expires)<new Date())return res.status(410).json({error:"Validação expirada."});
  let verified=false,provider:string|null=null,providerReference:string|null=null,evidenceUrl:string|null=null,evidenceHash:string|null=null,snapshot:any={};
  if(method==="otp"){
    const code=String(req.body?.code||"");
    const actual=sha256(`${validationId}:${code}:${process.env.VENDOR_SHIELD_OTP_SECRET||"vendor-shield"}`);
    verified=Boolean(step.challenge_hash)&&secureEqual(actual,String(step.challenge_hash));
  }else if(method==="terms"||method==="address_confirmation"){
    verified=req.body?.accepted===true; snapshot={accepted:true,ip:req.ip,userAgent:req.header("user-agent")||null};
  }else if(method==="3ds"){
    verified=req.body?.authenticated===true && typeof req.body?.providerReference==="string";
    provider=typeof req.body?.provider==="string"?req.body.provider:"psp"; providerReference=req.body?.providerReference||null;
    snapshot={eci:req.body?.eci||null,liabilityShift:req.body?.liabilityShift===true};
  }else if(method==="selfie"||method==="identity_document"){
    evidenceUrl=typeof req.body?.evidenceUrl==="string"?req.body.evidenceUrl:null;
    evidenceHash=typeof req.body?.evidenceHash==="string"?req.body.evidenceHash:null;
    provider=typeof req.body?.provider==="string"?req.body.provider:null; providerReference=typeof req.body?.providerReference==="string"?req.body.providerReference:null;
    verified=req.body?.providerVerified===true || req.body?.manualVerified===true;
    snapshot={verificationType:req.body?.providerVerified===true?"provider":"manual",documentType:req.body?.documentType||null};
  }else if(method==="manual_review"){
    const user=(req as any).user; if(user?.platformRole!=="super_admin"&&user?.platformRole!=="tenant_admin"&&user?.role!=="admin")return res.status(403).json({error:"A revisão manual exige administrador."});
    verified=req.body?.approved===true; snapshot={note:typeof req.body?.note==="string"?req.body.note:null};
  }
  await vendorPool.query(`UPDATE vendor_shield_validation_steps SET status=$1,provider=coalesce($2,provider),provider_reference=coalesce($3,provider_reference),evidence_url=coalesce($4,evidence_url),evidence_hash=coalesce($5,evidence_hash),verification_snapshot=$6::jsonb,verified_by=$7,verified_at=CASE WHEN $1='verified' THEN now() ELSE verified_at END,updated_at=now() WHERE id=$8`,[verified?"verified":"failed",provider,providerReference,evidenceUrl,evidenceHash,JSON.stringify(snapshot),actorId(req),step.id]);
  await vendorPool.query(`INSERT INTO vendor_shield_validation_events (tenant_id,validation_id,order_id,event_type,method,actor_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,[tenantId,validationId,step.order_id,verified?"step_verified":"step_failed",method,actorId(req),JSON.stringify(snapshot)]);
  const all=await vendorPool.query(`SELECT method,status FROM vendor_shield_validation_steps WHERE validation_id=$1 ORDER BY method`,[validationId]);
  const requiredComplete=all.rows.every((r:any)=>r.status==="verified"||r.status==="waived");
  if(requiredComplete){
    await vendorPool.query(`UPDATE vendor_shield_purchase_validations SET status='approved',completed_methods=required_methods,approved_by=$1,approved_at=now(),updated_at=now() WHERE id=$2`,[actorId(req),validationId]);
    await vendorPool.query(`INSERT INTO vendor_shield_validation_events (tenant_id,validation_id,order_id,event_type,actor_id) VALUES ($1,$2,$3,'validation_approved',$4)`,[tenantId,validationId,step.order_id,actorId(req)]);
  }
  return res.json({verified,validationApproved:requiredComplete,steps:all.rows});
});

router.get("/tenants/:tenantId/purchase-validations",async(req,res)=>{
  const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const status=typeof req.query.status==="string"?req.query.status:null;
  const q=await vendorPool.query(`SELECT v.id,v.order_id AS "orderId",v.status,v.risk_score AS "riskScore",v.risk_level AS "riskLevel",v.first_purchase AS "firstPurchase",v.high_value AS "highValue",v.required_methods AS "requiredMethods",v.completed_methods AS "completedMethods",v.expires_at AS "expiresAt",v.created_at AS "createdAt",p.total_centavos AS "totalCentavos",p.cliente_nome AS "clienteNome" FROM vendor_shield_purchase_validations v JOIN praca_pedidos p ON p.id=v.order_id WHERE v.tenant_id=$1 AND ($2::text IS NULL OR v.status=$2) ORDER BY v.created_at DESC LIMIT 300`,[tenantId,status]);
  return res.json(q.rows);
});

export default router;