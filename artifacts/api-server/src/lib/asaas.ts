import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { decrypt } from "./crypto.js";

const BASE_URL = (process.env.ASAAS_BASE_URL?.trim() || (
  process.env.ASAAS_SANDBOX === "true"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3"
)).replace(/\/+$/, "");

const USER_AGENT = process.env.ASAAS_USER_AGENT?.trim() || "VendorAI/1.0 (Node.js)";

function getApiKey(explicit?: string | null): string | null {
  return explicit ?? process.env.ASAAS_API_KEY ?? null;
}

export function getPlatformAsaasApiKey(): string | null {
  return getApiKey();
}

/**
 * Reads and decrypts a tenant's own Asaas API key (`tenants.asaas_api_key`,
 * stored encrypted with lib/crypto.ts). Each tenant is expected to have its
 * own Asaas account — the platform-level `ASAAS_API_KEY` env var is only used
 * for platform-billed flows (e.g. tenant paying VendorAI itself), not for
 * tenant-to-customer charges.
 */
export async function getTenantAsaasApiKey(tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select({ asaasApiKey: tenantsTable.asaasApiKey })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant?.asaasApiKey) return null;

  try {
    return decrypt(tenant.asaasApiKey);
  } catch (err) {
    logger.warn({ tenantId, err }, "Falha ao descriptografar a chave Asaas do tenant");
    return null;
  }
}

async function asaasRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  apiKey?: string | null,
): Promise<T> {
  const key = getApiKey(apiKey);
  if (!key) {
    throw new Error("Asaas API key not configured");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      access_token: key,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json() as unknown;

  if (!res.ok) {
    const errMsg = (data as any)?.errors?.[0]?.description ?? `Asaas API error ${res.status}`;
    logger.warn({ status: res.status, path, body: data }, `Asaas error: ${errMsg}`);
    throw new Error(errMsg);
  }

  return data as T;
}

export interface AsaasSubaccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  companyType?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
}

export interface AsaasSubaccountOutput {
  id: string;
  walletId: string;
  name: string;
  email: string;
  cpfCnpj: string;
}

export async function createSubaccount(
  data: AsaasSubaccountInput,
  apiKey?: string | null,
): Promise<AsaasSubaccountOutput> {
  return asaasRequest<AsaasSubaccountOutput>("POST", "/accounts", {
    ...data,
    companyType: data.companyType ?? "LIMITED",
  }, apiKey);
}

export interface AsaasSplit {
  walletId: string;
  percentualValue: number;
}

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";

export interface AsaasChargeInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  split?: AsaasSplit[];
  installmentCount?: number;
  installmentValue?: number;
}

// ── Forma de pagamento (proposta) → Asaas billingType ───────────────────────────
const FORMA_TO_BILLING_TYPE: Record<string, AsaasBillingType> = {
  pix: "PIX",
  boleto: "BOLETO",
  cartao_credito: "CREDIT_CARD",
  cartao_debito: "CREDIT_CARD",
  transferencia: "UNDEFINED",
  dinheiro: "UNDEFINED",
  a_combinar: "UNDEFINED",
};

export function formaPagamentoToBillingType(formaPagamento: string | null | undefined): AsaasBillingType {
  return FORMA_TO_BILLING_TYPE[formaPagamento ?? ""] ?? "UNDEFINED";
}

export interface AsaasChargeOutput {
  id: string;
  status: string;
  invoiceUrl: string;
  bankSlipUrl: string | null;
  pixQrCodeId: string | null;
  externalReference?: string | null;
}

export async function createCharge(
  data: AsaasChargeInput,
  apiKey?: string | null,
): Promise<AsaasChargeOutput> {
  return asaasRequest<AsaasChargeOutput>("POST", "/payments", data, apiKey);
}

/**
 * Removes an unpaid charge from the active Asaas flow. This is not a refund:
 * callers must only use it for pending/overdue local cycles. Asaas documents
 * DELETE /payments/{id} for this purpose and returns { deleted, id }.
 */
export async function deleteCharge(
  chargeId: string,
  apiKey?: string | null,
): Promise<{ deleted: boolean; id: string }> {
  return asaasRequest<{ deleted: boolean; id: string }>(
    "DELETE",
    `/payments/${encodeURIComponent(chargeId)}`,
    undefined,
    apiKey,
  );
}

/**
 * Recovery path for application-managed idempotency. Asaas recommends that
 * integrations reconcile an inconclusive request before retrying. The launch
 * subscription worker uses its stable externalReference to recover a charge
 * that may have been created remotely before the local process persisted it.
 */
export async function findChargeByExternalReference(
  externalReference: string,
  apiKey?: string | null,
): Promise<AsaasChargeOutput | null> {
  const result = await asaasRequest<{ data?: AsaasChargeOutput[] }>(
    "GET",
    `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
    undefined,
    apiKey,
  );
  return result.data?.[0] ?? null;
}

export interface AsaasCustomerInput {
  name: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
}

export interface AsaasCustomerOutput {
  id: string;
  name: string;
  email: string;
}

export async function createOrGetCustomer(
  data: AsaasCustomerInput,
  apiKey?: string | null,
): Promise<AsaasCustomerOutput> {
  if (data.email) {
    const existing = await asaasRequest<{ data: AsaasCustomerOutput[] }>(
      "GET",
      `/customers?email=${encodeURIComponent(data.email)}&limit=1`,
      undefined,
      apiKey,
    );
    if (existing.data.length > 0 && existing.data[0]) {
      return existing.data[0];
    }
  }

  return asaasRequest<AsaasCustomerOutput>("POST", "/customers", data, apiKey);
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export async function getPixQrCode(chargeId: string, apiKey?: string | null): Promise<AsaasPixQrCode> {
  return asaasRequest<AsaasPixQrCode>("GET", `/payments/${chargeId}/pixQrCode`, undefined, apiKey);
}

export interface AsaasSubscriptionInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
  description?: string;
  externalReference?: string;
  endDate?: string;
  maxPayments?: number;
}

export interface AsaasSubscriptionOutput {
  id: string;
  status?: string;
  customer?: string;
  value?: number;
  nextDueDate?: string;
  cycle?: string;
  externalReference?: string | null;
}

export async function createSubscription(
  data: AsaasSubscriptionInput,
  apiKey?: string | null,
): Promise<AsaasSubscriptionOutput> {
  return asaasRequest<AsaasSubscriptionOutput>("POST", "/subscriptions", data, apiKey);
}

export interface AsaasWebhookConfig {
  id: string;
  name?: string;
  url?: string;
  enabled?: boolean;
  interrupted?: boolean;
  events?: string[];
}

export async function ensureAsaasPaymentWebhook(
  input: { email: string; name?: string },
  apiKey?: string | null,
): Promise<{ configured: boolean; id?: string; reason?: string }> {
  const authToken = process.env.ASAAS_WEBHOOK_ACCESS_TOKEN?.trim();
  const apiBase = (process.env.PUBLIC_API_URL || process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (!authToken || authToken.length < 32 || !apiBase) {
    return { configured: false, reason: "server_webhook_config_missing" };
  }

  const webhookUrl = `${apiBase}/api/webhooks/asaas`;
  const existing = await asaasRequest<{ data?: AsaasWebhookConfig[] }>("GET", "/webhooks?limit=100", undefined, apiKey)
    .catch(() => ({ data: [] }));
  const match = existing.data?.find((item) => item.url === webhookUrl || item.name === "VendorAI Checkout");
  if (match?.id) return { configured: true, id: match.id };

  const created = await asaasRequest<AsaasWebhookConfig>("POST", "/webhooks", {
    name: input.name || "VendorAI Checkout",
    url: webhookUrl,
    email: input.email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken,
    sendType: "SEQUENTIALLY",
    events: [
      "PAYMENT_RECEIVED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_OVERDUE",
      "PAYMENT_DELETED",
      "PAYMENT_CANCELLED",
    ],
  }, apiKey);

  return { configured: true, id: created.id };
}

/**
 * Whether Asaas billing is available.
 *
 * - `isAsaasConfigured()` (no args): checks the platform-level `ASAAS_API_KEY`
 *   env var. Used by platform-billed flows (tenant paying VendorAI itself).
 * - `isAsaasConfigured(tenantId)`: checks whether that specific tenant has its
 *   own Asaas account configured (`tenants.asaas_api_key`, encrypted). This is
 *   the correct check for tenant-to-customer billing (deal-won charges) —
 *   each tenant has its own Asaas account. Missing configuration here is a
 *   normal, expected state (not an error): callers should fall back to manual
 *   billing rather than treating it as a failure.
 */
export async function isAsaasConfigured(tenantId?: string): Promise<boolean> {
  if (tenantId) {
    const key = await getTenantAsaasApiKey(tenantId);
    return !!key;
  }
  return !!getApiKey();
}
