import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { vendorPool } from "../lib/vendorDb";
import { createOrendaCharge, cancelOrendaCharge, decimalFromCents, brDateFromIso, mapOrendaStatus, OrendaPayError } from "../services/orendaPay";

const router: IRouter = Router();
export const pracaOrendaPayPublicRouter: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
function cents(v:any){return Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;}
function mapBilling(v:string){return v==="PIX"?"pix":v==="BOLETO"?"boleto":v==="DEBIT_CARD"?"debit":"credit";}
function cleanCardSnapshot(body:any){
  const clone={...body};
  delete clone.cartao_numero; delete clone.cartao_codigo; delete clone.cardNumber; delete clone.cvv;
  return clone;
}
function addressFrom(body:any){
  return {
    endereco:String(body?.clienteEndereco||body?.address?.street||"").trim(),
    cidade:String(body?.clienteCidade||body?.address?.city||"").trim(),
    uf:String(body?.clienteUf||body?.address?.state||"").trim().toUpperCase(),
    cep:String(body?.clienteCep||body?.address?.postalCode||"").replace(/\D/g,"").trim(),
  };
}

router.put("/tenants/:tenantId/payment-recipients/:ownerType/:ownerId/orendapay",async(req,res)=>{
  const tenantId=String(req.params.tenantId),ownerType=String(req.params.ownerType),ownerId=String(req.params.ownerId);
  if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  if(!["seller","courier"].includes(ownerType))return res.status(422).json({error:"Tipo de beneficiário inválido."});
  const email=String(req.body?.email||"").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return res.status(422).json({error:"E-mail OrendaPay obrigatório."});
  const q=await vendorPool.query(`INSERT INTO praca_payment_recipients (tenant_id,owner_type,owner_id,provider,wallet_id,status,metadata)
    VALUES ($1,$2,$3,'orendapay',$4,'active',$5::jsonb)
    ON CONFLICT (tenant_id,provider,owner_type,owner_id) DO UPDATE SET wallet_id=excluded.wallet_id,status='active',metadata=excluded.metadata,updated_at=now()
    RETURNING id,owner_type AS "ownerType",owner_id AS "ownerId",provider,wallet_id AS email,status`,
    [tenantId,ownerType,ownerId,email,JSON.stringify(req.body?.metadata&&typeof req.body.metadata==="object"?req.body.metadata:{})]);
  return res.json(q.rows[0]);
});

router.post("/tenants/:tenantId/praca-orders/:orderId/payment-intents/orendapay",async(req,res)=>{
  const tenantId=String(req.params.tenantId),orderId=String(req.params.orderId);
  if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const idempotencyKey=String(req.header("Idempotency-Key")||req.body?.idempotencyKey||"").trim();
  const billingType=String(req.body?.billingType||"");
  const dueDate=String(req.body?.dueDate||"");
  if(!idempotencyKey)return res.status(422).json({error:"Idempotency-Key obrigatório."});
  if(!["PIX","BOLETO","CREDIT_CARD","DEBIT_CARD"].includes(billingType))return res.status(422).json({error:"Forma de pagamento inválida."});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return res.status(422).json({error:"Vencimento obrigatório."});

  const existing=await vendorPool.query(`SELECT id,status,provider_payment_id AS "providerPaymentId",invoice_url AS "invoiceUrl" FROM praca_payment_intents WHERE tenant_id=$1 AND idempotency_key=$2`,[tenantId,idempotencyKey]);
  if(existing.rowCount)return res.json({...existing.rows[0],idempotentReplay:true});

  const validationPolicy=await vendorPool.query(`SELECT enabled FROM vendor_shield_validation_policies WHERE tenant_id=$1`,[tenantId]);
  if(!validationPolicy.rowCount||validationPolicy.rows[0].enabled!==false){
    const validation=await vendorPool.query(`SELECT id,status FROM vendor_shield_purchase_validations WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC LIMIT 1`,[tenantId,orderId]);
    if(!validation.rowCount||validation.rows[0].status!=="approved"){
      return res.status(409).json({error:"PURCHASE_VALIDATION_REQUIRED",message:"Conclua a Validação Inteligente de Compra antes de cobrar.",startEndpoint:`/tenants/${tenantId}/praca-orders/${orderId}/purchase-validation/start`,validation:validation.rows[0]||null});
    }
  }

  const oq=await vendorPool.query(`SELECT p.id,p.status,p.subtotal_centavos,p.frete_centavos,p.desconto_centavos,p.total_centavos,p.moeda,
      p.modelo_logistico,p.ponto_redespacho_id,p.cliente_nome,p.cliente_documento,p.cliente_email,p.cliente_whatsapp,
      t.comissao_praca_ai_percentual FROM praca_pedidos p JOIN tenants t ON t.id=p.tenant_id WHERE p.tenant_id=$1 AND p.id=$2`,[tenantId,orderId]);
  if(!oq.rowCount)return res.status(404).json({error:"Pedido não encontrado."});
  const order=oq.rows[0];
  if(!["recebido","pagamento_pendente"].includes(order.status))return res.status(409).json({error:"O pedido não aceita nova cobrança neste status."});
  const document=String(req.body?.clienteDocumento||order.cliente_documento||"").replace(/\D/g,"");
  const email=String(req.body?.clienteEmail||order.cliente_email||"").trim();
  const name=String(order.cliente_nome||req.body?.clienteNome||"").trim();
  const addr=addressFrom(req.body);
  if(![11,14].includes(document.length)||!email||!name||!addr.endereco||!addr.cidade||addr.uf.length!==2||addr.cep.length!==8){
    return res.status(422).json({error:"OrendaPay exige nome, CPF/CNPJ, e-mail e endereço completo do pagador."});
  }

  const gross=Number(order.total_centavos),freight=Number(order.frete_centavos),commissionBase=Math.max(0,Number(order.subtotal_centavos)-Number(order.desconto_centavos));
  const commissionBps=Math.round(Number(order.comissao_praca_ai_percentual||0)*100);
  const pracaAmount=Math.round(commissionBase*commissionBps/10000),sellerAmount=gross-pracaAmount-freight;
  if([gross,freight,pracaAmount,sellerAmount].some(v=>cents(v)===null)||sellerAmount<0)return res.status(422).json({error:"Composição financeira inválida."});

  const courierSplits=Array.isArray(req.body?.courierSplits)?req.body.courierSplits.map((x:any)=>({courierId:String(x?.courierId||""),amountCentavos:Number(x?.amountCentavos),trecho:String(x?.trecho||"")})):[];
  if(freight>0&&courierSplits.reduce((s:number,x:any)=>s+Number(x.amountCentavos||0),0)!==freight)return res.status(422).json({error:"Os valores dos entregadores precisam fechar o frete."});
  const courierIds=courierSplits.map((x:any)=>x.courierId);
  const recipients=await vendorPool.query(`SELECT owner_type,owner_id,wallet_id FROM praca_payment_recipients WHERE tenant_id=$1 AND provider='orendapay' AND status='active' AND ((owner_type='seller' AND owner_id=$2) OR (owner_type='courier' AND owner_id=ANY($3::text[])))`,[tenantId,tenantId,courierIds]);
  const sellerEmail=recipients.rows.find((x:any)=>x.owner_type==="seller")?.wallet_id;
  const courierEmail=new Map(recipients.rows.filter((x:any)=>x.owner_type==="courier").map((x:any)=>[x.owner_id,x.wallet_id]));
  if(sellerAmount>0&&!sellerEmail)return res.status(422).json({error:"Cadastre o e-mail OrendaPay do vendedor antes de cobrar."});
  if(courierIds.some((id:string)=>!courierEmail.get(id)))return res.status(422).json({error:"Todos os entregadores precisam de e-mail OrendaPay ativo."});

  const callbackBase=String(process.env.PUBLIC_API_URL||"").replace(/\/$/,"");
  const callbackSecret=String(process.env.ORENDAPAY_CALLBACK_SECRET||"").trim();
  if(!callbackBase||!callbackSecret)return res.status(503).json({error:"Callback OrendaPay não configurado no servidor."});

  const splitFixo:any[]=[];
  if(sellerAmount>0)splitFixo.push({valor:decimalFromCents(sellerAmount),email:sellerEmail});
  for(const x of courierSplits) if(x.amountCentavos>0) splitFixo.push({valor:decimalFromCents(x.amountCentavos),email:courierEmail.get(x.courierId)});

  const card=billingType==="CREDIT_CARD"||billingType==="DEBIT_CARD";
  const cardNumber=String(req.body?.cartao_numero||req.body?.cardNumber||"").replace(/\D/g,"");
  const cardName=String(req.body?.cartao_nome||req.body?.cardName||"").trim();
  const cardExpiry=String(req.body?.cartao_validade||req.body?.cardExpiry||"").trim();
  const cardCvv=String(req.body?.cartao_codigo||req.body?.cvv||"").trim();
  if(card&&(!cardNumber||!cardName||!cardExpiry||!cardCvv))return res.status(422).json({error:"Dados do cartão obrigatórios. Eles serão usados somente na chamada à OrendaPay e não serão armazenados."});

  const client=await vendorPool.connect(); let intentId="";
  try{
    await client.query("BEGIN");
    const iq=await client.query(`INSERT INTO praca_payment_intents (tenant_id,order_id,provider,idempotency_key,billing_type,status,currency,gross_centavos,due_date,request_snapshot)
      VALUES ($1,$2,'orendapay',$3,$4,'created',$5,$6,$7,$8::jsonb) RETURNING id`,[tenantId,orderId,idempotencyKey,billingType,order.moeda,gross,dueDate,JSON.stringify(cleanCardSnapshot({billingType,dueDate,modeloLogistico:order.modelo_logistico,courierSplits,commissionBps}))]);
    intentId=iq.rows[0].id;
    const allocations:any[]=[["seller",tenantId,sellerEmail,sellerAmount,"seller_revenue"],["praca","praca.ai",null,pracaAmount,"commission_remainder"],...courierSplits.map((x:any)=>["courier",x.courierId,courierEmail.get(x.courierId),x.amountCentavos,`order_freight_${x.trecho}`])];
    for(const a of allocations)await client.query(`INSERT INTO praca_payment_allocations (tenant_id,payment_intent_id,beneficiary_type,beneficiary_id,wallet_id,amount_centavos,basis,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'planned')`,[tenantId,intentId,...a]);
    await client.query(`UPDATE praca_pedidos SET status='pagamento_pendente',updated_at=now() WHERE id=$1 AND tenant_id=$2`,[orderId,tenantId]);
    await client.query("COMMIT");
  }catch(e:any){await client.query("ROLLBACK");if(e?.code==="23505")return res.status(409).json({error:"Este pedido já possui cobrança."});throw e;}finally{client.release();}

  try{
    const payload:any=await createOrendaCharge({
      seu_codigo:orderId.slice(0,30),descricao:`Pedido Praça.ai ${orderId}`.slice(0,120),vencimento:brDateFromIso(dueDate),valor:decimalFromCents(gross),
      cliente_nome:name.slice(0,70),cliente_cpf_cnpj:document,cliente_telefone:String(order.cliente_whatsapp||"").slice(0,15)||undefined,cliente_email:email.slice(0,60),
      cliente_endereco:addr.endereco.slice(0,100),cliente_cidade:addr.cidade.slice(0,40),cliente_uf:addr.uf,cliente_cep:addr.cep,
      TIPO:mapBilling(billingType) as any,NUMERO_PARCELAS:String(req.body?.installments||1),RECORRENCIA:"0",ENVIAR_EMAIL:"1",ENVIAR_SMS:"0",ENVIO_IMEDIATO:"1",
      ...(splitFixo.length?{SPLIT_FIXO:splitFixo} as any:{}),URL_CALLBACK:`${callbackBase}/webhooks/orendapay?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(callbackSecret)}`,UTILIZACAO:"ECOMMERCE",
      ...(card?{cartao_numero:cardNumber,cartao_nome:cardName,cartao_validade:cardExpiry,cartao_codigo:cardCvv,pre_autorizar:"0" as const}:{}),
    } as any);
    const providerId=String(payload?.codigo||"");
    if(!providerId)throw new OrendaPayError("OrendaPay não retornou código da cobrança.",502,payload);
    const status=mapOrendaStatus(payload?.situacao);
    await vendorPool.query(`UPDATE praca_payment_intents SET provider_payment_id=$1,status=$2,invoice_url=$3,checkout_url=$3,provider_snapshot=$4::jsonb,updated_at=now() WHERE id=$5`,[providerId,status,payload?.url||null,JSON.stringify({...payload,cartao_numero:undefined,cartao_codigo:undefined}),intentId]);
    await vendorPool.query(`UPDATE praca_payment_allocations SET status=CASE WHEN $2 IN ('received','confirmed') THEN 'settled' ELSE 'scheduled' END,updated_at=now() WHERE payment_intent_id=$1`,[intentId,status]);
    if(status==="received")await vendorPool.query(`UPDATE praca_pedidos SET status='pago',updated_at=now() WHERE id=$1 AND tenant_id=$2`,[orderId,tenantId]);
    return res.status(201).json({id:intentId,provider:"orendapay",providerPaymentId:providerId,status,invoiceUrl:payload?.url||null,pixQrCode:payload?.pix_qrcode||null,pixCopyPaste:payload?.pix_chave||null,digitableLine:payload?.linha_digitavel||null,cardStatus:payload?.situacao_cartao||null});
  }catch(e:any){
    await vendorPool.query(`UPDATE praca_payment_intents SET status='failed',provider_snapshot=$1::jsonb,updated_at=now() WHERE id=$2`,[JSON.stringify({error:e?.message,status:e?.status||null}),intentId]);
    const status=e instanceof OrendaPayError&&[423,429].includes(e.status)?e.status:502;
    return res.status(status).json({error:e?.message||"Falha de comunicação com a OrendaPay.",provider:"orendapay"});
  }
});

router.put("/tenants/:tenantId/praca-payments/:intentId/cancel/orendapay",async(req,res)=>{
  const tenantId=String(req.params.tenantId),intentId=String(req.params.intentId); if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const q=await vendorPool.query(`SELECT provider_payment_id FROM praca_payment_intents WHERE tenant_id=$1 AND id=$2 AND provider='orendapay'`,[tenantId,intentId]);
  if(!q.rowCount)return res.status(404).json({error:"Cobrança OrendaPay não encontrada."});
  try{const payload=await cancelOrendaCharge(q.rows[0].provider_payment_id);await vendorPool.query(`UPDATE praca_payment_intents SET status='cancelled',provider_snapshot=$1::jsonb,updated_at=now() WHERE id=$2`,[JSON.stringify(payload),intentId]);return res.json({ok:true,status:"cancelled"});}
  catch(e:any){return res.status(e?.status===423||e?.status===429?e.status:502).json({error:e?.message||"Falha ao cancelar cobrança."});}
});

pracaOrendaPayPublicRouter.post("/webhooks/orendapay",async(req,res)=>{
  const tenantId=String(req.query.tenantId||""),token=String(req.query.token||""),expected=String(process.env.ORENDAPAY_CALLBACK_SECRET||"");
  if(!tenantId||!token||!expected||!safeEqual(token,expected))return res.status(401).json({error:"Unauthorized"});
  const providerId=String(req.body?.codigo||req.body?.codigo_custom||req.body?.seu_codigo||"").trim();
  const providerStatus=String(req.body?.situacao||"").trim();
  if(!providerId||!providerStatus)return res.status(400).json({error:"Callback inválido."});
  const lookup=await vendorPool.query(`SELECT id,order_id,status FROM praca_payment_intents WHERE tenant_id=$1 AND provider='orendapay' AND (provider_payment_id=$2 OR order_id=$2) ORDER BY created_at DESC LIMIT 1`,[tenantId,providerId]);
  if(!lookup.rowCount)return res.status(202).json({ok:true,ignored:true});
  const intent=lookup.rows[0],status=mapOrendaStatus(providerStatus);
  await vendorPool.query(`UPDATE praca_payment_intents SET status=$1,provider_snapshot=coalesce(provider_snapshot,'{}'::jsonb)||$2::jsonb,updated_at=now() WHERE id=$3`,[status,JSON.stringify({lastCallback:req.body}),intent.id]);
  if(status==="received"){
    await vendorPool.query(`UPDATE praca_payment_allocations SET status='settled',updated_at=now() WHERE payment_intent_id=$1`,[intent.id]);
    await vendorPool.query(`UPDATE praca_pedidos SET status='pago',updated_at=now() WHERE id=$1 AND tenant_id=$2`,[intent.order_id,tenantId]);
  }else if(["chargeback","refunded","cancelled"].includes(status)){
    await vendorPool.query(`UPDATE praca_payment_allocations SET status='blocked',updated_at=now() WHERE payment_intent_id=$1 AND status<>'settled'`,[intent.id]);
    if(status==="chargeback"){
      await vendorPool.query(`INSERT INTO vendor_shield_disputes (tenant_id,order_id,payment_intent_id,provider,provider_dispute_id,reason,amount_centavos,status,pre_dispute)
        SELECT tenant_id,order_id,id,'orendapay',$2,'Chargeback recebido por callback OrendaPay',gross_centavos,'open',false FROM praca_payment_intents WHERE id=$1
        ON CONFLICT DO NOTHING`,[intent.id,providerId]);
      await vendorPool.query(`INSERT INTO vendor_shield_audit_events (tenant_id,order_id,event_type,metadata) VALUES ($1,$2,'chargeback_received',$3::jsonb)`,[tenantId,intent.order_id,JSON.stringify({provider:"orendapay",providerId})]);
    }
  }
  return res.json({ok:true,status});
});

export default router;
