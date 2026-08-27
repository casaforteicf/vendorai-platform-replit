import { vendorPool } from "../lib/vendorDb.js";

type PaymentRow={
 id:string;order_id:string;status:string;gross_centavos:string;provider_fee_centavos:string|null;net_centavos:string|null;
 allocations_centavos:string;blocked_count:string;unsettled_count:string;allocations:unknown;
};

export async function generatePracaReconciliation(input:{tenantId:string;from:string;to:string;actorId:string|null}){
 const client=await vendorPool.connect();
 try{
  await client.query("BEGIN");
  const batch=await client.query(
   `INSERT INTO praca_reconciliation_batches (tenant_id,period_from,period_to,created_by)
    VALUES ($1,$2,$3,$4) RETURNING id`,[input.tenantId,input.from,input.to,input.actorId],
  );
  const batchId=batch.rows[0].id;
  const payments=await client.query<PaymentRow>(
   `SELECT i.id,i.order_id,i.status,i.gross_centavos,i.provider_fee_centavos,i.net_centavos,
      coalesce(sum(a.amount_centavos),0)::bigint AS allocations_centavos,
      count(*) FILTER (WHERE a.status IN ('blocked','failed'))::int AS blocked_count,
      count(*) FILTER (WHERE a.status IN ('planned','scheduled'))::int AS unsettled_count,
      coalesce(jsonb_agg(jsonb_build_object('type',a.beneficiary_type,'ownerId',a.beneficiary_id,'amountCentavos',a.amount_centavos,'status',a.status))
        FILTER (WHERE a.id IS NOT NULL),'[]'::jsonb) AS allocations
    FROM praca_payment_intents i LEFT JOIN praca_payment_allocations a ON a.payment_intent_id=i.id
    WHERE i.tenant_id=$1 AND i.created_at>=$2::date AND i.created_at<($3::date+'1 day'::interval)
    GROUP BY i.id ORDER BY i.created_at`,[input.tenantId,input.from,input.to],
  );
  let balanced=0,divergent=0,pending=0,grossTotal=0,feeTotal=0,netTotal=0,differenceTotal=0;
  for(const p of payments.rows){
   const gross=Number(p.gross_centavos),fee=p.provider_fee_centavos==null?null:Number(p.provider_fee_centavos);
   const net=p.net_centavos==null?null:Number(p.net_centavos),allocations=Number(p.allocations_centavos);
   const expectedNet=fee==null?null:gross-fee,reasons:string[]=[];
   let status:"balanced"|"divergent"|"pending"|"blocked";
   if(Number(p.blocked_count)>0){status="blocked";reasons.push("split_bloqueado");}
   else if(["created","pending","confirmed","overdue"].includes(p.status)||Number(p.unsettled_count)>0){
    status="pending";reasons.push("liquidacao_pendente");
   }else{
    if(fee==null)reasons.push("taxa_operadora_ausente");
    if(net==null)reasons.push("valor_liquido_ausente");
    if(net!=null&&expectedNet!=null&&net!==expectedNet)reasons.push("liquido_diferente_do_bruto_menos_taxa");
    if(allocations!==gross)reasons.push("soma_dos_repasses_diferente_do_bruto");
    status=reasons.length?"divergent":"balanced";
   }
   const difference=gross-allocations;
   await client.query(
    `INSERT INTO praca_reconciliation_items
      (tenant_id,batch_id,payment_intent_id,order_id,payment_status,reconciliation_status,
       gross_centavos,provider_fee_centavos,net_centavos,expected_net_centavos,
       allocations_centavos,difference_centavos,reasons,snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)`,
    [input.tenantId,batchId,p.id,p.order_id,p.status,status,gross,fee,net,expectedNet,allocations,difference,
     JSON.stringify(reasons),JSON.stringify({allocations:p.allocations})],
   );
   if(status==="balanced")balanced++;else if(status==="pending")pending++;else divergent++;
   grossTotal+=gross;feeTotal+=fee??0;netTotal+=net??0;differenceTotal+=difference;
  }
  await client.query(
   `UPDATE praca_reconciliation_batches SET status='completed',payments_count=$1,balanced_count=$2,
      divergent_count=$3,pending_count=$4,gross_centavos=$5,provider_fee_centavos=$6,
      net_centavos=$7,difference_centavos=$8,updated_at=now() WHERE id=$9`,
   [payments.rowCount??payments.rows.length,balanced,divergent,pending,grossTotal,feeTotal,netTotal,differenceTotal,batchId],
  );
  await client.query(
   "INSERT INTO praca_reconciliation_events (tenant_id,batch_id,event_type,actor_id,metadata) VALUES ($1,$2,'generated',$3,$4::jsonb)",
   [input.tenantId,batchId,input.actorId,JSON.stringify({payments:payments.rowCount??payments.rows.length,balanced,divergent,pending})],
  );
  await client.query("COMMIT");
  return{batchId,payments:payments.rowCount??payments.rows.length,balanced,divergent,pending};
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
