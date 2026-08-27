const DEFAULT_BASE = "https://www.orendapay.com.br/api/v1";

export type OrendaBillingType = "pix" | "boleto" | "credit" | "debit";

export type OrendaSplit = { percentual?: string; valor?: string; email: string };

export type OrendaChargeInput = {
  seu_codigo: string;
  descricao: string;
  vencimento: string;
  valor: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  cliente_telefone?: string;
  cliente_email: string;
  cliente_endereco: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_cep: string;
  TIPO: OrendaBillingType;
  NUMERO_PARCELAS?: string;
  RECORRENCIA?: string;
  ENVIAR_EMAIL?: string;
  ENVIAR_SMS?: string;
  ENVIO_IMEDIATO?: string;
  SPLIT?: OrendaSplit[];
  SPLIT_TIPO?: "P" | "D";
  URL_CALLBACK?: string;
  UTILIZACAO?: "ECOMMERCE" | string;
  cartao_numero?: string;
  cartao_nome?: string;
  cartao_validade?: string;
  cartao_codigo?: string;
  pre_autorizar?: "0" | "1";
};

export class OrendaPayError extends Error {
  status: number;
  payload: any;
  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = "OrendaPayError";
    this.status = status;
    this.payload = payload;
  }
}

function credentials() {
  const id = String(process.env.ORENDAPAY_ID || "").trim();
  const token = String(process.env.ORENDAPAY_TOKEN || "").trim();
  if (!id || !token) throw new OrendaPayError("Credenciais OrendaPay não configuradas.", 503, null);
  return { id, token };
}

function baseUrl() {
  return String(process.env.ORENDAPAY_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

async function request(path: string, init: RequestInit = {}) {
  const { id, token } = credentials();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-ID": id,
        "x-Token": token,
        "User-Agent": "Vendor.ai/OrendaPay",
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok) {
      if (response.status === 429) throw new OrendaPayError("Limite de requisições da OrendaPay atingido.", 429, payload);
      if (response.status === 423) throw new OrendaPayError("Integração OrendaPay bloqueada por requisito de segurança.", 423, payload);
      throw new OrendaPayError("Falha na operação OrendaPay.", response.status, payload);
    }
    return payload;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new OrendaPayError("Timeout de comunicação com a OrendaPay.", 504, null);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createOrendaCharge(input: OrendaChargeInput) {
  // Never log or persist this payload: it can contain PAN/CVV for card transactions.
  return request("/cobranca", { method: "POST", body: JSON.stringify(input) });
}

export async function getOrendaCharge(code: string) {
  return request(`/cobranca/${encodeURIComponent(code)}`);
}

export async function cancelOrendaCharge(code: string) {
  return request(`/cobranca/${encodeURIComponent(code)}/cancela`, { method: "PUT" });
}

export async function captureOrendaCharge(code: string) {
  return request(`/cobranca/${encodeURIComponent(code)}/captura`, { method: "PUT" });
}

export function mapOrendaStatus(value: unknown) {
  const status = String(value || "").trim().toLowerCase();
  if (["pago", "credito"].includes(status)) return "received";
  if (status === "chargeback") return "chargeback";
  if (status === "estorno") return "refunded";
  if (status === "cancelado") return "cancelled";
  if (status === "aguardando") return "pending";
  return "pending";
}

export function brDateFromIso(isoDate: string) {
  const [y,m,d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function decimalFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}
