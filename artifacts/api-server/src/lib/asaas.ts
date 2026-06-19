import { logger } from "./logger.js";

const BASE_URL = process.env.ASAAS_SANDBOX === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://www.asaas.com/api/v3";

function getApiKey(): string | null {
  return process.env.ASAAS_API_KEY ?? null;
}

async function asaasRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY not configured");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
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
): Promise<AsaasSubaccountOutput> {
  return asaasRequest<AsaasSubaccountOutput>("POST", "/accounts", {
    ...data,
    companyType: data.companyType ?? "LIMITED",
  });
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
}

export async function createCharge(
  data: AsaasChargeInput,
): Promise<AsaasChargeOutput> {
  return asaasRequest<AsaasChargeOutput>("POST", "/payments", data);
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
): Promise<AsaasCustomerOutput> {
  if (data.email) {
    const existing = await asaasRequest<{ data: AsaasCustomerOutput[] }>(
      "GET",
      `/customers?email=${encodeURIComponent(data.email)}&limit=1`,
    );
    if (existing.data.length > 0 && existing.data[0]) {
      return existing.data[0];
    }
  }

  return asaasRequest<AsaasCustomerOutput>("POST", "/customers", data);
}

export interface AsaasPixQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export async function getPixQrCode(chargeId: string): Promise<AsaasPixQrCode> {
  return asaasRequest<AsaasPixQrCode>("GET", `/payments/${chargeId}/pixQrCode`);
}

export function isAsaasConfigured(): boolean {
  return !!getApiKey();
}
