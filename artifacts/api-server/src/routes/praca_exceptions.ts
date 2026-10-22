import { Router,type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";
import { runPracaExceptionScan } from "../services/pracaExceptionDetector.js";

const router:IRouter=Router();

function actor(req:Express.Request){
  const user=(req as any).user;
  return{id:user?.sub??user?.id??null,tenantId:user?.tenantId??null,platformRole:user?.platformRole??null,userFunction:user?.userFunction??null};
}
function canAccess(req:Express.Request,tenantId:string){
  const user=actor(req);return user.platformRole==="super_admin"||user.tenantId===tenantId;
}

router.get("/tenants/:tenantId/praca-exceptions/config",async(req,res)=>{
  const tenantId=String(req.params.tenantId),user=actor(req);
  if(!canAccess(req,tenantId)||user.userFunction==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
  const result=await vendorPool.query(
    "INSERT INTO praca_exception_config (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO UPDATE SET tenant_id=excluded.tenant_id RETURNING *",
    [tenantId],
  );
  res.json({config:result.rows[0]});
});

router.put("/tenants/:tenantId/praca-exceptions/config",async(req,res)=>{
  const tenantId=String(req.params.tenantId),user=actor(req);
  if(!canAccess(req,tenantId)||user.userFunction==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
  const fields=["pedidoParadoMinutos","rotaParadaMinutos","estornoPendenteMinutos","devolucaoAtrasadaHoras","notificacaoFalhaMinutos","escalonamentoMinutos"] as const;
  const values=fields.map(k=>Number(req.body?.[k]));
  if(values.some(v=>!Number.isInteger(v)||v<1)){ res.status(422).json({error:"Todos os limites de SLA devem ser números inteiros positivos."}); return; }
  const result=await vendorPool.query(
    `INSERT INTO praca_exception_config
      (tenant_id,pedido_parado_minutos,rota_parada_minutos,estorno_pendente_minutos,devolucao_atrasada_horas,notificacao_falha_minutos,escalonamento_minutos,ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (tenant_id) DO UPDATE SET pedido_parado_minutos=excluded.pedido_parado_minutos,
       rota_parada_minutos=excluded.rota_parada_minutos,estorno_pendente_minutos=excluded.estorno_pendente_minutos,
       devolucao_atrasada_horas=excluded.devolucao_atrasada_horas,notificacao_falha_minutos=excluded.notificacao_falha_minutos,
       escalonamento_minutos=excluded.escalonamento_minutos,ativo=excluded.ativo,updated_at=now() RETURNING *`,
    [tenantId,...values,req.body?.ativo!==false],
  );
  res.json({config:result.rows[0]});
});

router.post("/tenants/:tenantId/praca-exceptions/scan",async(req,res)=>{
  const tenantId=String(req.params.tenantId),user=actor(req);
  if(!canAccess(req,tenantId)||user.userFunction==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
  const config=await vendorPool.query("SELECT 1 FROM praca_exception_config WHERE tenant_id=$1",[tenantId]);
  if(!config.rowCount)await vendorPool.query("INSERT INTO praca_exception_config (tenant_id) VALUES ($1)",[tenantId]);
  res.json(await runPracaExceptionScan(undefined,tenantId));
});

router.get("/tenants/:tenantId/praca-exceptions",async(req,res)=>{
  const tenantId=String(req.params.tenantId),user=actor(req);
  if(!canAccess(req,tenantId)||user.userFunction==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
  const config=await vendorPool.query("SELECT 1 FROM praca_exception_config WHERE tenant_id=$1",[tenantId]);
  if(!config.rowCount)await vendorPool.query("INSERT INTO praca_exception_config (tenant_id) VALUES ($1)",[tenantId]);
  await runPracaExceptionScan(undefined,tenantId);
  const status=typeof req.query.status==="string"?req.query.status:"active";
  const where=status==="all"?"":" AND i.status IN ('aberto','reconhecido')";
  const [items,summary]=await Promise.all([
    vendorPool.query(
      `SELECT i.*,p.cliente_nome,u.name AS assigned_to_name,
              extract(epoch FROM (coalesce(i.due_at,now())-now()))::bigint AS seconds_to_due,
              (SELECT count(*)::int FROM praca_exception_alerts a WHERE a.incident_id=i.id) AS alert_recipients,
              (SELECT count(*)::int FROM praca_exception_alerts a WHERE a.incident_id=i.id AND a.acknowledged_at IS NOT NULL) AS alert_acknowledged,
              (SELECT max(a.sent_at) FROM praca_exception_alerts a WHERE a.incident_id=i.id) AS last_alert_at
         FROM praca_exception_incidents i
         LEFT JOIN praca_pedidos p ON p.id=i.pedido_id
         LEFT JOIN users u ON u.id=i.assigned_to
        WHERE i.tenant_id=$1${where}
        ORDER BY CASE i.severity WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
                 i.due_at NULLS LAST,i.last_detected_at DESC LIMIT 500`,
      [tenantId],
    ),
    vendorPool.query(
      `SELECT count(*) FILTER (WHERE status IN ('aberto','reconhecido'))::int AS ativos,
              count(*) FILTER (WHERE status='aberto')::int AS abertos,
              count(*) FILTER (WHERE status='reconhecido')::int AS reconhecidos,
              count(*) FILTER (WHERE status IN ('aberto','reconhecido') AND severity='critica')::int AS criticos,
              count(*) FILTER (WHERE status IN ('aberto','reconhecido') AND due_at<now())::int AS fora_sla,
              count(*) FILTER (WHERE status='resolvido' AND resolved_at>=date_trunc('day',now()))::int AS resolvidos_hoje
         FROM praca_exception_incidents WHERE tenant_id=$1`,
      [tenantId],
    ),
  ]);
  res.json({summary:summary.rows[0],incidents:items.rows});
});

router.get("/tenants/:tenantId/praca-exceptions/:incidentId",async(req,res)=>{
  const tenantId=String(req.params.tenantId);
  if(!canAccess(req,tenantId)||actor(req).userFunction==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
  const item=await vendorPool.query("SELECT * FROM praca_exception_incidents WHERE id=$1 AND tenant_id=$2",[String(req.params.incidentId),tenantId]);
  if(!item.rowCount){ res.status(404).json({error:"Incidente não encontrado."}); return; }
  const events=await vendorPool.query("SELECT * FROM praca_exception_events WHERE incident_id=$1 ORDER BY created_at,id",[item.rows[0].id]);
  res.json({incident:item.rows[0],events:events.rows});
});

router.patch("/tenants/:tenantId/praca-exceptions/:incidentId",async(req,res)=>{
  const tenantId=String(req.params.tenantId),incidentId=String(req.params.incidentId),user=actor(req);
  if(!canAccess(req,tenantId)||!user.id||user.userFunction==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
  const requestedStatus=typeof req.body?.status==="string"?req.body.status:null;
  const assignedTo=typeof req.body?.assignedTo==="string"?req.body.assignedTo.trim()||null:undefined;
  const effectiveAssignedTo=assignedTo===undefined&&requestedStatus==="reconhecido"?user.id:assignedTo;
  const note=typeof req.body?.note==="string"?req.body.note.trim():"";
  if(requestedStatus&&!["aberto","reconhecido","resolvido","ignorado"].includes(requestedStatus)){ res.status(422).json({error:"Status inválido."}); return; }
  if((requestedStatus==="resolvido"||requestedStatus==="ignorado")&&note.length<5){ res.status(422).json({error:"Explique a resolução ou o motivo para ignorar."}); return; }
  const client=await vendorPool.connect();
  try{
    await client.query("BEGIN");
    const current=await client.query("SELECT * FROM praca_exception_incidents WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[incidentId,tenantId]);
    if(!current.rowCount){await client.query("ROLLBACK");res.status(404).json({error:"Incidente não encontrado."}); return;}
    if(effectiveAssignedTo){
      const valid=await client.query("SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2 AND active=true",[effectiveAssignedTo,tenantId]);
      if(!valid.rowCount){await client.query("ROLLBACK");res.status(422).json({error:"Responsável inválido ou inativo."}); return;}
    }
    const previous=current.rows[0],next=requestedStatus??previous.status;
    const updated=await client.query(
      `UPDATE praca_exception_incidents SET status=$1,
        assigned_to=CASE WHEN $2::text IS NULL THEN assigned_to ELSE $2 END,
        acknowledged_at=CASE WHEN $1='reconhecido' THEN coalesce(acknowledged_at,now()) ELSE acknowledged_at END,
        resolved_at=CASE WHEN $1 IN ('resolvido','ignorado') THEN now() ELSE NULL END,
        resolution=CASE WHEN $1 IN ('resolvido','ignorado') THEN $3 ELSE resolution END,updated_at=now()
       WHERE id=$4 RETURNING *`,
      [next,effectiveAssignedTo===undefined?null:effectiveAssignedTo,note||null,incidentId],
    );
    const eventType=next!==previous.status?(next==="reconhecido"?"reconhecido":next==="resolvido"?"resolvido":next==="ignorado"?"ignorado":"reaberto"):effectiveAssignedTo!==undefined?"atribuido":"comentario";
    await client.query(
      "INSERT INTO praca_exception_events (tenant_id,incident_id,event_type,actor_id,previous_status,new_status,note,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [tenantId,incidentId,eventType,user.id,previous.status,next,note||null,JSON.stringify({assignedTo:effectiveAssignedTo??previous.assigned_to})],
    );
    if(["reconhecido","resolvido","ignorado"].includes(next)){
      await client.query(
        "UPDATE praca_exception_alerts SET acknowledged_at=coalesce(acknowledged_at,now()),acknowledged_by=coalesce(acknowledged_by,$1) WHERE incident_id=$2 AND user_id=$1",
        [user.id,incidentId],
      );
    }
    await client.query("COMMIT");res.json({incident:updated.rows[0]});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

export default router;
