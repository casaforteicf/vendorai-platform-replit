import type { PoolClient } from "pg";

export function pracaCustomerKey(input:{clienteId?:unknown;document?:unknown;email?:unknown;whatsapp?:unknown}){
 const id=typeof input.clienteId==="string"?input.clienteId.trim():"";
 if(id)return "id:"+id;
 const document=typeof input.document==="string"?input.document.replace(/\D/g,""):"";
 if(document)return "doc:"+document;
 const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
 if(email)return "email:"+email;
 const phone=typeof input.whatsapp==="string"?input.whatsapp.replace(/\D/g,""):"";
 return phone?"phone:"+phone:"";
}

export async function applyPracaPromotion(client:PoolClient,input:{
 tenantId:string;couponCode?:string;customerKey:string;subtotalCentavos:number;orderId:string;actorId:string|null;
}){
 let coupon:any=null,discountCentavos=0;
 const code=(input.couponCode||"").trim().toUpperCase();
 if(code){
  const found=await client.query(
   `SELECT c.*,p.partner_type,p.status partner_status,p.default_commission_bps
    FROM praca_partner_coupons c LEFT JOIN praca_brand_partners p ON p.id=c.partner_id
    WHERE c.tenant_id=$1 AND upper(c.code)=upper($2) FOR UPDATE OF c`,[input.tenantId,code],
  );
  if(!found.rowCount)throw Object.assign(new Error("Cupom não encontrado."),{statusCode:422});
  coupon=found.rows[0];
  const now=Date.now();
  if(!coupon.active||(coupon.starts_at&&new Date(coupon.starts_at).getTime()>now)||(coupon.ends_at&&new Date(coupon.ends_at).getTime()<now)||
     (coupon.partner_id&&coupon.partner_status!=="active"))throw Object.assign(new Error("Cupom inativo ou fora da validade."),{statusCode:422});
  if(input.subtotalCentavos<Number(coupon.minimum_centavos))throw Object.assign(new Error("O pedido não atingiu o valor mínimo do cupom."),{statusCode:422});
  if(!input.customerKey)throw Object.assign(new Error("Identifique o cliente para utilizar o cupom."),{statusCode:422});
  const usage=await client.query(
   `SELECT count(*)::int total,count(*) FILTER (WHERE customer_key=$2)::int customer
    FROM praca_coupon_redemptions WHERE coupon_id=$1 AND status<>'reversed'`,[coupon.id,input.customerKey],
  );
  if(coupon.total_usage_limit&&Number(usage.rows[0].total)>=Number(coupon.total_usage_limit))throw Object.assign(new Error("O limite total deste cupom foi atingido."),{statusCode:409});
  if(coupon.per_customer_limit&&Number(usage.rows[0].customer)>=Number(coupon.per_customer_limit))throw Object.assign(new Error("Este cliente já atingiu o limite do cupom."),{statusCode:409});
  discountCentavos=Math.round(input.subtotalCentavos*Number(coupon.discount_bps)/10000);
  if(coupon.maximum_discount_centavos!=null)discountCentavos=Math.min(discountCentavos,Number(coupon.maximum_discount_centavos));
 }
 let referral:any=null;
 if(input.customerKey){
  const current=await client.query(
   `SELECT r.*,p.default_commission_bps,p.wallet_id,p.status partner_status
    FROM praca_customer_referrals r JOIN praca_brand_partners p ON p.id=r.influencer_partner_id
    WHERE r.tenant_id=$1 AND r.customer_key=$2 AND r.status='active'`,[input.tenantId,input.customerKey],
  );
  referral=current.rows[0]??null;
  if(!referral&&coupon?.establishes_referral&&coupon.partner_type==="influenciador"){
   const inserted=await client.query(
    `INSERT INTO praca_customer_referrals (tenant_id,customer_key,influencer_partner_id,source_coupon_id)
     VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,customer_key) DO NOTHING RETURNING *`,
    [input.tenantId,input.customerKey,coupon.partner_id,coupon.id],
   );
   if(inserted.rowCount){
    referral={...inserted.rows[0],default_commission_bps:coupon.default_commission_bps,wallet_id:coupon.wallet_id,partner_status:coupon.partner_status};
    await client.query(
     "INSERT INTO praca_partner_events (tenant_id,partner_id,referral_id,event_type,actor_id,metadata) VALUES ($1,$2,$3,'customer_linked',$4,$5::jsonb)",
     [input.tenantId,coupon.partner_id,referral.id,input.actorId,JSON.stringify({customerKey:input.customerKey,couponId:coupon.id})],
    );
   }
  }
 }
 if(coupon){
  await client.query(
   `INSERT INTO praca_coupon_redemptions
    (tenant_id,coupon_id,order_id,customer_key,subtotal_centavos,discount_bps,discount_centavos)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
   [input.tenantId,coupon.id,input.orderId,input.customerKey,input.subtotalCentavos,coupon.discount_bps,discountCentavos],
  );
 }
 let commission:any=null;
 if(referral&&referral.partner_status==="active"){
  const bps=coupon?.partner_id===referral.influencer_partner_id&&coupon.commission_bps!=null
   ?Number(coupon.commission_bps):Number(referral.default_commission_bps);
  const base=Math.max(0,input.subtotalCentavos-discountCentavos),amount=Math.round(base*bps/10000);
  if(bps>0&&amount>0){
   const inserted=await client.query(
    `INSERT INTO praca_partner_commissions
      (tenant_id,partner_id,referral_id,order_id,coupon_id,base_centavos,commission_bps,amount_centavos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [input.tenantId,referral.influencer_partner_id,referral.id,input.orderId,coupon?.id??null,base,bps,amount],
   );
   commission=inserted.rows[0];
   await client.query(
    "INSERT INTO praca_partner_events (tenant_id,partner_id,referral_id,commission_id,event_type,actor_id,metadata) VALUES ($1,$2,$3,$4,'commission_calculated',$5,$6::jsonb)",
    [input.tenantId,referral.influencer_partner_id,referral.id,commission.id,input.actorId,JSON.stringify({orderId:input.orderId,baseCentavos:base,bps,amountCentavos:amount})],
   );
  }
 }
 return{code:coupon?.code??null,discountCentavos,referral,commission};
}
