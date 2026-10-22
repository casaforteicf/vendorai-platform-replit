import { Router,type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb.js";
import vendorShieldRouter from "./vendor_shield";
import vendorShieldPurchaseValidationRouter from "./vendor_shield_purchase_validation";

const router:IRouter=Router();
function canAccess(req:Express.Request,tenantId:string){
  const user=(req as any).user;
  return user?.platformRole==="super_admin"||(user?.tenantId===tenantId&&user?.userFunction!=="entrega");
}
function dateParam(value:unknown,fallback:Date){
  if(typeof value!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return fallback;
  const parsed=new Date(value+"T00:00:00.000Z");return Number.isNaN(parsed.getTime())?fallback:parsed;
}

router.get("/tenants/:tenantId/praca-executive-dashboard",async(req,res)=>{
  const tenantId=String(req.params.tenantId);
  if(!canAccess(req,tenantId)){ res.status(403).json({error:"Forbidden"}); return; }
  const today=new Date(),defaultFrom=new Date(today);defaultFrom.setUTCDate(defaultFrom.getUTCDate()-29);
  const from=dateParam(req.query.from,defaultFrom),to=dateParam(req.query.to,today);
  const end=new Date(to);end.setUTCDate(end.getUTCDate()+1);
  const days=Math.ceil((end.getTime()-from.getTime())/86400000);
  if(days<1||days>366){ res.status(422).json({error:"O período deve ter entre 1 e 366 dias."}); return; }
  const params=[tenantId,from.toISOString(),end.toISOString()];

  const [orders,finance,allocations,exceptions,series,statuses,products,returns]=await Promise.all([
    vendorPool.query(`SELECT count(*)::int AS pedidos,
      coalesce(sum(total_centavos),0)::bigint AS gmv_centavos,
      coalesce(avg(total_centavos),0)::bigint AS ticket_medio_centavos,
      count(*) FILTER (WHERE status='entregue')::int AS entregues,
      count(*) FILTER (WHERE status='falha_entrega')::int AS falhas_entrega,
      count(*) FILTER (WHERE status='cancelado')::int AS cancelados,
      count(*) FILTER (WHERE status IN ('coletado','em_rota'))::int AS em_transito
      FROM praca_pedidos WHERE tenant_id=$1 AND created_at>=$2 AND created_at<$3`,params),
    vendorPool.query(`SELECT count(*)::int AS cobrancas,
      coalesce(sum(gross_centavos) FILTER (WHERE status IN ('confirmed','received')),0)::bigint AS confirmado_centavos,
      coalesce(sum(gross_centavos) FILTER (WHERE status='received'),0)::bigint AS recebido_centavos,
      coalesce(sum(provider_fee_centavos),0)::bigint AS taxa_operadora_centavos,
      count(*) FILTER (WHERE status IN ('overdue','failed','chargeback'))::int AS pagamentos_risco,
      count(*) FILTER (WHERE status='refunded')::int AS estornos
      FROM praca_payment_intents WHERE tenant_id=$1 AND created_at>=$2 AND created_at<$3`,params),
    vendorPool.query(`SELECT beneficiary_type,
      coalesce(sum(amount_centavos) FILTER (WHERE status='settled'),0)::bigint AS liquidado_centavos,
      coalesce(sum(amount_centavos) FILTER (WHERE status IN ('planned','scheduled','blocked')),0)::bigint AS pendente_centavos
      FROM praca_payment_allocations a JOIN praca_payment_intents i ON i.id=a.payment_intent_id
      WHERE a.tenant_id=$1 AND i.created_at>=$2 AND i.created_at<$3 GROUP BY beneficiary_type ORDER BY beneficiary_type`,params),
    vendorPool.query(`SELECT count(*) FILTER (WHERE status IN ('aberto','reconhecido'))::int AS ativos,
      count(*) FILTER (WHERE status IN ('aberto','reconhecido') AND severity='critica')::int AS criticos,
      count(*) FILTER (WHERE status IN ('aberto','reconhecido') AND due_at<now())::int AS fora_sla,
      count(*) FILTER (WHERE status='resolvido')::int AS resolvidos,
      coalesce(avg(extract(epoch FROM (resolved_at-first_detected_at))/60) FILTER (WHERE resolved_at IS NOT NULL),0)::int AS tempo_medio_resolucao_min
      FROM praca_exception_incidents WHERE tenant_id=$1 AND first_detected_at>=$2 AND first_detected_at<$3`,params),
    vendorPool.query(`SELECT to_char(d.day,'YYYY-MM-DD') AS dia,
      coalesce(x.pedidos,0)::int AS pedidos,coalesce(x.gmv_centavos,0)::bigint AS gmv_centavos,
      coalesce(x.entregues,0)::int AS entregues
      FROM generate_series($2::timestamptz,($3::timestamptz-'1 day'::interval),'1 day') d(day)
      LEFT JOIN (SELECT date_trunc('day',created_at) day,count(*) pedidos,sum(total_centavos) gmv_centavos,
        count(*) FILTER (WHERE status='entregue') entregues FROM praca_pedidos
        WHERE tenant_id=$1 AND created_at>=$2 AND created_at<$3 GROUP BY 1) x ON x.day=d.day ORDER BY d.day`,params),
    vendorPool.query(`SELECT status,count(*)::int AS total FROM praca_pedidos
      WHERE tenant_id=$1 AND created_at>=$2 AND created_at<$3 GROUP BY status ORDER BY total DESC`,params),
    vendorPool.query(`SELECT i.produto_id,i.nome_snapshot,coalesce(sum(i.quantidade),0)::numeric AS quantidade,
      coalesce(sum(i.total_centavos),0)::bigint AS faturamento_centavos
      FROM praca_pedido_itens i JOIN praca_pedidos p ON p.id=i.pedido_id
      WHERE i.tenant_id=$1 AND p.created_at>=$2 AND p.created_at<$3
      GROUP BY i.produto_id,i.nome_snapshot ORDER BY faturamento_centavos DESC LIMIT 10`,params),
    vendorPool.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='recebida_vendedor')::int AS concluidas,
      count(*) FILTER (WHERE status='divergencia')::int AS divergencias
      FROM praca_devolucoes WHERE tenant_id=$1 AND solicitada_em>=$2 AND solicitada_em<$3`,params),
  ]);
  const o=orders.rows[0],deliveryBase=Number(o.entregues)+Number(o.falhas_entrega);
  res.json({
    period:{from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10),days},
    orders:{...o,taxa_sucesso_entrega:deliveryBase?Math.round(Number(o.entregues)*1000/deliveryBase)/10:0},
    finance:finance.rows[0],allocations:allocations.rows,exceptions:exceptions.rows[0],
    returns:returns.rows[0],series:series.rows,statuses:statuses.rows,topProducts:products.rows,
    generatedAt:new Date().toISOString(),
  });
});

// Vendor Shield is part of the executive control plane and inherits the same protected router.
router.use(vendorShieldRouter);
router.use(vendorShieldPurchaseValidationRouter);

export default router;
