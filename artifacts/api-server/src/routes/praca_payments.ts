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

router.post("/tenants/:tenantId/praca-orders/:orderId/payment-intents", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  const customerId = typeof req.body?.asaasCustomerId === "string" ? req.body.asaasCustomerId.trim() : "";
  const billingType = typeof req.body?.billingType === "string" ? req.body.billingType : "UNDEFINED";
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : "";
  const courierId = typeof req.body?.courierId === "string" ? req.body.courierId.trim() || null : null;

  if (!idempotencyKey || idempotencyKey.length > 200) {
    return res.status(422).json({ error: "Idempotency-Key obrigatório." });
  }
  if (!customerId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return res.status(422).json({ error: "Cliente Asaas e vencimento são obrigatórios." });
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
            p.total_centavos,p.moeda,t.asaas_api_key,t.comissao_praca_ai_percentual
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

  const gross = Number(order.total_centavos);
  const freight = Number(order.frete_centavos);
  const commissionBase = Math.max(0, Number(order.subtotal_centavos) - Number(order.desconto_centavos));
  const commissionBps = Math.round(Number(order.comissao_praca_ai_percentual ?? 0) * 100);
  const pracaAmount = Math.round(commissionBase * commissionBps / 10000);
  const courierAmount = freight;
  const sellerAmount = gross - pracaAmount - courierAmount;
  if (![gross,pracaAmount,courierAmount,sellerAmount].every(integerCents) ||
      pracaAmount + courierAmount + sellerAmount !== gross) {
    return res.status(422).json({ error: "A composição do split não fecha com o total do pedido." });
  }

  let courierWalletId: string | null = null;
  if (courierAmount > 0) {
    if (!courierId) return res.status(422).json({ error: "Entregador obrigatório para destinar o frete." });
    const courier = await vendorPool.query(
      `SELECT wallet_id FROM praca_payment_recipients
        WHERE tenant_id=$1 AND provider='asaas' AND owner_type='courier'
          AND owner_id=$2 AND status='active'`,
      [tenantId,courierId],
    );
    courierWalletId = courier.rows[0]?.wallet_id ?? null;
    if (!courierWalletId) {
      return res.status(422).json({ error: "Entregador sem carteira Asaas ativa." });
    }
  }

  const client = await vendorPool.connect();
  let intentId: string;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO praca_payment_intents
        (tenant_id,order_id,provider,provider_customer_id,idempotency_key,billing_type,
         status,currency,gross_centavos,due_date,request_snapshot)
       VALUES ($1,$2,'asaas',$3,$4,$5,'created',$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [tenantId,orderId,customerId,idempotencyKey,billingType,order.moeda,gross,dueDate,
       JSON.stringify({ commissionBps, commissionBaseCentavos: commissionBase, courierId })],
    );
    intentId = inserted.rows[0].id;
    const allocations = [
      ["seller",tenantId,null,sellerAmount,"remainder_after_marketplace_delivery"],
      ["praca","praca.ai",pracaWalletId,pracaAmount,"commission_on_products"],
      ...(courierAmount > 0 ? [["courier",courierId!,courierWalletId,courierAmount,"order_freight"]] : []),
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
    await client.query(
      `UPDATE praca_pedidos SET status='pagamento_pendente',updated_at=now() WHERE id=$1`,
      [orderId],
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
    ...(courierAmount > 0 ? [{ walletId: courierWalletId, fixedValue: centsToDecimal(courierAmount) }] : []),
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
      amounts:{ grossCentavos:gross,sellerCentavos:sellerAmount,pracaCentavos:pracaAmount,courierCentavos:courierAmount },
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
  return res.json({ ...intent.rows[0], allocations: allocations.rows });
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
  const intent = await vendorPool.query(
    `SELECT id,tenant_id,order_id,gross_centavos FROM praca_payment_intents
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
      } else if (["refunded","chargeback","cancelled"].includes(status)) {
        await client.query(
          `UPDATE praca_payment_allocations SET status='reversed',updated_at=now()
            WHERE payment_intent_id=$1 AND status IN ('planned','scheduled','settled')`,
          [row.id],
        );
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
      [row.tenant_id,row.id,eventId,eventType,JSON.stringify(req.body),status ? "processed" : "ignored"],
    );
    await client.query("COMMIT");
    return res.json({ received: true, processed: Boolean(status) });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return res.json({ received: true, duplicate: true });
    throw error;
  } finally {
    client.release();
  }
});

export default router;
