import { createHmac } from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { encrypt } from "./crypto.js";

type JsonObject = Record<string, unknown>;

type IdentityRow = {
  id: string;
  app_user_id: string | null;
  lead_id: string | null;
};

type LinkedLead = {
  id: string;
  app_user_id: string | null;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: number) => {
    let sum = 0;
    for (let i = 0; i < base; i += 1) sum += Number(cpf[i]) * (base + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function identitySecret(): string {
  const secret = process.env.CUSTOMER_IDENTITY_HMAC_SECRET || process.env.MASTER_ENCRYPTION_KEY;
  if (!secret) throw new Error("CUSTOMER_IDENTITY_SECRET_NOT_CONFIGURED");
  return secret;
}

export function cpfFingerprint(cpf: string): string {
  const normalized = normalizeCpf(cpf);
  if (!isValidCpf(normalized)) throw new Error("CPF_INVALID");
  return createHmac("sha256", identitySecret())
    .update(`vendorai:customer-identity:cpf:${normalized}`)
    .digest("hex");
}

function maskCpf(cpf: string): string {
  const normalized = normalizeCpf(cpf);
  return `***.${normalized.slice(3, 6)}.${normalized.slice(6, 9)}-**`;
}

async function findLeadByCpf(tenantId: string, cpf: string): Promise<LinkedLead | null> {
  const result = await db.execute(sql`
    SELECT l.id,
           (
             SELECT au.id
               FROM app_users au
              WHERE au.tenant_id = l.tenant_id
                AND au.lead_id = l.id
                AND au.status = 'active'
              ORDER BY au.updated_at DESC
              LIMIT 1
           ) AS app_user_id
      FROM leads l
     WHERE l.tenant_id = ${tenantId}
       AND regexp_replace(COALESCE(l.documento, ''), '[^0-9]', '', 'g') = ${cpf}
     ORDER BY l.updated_at DESC
     LIMIT 1
  `);
  return rowsOf<LinkedLead>(result)[0] ?? null;
}

export async function linkCpfToAppUser(input: {
  tenantId: string;
  appUserId: string;
  leadId?: string | null;
  cpf: string;
  verifiedSource?: string;
}): Promise<JsonObject> {
  const cpf = normalizeCpf(input.cpf);
  if (!isValidCpf(cpf)) throw new Error("CPF_INVALID");
  const fingerprint = cpfFingerprint(cpf);
  const ciphertext = encrypt(cpf);

  const existingResult = await db.execute(sql`
    SELECT id, app_user_id, lead_id
      FROM customer_identity_documents
     WHERE tenant_id = ${input.tenantId}
       AND document_type = 'cpf'
       AND document_fingerprint = ${fingerprint}
     LIMIT 1
  `);
  const existing = rowsOf<IdentityRow>(existingResult)[0] ?? null;
  if (existing?.app_user_id && existing.app_user_id !== input.appUserId) {
    throw new Error("CPF_ALREADY_LINKED");
  }

  const lead = input.leadId
    ? { id: input.leadId, app_user_id: input.appUserId }
    : await findLeadByCpf(input.tenantId, cpf);
  const leadId = lead?.id ?? existing?.lead_id ?? null;

  await db.execute(sql`
    INSERT INTO customer_identity_documents (
      tenant_id, document_type, document_fingerprint, document_ciphertext,
      app_user_id, lead_id, verified_source, verified_at, updated_at
    ) VALUES (
      ${input.tenantId}, 'cpf', ${fingerprint}, ${ciphertext},
      ${input.appUserId}, ${leadId}, ${input.verifiedSource ?? "app_user"}, now(), now()
    )
    ON CONFLICT (tenant_id, document_type, document_fingerprint)
    DO UPDATE SET
      app_user_id = EXCLUDED.app_user_id,
      lead_id = COALESCE(customer_identity_documents.lead_id, EXCLUDED.lead_id),
      document_ciphertext = EXCLUDED.document_ciphertext,
      verified_source = EXCLUDED.verified_source,
      verified_at = now(),
      updated_at = now()
  `);

  const claimed = await db.execute(sql`
    UPDATE external_purchases
       SET app_user_id = ${input.appUserId},
           lead_id = COALESCE(lead_id, ${leadId}),
           updated_at = now()
     WHERE tenant_id = ${input.tenantId}
       AND document_fingerprint = ${fingerprint}
       AND app_user_id IS NULL
    RETURNING id
  `);
  const claimedRows = rowsOf<{ id: string }>(claimed);

  if (claimedRows.length > 0) {
    await db.execute(sql`
      UPDATE app_runtime_commerce_events e
         SET app_user_id = ${input.appUserId}, updated_at = now()
       WHERE e.external_purchase_id IN (${sql.join(claimedRows.map((row) => sql`${row.id}`), sql`, `)})
    `);
  }

  return {
    linked: true,
    claimedPurchases: claimedRows.length,
    maskedCpf: maskCpf(cpf),
  };
}

const externalPurchaseSchema = z.object({
  tenantId: z.string().min(1),
  sourceKey: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  sourceName: z.string().trim().min(2).max(160),
  sourceKind: z.enum(["erp", "pdv", "ecommerce", "marketplace", "manual", "other"]),
  externalOrderId: z.string().trim().min(1).max(180),
  cpf: z.string().trim().min(11).max(18).optional(),
  status: z.enum(["created", "paid", "cancelled", "refunded", "partially_refunded", "voided"]).default("paid"),
  occurredAt: z.coerce.date(),
  customer: z.object({
    name: z.string().trim().max(180).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
  }).optional(),
  storeId: z.string().trim().max(120).optional(),
  terminalId: z.string().trim().max(120).optional(),
  sellerId: z.string().trim().max(120).optional(),
  items: z.array(z.object({
    sku: z.string().trim().max(180).optional(),
    productId: z.string().trim().max(180).optional(),
    name: z.string().trim().min(1).max(240),
    quantity: z.number().positive(),
    unitValue: z.number().nonnegative().optional(),
    lineTotal: z.number().nonnegative().optional(),
  })).max(300).default([]),
  subtotal: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  paymentMethod: z.string().trim().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type ExternalPurchaseInput = z.infer<typeof externalPurchaseSchema>;

export async function ingestExternalPurchase(raw: unknown): Promise<JsonObject> {
  const parsed = externalPurchaseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("EXTERNAL_PURCHASE_INVALID");
  const data = parsed.data;

  let fingerprint: string | null = null;
  let appUserId: string | null = null;
  let leadId: string | null = null;

  if (data.cpf) {
    const cpf = normalizeCpf(data.cpf);
    if (!isValidCpf(cpf)) throw new Error("CPF_INVALID");
    fingerprint = cpfFingerprint(cpf);

    const identityResult = await db.execute(sql`
      SELECT id, app_user_id, lead_id
        FROM customer_identity_documents
       WHERE tenant_id = ${data.tenantId}
         AND document_type = 'cpf'
         AND document_fingerprint = ${fingerprint}
       LIMIT 1
    `);
    let identity = rowsOf<IdentityRow>(identityResult)[0] ?? null;

    if (!identity) {
      const lead = await findLeadByCpf(data.tenantId, cpf);
      leadId = lead?.id ?? null;
      appUserId = lead?.app_user_id ?? null;
      await db.execute(sql`
        INSERT INTO customer_identity_documents (
          tenant_id, document_type, document_fingerprint, document_ciphertext,
          app_user_id, lead_id, verified_source, verified_at
        ) VALUES (
          ${data.tenantId}, 'cpf', ${fingerprint}, ${encrypt(cpf)},
          ${appUserId}, ${leadId}, ${data.sourceKey}, now()
        )
        ON CONFLICT (tenant_id, document_type, document_fingerprint) DO NOTHING
      `);
    } else {
      appUserId = identity.app_user_id;
      leadId = identity.lead_id;
    }
  }

  const sourceResult = await db.execute(sql`
    INSERT INTO external_purchase_sources (
      tenant_id, source_key, name, source_kind, active, last_received_at, updated_at
    ) VALUES (
      ${data.tenantId}, ${data.sourceKey}, ${data.sourceName}, ${data.sourceKind}, true, now(), now()
    )
    ON CONFLICT (tenant_id, source_key)
    DO UPDATE SET
      name = EXCLUDED.name,
      source_kind = EXCLUDED.source_kind,
      last_received_at = now(),
      updated_at = now()
    RETURNING id
  `);
  const sourceId = rowsOf<{ id: string }>(sourceResult)[0]?.id ?? null;

  const purchaseResult = await db.execute(sql`
    INSERT INTO external_purchases (
      tenant_id, source_id, source_key, source_kind, external_order_id,
      document_fingerprint, app_user_id, lead_id, status,
      customer_name, customer_email, customer_phone,
      store_id, terminal_id, seller_id, items, subtotal, discount, total,
      payment_method, occurred_at, metadata, updated_at
    ) VALUES (
      ${data.tenantId}, ${sourceId}, ${data.sourceKey}, ${data.sourceKind}, ${data.externalOrderId},
      ${fingerprint}, ${appUserId}, ${leadId}, ${data.status},
      ${data.customer?.name ?? null}, ${data.customer?.email?.toLowerCase() ?? null}, ${data.customer?.phone ?? null},
      ${data.storeId ?? null}, ${data.terminalId ?? null}, ${data.sellerId ?? null}, ${JSON.stringify(data.items)}::jsonb,
      ${data.subtotal.toFixed(2)}, ${data.discount.toFixed(2)}, ${data.total.toFixed(2)},
      ${data.paymentMethod ?? null}, ${data.occurredAt}, ${JSON.stringify(data.metadata)}::jsonb, now()
    )
    ON CONFLICT (tenant_id, source_key, external_order_id)
    DO UPDATE SET
      source_id = EXCLUDED.source_id,
      source_kind = EXCLUDED.source_kind,
      document_fingerprint = COALESCE(EXCLUDED.document_fingerprint, external_purchases.document_fingerprint),
      app_user_id = COALESCE(EXCLUDED.app_user_id, external_purchases.app_user_id),
      lead_id = COALESCE(EXCLUDED.lead_id, external_purchases.lead_id),
      status = EXCLUDED.status,
      customer_name = COALESCE(EXCLUDED.customer_name, external_purchases.customer_name),
      customer_email = COALESCE(EXCLUDED.customer_email, external_purchases.customer_email),
      customer_phone = COALESCE(EXCLUDED.customer_phone, external_purchases.customer_phone),
      store_id = EXCLUDED.store_id,
      terminal_id = EXCLUDED.terminal_id,
      seller_id = EXCLUDED.seller_id,
      items = EXCLUDED.items,
      subtotal = EXCLUDED.subtotal,
      discount = EXCLUDED.discount,
      total = EXCLUDED.total,
      payment_method = EXCLUDED.payment_method,
      occurred_at = EXCLUDED.occurred_at,
      metadata = EXCLUDED.metadata,
      updated_at = now()
    RETURNING id, status, app_user_id, lead_id, source_key, source_kind, external_order_id, total, occurred_at
  `);
  const purchase = rowsOf<Record<string, unknown>>(purchaseResult)[0] ?? {};

  return {
    ...purchase,
    identityMatched: Boolean(appUserId || leadId),
    appUserId,
    leadId,
  };
}

export async function listUnifiedPurchaseHistory(input: {
  tenantId: string;
  appInstanceId: string;
  appUserId: string;
}): Promise<JsonObject> {
  const result = await db.execute(sql`
    SELECT * FROM (
      SELECT
        o.id,
        o.status,
        o.payment_url AS payment_url,
        o.billing_type AS billing_type,
        o.items,
        o.first_charge_total::numeric AS total,
        o.paid_at,
        o.created_at AS occurred_at,
        'app'::text AS source_kind,
        o.checkout_source AS source_key,
        o.id AS external_order_id,
        NULL::text AS store_id
      FROM site_checkout_orders o
      WHERE o.tenant_id = ${input.tenantId}
        AND o.app_instance_id = ${input.appInstanceId}
        AND o.app_user_id = ${input.appUserId}

      UNION ALL

      SELECT
        p.id,
        p.status,
        NULL::text AS payment_url,
        p.payment_method AS billing_type,
        p.items,
        p.total::numeric AS total,
        CASE WHEN p.status = 'paid' THEN p.occurred_at ELSE NULL END AS paid_at,
        p.occurred_at,
        p.source_kind,
        p.source_key,
        p.external_order_id,
        p.store_id
      FROM external_purchases p
      WHERE p.tenant_id = ${input.tenantId}
        AND p.app_user_id = ${input.appUserId}
    ) unified
    ORDER BY occurred_at DESC
    LIMIT 100
  `);

  const rows = rowsOf<{
    id: string;
    status: string;
    payment_url: string | null;
    billing_type: string | null;
    items: unknown;
    total: string | number;
    paid_at: Date | null;
    occurred_at: Date;
    source_kind: string;
    source_key: string;
    external_order_id: string;
    store_id: string | null;
  }>(result);

  return {
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      paymentUrl: row.payment_url,
      billingType: row.billing_type,
      products: Array.isArray(row.items) ? row.items : [],
      totals: { dueNow: Number(row.total ?? 0) },
      paidAt: row.paid_at?.toISOString() ?? null,
      createdAt: row.occurred_at.toISOString(),
      origin: row.source_kind,
      sourceKey: row.source_key,
      externalOrderId: row.external_order_id,
      storeId: row.store_id,
    })),
    sourceOfTruth: "vendorai.customer_purchase_history",
  };
}
