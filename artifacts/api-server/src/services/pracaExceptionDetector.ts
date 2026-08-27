import { vendorPool } from "../lib/vendorDb.js";
import type { Logger } from "pino";
import { dispatchPracaExceptionAlerts } from "./pracaExceptionEscalation.js";

type Candidate={
  incident_type:string;entity_type:string;entity_id:string;pedido_id:string|null;
  severity:"baixa"|"media"|"alta"|"critica";title:string;description:string;
  details:Record<string,unknown>;due_at:string|null;
};

export async function runPracaExceptionScan(log?:Logger,tenantIdFilter?:string):Promise<{tenants:number;detected:number;resolved:number}>{
  const configs=await vendorPool.query(
    "SELECT * FROM praca_exception_config WHERE ativo=true"+(tenantIdFilter?" AND tenant_id=$1":""),
    tenantIdFilter?[tenantIdFilter]:[],
  );
  let detected=0,resolved=0;
  for(const cfg of configs.rows){
    try{
      const candidates=await vendorPool.query<Candidate>(
        `SELECT 'pagamento_atrasado' incident_type,'pagamento' entity_type,i.id entity_id,i.order_id pedido_id,
                'alta' severity,'Pagamento vencido' title,
                'A cobrança venceu e continua sem confirmação.' description,
                jsonb_build_object('status',i.status,'vencimento',i.due_date,'valorCentavos',i.gross_centavos) details,
                i.due_date::timestamptz due_at
           FROM praca_payment_intents i
          WHERE i.tenant_id=$1 AND i.status='overdue'
          UNION ALL
         SELECT CASE WHEN i.status='chargeback' THEN 'chargeback' ELSE 'pagamento_falhou' END,
                'pagamento',i.id,i.order_id,CASE WHEN i.status='chargeback' THEN 'critica' ELSE 'alta' END,
                CASE WHEN i.status='chargeback' THEN 'Chargeback aberto' ELSE 'Pagamento falhou' END,
                CASE WHEN i.status='chargeback' THEN 'O comprador contestou o pagamento.' ELSE 'A cobrança foi recusada ou falhou.' END,
                jsonb_build_object('status',i.status,'providerPaymentId',i.provider_payment_id),now()
           FROM praca_payment_intents i
          WHERE i.tenant_id=$1 AND i.status IN ('failed','chargeback')
          UNION ALL
         SELECT 'split_bloqueado','pagamento',a.payment_intent_id,i.order_id,'critica',
                'Split financeiro bloqueado','Um beneficiário não recebeu ou o split foi bloqueado.',
                jsonb_build_object('beneficiario',a.beneficiary_type,'beneficiarioId',a.beneficiary_id,'status',a.status,'valorCentavos',a.amount_centavos),now()
           FROM praca_payment_allocations a JOIN praca_payment_intents i ON i.id=a.payment_intent_id
          WHERE a.tenant_id=$1 AND a.status IN ('blocked','failed')
          UNION ALL
         SELECT 'pedido_parado','pedido',p.id,p.id,'media','Pedido sem movimentação',
                'O pedido permaneceu no mesmo estado além do SLA configurado.',
                jsonb_build_object('status',p.status,'ultimaAtualizacao',p.updated_at),
                p.updated_at+make_interval(mins=>$2)
           FROM praca_pedidos p
          WHERE p.tenant_id=$1 AND p.status IN ('recebido','pagamento_pendente','pago','em_separacao','pronto_coleta','coleta_agendada','coletado','em_rota')
            AND p.updated_at<now()-make_interval(mins=>$2)
          UNION ALL
         SELECT 'rota_parada','rota',r.id,NULL,'alta','Rota sem atualização',
                'Uma rota ativa ficou sem movimentação além do SLA.',
                jsonb_build_object('status',r.status,'numero',r.numero,'entregadorId',r.entregador_id),
                r.updated_at+make_interval(mins=>$3)
           FROM praca_rotas_entrega r
          WHERE r.tenant_id=$1 AND r.status IN ('planejada','aceita','coletando','em_rota','parcial','aguardando_transferencia')
            AND r.updated_at<now()-make_interval(mins=>$3)
          UNION ALL
         SELECT 'falha_entrega','pedido',p.id,p.id,'alta','Falha de entrega aberta',
                coalesce(s.motivo_falha_descricao,'A entrega falhou e precisa de decisão operacional.'),
                jsonb_build_object('motivoCodigo',s.motivo_falha_codigo,'rotaId',s.rota_id),now()
           FROM praca_pedidos p LEFT JOIN LATERAL (
             SELECT * FROM praca_rota_paradas x WHERE x.pedido_id=p.id AND x.status='falhou' ORDER BY x.updated_at DESC LIMIT 1
           ) s ON true
          WHERE p.tenant_id=$1 AND p.status='falha_entrega'
          UNION ALL
         SELECT 'custodia_divergente','transferencia',t.id,t.pedido_id,'critica','Divergência de custódia',
                'A saída e o recebimento do volume no redespacho apresentam divergência.',
                jsonb_build_object('volumeId',t.volume_id,'status',t.status,'pontoRedespachoId',t.ponto_redespacho_id),now()
           FROM praca_transferencias_custodia t WHERE t.tenant_id=$1 AND t.status='divergencia'
          UNION ALL
         SELECT 'custodia_divergente','devolucao',d.id,d.pedido_id,'critica','Divergência na devolução',
                'A custódia da logística reversa apresenta divergência.',
                jsonb_build_object('status',d.status,'modelo',d.modelo_logistico),now()
           FROM praca_devolucoes d WHERE d.tenant_id=$1 AND d.status='divergencia'
          UNION ALL
         SELECT 'devolucao_atrasada','devolucao',d.id,d.pedido_id,'alta','Devolução atrasada',
                'A devolução não foi recebida dentro do SLA configurado.',
                jsonb_build_object('status',d.status,'dataServico',d.data_servico,'modelo',d.modelo_logistico),
                d.data_servico::timestamptz+make_interval(hours=>$4)
           FROM praca_devolucoes d
          WHERE d.tenant_id=$1 AND d.status NOT IN ('recebida_vendedor','cancelada')
            AND d.data_servico::timestamptz+make_interval(hours=>$4)<now()
          UNION ALL
         SELECT 'estorno_pendente','estorno',a.id,a.order_id,'critica','Estorno sem confirmação',
                'O Asaas aceitou o estorno, mas o webhook ainda não confirmou a conclusão.',
                jsonb_build_object('actionType',a.action_type,'status',a.status,'providerAcceptedAt',a.provider_accepted_at),
                a.provider_accepted_at+make_interval(mins=>$5)
           FROM praca_payment_actions a
          WHERE a.tenant_id=$1 AND a.action_type='full_refund' AND a.status='provider_accepted'
            AND a.provider_accepted_at<now()-make_interval(mins=>$5)
          UNION ALL
         SELECT 'notificacao_falhou','notificacao',n.id,n.pedido_id,'media','Notificação ao cliente falhou',
                'Uma atualização operacional não foi entregue ao WhatsApp do cliente.',
                jsonb_build_object('template',n.template,'status',n.status),n.created_at+make_interval(mins=>$6)
           FROM praca_entrega_notificacoes n
          WHERE n.tenant_id=$1 AND n.status='falhou'
            AND n.created_at<now()-make_interval(mins=>$6)`,
        [cfg.tenant_id,cfg.pedido_parado_minutos,cfg.rota_parada_minutos,cfg.devolucao_atrasada_horas,cfg.estorno_pendente_minutos,cfg.notificacao_falha_minutos],
      );
      const activeKeys=new Set<string>();
      for(const c of candidates.rows){
        const key=[c.incident_type,c.entity_type,c.entity_id].join("|");activeKeys.add(key);
        const upsert=await vendorPool.query(
          `INSERT INTO praca_exception_incidents
            (tenant_id,incident_type,entity_type,entity_id,pedido_id,severity,status,title,description,details,due_at)
           VALUES ($1,$2,$3,$4,$5,$6,'aberto',$7,$8,$9::jsonb,$10)
           ON CONFLICT (tenant_id,incident_type,entity_type,entity_id)
             WHERE status IN ('aberto','reconhecido')
           DO UPDATE SET severity=excluded.severity,title=excluded.title,description=excluded.description,
             details=excluded.details,due_at=excluded.due_at,last_detected_at=now(),updated_at=now()
           RETURNING id,(xmax=0) AS inserted`,
          [cfg.tenant_id,c.incident_type,c.entity_type,c.entity_id,c.pedido_id,c.severity,c.title,c.description,JSON.stringify(c.details),c.due_at],
        );
        if(upsert.rows[0].inserted){
          detected++;
          await vendorPool.query(
            "INSERT INTO praca_exception_events (tenant_id,incident_id,event_type,new_status,metadata) VALUES ($1,$2,'detectado','aberto',$3::jsonb)",
            [cfg.tenant_id,upsert.rows[0].id,JSON.stringify(c.details)],
          );
        }
      }
      const open=await vendorPool.query(
        "SELECT id,incident_type,entity_type,entity_id,status FROM praca_exception_incidents WHERE tenant_id=$1 AND status IN ('aberto','reconhecido')",
        [cfg.tenant_id],
      );
      for(const incident of open.rows){
        const key=[incident.incident_type,incident.entity_type,incident.entity_id].join("|");
        if(activeKeys.has(key))continue;
        const changed=await vendorPool.query(
          "UPDATE praca_exception_incidents SET status='resolvido',resolved_at=now(),resolution='Resolvido automaticamente: a condição de origem deixou de existir.',updated_at=now() WHERE id=$1 AND status IN ('aberto','reconhecido') RETURNING id",
          [incident.id],
        );
        if(changed.rowCount){
          resolved++;
          await vendorPool.query(
            "INSERT INTO praca_exception_events (tenant_id,incident_id,event_type,previous_status,new_status,note) VALUES ($1,$2,'resolvido',$3,'resolvido','Condição normalizada na varredura automática.')",
            [cfg.tenant_id,incident.id,incident.status],
          );
        }
      }
    }catch(error){log?.error({error,tenantId:cfg.tenant_id},"praca-exceptions: scan failed");}
  }
  await dispatchPracaExceptionAlerts(tenantIdFilter,log);
  return{tenants:configs.rowCount??configs.rows.length,detected,resolved};
}
