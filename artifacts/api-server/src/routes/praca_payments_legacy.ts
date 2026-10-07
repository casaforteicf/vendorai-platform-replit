import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { vendorPool } from "../lib/vendorDb";

const router: IRouter = Router();
export const pracaPaymentsPublicRouter: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function safeTokenMatch(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function centsToDecimal(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function integerCents(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

async function resolveMarketplaceCommissionForOrder(
  tenantId: string,
  orderId: string,
  billingType: string,
  grossCentavos: number,
  commissionBaseCentavos: number,
) {
  const items = await vendorPool.query(
    `SELECT i.produto_id,i.sku,i.total_centavos,
            p.marca,p.categoria_id,
            COALESCE(cat.nome,'') AS categoria
       FROM praca_pedido_itens i
       JOIN produtos_catalogo p ON p.id=i.produto_id
       LEFT JOIN categorias_produto cat ON cat.id=p.categoria_id
      WHERE i.tenant_id=$1 AND i.pedido_id=$2
      ORDER BY i.id`,
    [tenantId, orderId],
  );

  let totalCommissionCentavos = 0;
  const itemRules: any[] = [];
  const rawItemsTotal = items.rows.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.total_centavos || 0)), 0);
  const discountFactor = rawItemsTotal > 0 ? Math.min(1, commissionBaseCentavos / rawItemsTotal) : 1;
  for (const item of items.rows) {
    const ctx = {
      billingType,
      orderValue: grossCentavos / 100,
      sellerTenantId: tenantId,
    };
    const resolved = await vendorPool.query(
      `SELECT * FROM public.arqdor_market_resolve_commission_v2(
        $1,$2,$3,$4,$5,$6,$7::jsonb
      )`,
      [
        tenantId,
        item.categoria || null,
        item.categoria || null,
        item.produto_id || null,
        item.sku || null,
        item.marca || null,
        JSON.stringify(ctx),
      ],
    );
    const rule = resolved.rows[0] || null;
    const percentage = Number(rule?.percentage ?? 10);
    const itemBase = Math.round(Math.max(0, Number(item.total_centavos || 0)) * discountFactor);
    const itemCommission = Math.round(itemBase * percentage / 100);
    totalCommissionCentavos += itemCommission;
    itemRules.push({
      productId: item.produto_id,
      sku: item.sku,
      brand: item.marca,
      category: item.categoria,
      baseCentavos: itemBase,
      commissionCentavos: itemCommission,
      ruleId: rule?.rule_id || null,
      percentage,
      ruleName: rule?.rule_name || null,
      ruleKind: rule?.rule_kind || null,
      campaignCode: rule?.campaign_code || null,
    });
  }

  if (!items.rows.length) {
    const fallback = await vendorPool.query(
      `SELECT * FROM public.arqdor_market_resolve_commission_v2(
        $1,NULL,NULL,NULL,NULL,NULL,$2::jsonb
      )`,
      [tenantId, JSON.stringify({ billingType, orderValue: grossCentavos / 100, sellerTenantId: tenantId })],
    );
    const rule = fallback.rows[0] || null;
    const percentage = Number(rule?.percentage ?? 10);
    totalCommissionCentavos = Math.round(commissionBaseCentavos * percentage / 100);
    itemRules.push({
      productId: null,
      baseCentavos: commissionBaseCentavos,
      commissionCentavos: totalCommissionCentavos,
      ruleId: rule?.rule_id || null,
      percentage,
      ruleName: rule?.rule_name || null,
      ruleKind: rule?.rule_kind || null,
      campaignCode: rule?.campaign_code || null,
    });
  }

  return { totalCommissionCentavos, itemRules };
}

const EVENT_STATUS: Record<string, string> = {
  PAYMENT_CREATED: "pending",
  PAYMENT_UPDATED: "pending",
  PAYMENT_AUTHORIZED: "confirmed",
  PAYMENT_CONFIRMED: "confirmed",
  PAYMENT_RECEIVED: "received",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_REFUND_IN_PROGRESS: "refunded",
  PAYMENT_CHARGEBACK_REQUESTED: "chargeback",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "chargeback",
  PAYMENT_DELETED: "cancelled",
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: "failed",
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: "failed",
};

router.put("/tenants/:tenantId/payment-recipients/:ownerType/:ownerId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const ownerType = String(req.params.ownerType);
  const ownerId = String(req.params.ownerId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!["seller", "praca", "courier"].includes(ownerType)) {
    return res.status(422).json({ error: "Tipo de beneficiário inválido." });
  }
  const walletId = typeof req.body?.walletId === "string" ? req.body.walletId.trim() : "";
  if (!walletId || walletId.length > 200) {
    return res.status(422).json({ error: "walletId obrigatório." });
  }
  const result = await vendorPool.query(
    `INSERT INTO praca_payment_recipients
      (tenant_id,owner_type,owner_id,provider,wallet_id,status,metadata)
     VALUES ($1,$2,$3,'asaas',$4,'active',$5::jsonb)
     ON CONFLICT (tenant_id,provider,owner_type,owner_id)
     DO UPDATE SET wallet_id=excluded.wallet_id,status='active',
                   metadata=excluded.metadata,updated_at=now()
     RETURNING id,owner_type AS "ownerType",owner_id AS "ownerId",
               provider,wallet_id AS "walletId",status,updated_at AS "updatedAt"`,
    [tenantId,ownerType,ownerId,walletId,
     JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {})],
  );
  return res.json(result.rows[0]);
});

router.get("/tenants/:tenantId/payment-recipients", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await vendorPool.query(
    `SELECT id,owner_type AS "ownerType",owner_id AS "ownerId",provider,
            wallet_id AS "walletId",status,metadata,updated_at AS "updatedAt"
       FROM praca_payment_recipients WHERE tenant_id=$1 ORDER BY owner_type,owner_id`,
    [tenantId],
  );
  return res.json(result.rows);
});

router.get("/tenants/:tenantId/praca-payment-options", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const [courierRecipients, relayPoints] = await Promise.all([
    vendorPool.query(
      `SELECT u.id,u.name,u.email,u.telefone,r.wallet_id AS "walletId"
         FROM users u
         LEFT JOIN praca_payment_recipients r
           ON r.tenant_id=u.tenant_id AND r.owner_type='courier'
          AND r.owner_id=u.id AND r.provider='asaas' AND r.status='active'
        WHERE u.tenant_id=$1 AND u.active=true AND u.user_function='entrega'
        ORDER BY u.name,u.id`,
      [tenantId],
    ),
    vendorPool.query(
      `SELECT id,nome,endereco,latitude,longitude
         FROM praca_pontos_redespacho
        WHERE tenant_id=$1 AND ativo=true ORDER BY nome,id`,
      [tenantId],
    ),
  ]);
  const couriers = courierRecipients.rows.filter((item: any) => Boolean(item.walletId));
  res.json({ couriers, courierRecipients: courierRecipients.rows, relayPoints: relayPoints.rows });
});

router.post("/tenants/:tenantId/praca-orders/:orderId/payment-intents", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  let customerId = typeof req.body?.asaasCustomerId === "string" ? req.body.asaasCustomerId.trim() : "";
  const payerDocument = typeof req.body?.clienteDocumento === "string" ? req.body.clienteDocumento.replace(/\D/g, "") : "";
  const billingType = typeof req.body?.billingType === "string" ? req.body.billingType : "UNDEFINED";
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : "";
  const courierId = typeof req.body?.courierId === "string" ? req.body.courierId.trim() || null : null;
  const requestedMode = req.body?.modeloLogistico === "redespacho" ? "redespacho" : "direto";
  const relayPointId = typeof req.body?.pontoRedespachoId === "string" ? req.body.pontoRedespachoId.trim() : "";
  const requestedCourierSplits = Array.isArray(req.body?.courierSplits)
    ? req.body.courierSplits.map((item: any) => ({
        courierId: typeof item?.courierId === "string" ? item.courierId.trim() : "",
        amountCentavos: Number(item?.amountCentavos),
        trecho: String(item?.trecho ?? ""),
      }))
    : [];

  if (!idempotencyKey || idempotencyKey.length > 200) {
    return res.status(422).json({ error: "Idempotency-Key obrigatório." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return res.status(422).json({ error: "Vencimento obrigatório." });
  }
  if (!["PIX","CREDIT_CARD","BOLETO","UNDEFINED"].includes(billingType)) {
    return res.status(422).json({ error: "Forma de pagamento inválida." });
  }

  const existing = await vendorPool.query(
    `SELECT id,status,provider_payment_id AS "providerPaymentId",invoice_url AS "invoiceUrl"
       FROM praca_payment_intents WHERE tenant_id=$1 AND idempotency_key=$2`,
    [tenantId,idempotencyKey],
  );
  if (existing.rowCount) return res.json({ ...existing.rows[0], idempotentReplay: true });

  const orderResult = await vendorPool.query(
    `SELECT p.id,p.status,p.subtotal_centavos,p.frete_centavos,p.desconto_centavos,
            p.total_centavos,p.moeda,p.modelo_logistico,p.ponto_redespacho_id,
            p.cliente_nome,p.cliente_documento,p.cliente_email,p.cliente_whatsapp,p.asaas_customer_id,p.market_demand_id,
            t.asaas_api_key,t.comissao_praca_ai_percentual
       FROM praca_pedidos p JOIN tenants t ON t.id=p.tenant_id
      WHERE p.tenant_id=$1 AND p.id=$2`,
    [tenantId,orderId],
  );
  if (!orderResult.rowCount) return res.status(404).json({ error: "Pedido não encontrado." });
  const order = orderResult.rows[0];
  if (!["recebido","pagamento_pendente"].includes(order.status)) {
    return res.status(409).json({ error: "O pedido não aceita uma nova cobrança neste status." });
  }

  const apiKey = String(order.asaas_api_key || "").trim();
  const pracaWalletId = String(process.env["ASAAS_PRACA_WALLET_ID"] || "").trim();
  const apiBase = String(process.env["ASAAS_API_BASE_URL"] || "https://api.asaas.com/v3").replace(/\/$/, "");
  if (!apiKey) return res.status(422).json({ error: "Chave Asaas do tenant não configurada." });
  if (!pracaWalletId) return res.status(503).json({ error: "Carteira Asaas da Praça.ai não configurada." });

  customerId = customerId || String(order.asaas_customer_id || "");
  if (!customerId) {
    const document = payerDocument || String(order.cliente_documento || "").replace(/\D/g, "");
    if (![11,14].includes(document.length)) {
      return res.status(422).json({ error: "CPF ou CNPJ válido é obrigatório para cadastrar o pagador no Asaas." });
    }
    try {
      const lookupResponse = await fetch(`${apiBase}/customers?cpfCnpj=${encodeURIComponent(document)}&limit=10`, {
        headers: { access_token: apiKey, "User-Agent": "Vendor.ai" },
      });
      const lookupPayload: any = await lookupResponse.json().catch(() => ({}));
      if (!lookupResponse.ok) {
        return res.status(502).json({ error: "Não foi possível consultar o cliente no Asaas.", details: lookupPayload?.errors ?? null });
      }
      const existingCustomer = Array.isArray(lookupPayload?.data)
        ? lookupPayload.data.find((item: any) => String(item?.cpfCnpj || "").replace(/\D/g, "") === document)
        : null;
      if (existingCustomer?.id) {
        customerId = existingCustomer.id;
      } else {
        const createResponse = await fetch(`${apiBase}/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", access_token: apiKey, "User-Agent": "Vendor.ai" },
          body: JSON.stringify({
            name: order.cliente_nome,
            cpfCnpj: document,
            email: order.cliente_email || undefined,
            mobilePhone: order.cliente_whatsapp || undefined,
            externalReference: order.id,
          }),
        });
        const createdCustomer: any = await createResponse.json().catch(() => ({}));
        if (!createResponse.ok || !createdCustomer?.id) {
          return res.status(502).json({ error: "Não foi possível cadastrar o cliente no Asaas.", details: createdCustomer?.errors ?? null });
        }
        customerId = createdCustomer.id;
      }
      await vendorPool.query(
        `UPDATE praca_pedidos SET asaas_customer_id=$1,cliente_documento=coalesce(cliente_documento,$2),updated_at=now()
          WHERE id=$3 AND tenant_id=$4`,
        [customerId,document,orderId,tenantId],
      );
    } catch {
      return res.status(502).json({ error: "Falha de comunicação ao localizar ou cadastrar o cliente no Asaas." });
    }
  }

  const gross = Number(order.total_centavos);
  const freight = Number(order.frete_centavos);
  const commissionBase = Math.max(0, Number(order.subtotal_centavos) - Number(order.desconto_centavos));
  const resolvedCommission = await resolveMarketplaceCommissionForOrder(tenantId, orderId, billingType, gross, commissionBase);
  const pracaAmount = Math.min(commissionBase, resolvedCommission.totalCommissionCentavos);
  const effectiveCommissionPercent = commissionBase > 0 ? (pracaAmount / commissionBase) * 100 : 0;
  const commissionBps = Math.round(effectiveCommissionPercent * 100);
  const courierAmount = freight;
  const sellerAmount = gross - pracaAmount - courierAmount;
  if (![gross,pracaAmount,courierAmount,sellerAmount].every(integerCents) ||
      pracaAmount + courierAmount + sellerAmount !== gross) {
    return res.status(422).json({ error: "A composição do split não fecha com o total do pedido." });
  }

  const courierSplits = requestedCourierSplits.length
    ? requestedCourierSplits
    : courierAmount > 0 && courierId
      ? [{ courierId, amountCentavos: courierAmount, trecho: "direta" }]
      : [];
  const expectedCount = requestedMode === "redespacho" ? 2 : courierAmount > 0 ? 1 : 0;
  const allowedLegs = requestedMode === "redespacho"
    ? new Set(["coleta_redespacho","ultima_milha"])
    : new Set(["direta"]);
  if (courierSplits.length !== expectedCount ||
      new Set(courierSplits.map((item) => item.courierId)).size !== courierSplits.length ||
      courierSplits.some((item) => !item.courierId || !integerCents(item.amountCentavos) || !allowedLegs.has(item.trecho)) ||
      courierSplits.reduce((sum,item) => sum + item.amountCentavos,0) !== courierAmount) {
    return res.status(422).json({ error: requestedMode === "redespacho"
      ? "Redespacho exige dois entregadores distintos e valores dos dois trechos fechando o frete."
      : "Entrega direta exige um entregador com o valor integral do frete." });
  }
  if (requestedMode === "redespacho") {
    if (!relayPointId) return res.status(422).json({ error: "Ponto de redespacho obrigatório antes da cobrança." });
    const point = await vendorPool.query(
      "SELECT 1 FROM praca_pontos_redespacho WHERE id=$1 AND tenant_id=$2 AND ativo=true",
      [relayPointId,tenantId],
    );
    if (!point.rowCount) return res.status(422).json({ error: "Ponto de redespacho inválido ou inativo." });
    if (new Set(courierSplits.map((item) => item.trecho)).size !== 2) {
      return res.status(422).json({ error: "Informe separadamente coleta ao redespacho e última milha." });
    }
  }
  const courierIds = courierSplits.map((item) => item.courierId);
  const wallets = courierIds.length ? await vendorPool.query(
    `SELECT owner_id,wallet_id FROM praca_payment_recipients
      WHERE tenant_id=$1 AND provider='asaas' AND owner_type='courier'
        AND owner_id=ANY($2::text[]) AND status='active'`,
    [tenantId,courierIds],
  ) : { rows: [] as any[] };
  const walletByCourier = new Map(wallets.rows.map((row:any) => [row.owner_id,row.wallet_id]));
  if (courierIds.some((id) => !walletByCourier.get(id))) {
    return res.status(422).json({ error: "Todos os entregadores precisam de carteira Asaas ativa." });
  }

  const client = await vendorPool.connect();
  let intentId: string;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO praca_payment_intents
        (tenant_id,order_id,provider,provider_customer_id,idempotency_key,billing_type,
         status,currency,gross_centavos,due_date,request_snapshot,market_demand_id)
       VALUES ($1,$2,'asaas',$3,$4,$5,'created',$6,$7,$8,$9::jsonb,$10::uuid)
       RETURNING id`,
      [tenantId,orderId,customerId,idempotencyKey,billingType,order.moeda,gross,dueDate,
       JSON.stringify({ commissionBps, commissionBaseCentavos: commissionBase, commissionRules: resolvedCommission.itemRules,
         marketDemandId: order.market_demand_id || null, modeloLogistico: requestedMode,
         pontoRedespachoId: requestedMode === "redespacho" ? relayPointId : null, courierSplits }),
       order.market_demand_id || null],
    );
    intentId = inserted.rows[0].id;
    const allocations = [
      ["seller",tenantId,null,sellerAmount,"remainder_after_marketplace_delivery"],
      ["praca","praca.ai",pracaWalletId,pracaAmount,"commission_on_products"],
      ...courierSplits.map((item) => ["courier",item.courierId,walletByCourier.get(item.courierId),
        item.amountCentavos,`order_freight_${item.trecho}`]),
    ];
    for (const allocation of allocations) {
      await client.query(
        `INSERT INTO praca_payment_allocations
          (tenant_id,payment_intent_id,beneficiary_type,beneficiary_id,wallet_id,
           amount_centavos,basis,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'planned')`,
        [tenantId,intentId,...allocation],
      );
    }
    if (order.market_demand_id && pracaAmount > 0) {
      const entryResult = await client.query(
        `INSERT INTO arqdor_market_commission_entries
          (demand_id,tenant_id,praca_order_id,source,percentage,base_value,commission_amount,status,
           payment_intent_id,provider,rule_snapshot,metadata)
         VALUES($1::uuid,$2,$3,'internal',$4,$5,$6,'invoiced',$7,'asaas',$8::jsonb,$9::jsonb)
         ON CONFLICT (praca_order_id) WHERE praca_order_id IS NOT NULL
         DO UPDATE SET percentage=EXCLUDED.percentage,
                       base_value=EXCLUDED.base_value,
                       commission_amount=EXCLUDED.commission_amount,
                       status='invoiced',
                       payment_intent_id=EXCLUDED.payment_intent_id,
                       provider='asaas',
                       rule_snapshot=EXCLUDED.rule_snapshot,
                       metadata=EXCLUDED.metadata,
                       updated_at=now()
         RETURNING id`,
        [
          order.market_demand_id,
          tenantId,
          orderId,
          String(effectiveCommissionPercent),
          String(commissionBase / 100),
          String(pracaAmount / 100),
          intentId,
          JSON.stringify(resolvedCommission.itemRules),
          JSON.stringify({ orderId, billingType, retainedAtCheckout: true }),
        ],
      );
      await client.query(
        `UPDATE praca_payment_intents SET market_commission_entry_id=$1::uuid WHERE id=$2`,
        [entryResult.rows[0].id, intentId],
      );
      await client.query(
        `UPDATE arqdor_market_demands d
            SET commission_base_value=COALESCE((
                  SELECT SUM(e.base_value) FROM arqdor_market_commission_entries e
                  WHERE e.demand_id=d.id AND e.status<>'cancelled'
                ),0),
                commission_amount=COALESCE((
                  SELECT SUM(e.commission_amount) FROM arqdor_market_commission_entries e
                  WHERE e.demand_id=d.id AND e.status<>'cancelled'
                ),0),
                commission_status='invoiced',updated_at=now()
          WHERE id=$1::uuid AND tenant_id=$2`,
        [order.market_demand_id, tenantId],
      );
    }
    await client.query(
      `UPDATE praca_pedidos SET status='pagamento_pendente',modelo_logistico=$2,
        ponto_redespacho_id=$3,updated_at=now() WHERE id=$1`,
      [orderId,requestedMode,requestedMode === "redespacho" ? relayPointId : null],
    );
    await client.query("COMMIT");
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return res.status(409).json({ error: "Este pedido já possui cobrança." });
    throw error;
  } finally {
    client.release();
  }

  const split = [
    ...(pracaAmount > 0 ? [{ walletId: pracaWalletId, fixedValue: centsToDecimal(pracaAmount) }] : []),
    ...courierSplits.map((item) => ({
      walletId: walletByCourier.get(item.courierId),
      fixedValue: centsToDecimal(item.amountCentavos),
      description: `Frete ${item.trecho}`,
    })),
  ];
  const providerRequest = {
    customer: customerId,
    billingType,
    value: centsToDecimal(gross),
    dueDate,
    description: `Pedido Praça.ai ${orderId}`,
    externalReference: orderId,
    split,
  };

  try {
    const response = await fetch(`${apiBase}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: apiKey, "User-Agent": "Vendor.ai" },
      body: JSON.stringify(providerRequest),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.id) {
      await vendorPool.query(
        `UPDATE praca_payment_intents SET status='failed',provider_snapshot=$1::jsonb,updated_at=now()
          WHERE id=$2`,
        [JSON.stringify(payload),intentId],
      );
      return res.status(502).json({ error: "Asaas recusou a criação da cobrança.", details: payload?.errors ?? null });
    }

    await vendorPool.query(
      `UPDATE praca_payment_intents SET
        provider_payment_id=$1,status='pending',checkout_url=$2,invoice_url=$3,
        provider_snapshot=$4::jsonb,updated_at=now()
       WHERE id=$5`,
      [payload.id,payload.checkoutUrl ?? null,payload.invoiceUrl ?? null,JSON.stringify(payload),intentId],
    );
    await vendorPool.query(
      `UPDATE praca_payment_allocations SET status='scheduled',updated_at=now()
        WHERE payment_intent_id=$1`,
      [intentId],
    );
    return res.status(201).json({
      id:intentId,
      providerPaymentId:payload.id,
      status:"pending",
      invoiceUrl:payload.invoiceUrl ?? null,
      checkoutUrl:payload.checkoutUrl ?? null,
      amounts:{ grossCentavos:gross,sellerCentavos:sellerAmount,pracaCentavos:pracaAmount,courierCentavos:courierAmount,courierSplits },
    });
  } catch (error: any) {
    await vendorPool.query(
      `UPDATE praca_payment_intents SET status='failed',
        provider_snapshot=jsonb_build_object('transportError',$1),updated_at=now() WHERE id=$2`,
      [String(error?.message ?? error),intentId],
    );
    return res.status(502).json({ error: "Falha de comunicação com o Asaas." });
  }
});


router.post("/tenants/:tenantId/praca-orders/:orderId/payment-actions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const actionType = String(req.body?.actionType || "");
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  if (!["cancel_charge","full_refund"].includes(actionType)) return res.status(422).json({ error: "Ação financeira inválida." });
  if (reason.length < 5 || reason.length > 500 || !idempotencyKey || idempotencyKey.length > 200) {
    return res.status(422).json({ error: "Motivo (5 a 500 caracteres) e Idempotency-Key são obrigatórios." });
  }

  const existing = await vendorPool.query(
    "SELECT id,action_type AS \"actionType\",status,error_message AS \"errorMessage\",requested_at AS \"requestedAt\",completed_at AS \"completedAt\" FROM praca_payment_actions WHERE tenant_id=$1 AND idempotency_key=$2",
    [tenantId,idempotencyKey],
  );
  if (existing.rowCount) return res.json({ ...existing.rows[0], idempotentReplay: true });

  const result = await vendorPool.query(
    "SELECT p.status AS order_status,t.asaas_api_key,pi.id AS payment_intent_id,pi.status AS payment_status,pi.provider_payment_id,pi.gross_centavos FROM praca_pedidos p JOIN tenants t ON t.id=p.tenant_id JOIN praca_payment_intents pi ON pi.tenant_id=p.tenant_id AND pi.order_id=p.id WHERE p.tenant_id=$1 AND p.id=$2",
    [tenantId,orderId],
  );
  if (!result.rowCount) return res.status(404).json({ error: "Pedido ou pagamento não encontrado." });
  const row = result.rows[0];
  if (!row.provider_payment_id) return res.status(409).json({ error: "Cobrança sem identificador do Asaas." });

  const pendingStatuses = new Set(["created","pending","overdue"]);
  const paidStatuses = new Set(["confirmed","received"]);
  const preCollectionStatuses = new Set(["pago","em_separacao","pronto_coleta","coleta_agendada","devolvido"]);
  if (actionType === "cancel_charge" && !pendingStatuses.has(row.payment_status)) {
    return res.status(409).json({ error: paidStatuses.has(row.payment_status) ? "O pagamento já foi confirmado. Use estorno integral." : "A cobrança não pode ser excluída neste status." });
  }
  if (actionType === "full_refund" && !paidStatuses.has(row.payment_status)) {
    return res.status(409).json({ error: "Somente pagamentos confirmados ou recebidos podem ser estornados." });
  }
  if (actionType === "full_refund" && !preCollectionStatuses.has(row.order_status)) {
    return res.status(409).json({ error: "Produto entrou no fluxo físico e ainda não teve a devolução recebida pelo vendedor." });
  }

  const apiKey = String(row.asaas_api_key || "").trim();
  const apiBase = String(process.env["ASAAS_API_BASE_URL"] || "https://api.asaas.com/v3").replace(/\/$/, "");
  if (!apiKey) return res.status(422).json({ error: "Chave Asaas do tenant não configurada." });
  const requestedBy = String((req as any).user?.id || (req as any).user?.sub || "") || null;
  let actionId: string;
  try {
    const inserted = await vendorPool.query(
      "INSERT INTO praca_payment_actions (tenant_id,order_id,payment_intent_id,action_type,status,reason,idempotency_key,requested_by,request_snapshot) VALUES ($1,$2,$3,$4,'processing',$5,$6,$7,$8::jsonb) RETURNING id",
      [tenantId,orderId,row.payment_intent_id,actionType,reason,idempotencyKey,requestedBy,JSON.stringify({ paymentStatus:row.payment_status,orderStatus:row.order_status,providerPaymentId:row.provider_payment_id,grossCentavos:Number(row.gross_centavos) })],
    );
    actionId = inserted.rows[0].id;
  } catch (error: any) {
    if (error?.code === "23505") {
      const replay = await vendorPool.query("SELECT id,action_type AS \"actionType\",status,error_message AS \"errorMessage\",requested_at AS \"requestedAt\",completed_at AS \"completedAt\" FROM praca_payment_actions WHERE tenant_id=$1 AND idempotency_key=$2",[tenantId,idempotencyKey]);
      return res.json({ ...replay.rows[0], idempotentReplay:true });
    }
    throw error;
  }

  try {
    const providerResponse = await fetch(
      actionType === "cancel_charge" ? apiBase + "/payments/" + encodeURIComponent(row.provider_payment_id) : apiBase + "/payments/" + encodeURIComponent(row.provider_payment_id) + "/refund",
      { method:actionType === "cancel_charge" ? "DELETE" : "POST", headers:{ "Content-Type":"application/json",access_token:apiKey,"User-Agent":"Vendor.ai" }, ...(actionType === "full_refund" ? { body:JSON.stringify({ description:reason }) } : {}) },
    );
    const payload: any = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      await vendorPool.query("UPDATE praca_payment_actions SET status='failed',provider_snapshot=$1::jsonb,error_message=$2,updated_at=now() WHERE id=$3",[JSON.stringify(payload),JSON.stringify(payload?.errors ?? payload).slice(0,2000),actionId]);
      return res.status(502).json({ error:actionType === "cancel_charge" ? "Asaas recusou a exclusão da cobrança." : "Asaas recusou o estorno.",details:payload?.errors ?? null,actionId });
    }

    const client = await vendorPool.connect();
    try {
      await client.query("BEGIN");
      const paymentStatus = actionType === "cancel_charge" ? "cancelled" : "refunded";
      await client.query("UPDATE praca_payment_intents SET status=$1,refunded_at=CASE WHEN $1='refunded' THEN coalesce(refunded_at,now()) ELSE refunded_at END,provider_snapshot=$2::jsonb,updated_at=now() WHERE id=$3",[paymentStatus,JSON.stringify(payload),row.payment_intent_id]);
      await client.query("UPDATE praca_payment_allocations SET status='reversed',updated_at=now() WHERE payment_intent_id=$1 AND status IN ('planned','scheduled','settled','blocked')",[row.payment_intent_id]);
      await client.query("UPDATE praca_pedidos SET status='cancelado',updated_at=now() WHERE id=$1 AND tenant_id=$2",[orderId,tenantId]);
      await client.query("UPDATE praca_payment_actions SET status='provider_accepted',provider_snapshot=$1::jsonb,provider_accepted_at=now(),updated_at=now() WHERE id=$2",[JSON.stringify(payload),actionId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return res.json({ id:actionId,actionType,status:"provider_accepted",paymentStatus:actionType === "cancel_charge" ? "cancelled" : "refunded",orderStatus:"cancelado" });
  } catch (error: any) {
    await vendorPool.query("UPDATE praca_payment_actions SET status='failed',error_message=$1,updated_at=now() WHERE id=$2",[String(error?.message ?? error).slice(0,2000),actionId]);
    return res.status(502).json({ error:"Falha de comunicação com o Asaas.",actionId });
  }
});

router.get("/tenants/:tenantId/praca-orders/:orderId/payment", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const intent = await vendorPool.query(
    `SELECT id,provider,provider_payment_id AS "providerPaymentId",billing_type AS "billingType",
            status,currency,gross_centavos AS "grossCentavos",
            provider_fee_centavos AS "providerFeeCentavos",net_centavos AS "netCentavos",
            due_date AS "dueDate",checkout_url AS "checkoutUrl",invoice_url AS "invoiceUrl",
            confirmed_at AS "confirmedAt",received_at AS "receivedAt",refunded_at AS "refundedAt",
            created_at AS "createdAt",updated_at AS "updatedAt"
       FROM praca_payment_intents WHERE tenant_id=$1 AND order_id=$2`,
    [tenantId,orderId],
  );
  if (!intent.rowCount) return res.status(404).json({ error: "Pagamento não encontrado." });
  const allocations = await vendorPool.query(
    `SELECT beneficiary_type AS "beneficiaryType",beneficiary_id AS "beneficiaryId",
            amount_centavos AS "amountCentavos",basis,status,settled_at AS "settledAt"
       FROM praca_payment_allocations WHERE tenant_id=$1 AND payment_intent_id=$2
       ORDER BY beneficiary_type`,
    [tenantId,intent.rows[0].id],
  );
  const actions = await vendorPool.query(
    "SELECT id,action_type AS \"actionType\",status,reason,requested_by AS \"requestedBy\",error_message AS \"errorMessage\",requested_at AS \"requestedAt\",provider_accepted_at AS \"providerAcceptedAt\",completed_at AS \"completedAt\" FROM praca_payment_actions WHERE tenant_id=$1 AND payment_intent_id=$2 ORDER BY requested_at DESC",
    [tenantId,intent.rows[0].id],
  );
  return res.json({ ...intent.rows[0], allocations: allocations.rows, actions: actions.rows });
});

pracaPaymentsPublicRouter.post("/webhooks/asaas/payments", async (req, res) => {
  const expectedToken = String(process.env["ASAAS_WEBHOOK_TOKEN"] || "");
  const receivedToken = String(req.header("asaas-access-token") || "");
  if (!expectedToken || !receivedToken || !safeTokenMatch(receivedToken, expectedToken)) {
    return res.status(401).json({ error: "Webhook não autorizado." });
  }

  const eventType = typeof req.body?.event === "string" ? req.body.event : "";
  const payment = req.body?.payment;
  const paymentId = typeof payment?.id === "string" ? payment.id : "";
  const eventId = typeof req.body?.id === "string"
    ? req.body.id
    : [eventType,paymentId,payment?.status,payment?.dateCreated,payment?.confirmedDate]
        .filter(Boolean).join(":");
  if (!eventType || !paymentId || !eventId) {
    return res.status(422).json({ error: "Evento Asaas inválido." });
  }

  const status = EVENT_STATUS[eventType];
  const splitEvent = ["PAYMENT_SPLIT_DONE","PAYMENT_SPLIT_CANCELLED","PAYMENT_SPLIT_DIVERGENCE_BLOCK","PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED"].includes(eventType);
  const recognizedEvent = Boolean(status) || splitEvent;
  const intent = await vendorPool.query(
    `SELECT id,tenant_id,order_id,gross_centavos,market_demand_id,market_commission_entry_id FROM praca_payment_intents
      WHERE provider='asaas' AND provider_payment_id=$1`,
    [paymentId],
  );
  if (!intent.rowCount) return res.status(202).json({ received: true, reconciled: false });
  const row = intent.rows[0];

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const duplicate = await client.query(
      `SELECT id FROM praca_payment_events WHERE provider='asaas' AND provider_event_id=$1`,
      [eventId],
    );
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      return res.json({ received: true, duplicate: true });
    }

    const netValue = Number(payment?.netValue);
    const netCents = Number.isFinite(netValue) && netValue >= 0 ? Math.round(netValue * 100) : null;
    const feeCents = netCents == null ? null : Math.max(0,Number(row.gross_centavos)-netCents);

    if (status) {
      await client.query(
        `UPDATE praca_payment_intents SET status=$1,
          provider_fee_centavos=coalesce($2,provider_fee_centavos),
          net_centavos=coalesce($3,net_centavos),
          provider_snapshot=$4::jsonb,
          confirmed_at=CASE WHEN $1='confirmed' THEN coalesce(confirmed_at,now()) ELSE confirmed_at END,
          received_at=CASE WHEN $1='received' THEN coalesce(received_at,now()) ELSE received_at END,
          refunded_at=CASE WHEN $1='refunded' THEN coalesce(refunded_at,now()) ELSE refunded_at END,
          updated_at=now() WHERE id=$5`,
        [status,feeCents,netCents,JSON.stringify(payment),row.id],
      );
      if (status === "confirmed" || status === "received") {
        await client.query(
          `UPDATE praca_pedidos SET status='pago',updated_at=now()
            WHERE id=$1 AND tenant_id=$2 AND status='pagamento_pendente'`,
          [row.order_id,row.tenant_id],
        );
      }
      if (status === "received") {
        await client.query(
          `UPDATE praca_payment_allocations SET status='settled',settled_at=now(),updated_at=now()
            WHERE payment_intent_id=$1 AND status IN ('planned','scheduled')`,
          [row.id],
        );
        if (row.market_commission_entry_id) {
          await client.query(
            `UPDATE arqdor_market_commission_entries
                SET status='paid',provider='asaas',provider_payment_id=$1,settled_at=now(),updated_at=now()
              WHERE id=$2::uuid`,
            [paymentId, row.market_commission_entry_id],
          );
          if (row.market_demand_id) {
            await client.query(
              `UPDATE arqdor_market_demands
                  SET commission_status=CASE
                    WHEN EXISTS (
                      SELECT 1 FROM arqdor_market_commission_entries e
                      WHERE e.demand_id=arqdor_market_demands.id AND e.status NOT IN ('paid','waived','cancelled')
                    ) THEN 'invoiced'
                    ELSE 'paid'
                  END,
                  updated_at=now()
                WHERE id=$1::uuid`,
              [row.market_demand_id],
            );
            await client.query(
              `INSERT INTO arqdor_market_demand_events
                (demand_id,tenant_id,event_type,actor_type,source,reference_type,reference_id,payload,created_at)
               VALUES($1::uuid,$2,'commission_settled','system','asaas','payment_intent',$3,$4::jsonb,now())`,
              [row.market_demand_id,row.tenant_id,row.id,JSON.stringify({ providerPaymentId: paymentId, eventType })],
            );
          }
        }
      } else if (["refunded","chargeback","cancelled"].includes(status)) {
        await client.query(
          `UPDATE praca_payment_allocations SET status='reversed',updated_at=now()
            WHERE payment_intent_id=$1 AND status IN ('planned','scheduled','settled','blocked')`,
          [row.id],
        );
        if (row.market_commission_entry_id) {
          await client.query(
            `UPDATE arqdor_market_commission_entries
                SET status='cancelled',updated_at=now()
              WHERE id=$1::uuid`,
            [row.market_commission_entry_id],
          );
        }
        if (status === "refunded" || status === "cancelled") {
          await client.query(
            "UPDATE praca_payment_actions SET status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() WHERE payment_intent_id=$1 AND status='provider_accepted' AND action_type=$2",
            [row.id,status === "refunded" ? "full_refund" : "cancel_charge"],
          );
        }
      }
    }

    if (feeCents != null && netCents != null) {
      await client.query(
        `INSERT INTO praca_payment_allocations
          (tenant_id,payment_intent_id,beneficiary_type,beneficiary_id,amount_centavos,basis,status,settled_at)
         VALUES ($1,$2,'provider','asaas',$3,'actual_net_value','settled',now())
         ON CONFLICT (payment_intent_id,beneficiary_type,beneficiary_id)
         DO UPDATE SET amount_centavos=excluded.amount_centavos,status='settled',
                       settled_at=now(),updated_at=now()`,
        [row.tenant_id,row.id,feeCents],
      );
      const directed = await client.query(
        `SELECT coalesce(sum(amount_centavos),0)::bigint AS total
           FROM praca_payment_allocations
          WHERE payment_intent_id=$1 AND beneficiary_type IN ('praca','courier')`,
        [row.id],
      );
      const sellerActual = Math.max(0,netCents-Number(directed.rows[0]?.total ?? 0));
      await client.query(
        `UPDATE praca_payment_allocations SET amount_centavos=$1,
          basis='actual_net_remainder',updated_at=now()
          WHERE payment_intent_id=$2 AND beneficiary_type='seller'`,
        [sellerActual,row.id],
      );
    }

    if (eventType === "PAYMENT_SPLIT_DONE") {
      await client.query(
        `UPDATE praca_payment_allocations SET status='settled',
          settled_at=coalesce(settled_at,now()),updated_at=now()
          WHERE payment_intent_id=$1 AND beneficiary_type IN ('praca','courier')`,
        [row.id],
      );
    } else if (eventType === "PAYMENT_SPLIT_CANCELLED" ||
               eventType === "PAYMENT_SPLIT_DIVERGENCE_BLOCK") {
      await client.query(
        `UPDATE praca_payment_allocations SET status='blocked',updated_at=now()
          WHERE payment_intent_id=$1 AND beneficiary_type IN ('praca','courier')`,
        [row.id],
      );
    }

    await client.query(
      `INSERT INTO praca_payment_events
        (tenant_id,payment_intent_id,provider,provider_event_id,event_type,payload,
         processing_status,processed_at)
       VALUES ($1,$2,'asaas',$3,$4,$5::jsonb,$6,now())`,
      [row.tenant_id,row.id,eventId,eventType,JSON.stringify(req.body),recognizedEvent ? "processed" : "ignored"],
    );
    await client.query("COMMIT");
    return res.json({ received: true, processed: recognizedEvent });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return res.json({ received: true, duplicate: true });
    throw error;
  } finally {
    client.release();
  }
});

export default router;
