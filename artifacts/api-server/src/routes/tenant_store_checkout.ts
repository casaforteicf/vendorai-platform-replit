import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  generatedSitesTable,
  produtosCatalogoTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  createCharge,
  createOrGetCustomer,
  createSubscription,
  ensureAsaasPaymentWebhook,
  getPlatformAsaasApiKey,
  getTenantAsaasApiKey,
  type AsaasBillingType,
} from "../lib/asaas.js";

export const tenantStoreCheckoutRouter: IRouter = Router();

const checkoutSchema = z.object({
  siteSlug: z.string().trim().min(1).max(120),
  customer: z.object({
    name: z.string().trim().min(2).max(180),
    email: z.email(),
    phone: z.string().trim().max(40).optional(),
    cpfCnpj: z.string().trim().max(24).optional(),
  }),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]).default("UNDEFINED"),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(180),
    quantity: z.number().int().min(1).max(99).default(1),
  })).min(1).max(50),
  pageUrl: z.string().trim().max(2000).optional(),
});

type CheckoutOrderRow = {
  id: string;
  tenant_id: string;
  site_id: string;
  site_slug: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_cpf_cnpj: string | null;
  billing_type: AsaasBillingType;
  items: unknown;
  one_time_total: string;
  recurring_total: string;
  first_charge_total: string;
  status: string;
  asaas_customer_id: string | null;
  asaas_charge_id: string | null;
  asaas_subscription_id: string | null;
  payment_url: string | null;
  error_code: string | null;
  paid_at: Date | null;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function money(value: number): string {
  return value.toFixed(2);
}

function monthlyRecurrence(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return ["mensal", "monthly", "mes", "mês"].includes(normalized);
}

function hasUnsupportedRecurrence(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(normalized) && !monthlyRecurrence(normalized);
}

function nextMonthDate(from = new Date()): string {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate()));
  return next.toISOString().slice(0, 10);
}

async function resolveCheckoutAsaasKey(tenantId: string, tenantSlug: string | null): Promise<string | null> {
  const tenantKey = await getTenantAsaasApiKey(tenantId);
  if (tenantKey) return tenantKey;

  // Vendor.ai itself is the platform seller. Only this tenant may use the
  // platform account; customer tenants must always connect their own Asaas.
  if ((tenantSlug ?? "").toLowerCase() === "vendorai") return getPlatformAsaasApiKey();
  return null;
}

async function loadOrder(orderId: string): Promise<CheckoutOrderRow | null> {
  const result = await db.execute(sql`
    SELECT id, tenant_id, site_id, site_slug, customer_name, customer_email,
           customer_phone, customer_cpf_cnpj, billing_type, items,
           one_time_total, recurring_total, first_charge_total, status,
           asaas_customer_id, asaas_charge_id, asaas_subscription_id,
           payment_url, error_code, paid_at
      FROM site_checkout_orders
     WHERE id = ${orderId}
     LIMIT 1
  `);
  return rowsOf<CheckoutOrderRow>(result)[0] ?? null;
}

async function tenantSlugFor(tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select({ slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  return tenant?.slug ?? null;
}

tenantStoreCheckoutRouter.post("/public/tenant-commerce/checkout", async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados de checkout inválidos", details: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const [site] = await db
    .select({
      id: generatedSitesTable.id,
      tenantId: generatedSitesTable.tenantId,
      siteSlug: generatedSitesTable.siteSlug,
      published: generatedSitesTable.published,
    })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.siteSlug, data.siteSlug))
    .limit(1);

  if (!site || !site.siteSlug) {
    res.status(404).json({ error: "Loja não encontrada" });
    return;
  }
  if (!site.published) {
    res.status(409).json({ error: "Publique o site antes de receber pagamentos", code: "site_not_published" });
    return;
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, site.tenantId))
    .limit(1);
  if (!tenant) {
    res.status(404).json({ error: "Empresa responsável pela loja não encontrada" });
    return;
  }

  const requestedSkus = [...new Set(data.items.map((item) => item.sku))];
  const catalogRows = await db
    .select({
      id: produtosCatalogoTable.id,
      sku: produtosCatalogoTable.sku,
      nome: produtosCatalogoTable.nome,
      descricao: produtosCatalogoTable.descricao,
      precoBase: produtosCatalogoTable.precoBase,
      precoMensalidade: produtosCatalogoTable.precoMensalidade,
      recorrencia: produtosCatalogoTable.recorrencia,
      ativo: produtosCatalogoTable.ativo,
    })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.tenantId, tenant.id),
      eq(produtosCatalogoTable.ativo, true),
      inArray(produtosCatalogoTable.sku, requestedSkus),
    ));

  const bySku = new Map(catalogRows.filter((item) => item.sku).map((item) => [item.sku!, item]));
  const missing = requestedSkus.filter((sku) => !bySku.has(sku));
  if (missing.length > 0) {
    res.status(409).json({ error: "Um ou mais itens não estão mais disponíveis", code: "catalog_items_changed", missing });
    return;
  }

  const unsupported = catalogRows.filter((item) => hasUnsupportedRecurrence(item.recorrencia));
  if (unsupported.length > 0) {
    res.status(422).json({
      error: "Há itens com recorrência ainda não suportada pelo checkout automático",
      code: "unsupported_recurrence",
      items: unsupported.map((item) => item.nome),
    });
    return;
  }

  let oneTimeTotal = 0;
  let recurringTotal = 0;
  const itemSnapshot = data.items.map((requested) => {
    const product = bySku.get(requested.sku)!;
    const recurring = monthlyRecurrence(product.recorrencia);
    const base = Number(product.precoBase ?? 0);
    const monthly = Number(product.precoMensalidade ?? 0);
    const unitValue = recurring && Number.isFinite(monthly) && monthly > 0 ? monthly : base;
    if (!Number.isFinite(unitValue) || unitValue <= 0) {
      throw new Error(`invalid_catalog_price:${product.id}`);
    }
    const lineTotal = unitValue * requested.quantity;
    if (recurring) recurringTotal += lineTotal;
    else oneTimeTotal += lineTotal;
    return {
      productId: product.id,
      sku: product.sku,
      name: product.nome,
      description: product.descricao ?? null,
      quantity: requested.quantity,
      unitValue,
      lineTotal,
      recurring: recurring ? "monthly" : null,
    };
  });

  const firstChargeTotal = oneTimeTotal + recurringTotal;
  if (!(firstChargeTotal > 0)) {
    res.status(422).json({ error: "O carrinho não possui valor válido para cobrança" });
    return;
  }

  const asaasKey = await resolveCheckoutAsaasKey(tenant.id, tenant.slug);
  if (!asaasKey) {
    res.status(409).json({
      error: "Pagamento indisponível: conecte a conta Asaas desta empresa nas Integrações.",
      code: "asaas_not_configured",
    });
    return;
  }

  const [admin] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenant.id), eq(usersTable.active, true)))
    .limit(1);
  const webhookEmail = admin?.email || data.customer.email;
  try {
    const webhook = await ensureAsaasPaymentWebhook({ email: webhookEmail }, asaasKey);
    if (!webhook.configured && recurringTotal > 0) {
      res.status(503).json({
        error: "A automação de cobrança recorrente do Asaas ainda não está configurada para esta empresa.",
        code: "asaas_webhook_not_configured",
      });
      return;
    }
  } catch (error) {
    req.log.warn({ error, tenantId: tenant.id }, "tenant commerce: could not ensure Asaas webhook");
    if (recurringTotal > 0) {
      res.status(503).json({
        error: "Não foi possível preparar a cobrança recorrente no Asaas agora.",
        code: "asaas_webhook_setup_failed",
      });
      return;
    }
  }

  const orderId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO site_checkout_orders (
      id, tenant_id, site_id, site_slug, customer_name, customer_email,
      customer_phone, customer_cpf_cnpj, billing_type, items,
      one_time_total, recurring_total, first_charge_total, status, page_url
    ) VALUES (
      ${orderId}, ${tenant.id}, ${site.id}, ${site.siteSlug}, ${data.customer.name}, ${data.customer.email.toLowerCase()},
      ${data.customer.phone ?? null}, ${data.customer.cpfCnpj ?? null}, ${data.billingType}, ${JSON.stringify(itemSnapshot)}::jsonb,
      ${money(oneTimeTotal)}, ${money(recurringTotal)}, ${money(firstChargeTotal)}, 'created', ${data.pageUrl ?? null}
    )
  `);

  try {
    const customer = await createOrGetCustomer({
      name: data.customer.name,
      email: data.customer.email.toLowerCase(),
      cpfCnpj: data.customer.cpfCnpj,
      phone: data.customer.phone,
    }, asaasKey);

    const charge = await createCharge({
      customer: customer.id,
      billingType: data.billingType,
      value: firstChargeTotal,
      dueDate: new Date().toISOString().slice(0, 10),
      description: `${tenant.name} · ${itemSnapshot.map((item) => item.name).join(", ")}`.slice(0, 500),
      externalReference: `tenant_checkout:${orderId}`,
    }, asaasKey);
    const paymentUrl = charge.invoiceUrl || charge.bankSlipUrl;
    if (!paymentUrl) throw new Error("Asaas did not return a payment URL");

    await db.execute(sql`
      UPDATE site_checkout_orders
         SET status = 'payment_pending',
             asaas_customer_id = ${customer.id},
             asaas_charge_id = ${charge.id},
             payment_url = ${paymentUrl},
             updated_at = now()
       WHERE id = ${orderId}
    `);

    res.status(201).json({
      orderId,
      status: "payment_pending",
      paymentUrl,
      provider: "asaas",
      totals: {
        oneTime: oneTimeTotal,
        recurringMonthly: recurringTotal,
        dueNow: firstChargeTotal,
      },
    });
  } catch (error) {
    await db.execute(sql`
      UPDATE site_checkout_orders
         SET status = 'failed', error_code = 'asaas_charge_failed', updated_at = now()
       WHERE id = ${orderId}
    `);
    req.log.error({ error, orderId, tenantId: tenant.id }, "tenant commerce: Asaas charge failed");
    res.status(502).json({ error: "Não foi possível iniciar o pagamento no Asaas. Tente novamente." });
  }
});

tenantStoreCheckoutRouter.get("/public/tenant-commerce/checkout/:id/status", async (req, res) => {
  const order = await loadOrder(String(req.params.id));
  if (!order) {
    res.status(404).json({ error: "Checkout não encontrado" });
    return;
  }
  res.json({
    orderId: order.id,
    status: order.status,
    paymentUrl: order.payment_url,
    provider: "asaas",
    recurring: Number(order.recurring_total) > 0,
  });
});

export async function handleTenantSiteCheckoutPayment(
  orderId: string,
  event: string,
  paymentId: string,
): Promise<{ handled: boolean; status?: string; recurrence?: string }> {
  const order = await loadOrder(orderId);
  if (!order) return { handled: false };

  if (event === "PAYMENT_DELETED" || event === "PAYMENT_CANCELLED") {
    if (!order.paid_at) {
      await db.execute(sql`
        UPDATE site_checkout_orders
           SET status = 'cancelled', updated_at = now()
         WHERE id = ${orderId} AND paid_at IS NULL
      `);
    }
    return { handled: true, status: "cancelled" };
  }

  if (event === "PAYMENT_OVERDUE") {
    if (!order.paid_at) {
      await db.execute(sql`
        UPDATE site_checkout_orders
           SET status = 'overdue', updated_at = now()
         WHERE id = ${orderId} AND paid_at IS NULL
      `);
    }
    return { handled: true, status: "overdue" };
  }

  if (event !== "PAYMENT_RECEIVED" && event !== "PAYMENT_CONFIRMED") {
    return { handled: true, status: order.status };
  }

  await db.execute(sql`
    UPDATE site_checkout_orders
       SET paid_at = COALESCE(paid_at, now()),
           asaas_charge_id = COALESCE(asaas_charge_id, ${paymentId}),
           status = CASE
             WHEN recurring_total::numeric > 0 AND asaas_subscription_id IS NULL THEN 'recurrence_pending'
             ELSE 'paid'
           END,
           error_code = NULL,
           updated_at = now()
     WHERE id = ${orderId}
  `);

  const refreshed = await loadOrder(orderId);
  if (!refreshed || Number(refreshed.recurring_total) <= 0 || refreshed.asaas_subscription_id) {
    return { handled: true, status: "paid", recurrence: refreshed?.asaas_subscription_id ? "active" : "none" };
  }

  const claim = await db.execute(sql`
    UPDATE site_checkout_orders
       SET status = 'recurrence_provisioning', updated_at = now()
     WHERE id = ${orderId}
       AND asaas_subscription_id IS NULL
       AND status IN ('recurrence_pending', 'paid', 'recurrence_failed')
    RETURNING id
  `);
  if (rowsOf<{ id: string }>(claim).length === 0) {
    return { handled: true, status: "paid", recurrence: "already_processing" };
  }

  try {
    const tenantSlug = await tenantSlugFor(refreshed.tenant_id);
    const asaasKey = await resolveCheckoutAsaasKey(refreshed.tenant_id, tenantSlug);
    if (!asaasKey) throw new Error("Tenant Asaas key unavailable after payment");

    let customerId = refreshed.asaas_customer_id;
    if (!customerId) {
      const customer = await createOrGetCustomer({
        name: refreshed.customer_name,
        email: refreshed.customer_email,
        cpfCnpj: refreshed.customer_cpf_cnpj ?? undefined,
        phone: refreshed.customer_phone ?? undefined,
      }, asaasKey);
      customerId = customer.id;
    }

    const subscription = await createSubscription({
      customer: customerId,
      billingType: refreshed.billing_type,
      value: Number(refreshed.recurring_total),
      nextDueDate: nextMonthDate(),
      cycle: "MONTHLY",
      description: `Recorrência mensal · pedido ${refreshed.id}`,
      externalReference: `tenant_subscription:${refreshed.id}`,
    }, asaasKey);

    await db.execute(sql`
      UPDATE site_checkout_orders
         SET status = 'paid',
             asaas_customer_id = ${customerId},
             asaas_subscription_id = ${subscription.id},
             error_code = NULL,
             updated_at = now()
       WHERE id = ${orderId}
    `);
    return { handled: true, status: "paid", recurrence: "active" };
  } catch (error) {
    await db.execute(sql`
      UPDATE site_checkout_orders
         SET status = 'recurrence_failed',
             error_code = 'asaas_subscription_failed',
             updated_at = now()
       WHERE id = ${orderId}
    `);
    throw error;
  }
}
