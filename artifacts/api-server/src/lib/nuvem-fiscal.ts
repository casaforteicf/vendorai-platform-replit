const AUTH_URL = "https://auth.nuvemfiscal.com.br/oauth/token";
const API_URL = "https://api.nuvemfiscal.com.br";

export function isNuvemFiscalConfigured() {
  return Boolean(process.env.NUVEM_FISCAL_CLIENT_ID && process.env.NUVEM_FISCAL_CLIENT_SECRET);
}

async function token(scope: "nfe" | "nfse") {
  const clientId = process.env.NUVEM_FISCAL_CLIENT_ID;
  const clientSecret = process.env.NUVEM_FISCAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Nuvem Fiscal não configurada");
  const body = new URLSearchParams({ grant_type:"client_credentials", client_id:clientId, client_secret:clientSecret, scope });
  const response = await fetch(AUTH_URL, { method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" }, body });
  const data = await response.json() as any;
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? `Falha de autenticação fiscal (${response.status})`);
  return data.access_token as string;
}

export async function emitirDocumentoFiscal(tipo: "nfe" | "nfse", payload: Record<string, unknown>) {
  const accessToken = await token(tipo);
  const path = tipo === "nfe" ? "/nfe" : "/nfse/dps";
  const response = await fetch(`${API_URL}${path}`, { method:"POST", headers:{ Authorization:`Bearer ${accessToken}`, "Content-Type":"application/json" }, body:JSON.stringify(payload) });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data?.error?.message ?? data?.mensagens?.[0]?.descricao ?? `Emissão fiscal rejeitada (${response.status})`);
  return data;
}
