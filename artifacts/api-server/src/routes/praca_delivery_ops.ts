import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { vendorPool } from "../lib/vendorDb";
import {
  createEvidenceReadUrl,
  createEvidenceUpload,
  evidencePathBelongsTo,
} from "../services/pracaEvidenceStorage.js";

const router: IRouter = Router();
export const pracaDeliveryPublicRouter: IRouter = Router();

// IMPORTANT: this public router is mounted without a path before the global
// authenticate middleware. A router.use(rateLimit(...)) here would therefore
// rate-limit every API request that was not handled by an earlier public router,
// including all authenticated CRM routes. Keep the limiter attached only to the
// two public delivery-portal endpoints below.
const publicDeliveryRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function actor(req: Express.Request) {
  const user = (req as any).user;
  return {
    id: user?.sub ?? user?.id ?? null,
    tenantId: user?.tenantId ?? null,
    platformRole: user?.platformRole ?? null,
    userFunction: user?.userFunction ?? null,
  };
}

function canAccess(req: Express.Request, tenantId: string): boolean {
  const user = actor(req);
  return user.platformRole === "super_admin" || user.tenantId === tenantId;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function message(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

pracaDeliveryPublicRouter.get("/public/praca-delivery/:trackingToken", publicDeliveryRateLimiter, async (req, res) => {
  const token = String(req.params.trackingToken);
  if (!/^[a-f0-9]{64}$/.test(token)) { res.status(404).json({ error: "Rastreamento não encontrado." }); return; }
  const order = await vendorPool.query(
    `SELECT p.id,p.status,p.cliente_nome,p.ocorrido_em,p.updated_at,p.modelo_logistico,
            hub.nome AS ponto_redespacho_nome,
            r.id AS rota_id,r.status AS rota_status,
            s.sequencia,s.status AS parada_status,s.motivo_falha_codigo,s.motivo_falha_descricao
       FROM praca_pedidos p
       LEFT JOIN praca_rota_paradas s ON s.pedido_id=p.id AND s.tipo='entrega'
       LEFT JOIN praca_rotas_entrega r ON r.id=s.rota_id
       LEFT JOIN praca_pontos_redespacho hub ON hub.id=p.ponto_redespacho_id
      WHERE p.tracking_token=$1
      ORDER BY s.created_at DESC LIMIT 1`,
    [token],
  );
  if (!order.rowCount) { res.status(404).json({ error: "Rastreamento não encontrado." }); return; }
  const [interactions,legs,transfers] = await Promise.all([
    vendorPool.query(
      `SELECT remetente_tipo,canal,mensagem,created_at
         FROM praca_entrega_interacoes
        WHERE pedido_id=$1 ORDER BY created_at,id LIMIT 200`,
      [order.rows[0].id],
    ),
    vendorPool.query(
      `SELECT ordem,tipo,origem_tipo,destino_tipo,status,iniciado_em,concluido_em,updated_at
         FROM praca_trechos_logisticos WHERE pedido_id=$1 ORDER BY ordem`,
      [order.rows[0].id],
    ),
    vendorPool.query(
      `SELECT status,saida_confirmada_em,entrada_confirmada_em,updated_at
         FROM praca_transferencias_custodia WHERE pedido_id=$1 ORDER BY created_at`,
      [order.rows[0].id],
    ),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  const reverse = await vendorPool.query(
    "SELECT id,modelo_logistico,status,data_servico,motivo_descricao,solicitada_em,coletada_em,recebida_em,updated_at FROM praca_devolucoes WHERE pedido_id=$1 ORDER BY solicitada_em DESC LIMIT 1",
    [order.rows[0].id],
  );
  const reverseEvents = reverse.rowCount ? await vendorPool.query(
    "SELECT tipo,status_anterior,status_novo,motivo,ocorrido_em FROM praca_devolucao_eventos WHERE devolucao_id=$1 ORDER BY ocorrido_em,id",
    [reverse.rows[0].id],
  ) : { rows: [] };
  res.json({ order: order.rows[0], interactions: interactions.rows, legs: legs.rows, transfers: transfers.rows,
    reverse: reverse.rows[0] ?? null, reverseEvents: reverseEvents.rows });
});

pracaDeliveryPublicRouter.post("/public/praca-delivery/:trackingToken/messages", publicDeliveryRateLimiter, async (req, res) => {
  const token = String(req.params.trackingToken);
  const body = message(req.body?.mensagem);
  if (!/^[a-f0-9]{64}$/.test(token) || !body || body.length > 4000) {
    res.status(422).json({ error: "Mensagem inválida." }); return;
  }
  const order = await vendorPool.query(
    "SELECT id,tenant_id FROM praca_pedidos WHERE tracking_token=$1",
    [token],
  );
  if (!order.rowCount) { res.status(404).json({ error: "Rastreamento não encontrado." }); return; }
  const created = await vendorPool.query(
    `INSERT INTO praca_entrega_interacoes
      (tenant_id,pedido_id,remetente_tipo,canal,mensagem)
     VALUES ($1,$2,'cliente','portal',$3)
     RETURNING id,remetente_tipo,canal,mensagem,created_at`,
    [order.rows[0].tenant_id, order.rows[0].id, body],
  );
  res.status(201).json({ interaction: created.rows[0] });
});

router.post("/tenants/:tenantId/praca-delivery/evidence-uploads", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const user = actor(req);
  if (!canAccess(req, tenantId) || !user.id) { res.status(403).json({ error: "Forbidden" }); return; }
  const volumeId = String(req.body?.volumeId ?? "");
  const contentType = String(req.body?.contentType ?? "");
  const size = Number(req.body?.size);
  const volume = await vendorPool.query(
    `SELECT v.id,p.id AS pedido_id,r.entregador_id
       FROM praca_pedido_volumes v
       JOIN praca_pedidos p ON p.id=v.pedido_id
       JOIN praca_rota_parada_volumes pv ON pv.volume_id=v.id
       JOIN praca_rota_paradas s ON s.id=pv.parada_id AND s.tipo='entrega'
       JOIN praca_rotas_entrega r ON r.id=s.rota_id
      WHERE v.id=$1 AND v.tenant_id=$2 ORDER BY s.created_at DESC LIMIT 1`,
    [volumeId, tenantId],
  );
  if (!volume.rowCount) { res.status(404).json({ error: "Volume não encontrado." }); return; }
  if (user.userFunction === "entrega" && volume.rows[0].entregador_id !== user.id) {
    res.status(403).json({ error: "Volume pertence a outro entregador." }); return;
  }
  const upload = await createEvidenceUpload(tenantId, volume.rows[0].pedido_id, volumeId, contentType, size);
  res.status(201).json(upload);
});

router.get("/tenants/:tenantId/praca-delivery/evidence/:kind/:evidenceId/url", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const kind = String(req.params.kind);
  if (!["proof","failure"].includes(kind)) { res.status(404).json({ error: "Evidência não encontrada." }); return; }
  const table = kind === "proof" ? "praca_entrega_provas" : "praca_entrega_falhas";
  const result = await vendorPool.query(
    `SELECT foto_url,rota_id FROM ${table} WHERE id=$1 AND tenant_id=$2`,
    [String(req.params.evidenceId), tenantId],
  );
  if (!result.rowCount || !result.rows[0].foto_url) { res.status(404).json({ error: "Evidência não encontrada." }); return; }
  const user = actor(req);
  if (user.userFunction === "entrega") {
    const route = await vendorPool.query("SELECT entregador_id FROM praca_rotas_entrega WHERE id=$1", [result.rows[0].rota_id]);
    if (route.rows[0]?.entregador_id !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  res.json({ url: await createEvidenceReadUrl(result.rows[0].foto_url), expiresIn: 300 });
});

router.get("/tenants/:tenantId/praca-delivery/monitor", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || actor(req).userFunction === "entrega") { res.status(403).json({ error: "Forbidden" }); return; }
  const [summary, orders, pendingMessages] = await Promise.all([
    vendorPool.query(
      `SELECT count(*) FILTER (WHERE p.status IN ('coleta_agendada','coletado','em_rota'))::int AS em_operacao,
              count(*) FILTER (WHERE p.status='falha_entrega')::int AS falhas,
              count(*) FILTER (WHERE p.status='entregue')::int AS entregues,
              (SELECT count(*)::int FROM praca_payment_intents i
                WHERE i.tenant_id=$1 AND i.status IN ('failed','overdue','chargeback')) AS alertas_financeiros,
              (SELECT count(*)::int FROM praca_payment_allocations a
                JOIN praca_payment_intents i ON i.id=a.payment_intent_id
               WHERE i.tenant_id=$1 AND i.status='received'
                 AND a.status<>'settled') AS repasses_pendentes
         FROM praca_pedidos p WHERE p.tenant_id=$1`,
      [tenantId],
    ),
    vendorPool.query(
      `SELECT p.id,p.status,p.cliente_nome,p.cliente_documento,p.cliente_email,p.cliente_whatsapp,p.updated_at,p.modelo_logistico,p.frete_centavos,
              hub.nome AS ponto_redespacho_nome,t.status AS transferencia_status,
              pi.status AS pagamento_status,pi.provider_fee_centavos,pi.net_centavos,
              coalesce(pa.repasses_pendentes,0)::int AS repasses_pendentes,
              r.id AS rota_id,r.numero AS rota_numero,r.status AS rota_status,
              s.sequencia,s.status AS parada_status,s.motivo_falha_codigo,s.motivo_falha_descricao,
              (SELECT count(*)::int FROM praca_entrega_interacoes i WHERE i.pedido_id=p.id) AS mensagens
         FROM praca_pedidos p
         LEFT JOIN LATERAL (
           SELECT * FROM praca_rota_paradas x
            WHERE x.pedido_id=p.id AND x.tipo='entrega'
            ORDER BY x.created_at DESC LIMIT 1
         ) s ON true
         LEFT JOIN praca_rotas_entrega r ON r.id=s.rota_id
         LEFT JOIN praca_pontos_redespacho hub ON hub.id=p.ponto_redespacho_id
         LEFT JOIN LATERAL (
           SELECT i.id,i.status,i.provider_fee_centavos,i.net_centavos
             FROM praca_payment_intents i WHERE i.order_id=p.id
            ORDER BY i.created_at DESC LIMIT 1
         ) pi ON true
         LEFT JOIN LATERAL (
           SELECT count(*)::int AS repasses_pendentes
             FROM praca_payment_allocations a
            WHERE a.payment_intent_id=pi.id AND a.status<>'settled'
         ) pa ON true
         LEFT JOIN LATERAL (
           SELECT x.status FROM praca_transferencias_custodia x
            WHERE x.pedido_id=p.id ORDER BY x.created_at DESC LIMIT 1
         ) t ON true
        WHERE p.tenant_id=$1
          AND p.status IN ('recebido','pagamento_pendente','pago','em_separacao','pronto_coleta','coleta_agendada','coletado','em_rota','falha_entrega','entregue','devolucao_solicitada','devolvido')
        ORDER BY CASE WHEN p.status='falha_entrega' THEN 0 ELSE 1 END,p.updated_at
        LIMIT 200`,
      [tenantId],
    ),
    vendorPool.query(
      `SELECT count(*)::int AS total FROM praca_entrega_notificacoes
        WHERE tenant_id=$1 AND status IN ('pendente','falhou')`,
      [tenantId],
    ),
  ]);
  res.json({ summary: { ...summary.rows[0], notificacoesPendentes: pendingMessages.rows[0].total }, orders: orders.rows });
});

router.post("/tenants/:tenantId/praca-delivery/orders/:orderId/messages", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const user = actor(req);
  if (!canAccess(req, tenantId) || !user.id) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = message(req.body?.mensagem);
  if (!body || body.length > 4000) { res.status(422).json({ error: "Mensagem inválida." }); return; }

  const order = await vendorPool.query(
    `SELECT p.id,p.cliente_whatsapp,r.id AS rota_id,r.entregador_id
       FROM praca_pedidos p
       LEFT JOIN praca_rota_paradas s ON s.pedido_id=p.id AND s.tipo='entrega'
       LEFT JOIN praca_rotas_entrega r ON r.id=s.rota_id
      WHERE p.id=$1 AND p.tenant_id=$2 ORDER BY s.created_at DESC LIMIT 1`,
    [String(req.params.orderId), tenantId],
  );
  if (!order.rowCount) { res.status(404).json({ error: "Pedido não encontrado." }); return; }
  if (user.userFunction === "entrega" && order.rows[0].entregador_id !== user.id) {
    res.status(403).json({ error: "Pedido pertence a outro entregador." }); return;
  }
  if (!order.rows[0].cliente_whatsapp) { res.status(422).json({ error: "Cliente sem WhatsApp cadastrado." }); return; }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const interaction = await client.query(
      `INSERT INTO praca_entrega_interacoes
        (tenant_id,pedido_id,rota_id,remetente_tipo,remetente_id,canal,mensagem)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenantId,order.rows[0].id,order.rows[0].rota_id,
       user.userFunction === "entrega" ? "entregador" : "operador",user.id,
       user.userFunction === "entrega" ? "app_entregador" : "vendorai",body],
    );
    await client.query(
      `INSERT INTO praca_entrega_notificacoes
        (tenant_id,pedido_id,interacao_id,destinatario_whatsapp,template,payload)
       VALUES ($1,$2,$3,$4,'mensagem_entregador',$5)`,
      [tenantId,order.rows[0].id,interaction.rows[0].id,order.rows[0].cliente_whatsapp,{ mensagem: body }],
    );
    await client.query("COMMIT");
    res.status(201).json({ interaction: interaction.rows[0], notificationStatus: "pendente" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.post("/tenants/:tenantId/praca-delivery/orders/:orderId/reattempt", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const user = actor(req);
  if (!canAccess(req, tenantId) || !user.id || user.userFunction === "entrega") {
    res.status(403).json({ error: "Somente o operador pode autorizar reentrega." }); return;
  }
  const serviceDate = req.body?.dataServico;
  const reason = message(req.body?.motivo);
  if (!validDate(serviceDate) || !reason) {
    res.status(422).json({ error: "Data de serviço e motivo são obrigatórios." }); return;
  }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(
      `SELECT p.*,s.id AS parada_id
         FROM praca_pedidos p
         JOIN praca_rota_paradas s ON s.pedido_id=p.id AND s.tipo='entrega' AND s.status='falhou'
        WHERE p.id=$1 AND p.tenant_id=$2 AND p.status='falha_entrega'
        ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE OF p,s`,
      [String(req.params.orderId), tenantId],
    );
    if (!order.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Pedido não possui falha elegível para reentrega." }); return;
    }
    const configDay = await client.query(
      `SELECT 1 FROM praca_logistica_config c
        WHERE c.tenant_id=$1 AND c.ativo=true
          AND extract(isodow FROM $2::date)::int=ANY(c.dias_semana)
          AND $2::date >= (now() AT TIME ZONE c.timezone)::date
          AND NOT EXISTS (
            SELECT 1 FROM praca_ondas_coleta o
             WHERE o.tenant_id=c.tenant_id AND o.data_servico=$2::date
               AND o.status<>'planejando'
          )`,
      [tenantId, serviceDate],
    );
    if (!configDay.rowCount) {
      await client.query("ROLLBACK");
      res.status(422).json({ error: "Data fora dos dias de operação ou anterior à data local do tenant." }); return;
    }
    const retry = await client.query(
      `INSERT INTO praca_reentregas
        (tenant_id,pedido_id,parada_falha_id,data_servico,motivo,solicitada_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId,order.rows[0].id,order.rows[0].parada_id,serviceDate,reason,user.id],
    );
    await client.query("UPDATE praca_rota_paradas SET status='ignorada',updated_at=now() WHERE id=$1", [order.rows[0].parada_id]);
    await client.query(
      "UPDATE praca_pedido_volumes SET status='pronto_coleta',updated_at=now() WHERE pedido_id=$1 AND status='falha_entrega'",
      [order.rows[0].id],
    );
    await client.query("UPDATE praca_pedidos SET status='pronto_coleta',updated_at=now() WHERE id=$1", [order.rows[0].id]);
    await client.query(
      `INSERT INTO praca_pedido_eventos
        (tenant_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,descricao,metadata)
       VALUES ($1,$2,'reentrega_solicitada','falha_entrega','pronto_coleta','tenant',$3,$4,$5)`,
      [tenantId,order.rows[0].id,user.id,reason,{ dataServico: serviceDate, reentregaId: retry.rows[0].id }],
    );
    if (order.rows[0].cliente_whatsapp) {
      await client.query(
        `INSERT INTO praca_entrega_notificacoes
          (tenant_id,pedido_id,destinatario_whatsapp,template,payload)
         VALUES ($1,$2,$3,'reentrega_agendada',$4)`,
        [tenantId,order.rows[0].id,order.rows[0].cliente_whatsapp,{ dataServico: serviceDate }],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ reattempt: retry.rows[0] });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") { res.status(409).json({ error: "Reentrega já cadastrada para esta data." }); return; }
    throw error;
  } finally {
    client.release();
  }
});


router.post("/tenants/:tenantId/praca-returns/:returnId/evidence-uploads",async(req,res)=>{
  const tenantId=String(req.params.tenantId),user=actor(req);
  if(!canAccess(req,tenantId)||!user.id||user.userFunction==="entrega"){ res.status(403).json({error:"Somente a operação pode registrar o recebimento."}); return; }
  const found=await vendorPool.query("SELECT d.pedido_id,v.id AS volume_id FROM praca_devolucoes d JOIN LATERAL (SELECT id FROM praca_pedido_volumes WHERE pedido_id=d.pedido_id ORDER BY numero LIMIT 1) v ON true WHERE d.id=$1 AND d.tenant_id=$2",[String(req.params.returnId),tenantId]);
  if(!found.rowCount){ res.status(404).json({error:"Devolução ou volume não encontrado."}); return; }
  const contentType=String(req.body?.contentType||""),size=Number(req.body?.size);
  const upload=await createEvidenceUpload(tenantId,found.rows[0].pedido_id,found.rows[0].volume_id,contentType,size);
  res.status(201).json(upload);
});

router.get("/tenants/:tenantId/praca-returns", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || actor(req).userFunction === "entrega") { res.status(403).json({ error: "Forbidden" }); return; }
  const result = await vendorPool.query(
    "SELECT d.*,p.cliente_nome,p.cliente_whatsapp,p.total_centavos,hub.nome AS ponto_redespacho_nome,c1.name AS entregador_coleta_nome,c2.name AS entregador_destino_nome,(SELECT count(*)::int FROM praca_devolucao_eventos e WHERE e.devolucao_id=d.id) AS total_eventos FROM praca_devolucoes d JOIN praca_pedidos p ON p.id=d.pedido_id LEFT JOIN praca_pontos_redespacho hub ON hub.id=d.ponto_redespacho_id LEFT JOIN users c1 ON c1.id=d.entregador_coleta_id LEFT JOIN users c2 ON c2.id=d.entregador_destino_id WHERE d.tenant_id=$1 ORDER BY CASE WHEN d.status IN ('recebida_vendedor','cancelada') THEN 1 ELSE 0 END,d.data_servico,d.solicitada_em",
    [tenantId],
  );
  res.json({ returns: result.rows });
});

router.get("/tenants/:tenantId/praca-returns/:returnId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const item = await vendorPool.query("SELECT d.*,p.cliente_nome,p.cliente_whatsapp,p.total_centavos FROM praca_devolucoes d JOIN praca_pedidos p ON p.id=d.pedido_id WHERE d.id=$1 AND d.tenant_id=$2",[String(req.params.returnId),tenantId]);
  if (!item.rowCount) { res.status(404).json({ error: "Devolução não encontrada." }); return; }
  const events = await vendorPool.query("SELECT * FROM praca_devolucao_eventos WHERE devolucao_id=$1 ORDER BY ocorrido_em,id",[item.rows[0].id]);
  res.json({ return:item.rows[0],events:events.rows });
});

router.post("/tenants/:tenantId/praca-orders/:orderId/returns", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  const user = actor(req);
  if (!canAccess(req, tenantId) || !user.id || user.userFunction === "entrega") { res.status(403).json({ error: "Somente a operação pode abrir devoluções." }); return; }
  const key = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  const reasonCode = message(req.body?.motivoCodigo);
  const reason = message(req.body?.motivoDescricao);
  const mode = req.body?.modeloLogistico === "redespacho" ? "redespacho" : "direto";
  const serviceDate = req.body?.dataServico;
  const firstCourier = message(req.body?.entregadorColetaId);
  const secondCourier = mode === "redespacho" ? message(req.body?.entregadorDestinoId) : firstCourier;
  const relayPointId = mode === "redespacho" ? message(req.body?.pontoRedespachoId) : "";
  const pickupSequence = Number(req.body?.sequenciaColeta || 1);
  const destinationSequence = Number(req.body?.sequenciaDestino || 2);
  if (!key || key.length>200 || !reasonCode || reason.length<5 || !validDate(serviceDate) || !firstCourier || !Number.isInteger(pickupSequence) || !Number.isInteger(destinationSequence) || pickupSequence<1 || destinationSequence<1) {
    res.status(422).json({ error: "Idempotência, motivo, data, entregador e sequências são obrigatórios." }); return;
  }
  if (mode==="redespacho" && (!relayPointId || !secondCourier || firstCourier===secondCourier)) {
    res.status(422).json({ error: "Redespacho exige ponto e dois entregadores diferentes." }); return;
  }

  const client=await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const replay=await client.query("SELECT * FROM praca_devolucoes WHERE tenant_id=$1 AND idempotency_key=$2",[tenantId,key]);
    if(replay.rowCount){await client.query("COMMIT");res.json({ return:replay.rows[0],idempotentReplay:true }); return;}
    const order=await client.query(
      "SELECT p.*,c.endereco_coleta AS endereco_vendedor,pi.status AS pagamento_status FROM praca_pedidos p JOIN praca_logistica_config c ON c.tenant_id=p.tenant_id AND c.ativo=true LEFT JOIN praca_payment_intents pi ON pi.order_id=p.id WHERE p.id=$1 AND p.tenant_id=$2 FOR UPDATE OF p",
      [orderId,tenantId],
    );
    if(!order.rowCount){await client.query("ROLLBACK");res.status(404).json({error:"Pedido ou configuração logística não encontrado."}); return;}
    const row=order.rows[0];
    if(!["entregue","falha_entrega"].includes(row.status)){await client.query("ROLLBACK");res.status(409).json({error:"Devolução permitida somente após entrega ou falha definitiva."}); return;}
    if(!["confirmed","received"].includes(row.pagamento_status)){await client.query("ROLLBACK");res.status(409).json({error:"O pedido não possui pagamento elegível para devolução."}); return;}
    const courierIds=[firstCourier,...(mode==="redespacho"?[secondCourier]:[])];
    const couriers=await client.query("SELECT id FROM users WHERE tenant_id=$1 AND active=true AND user_function='entrega' AND id=ANY($2::text[])",[tenantId,courierIds]);
    if(couriers.rowCount!==courierIds.length){await client.query("ROLLBACK");res.status(422).json({error:"Um dos entregadores não está ativo neste tenant."}); return;}
    if(mode==="redespacho"){
      const point=await client.query("SELECT 1 FROM praca_pontos_redespacho WHERE id=$1 AND tenant_id=$2 AND ativo=true",[relayPointId,tenantId]);
      if(!point.rowCount){await client.query("ROLLBACK");res.status(422).json({error:"Ponto de redespacho inválido ou inativo."}); return;}
    }
    const created=await client.query(
      "INSERT INTO praca_devolucoes (tenant_id,pedido_id,idempotency_key,motivo_codigo,motivo_descricao,modelo_logistico,status,data_servico,endereco_coleta,endereco_destino,ponto_redespacho_id,entregador_coleta_id,entregador_destino_id,sequencia_coleta,sequencia_destino,solicitada_por,agendada_em) VALUES ($1,$2,$3,$4,$5,$6,'agendada',$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,now()) RETURNING *",
      [tenantId,orderId,key,reasonCode,reason,mode,serviceDate,JSON.stringify(row.endereco_entrega),JSON.stringify(row.endereco_vendedor),relayPointId||null,firstCourier,secondCourier,pickupSequence,destinationSequence,user.id],
    );
    await client.query("UPDATE praca_pedidos SET status='devolucao_solicitada',updated_at=now() WHERE id=$1",[orderId]);
    await client.query("INSERT INTO praca_devolucao_eventos (tenant_id,devolucao_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,motivo,metadata) VALUES ($1,$2,$3,'devolucao_agendada',$4,'agendada','tenant',$5,$6,$7::jsonb)",[tenantId,created.rows[0].id,orderId,row.status,user.id,reason,JSON.stringify({modeloLogistico:mode,dataServico:serviceDate,sequenciaColeta:pickupSequence,sequenciaDestino:destinationSequence})]);
    await client.query("INSERT INTO praca_pedido_eventos (tenant_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,motivo_codigo,descricao,metadata) VALUES ($1,$2,'devolucao_agendada',$3,'devolucao_solicitada','tenant',$4,$5,$6,$7::jsonb)",[tenantId,orderId,row.status,user.id,reasonCode,reason,JSON.stringify({devolucaoId:created.rows[0].id,qrCode:created.rows[0].qr_code})]);
    if(row.cliente_whatsapp) await client.query("INSERT INTO praca_entrega_notificacoes (tenant_id,pedido_id,destinatario_whatsapp,template,payload) VALUES ($1,$2,$3,'devolucao_agendada',$4::jsonb)",[tenantId,orderId,row.cliente_whatsapp,JSON.stringify({dataServico:serviceDate,motivo:reason})]);
    await client.query("COMMIT");
    res.status(201).json({return:created.rows[0]});
  } catch(error:any) {
    await client.query("ROLLBACK");
    if(error?.code==="23505") { res.status(409).json({error:"Este pedido já possui uma devolução."}); return; }
    throw error;
  } finally { client.release(); }
});

router.post("/tenants/:tenantId/praca-returns/:returnId/events", async (req,res)=>{
  const tenantId=String(req.params.tenantId),returnId=String(req.params.returnId);
  const user=actor(req);
  if(!canAccess(req,tenantId)||!user.id){ res.status(403).json({error:"Forbidden"}); return; }
  const action=String(req.body?.acao||"");
  const rawQr=message(req.body?.qrCode),qrCode=rawQr.startsWith("APPVENDOR:RETURN:")?rawQr.slice(17):rawQr;
  if(!qrCode){ res.status(422).json({error:"QR Code da devolução é obrigatório."}); return; }
  const lat=req.body?.latitude==null?null:Number(req.body.latitude),lng=req.body?.longitude==null?null:Number(req.body.longitude);
  if((lat!=null&&(!Number.isFinite(lat)||lat< -90||lat>90))||(lng!=null&&(!Number.isFinite(lng)||lng< -180||lng>180))){ res.status(422).json({error:"Coordenadas inválidas."}); return; }
  const client=await vendorPool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT d.*,p.cliente_whatsapp FROM praca_devolucoes d JOIN praca_pedidos p ON p.id=d.pedido_id WHERE d.id=$1 AND d.tenant_id=$2 FOR UPDATE OF d",[returnId,tenantId]);
    if(!found.rowCount){await client.query("ROLLBACK");res.status(404).json({error:"Devolução não encontrada."}); return;}
    const row=found.rows[0],isCourier=user.userFunction==="entrega";
    if(qrCode!==row.qr_code){await client.query("ROLLBACK");res.status(422).json({error:"QR Code não pertence a esta devolução."}); return;}
    const transitions:any={
      direto:{coletar_cliente:["agendada","em_rota_vendedor"],receber_vendedor:["em_rota_vendedor","recebida_vendedor"]},
      redespacho:{coletar_cliente:["agendada","em_rota_redespacho"],receber_redespacho:["em_rota_redespacho","recebida_redespacho"],sair_redespacho:["recebida_redespacho","em_rota_vendedor"],receber_vendedor:["em_rota_vendedor","recebida_vendedor"]},
    };
    const transition=transitions[row.modelo_logistico]?.[action];
    if(!transition||row.status!==transition[0]){await client.query("ROLLBACK");res.status(409).json({error:"Movimento incompatível com a etapa atual da devolução."}); return;}
    if(isCourier){
      const allowedCourier=action==="coletar_cliente"?row.entregador_coleta_id:row.entregador_destino_id;
      if(action==="receber_vendedor"||allowedCourier!==user.id){await client.query("ROLLBACK");res.status(403).json({error:"A etapa pertence a outro responsável."}); return;}
      if(lat==null||lng==null){await client.query("ROLLBACK");res.status(422).json({error:"Entregador deve registrar localização real."}); return;}
    } else if(action!=="receber_vendedor"){
      await client.query("ROLLBACK");res.status(403).json({error:"Esta etapa deve ser registrada pelo entregador responsável."}); return;
    }
    const evidence=req.body?.evidencia&&typeof req.body.evidencia==="object"?req.body.evidencia:{};
    if(action==="receber_vendedor"&&(!message(req.body?.condicaoRecebimento)||!Object.keys(evidence).length)){
      await client.query("ROLLBACK");res.status(422).json({error:"Recebimento exige condição do produto e evidência."}); return;
    }
    const next=transition[1];
    await client.query("UPDATE praca_devolucoes SET status=$1,coletada_em=CASE WHEN $2='coletar_cliente' THEN now() ELSE coletada_em END,recebida_em=CASE WHEN $1='recebida_vendedor' THEN now() ELSE recebida_em END,recebida_por=CASE WHEN $1='recebida_vendedor' THEN $3 ELSE recebida_por END,condicao_recebimento=CASE WHEN $1='recebida_vendedor' THEN $4 ELSE condicao_recebimento END,evidencia_recebimento=CASE WHEN $1='recebida_vendedor' THEN $5::jsonb ELSE evidencia_recebimento END,updated_at=now() WHERE id=$6",[next,action,user.id,message(req.body?.condicaoRecebimento)||null,JSON.stringify(evidence),returnId]);
    await client.query("INSERT INTO praca_devolucao_eventos (tenant_id,devolucao_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,latitude,longitude,motivo,evidencia,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)",[tenantId,returnId,row.pedido_id,action,row.status,next,isCourier?"entregador":"tenant",user.id,lat,lng,message(req.body?.motivo)||null,JSON.stringify(evidence),JSON.stringify({qrCode:row.qr_code})]);
    await client.query("INSERT INTO praca_pedido_eventos (tenant_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,latitude,longitude,descricao,evidencia,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)",[tenantId,row.pedido_id,"devolucao_"+action,row.status,next,isCourier?"entregador":"tenant",user.id,lat,lng,message(req.body?.motivo)||null,JSON.stringify(evidence),JSON.stringify({devolucaoId:returnId})]);
    if(next==="recebida_vendedor") await client.query("UPDATE praca_pedidos SET status='devolvido',updated_at=now() WHERE id=$1",[row.pedido_id]);
    if(row.cliente_whatsapp) await client.query("INSERT INTO praca_entrega_notificacoes (tenant_id,pedido_id,destinatario_whatsapp,template,payload) VALUES ($1,$2,$3,'devolucao_atualizada',$4::jsonb)",[tenantId,row.pedido_id,row.cliente_whatsapp,JSON.stringify({status:next})]);
    await client.query("COMMIT");
    res.json({ok:true,returnId,status:next,refundEligible:next==="recebida_vendedor"});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

export default router;
