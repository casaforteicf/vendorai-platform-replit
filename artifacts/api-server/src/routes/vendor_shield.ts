import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";
import { assessVendorShieldRisk, recordShieldVelocityEvent, shieldHash } from "../services/vendorShield";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function actorId(req: Express.Request) {
  const user = (req as any).user;
  return String(user?.id || user?.sub || "") || null;
}

router.get("/tenants/:tenantId/vendor-shield/config", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await vendorPool.query(
    `SELECT tenant_id AS "tenantId",enabled,review_threshold AS "reviewThreshold",
            block_threshold AS "blockThreshold",require_3ds_threshold AS "require3dsThreshold",
            high_value_centavos AS "highValueCentavos",
            new_vendor_reserve_bps AS "newVendorReserveBps",
            medium_risk_reserve_bps AS "mediumRiskReserveBps",
            high_risk_reserve_bps AS "highRiskReserveBps",
            velocity_max_attempts_10m AS "velocityMaxAttempts10m",
            velocity_max_cards_24h AS "velocityMaxCards24h",
            velocity_max_accounts_24h AS "velocityMaxAccounts24h",
            require_delivery_otp AS "requireDeliveryOtp",
            require_delivery_photo AS "requireDeliveryPhoto",
            require_delivery_geo AS "requireDeliveryGeo",metadata,updated_at AS "updatedAt"
       FROM vendor_shield_configs WHERE tenant_id=$1`,
    [tenantId],
  );
  if (result.rowCount) return res.json(result.rows[0]);
  return res.json({
    tenantId, enabled: true, reviewThreshold: 61, blockThreshold: 81,
    require3dsThreshold: 31, highValueCentavos: 300000,
    newVendorReserveBps: 1000, mediumRiskReserveBps: 500, highRiskReserveBps: 1500,
    velocityMaxAttempts10m: 5, velocityMaxCards24h: 3, velocityMaxAccounts24h: 3,
    requireDeliveryOtp: true, requireDeliveryPhoto: true, requireDeliveryGeo: true,
    metadata: {}, inheritedDefaults: true,
  });
});

router.put("/tenants/:tenantId/vendor-shield/config", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const user = (req as any).user;
  if (user?.platformRole !== "super_admin" && user?.role !== "tenant_admin") {
    return res.status(403).json({ error: "Somente administrador pode alterar a política de risco." });
  }

  const values = {
    enabled: req.body?.enabled !== false,
    review: Number(req.body?.reviewThreshold ?? 61),
    block: Number(req.body?.blockThreshold ?? 81),
    threeDs: Number(req.body?.require3dsThreshold ?? 31),
    highValue: Number(req.body?.highValueCentavos ?? 300000),
    newVendor: Number(req.body?.newVendorReserveBps ?? 1000),
    mediumReserve: Number(req.body?.mediumRiskReserveBps ?? 500),
    highReserve: Number(req.body?.highRiskReserveBps ?? 1500),
    attempts: Number(req.body?.velocityMaxAttempts10m ?? 5),
    cards: Number(req.body?.velocityMaxCards24h ?? 3),
    accounts: Number(req.body?.velocityMaxAccounts24h ?? 3),
    otp: req.body?.requireDeliveryOtp !== false,
    photo: req.body?.requireDeliveryPhoto !== false,
    geo: req.body?.requireDeliveryGeo !== false,
  };
  if (![values.review, values.block, values.threeDs].every(Number.isInteger) ||
      values.threeDs < 1 || values.threeDs > values.review || values.review >= values.block || values.block > 100 ||
      ![values.highValue,values.newVendor,values.mediumReserve,values.highReserve,values.attempts,values.cards,values.accounts].every(Number.isInteger) ||
      values.highValue < 0 || [values.newVendor,values.mediumReserve,values.highReserve].some((v) => v < 0 || v > 10000) ||
      [values.attempts,values.cards,values.accounts].some((v) => v < 1)) {
    return res.status(422).json({ error: "Configuração de risco inválida." });
  }

  const result = await vendorPool.query(
    `INSERT INTO vendor_shield_configs
      (tenant_id,enabled,review_threshold,block_threshold,require_3ds_threshold,high_value_centavos,
       new_vendor_reserve_bps,medium_risk_reserve_bps,high_risk_reserve_bps,
       velocity_max_attempts_10m,velocity_max_cards_24h,velocity_max_accounts_24h,
       require_delivery_otp,require_delivery_photo,require_delivery_geo,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
     ON CONFLICT (tenant_id) DO UPDATE SET
       enabled=excluded.enabled,review_threshold=excluded.review_threshold,block_threshold=excluded.block_threshold,
       require_3ds_threshold=excluded.require_3ds_threshold,high_value_centavos=excluded.high_value_centavos,
       new_vendor_reserve_bps=excluded.new_vendor_reserve_bps,medium_risk_reserve_bps=excluded.medium_risk_reserve_bps,
       high_risk_reserve_bps=excluded.high_risk_reserve_bps,velocity_max_attempts_10m=excluded.velocity_max_attempts_10m,
       velocity_max_cards_24h=excluded.velocity_max_cards_24h,velocity_max_accounts_24h=excluded.velocity_max_accounts_24h,
       require_delivery_otp=excluded.require_delivery_otp,require_delivery_photo=excluded.require_delivery_photo,
       require_delivery_geo=excluded.require_delivery_geo,metadata=excluded.metadata,updated_at=now()
     RETURNING *`,
    [tenantId,values.enabled,values.review,values.block,values.threeDs,values.highValue,values.newVendor,
     values.mediumReserve,values.highReserve,values.attempts,values.cards,values.accounts,values.otp,values.photo,values.geo,
     JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {})],
  );
  await vendorPool.query(
    `INSERT INTO vendor_shield_audit_events (tenant_id,event_type,actor_id,metadata)
     VALUES ($1,'config_updated',$2,$3::jsonb)`,
    [tenantId,actorId(req),JSON.stringify(values)],
  );
  return res.json(result.rows[0]);
});

router.post("/tenants/:tenantId/vendor-shield/assess", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : null;
  const amountCentavos = Number(req.body?.amountCentavos);
  if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 0) {
    return res.status(422).json({ error: "amountCentavos obrigatório e deve ser inteiro." });
  }
  try {
    const result = await assessVendorShieldRisk(tenantId, orderId, {
      customerId: req.body?.customerId,
      document: req.body?.document,
      email: req.body?.email,
      phone: req.body?.phone,
      deviceId: req.body?.deviceId,
      ip: req.body?.ip || req.ip,
      cardFingerprint: req.body?.cardFingerprint,
      amountCentavos,
      billingType: req.body?.billingType,
      accountAgeDays: req.body?.accountAgeDays == null ? null : Number(req.body.accountAgeDays),
      successfulOrders: req.body?.successfulOrders == null ? null : Number(req.body.successfulOrders),
      previousChargebacks: req.body?.previousChargebacks == null ? null : Number(req.body.previousChargebacks),
      previousFraud: req.body?.previousFraud == null ? null : Number(req.body.previousFraud),
      addressMismatch: Boolean(req.body?.addressMismatch),
      geolocationMismatch: Boolean(req.body?.geolocationMismatch),
      proxyOrVpn: Boolean(req.body?.proxyOrVpn),
      threeDsAvailable: Boolean(req.body?.threeDsAvailable),
      threeDsAuthenticated: Boolean(req.body?.threeDsAuthenticated),
      vendorAgeDays: req.body?.vendorAgeDays == null ? null : Number(req.body.vendorAgeDays),
      vendorChargebackRateBps: req.body?.vendorChargebackRateBps == null ? null : Number(req.body.vendorChargebackRateBps),
      manualFlags: Array.isArray(req.body?.manualFlags) ? req.body.manualFlags.map(String) : [],
    }, { phase: typeof req.body?.phase === "string" ? req.body.phase : "pre_payment" });
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(422).json({ error: String(error?.message ?? error) });
  }
});

router.post("/tenants/:tenantId/vendor-shield/velocity-events", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const eventType = String(req.body?.eventType || "");
  const allowed = new Set(["checkout","payment_attempt","payment_authorized","payment_failed","refund","chargeback","account_created"]);
  if (!allowed.has(eventType)) return res.status(422).json({ error: "eventType inválido." });
  await recordShieldVelocityEvent({
    tenantId,
    orderId: typeof req.body?.orderId === "string" ? req.body.orderId : null,
    eventType: eventType as any,
    deviceId: req.body?.deviceId,
    ip: req.body?.ip || req.ip,
    document: req.body?.document,
    cardFingerprint: req.body?.cardFingerprint,
    amountCentavos: Number.isSafeInteger(req.body?.amountCentavos) ? req.body.amountCentavos : null,
    metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
  });
  return res.status(201).json({ ok: true });
});

router.post("/tenants/:tenantId/praca-orders/:orderId/shield-evidence", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const evidenceType = String(req.body?.evidenceType || "");
  if (!["otp","photo","geolocation","signature","recipient_document","courier_identity","handoff","other"].includes(evidenceType)) {
    return res.status(422).json({ error: "Tipo de evidência inválido." });
  }
  const order = await vendorPool.query("SELECT 1 FROM praca_pedidos WHERE tenant_id=$1 AND id=$2", [tenantId,orderId]);
  if (!order.rowCount) return res.status(404).json({ error: "Pedido não encontrado." });

  const result = await vendorPool.query(
    `INSERT INTO vendor_shield_delivery_evidence
      (tenant_id,order_id,event_id,evidence_type,storage_url,evidence_hash,latitude,longitude,
       recipient_name,recipient_document_hash,captured_by,metadata,captured_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,coalesce($13::timestamptz,now()))
     RETURNING id,evidence_type AS "evidenceType",captured_at AS "capturedAt"`,
    [tenantId,orderId,Number.isSafeInteger(req.body?.eventId) ? req.body.eventId : null,evidenceType,
     typeof req.body?.storageUrl === "string" ? req.body.storageUrl : null,
     typeof req.body?.evidenceHash === "string" ? req.body.evidenceHash : null,
     Number.isFinite(req.body?.latitude) ? Number(req.body.latitude) : null,
     Number.isFinite(req.body?.longitude) ? Number(req.body.longitude) : null,
     typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() || null : null,
     shieldHash(typeof req.body?.recipientDocument === "string" ? req.body.recipientDocument.replace(/\D/g, "") : null),
     actorId(req),JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
     typeof req.body?.capturedAt === "string" ? req.body.capturedAt : null],
  );
  await vendorPool.query(
    `INSERT INTO vendor_shield_audit_events (tenant_id,order_id,event_type,actor_id,metadata)
     VALUES ($1,$2,'delivery_evidence_added',$3,$4::jsonb)`,
    [tenantId,orderId,actorId(req),JSON.stringify({ evidenceId: result.rows[0].id, evidenceType })],
  );
  return res.status(201).json(result.rows[0]);
});

router.get("/tenants/:tenantId/praca-orders/:orderId/shield-evidence", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const [evidence, assessments] = await Promise.all([
    vendorPool.query(
      `SELECT id,evidence_type AS "evidenceType",storage_url AS "storageUrl",evidence_hash AS "evidenceHash",
              latitude,longitude,recipient_name AS "recipientName",metadata,captured_at AS "capturedAt"
         FROM vendor_shield_delivery_evidence WHERE tenant_id=$1 AND order_id=$2 ORDER BY captured_at,id`,
      [tenantId,orderId],
    ),
    vendorPool.query(
      `SELECT id,phase,score,risk_level AS "riskLevel",decision,reserve_bps AS "reserveBps",
              require_3ds AS "require3ds",reasons,signals,model_version AS "modelVersion",created_at AS "createdAt"
         FROM vendor_shield_assessments WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at DESC`,
      [tenantId,orderId],
    ),
  ]);
  return res.json({ evidence: evidence.rows, assessments: assessments.rows });
});

router.post("/tenants/:tenantId/praca-orders/:orderId/shield-disputes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const payment = await vendorPool.query(
    `SELECT id,gross_centavos FROM praca_payment_intents WHERE tenant_id=$1 AND order_id=$2`,
    [tenantId,orderId],
  );
  if (!payment.rowCount) return res.status(404).json({ error: "Pagamento não encontrado." });
  const result = await vendorPool.query(
    `INSERT INTO vendor_shield_disputes
      (tenant_id,order_id,payment_intent_id,provider,provider_dispute_id,reason_code,reason,amount_centavos,status,pre_dispute,response_deadline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (tenant_id,provider,provider_dispute_id) WHERE provider_dispute_id IS NOT NULL
     DO UPDATE SET reason_code=excluded.reason_code,reason=excluded.reason,status=excluded.status,
                   response_deadline=excluded.response_deadline,updated_at=now()
     RETURNING id,status,opened_at AS "openedAt"`,
    [tenantId,orderId,payment.rows[0].id,typeof req.body?.provider === "string" ? req.body.provider : "asaas",
     typeof req.body?.providerDisputeId === "string" ? req.body.providerDisputeId : null,
     typeof req.body?.reasonCode === "string" ? req.body.reasonCode : null,
     typeof req.body?.reason === "string" ? req.body.reason : null,
     Number.isSafeInteger(req.body?.amountCentavos) ? req.body.amountCentavos : Number(payment.rows[0].gross_centavos),
     req.body?.preDispute ? "alerted" : "open",Boolean(req.body?.preDispute),
     typeof req.body?.responseDeadline === "string" ? req.body.responseDeadline : null],
  );
  await recordShieldVelocityEvent({ tenantId,orderId,eventType:"chargeback",amountCentavos:Number(payment.rows[0].gross_centavos) });
  return res.status(201).json(result.rows[0]);
});

router.post("/tenants/:tenantId/vendor-shield/disputes/:disputeId/build-evidence", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const disputeId = String(req.params.disputeId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const dispute = await vendorPool.query(
    `SELECT d.*,p.provider_payment_id,p.billing_type,p.status AS payment_status,p.confirmed_at,p.received_at,
            o.cliente_nome,o.cliente_email,o.cliente_whatsapp,o.endereco_entrega,o.status AS order_status,o.created_at AS order_created_at
       FROM vendor_shield_disputes d
       JOIN praca_pedidos o ON o.id=d.order_id AND o.tenant_id=d.tenant_id
       LEFT JOIN praca_payment_intents p ON p.id=d.payment_intent_id
      WHERE d.tenant_id=$1 AND d.id=$2`,
    [tenantId,disputeId],
  );
  if (!dispute.rowCount) return res.status(404).json({ error: "Disputa não encontrada." });
  const d = dispute.rows[0];
  const [events,evidence,assessments] = await Promise.all([
    vendorPool.query(
      `SELECT tipo,status_anterior,status_novo,ator_tipo,latitude,longitude,motivo_codigo,descricao,evidencia,metadata,ocorrido_em
         FROM praca_pedido_eventos WHERE tenant_id=$1 AND pedido_id=$2 ORDER BY ocorrido_em,id`,
      [tenantId,d.order_id],
    ),
    vendorPool.query(
      `SELECT evidence_type,storage_url,evidence_hash,latitude,longitude,recipient_name,metadata,captured_at
         FROM vendor_shield_delivery_evidence WHERE tenant_id=$1 AND order_id=$2 ORDER BY captured_at,id`,
      [tenantId,d.order_id],
    ),
    vendorPool.query(
      `SELECT score,risk_level,decision,require_3ds,reasons,signals,model_version,created_at
         FROM vendor_shield_assessments WHERE tenant_id=$1 AND order_id=$2 ORDER BY created_at`,
      [tenantId,d.order_id],
    ),
  ]);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    dispute: { id:d.id,provider:d.provider,providerDisputeId:d.provider_dispute_id,reasonCode:d.reason_code,reason:d.reason,amountCentavos:d.amount_centavos },
    payment: { providerPaymentId:d.provider_payment_id,billingType:d.billing_type,status:d.payment_status,confirmedAt:d.confirmed_at,receivedAt:d.received_at },
    order: { id:d.order_id,status:d.order_status,createdAt:d.order_created_at,customerName:d.cliente_nome,customerEmail:d.cliente_email,customerPhone:d.cliente_whatsapp,deliveryAddress:d.endereco_entrega },
    riskAssessments: assessments.rows,
    fulfillmentTimeline: events.rows,
    deliveryEvidence: evidence.rows,
  };
  await vendorPool.query(
    `UPDATE vendor_shield_disputes SET status='evidence_ready',evidence_snapshot=$1::jsonb,updated_at=now()
      WHERE tenant_id=$2 AND id=$3`,
    [JSON.stringify(snapshot),tenantId,disputeId],
  );
  await vendorPool.query(
    `INSERT INTO vendor_shield_audit_events (tenant_id,order_id,dispute_id,event_type,actor_id,metadata)
     VALUES ($1,$2,$3,'chargeback_evidence_built',$4,$5::jsonb)`,
    [tenantId,d.order_id,disputeId,actorId(req),JSON.stringify({ evidenceCount:evidence.rowCount,eventCount:events.rowCount })],
  );
  return res.json({ disputeId,status:"evidence_ready",snapshot });
});

router.get("/tenants/:tenantId/vendor-shield/dashboard", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const [risk,disputes,evidence] = await Promise.all([
    vendorPool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE decision='block')::int AS blocked,
              count(*) FILTER (WHERE decision='review')::int AS review,
              count(*) FILTER (WHERE require_3ds)::int AS "threeDs",
              round(avg(score),1) AS "averageScore"
         FROM vendor_shield_assessments WHERE tenant_id=$1 AND created_at >= now()-interval '30 days'`,
      [tenantId],
    ),
    vendorPool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status IN ('alerted','open','evidence_ready','submitted'))::int AS open,
              count(*) FILTER (WHERE status='won')::int AS won,
              count(*) FILTER (WHERE status='lost')::int AS lost,
              coalesce(sum(amount_centavos) FILTER (WHERE status IN ('alerted','open','evidence_ready','submitted')),0)::bigint AS "exposureCentavos"
         FROM vendor_shield_disputes WHERE tenant_id=$1 AND opened_at >= now()-interval '90 days'`,
      [tenantId],
    ),
    vendorPool.query(
      `SELECT count(*)::int AS total FROM vendor_shield_delivery_evidence WHERE tenant_id=$1 AND captured_at >= now()-interval '30 days'`,
      [tenantId],
    ),
  ]);
  return res.json({ periodDays:30,risk:risk.rows[0],disputes:disputes.rows[0],deliveryEvidence:evidence.rows[0] });
});

export default router;
