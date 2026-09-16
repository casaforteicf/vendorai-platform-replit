import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  produtosCatalogoTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  createCharge,
  createOrGetCustomer,
  ensureAsaasPaymentWebhook,
  getPlatformAsaasApiKey,
  getTenantAsaasApiKey,
  type AsaasBillingType,
} from "./asaas.js";

type JsonObject = Record<string, unknown>;

export type AppRuntimeCommerceContext = {
  tenantId: string;
  appInstanceId: string;
  viewer: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  };
};

export class AppRuntimeCommerceError extends Error {
  constructor(
    public readonly code: string,
    public readonly kind: "invalid" | "conflict" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

const checkoutSchema = z.object({
  confirmPurchase: z.literal(true),
  idempotencyKey: z.string().trim().min(8).max(120),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]).default("UNDEFINED"),
  cpfCnpj: z.string().trim().max(24).optional(),
  phone: z.string().trim().max(40).optional(),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(180),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
}).strict();

type ExistingOrder = {
  id: string;
  status: string;
  payment_url: string | null;
  one_time_total: string;
  recurring_total: string;
  first_charge_total: string;
};

type OrderListRow = ExistingOrder & {
  billing_type: string;
  items: unknown;
  paid_at: Date | null;
  created_at: Date;
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

function unsupportedRecurrence(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(normalized) && !monthlyRecurrence(normalized);
}

function promotionActive(price: string | null, endsAt: Date | null): boolean {
  const numeric = Number(price ?? 0);
  if (!(numeric > 0)) return false;
  return !endsAt || endsAt.getTime() >= Date.now();
}

async function resolveCheckoutAsaasKey(tenantId: string, tenantSlug: string | null): Promise<string | null> {
  const tenantKey = await getTenantAsaasApiKey(tenantId);
  if (tenantKey) return tenantKey;
  if ((tenantSlug ?? "").toLowerCase() === "vendorai") return getPlatformAsaasApiKey();
  return null;
}

async function loadExistingOrder(
  tenantId: string,
  appInstanceId: string,
  appUserId: string,
  idempotencyKey: string,
): Promise<ExistingOrder | null> {
  const result = await db.execute(sql`
    SELECT id, status, payment_url, one_time_total, recurring_total, first_charge_total
      FROM site_checkout_orders
     WHERE tenant_id = ${tenantId}
       AND app_instance_id = ${appInstanceId}
       AND app_user_id = ${appUserId}
       AND idempotency_key = ${idempotencyKey}
     LIMIT 1
  `);
  return rowsOf<ExistingOrder>(result)[0] ?? null;
}

function orderResponse(order: ExistingOrder) {
  return {
    orderId: order.id,
    status: order.status,
    paymentUrl: order.payment_url,
    provider: "asaas",
    totals: {
      oneTime: Number(order.one_time_total),
      recurringMonthly: Number(order.recurring_total),
      dueNow: Number(order.first_charge_total),
    },
    reused: true,
  };
}

export async function startAppRuntimeCheckout(
  input: unknown,
  context: AppRuntimeCommerceContext,
): Promise<JsonObject> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppRuntimeCommerceError("checkout_input_invalid", "invalid", "Revise os dados da compra.");
  }
  if (!context.viewer.email) {
    throw new AppRuntimeCommerceError("checkout_email_required", "invalid", "Cadastre um e-mail antes de comprar.");
  }

  const data = parsed.data;
  const existing = await loadExistingOrder(
    context.tenantId,
    context.appInstanceId,
    context.viewer.id,
    data.idempotencyKey,
  );
  if (existing) {
    if (["failed", "cancelled", "overdue"].includes(existing.status)) {
      throw new AppRuntimeCommerceError(
        "checkout_terminal",
        "conflict",
        "Este checkout não pode ser reutilizado. Confirme a compra novamente para gerar uma nova cobrança.",
      );
    }
    return orderResponse(existing);
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, context.tenantId))
    .limit(1);
  if (!tenant) {
    throw new AppRuntimeCommerceError("tenant_not_found", "invalid", "Empresa não encontrada.");
  }

  const requestedSkus = Array.from(new Set(data.items.map((item) => item.sku)));
  const products = await db
    .select({
      id: produtosCatalogoTable.id,
      sku: produtosCatalogoTable.sku,
      name: produtosCatalogoTable.nome,
      description: produtosCatalogoTable.descricao,
      basePrice: produtosCatalogoTable.precoBase,
      promotionalPrice: produtosCatalogoTable.precoPromocional,
      promotionEndsAt: produtosCatalogoTable.promocaoAtivaAte,
      monthlyPrice: produtosCatalogoTable.precoMensalidade,
      recurrence: produtosCatalogoTable.recorrencia,
      controlsStock: produtosCatalogoTable.controlaEstoque,
      stockQuantity: produtosCatalogoTable.estoqueQuantidade,
      active: produtosCatalogoTable.ativo,
    })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.tenantId, context.tenantId),
      eq(produtosCatalogoTable.ativo, true),
      inArray(produtosCatalogoTable.sku, requestedSkus),
    ));

  const bySku = new Map(products.filter((product) => product.sku).map((product) => [product.sku!, product]));
  const missing = requestedSkus.filter((sku) => !bySku.has(sku));
  if (missing.length > 0) {
    throw new AppRuntimeCommerceError("catalog_items_changed", "conflict", "Um ou mais produtos não estão mais disponíveis.");
  }

  const requestedBySku = new Map(data.items.map((item) => [item.sku, item]));
  let oneTimeTotal = 0;
  let recurringTotal = 0;
  const itemSnapshot = requestedSkus.map((sku) => {
    const product = bySku.get(sku)!;
    const requested = requestedBySku.get(sku)!;
    if (unsupportedRecurrence(product.recurrence)) {
      throw new AppRuntimeCommerceError(
        "unsupported_recurrence",
        "invalid",
        `A recorrência de ${product.name} ainda não é suportada no checkout automático.`,
      );
    }

    const recurring = monthlyRecurrence(product.recurrence);
    const base = Number(product.basePrice ?? 0);
    const promotional = promotionActive(product.promotionalPrice, product.promotionEndsAt)
      ? Number(product.promotionalPrice)
      : null;
    const monthly = Number(product.monthlyPrice ?? 0);
    const unitValue = recurring && monthly > 0 ? monthly : promotional ?? base;
    if (!Number.isFinite(unitValue) || !(unitValue > 0)) {
      throw new AppRuntimeCommerceError("invalid_catalog_price", "conflict", `O preço de ${product.name} precisa ser revisado.`);
    }

    if (product.controlsStock && (product.stockQuantity ?? 0) < requested.quantity) {
      throw new AppRuntimeCommerceError("stock_unavailable", "conflict", `Estoque insuficiente para ${product.name}.`);
    }

    const lineTotal = unitValue * requested.quantity;
    if (recurring) recurringTotal += lineTotal;
    else oneTimeTotal += lineTotal;

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? null,
      quantity: requested.quantity,
      unitValue,
      lineTotal,
      recurring: recurring ? "monthly" : null,
      stockControlled: product.controlsStock,
    };
  });

  const firstChargeTotal = oneTimeTotal + recurringTotal;
  if (!(firstChargeTotal > 0)) {
    throw new AppRuntimeCommerceError("checkout_total_invalid", "invalid", "O carrinho não possui valor válido para cobrança.");
  }

  const asaasKey = await resolveCheckoutAsaasKey(tenant.id, tenant.slug);
  if (!asaasKey) {
    throw new AppRuntimeCommerceError(
      "asaas_not_configured",
      "unavailable",
      "Pagamento indisponível: conecte a conta Asaas desta empresa nas Integrações.",
    );
  }

  const [admin] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenant.id), eq(usersTable.active, true)))
    .limit(1);
  try {
    const webhook = await ensureAsaasPaymentWebhook(
      { email: admin?.email || context.viewer.email },
      asaasKey,
    );
    if (!webhook.configured) {
      throw new AppRuntimeCommerceError(
        "asaas_webhook_not_configured",
        "unavailable",
        "A conta de pagamento ainda não está pronta para confirmar pedidos automaticamente.",
      );
    }
  } catch (error) {
    if (error instanceof AppRuntimeCommerceError) throw error;
    throw new AppRuntimeCommerceError(
      "asaas_webhook_setup_failed",
      "unavailable",
      "Não foi possível preparar a automação de pagamento agora.",
    );
  }

  const orderId = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
      for (const item of itemSnapshot) {
        if (!item.stockControlled) continue;
        const reserved = await tx.execute(sql`
          UPDATE produtos_catalogo
             SET estoque_quantidade = estoque_quantidade - ${item.quantity},
                 updated_at = now()
           WHERE id = ${item.productId}
             AND tenant_id = ${context.tenantId}
             AND ativo = true
             AND controla_estoque = true
             AND COALESCE(estoque_quantidade, 0) >= ${item.quantity}
          RETURNING id
        `);
        if (rowsOf<{ id: string }>(reserved).length === 0) {
          throw new AppRuntimeCommerceError("stock_unavailable", "conflict", `Estoque insuficiente para ${item.name}.`);
        }
      }

      await tx.execute(sql`
        INSERT INTO site_checkout_orders (
          id, tenant_id, site_id, site_slug, app_instance_id, app_user_id,
          idempotency_key, checkout_source, customer_name, customer_email,
          customer_phone, customer_cpf_cnpj, billing_type, items,
          one_time_total, recurring_total, first_charge_total, status,
          stock_reserved_at, page_url
        ) VALUES (
          ${orderId}, ${context.tenantId}, NULL, ${`app:${context.appInstanceId}`},
          ${context.appInstanceId}, ${context.viewer.id}, ${data.idempotencyKey}, 'app_runtime',
          ${context.viewer.displayName}, ${context.viewer.email.toLowerCase()},
          ${data.phone ?? context.viewer.phone ?? null}, ${data.cpfCnpj ?? null},
          ${data.billingType}, ${JSON.stringify(itemSnapshot)}::jsonb,
          ${money(oneTimeTotal)}, ${money(recurringTotal)}, ${money(firstChargeTotal)},
          'created', now(), NULL
        )
      `);
    });
  } catch (error) {
    if (error instanceof AppRuntimeCommerceError) throw error;
    const duplicate = await loadExistingOrder(
      context.tenantId,
      context.appInstanceId,
      context.viewer.id,
      data.idempotencyKey,
    );
    if (duplicate) return orderResponse(duplicate);
    throw error;
  }

  try {
    const customer = await createOrGetCustomer({
      name: context.viewer.displayName,
      email: context.viewer.email.toLowerCase(),
      cpfCnpj: data.cpfCnpj,
      phone: data.phone ?? context.viewer.phone ?? undefined,
    }, asaasKey);

    const charge = await createCharge({
      customer: customer.id,
      billingType: data.billingType as AsaasBillingType,
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
         AND tenant_id = ${context.tenantId}
         AND app_instance_id = ${context.appInstanceId}
         AND app_user_id = ${context.viewer.id}
    `);

    return {
      orderId,
      status: "payment_pending",
      paymentUrl,
      provider: "asaas",
      totals: {
        oneTime: oneTimeTotal,
        recurringMonthly: recurringTotal,
        dueNow: firstChargeTotal,
      },
      reused: false,
    };
  } catch (error) {
    await db.execute(sql`
      UPDATE site_checkout_orders
         SET status = 'failed',
             error_code = 'asaas_charge_failed',
             updated_at = now()
       WHERE id = ${orderId}
         AND tenant_id = ${context.tenantId}
         AND app_instance_id = ${context.appInstanceId}
         AND app_user_id = ${context.viewer.id}
    `);
    throw new AppRuntimeCommerceError(
      "asaas_charge_failed",
      "unavailable",
      "Não foi possível iniciar o pagamento agora. O estoque reservado foi liberado.",
    );
  }
}

export async function listAppRuntimeOrders(
  context: AppRuntimeCommerceContext,
): Promise<JsonObject> {
  const result = await db.execute(sql`
    SELECT id, status, payment_url, one_time_total, recurring_total,
           first_charge_total, billing_type, items, paid_at, created_at
      FROM site_checkout_orders
     WHERE tenant_id = ${context.tenantId}
       AND app_instance_id = ${context.appInstanceId}
       AND app_user_id = ${context.viewer.id}
     ORDER BY created_at DESC
     LIMIT 50
  `);
  const rows = rowsOf<OrderListRow>(result);
  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      paymentUrl: row.payment_url,
      billingType: row.billing_type,
      products: Array.isArray(row.items) ? row.items : row.items,
      totals: {
        oneTime: Number(row.one_time_total),
        recurringMonthly: Number(row.recurring_total),
        dueNow: Number(row.first_charge_total),
      },
      paidAt: row.paid_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    })),
    sourceOfTruth: "vendorai.commerce",
  };
}
