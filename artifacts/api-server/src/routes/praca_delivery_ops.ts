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
pracaDeliveryPublicRouter.use(rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}));

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

pracaDeliveryPublicRouter.get("/public/praca-delivery/:trackingToken", async (req, res) => {
  const token = String(req.params.trackingToken);
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ error: "Rastreamento não encontrado." });
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
  if (!order.rowCount) return res.status(404).json({ error: "Rastreamento não encontrado." });
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
  res.json({ order: order.rows[0], interactions: interactions.rows, legs: legs.rows, transfers: transfers.rows });
});

pracaDeliveryPublicRouter.post("/public/praca-delivery/:trackingToken/messages", async (req, res) => {
  const token = String(req.params.trackingToken);
  const body = message(req.body?.mensagem);
  if (!/^[a-f0-9]{64}$/.test(token) || !body || body.length > 4000) {
    return res.status(422).json({ error: "Mensagem inválida." });
  }
  const order = await vendorPool.query(
    "SELECT id,tenant_id FROM praca_pedidos WHERE tracking_token=$1",
    [token],
  );
  if (!order.rowCount) return res.status(404).json({ error: "Rastreamento não encontrado." });
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
  if (!canAccess(req, tenantId) || !user.id) return res.status(403).json({ error: "Forbidden" });
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
  if (!volume.rowCount) return res.status(404).json({ error: "Volume não encontrado." });
  if (user.userFunction === "entrega" && volume.rows[0].entregador_id !== user.id) {
    return res.status(403).json({ error: "Volume pertence a outro entregador." });
  }
  const upload = await createEvidenceUpload(tenantId, volume.rows[0].pedido_id, volumeId, contentType, size);
  res.status(201).json(upload);
});

router.get("/tenants/:tenantId/praca-delivery/evidence/:kind/:evidenceId/url", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const kind = String(req.params.kind);
  if (!["proof","failure"].includes(kind)) return res.status(404).json({ error: "Evidência não encontrada." });
  const table = kind === "proof" ? "praca_entrega_provas" : "praca_entrega_falhas";
  const result = await vendorPool.query(
    `SELECT foto_url,rota_id FROM ${table} WHERE id=$1 AND tenant_id=$2`,
    [String(req.params.evidenceId), tenantId],
  );
  if (!result.rowCount || !result.rows[0].foto_url) return res.status(404).json({ error: "Evidência não encontrada." });
  const user = actor(req);
  if (user.userFunction === "entrega") {
    const route = await vendorPool.query("SELECT entregador_id FROM praca_rotas_entrega WHERE id=$1", [result.rows[0].rota_id]);
    if (route.rows[0]?.entregador_id !== user.id) return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ url: await createEvidenceReadUrl(result.rows[0].foto_url), expiresIn: 300 });
});

router.get("/tenants/:tenantId/praca-delivery/monitor", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || actor(req).userFunction === "entrega") return res.status(403).json({ error: "Forbidden" });
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
          AND p.status IN ('recebido','pagamento_pendente','pronto_coleta','coleta_agendada','coletado','em_rota','falha_entrega')
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
  if (!canAccess(req, tenantId) || !user.id) return res.status(403).json({ error: "Forbidden" });
  const body = message(req.body?.mensagem);
  if (!body || body.length > 4000) return res.status(422).json({ error: "Mensagem inválida." });

  const order = await vendorPool.query(
    `SELECT p.id,p.cliente_whatsapp,r.id AS rota_id,r.entregador_id
       FROM praca_pedidos p
       LEFT JOIN praca_rota_paradas s ON s.pedido_id=p.id AND s.tipo='entrega'
       LEFT JOIN praca_rotas_entrega r ON r.id=s.rota_id
      WHERE p.id=$1 AND p.tenant_id=$2 ORDER BY s.created_at DESC LIMIT 1`,
    [String(req.params.orderId), tenantId],
  );
  if (!order.rowCount) return res.status(404).json({ error: "Pedido não encontrado." });
  if (user.userFunction === "entrega" && order.rows[0].entregador_id !== user.id) {
    return res.status(403).json({ error: "Pedido pertence a outro entregador." });
  }
  if (!order.rows[0].cliente_whatsapp) return res.status(422).json({ error: "Cliente sem WhatsApp cadastrado." });

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
    return res.status(403).json({ error: "Somente o operador pode autorizar reentrega." });
  }
  const serviceDate = req.body?.dataServico;
  const reason = message(req.body?.motivo);
  if (!validDate(serviceDate) || !reason) {
    return res.status(422).json({ error: "Data de serviço e motivo são obrigatórios." });
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
      return res.status(409).json({ error: "Pedido não possui falha elegível para reentrega." });
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
      return res.status(422).json({ error: "Data fora dos dias de operação ou anterior à data local do tenant." });
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
    if (error?.code === "23505") return res.status(409).json({ error: "Reentrega já cadastrada para esta data." });
    throw error;
  } finally {
    client.release();
  }
});

export default router;
