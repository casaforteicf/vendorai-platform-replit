import { and, desc, eq } from "drizzle-orm";
import {
  db,
  financeIntegrationConnectionsTable,
  financeIntegrationRegistryTable,
  financeIntegrationSyncLogsTable,
  googleAdsConnectionsTable,
  instagramConnectionsTable,
  tenantsTable,
  whatsappConnectionsTable,
  type FinanceIntegrationStatus,
} from "@workspace/db";
import { getTenantAsaasApiKey } from "../lib/asaas.js";
import { isNuvemFiscalConfigured } from "../lib/nuvem-fiscal.js";

export type FinanceHealthResult = {
  providerKey: string;
  configured: boolean;
  status: FinanceIntegrationStatus;
  authenticationHealthPercent: number;
  syncHealthPercent: number;
  webhookHealthPercent: number;
  dataConsistencyPercent: number;
  overallHealthPercent: number;
  latencyMs: number | null;
  message: string;
  errorCode: string | null;
  checkedAt: Date;
};

type RawCheck = {
  configured: boolean;
  auth: number;
  sync?: number;
  webhook?: number;
  consistency?: number;
  message: string;
  errorCode?: string | null;
  expired?: boolean;
  latencyMs?: number | null;
  metadata?: Record<string, unknown>;
};

function pct(value: number | undefined, fallback = 0) {
  const n = Number(value ?? fallback);
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : fallback));
}

function overall(check: RawCheck, webhookSupport: boolean) {
  const auth = pct(check.auth);
  const sync = pct(check.sync, check.configured ? 70 : 0);
  const webhook = pct(check.webhook, webhookSupport ? (check.configured ? 60 : 0) : 100);
  const consistency = pct(check.consistency, check.configured ? 80 : 0);
  return Number((auth * 0.35 + sync * 0.25 + webhook * 0.15 + consistency * 0.25).toFixed(2));
}

function deriveStatus(check: RawCheck, score: number): FinanceIntegrationStatus {
  if (!check.configured) return "not_configured";
  if (check.expired) return "expired";
  if (check.auth <= 0) return "error";
  if (score >= 80) return "connected";
  if (score >= 50) return "partial";
  return "error";
}

async function timedFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(6500) });
    return { response, latencyMs: Date.now() - started };
  } catch (error) {
    return { response: null, latencyMs: Date.now() - started, error };
  }
}

async function checkAsaas(tenantId: string): Promise<RawCheck> {
  const key = await getTenantAsaasApiKey(tenantId);
  if (!key) return { configured: false, auth: 0, message: "Asaas não configurado para este tenant." };
  const base = (process.env.ASAAS_BASE_URL?.trim() || (process.env.ASAAS_SANDBOX === "true" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3")).replace(/\/+$/, "");
  const { response, latencyMs } = await timedFetch(`${base}/myAccount`, { headers: { access_token: key, "User-Agent": process.env.ASAAS_USER_AGENT?.trim() || "VendorAI/1.0" } });
  if (!response) return { configured: true, auth: 0, sync: 0, webhook: 50, consistency: 50, latencyMs, errorCode: "NETWORK_ERROR", message: "Asaas configurado, mas não respondeu ao health check." };
  if (response.ok) return { configured: true, auth: 100, sync: 100, webhook: 85, consistency: 100, latencyMs, message: "Asaas autenticado e respondendo." };
  return { configured: true, auth: response.status === 401 || response.status === 403 ? 0 : 30, sync: 20, webhook: 40, consistency: 50, latencyMs, errorCode: `HTTP_${response.status}`, message: `Asaas respondeu HTTP ${response.status}.` };
}

async function checkZapSign(tenantId: string): Promise<RawCheck> {
  const [tenant] = await db.select({ key: tenantsTable.zapsignApiKey }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  if (!tenant?.key) return { configured: false, auth: 0, message: "ZapSign não configurado." };
  const { response, latencyMs } = await timedFetch("https://api.zapsign.com.br/api/v1/users/me/", { headers: { Authorization: `Bearer ${tenant.key}` } });
  if (!response) return { configured: true, auth: 0, sync: 0, webhook: 40, consistency: 50, latencyMs, errorCode: "NETWORK_ERROR", message: "ZapSign configurado, mas não respondeu." };
  if (response.ok) return { configured: true, auth: 100, sync: 95, webhook: 85, consistency: 100, latencyMs, message: "ZapSign autenticado e respondendo." };
  return { configured: true, auth: response.status === 401 || response.status === 403 ? 0 : 30, sync: 20, webhook: 40, consistency: 50, latencyMs, errorCode: `HTTP_${response.status}`, message: `ZapSign respondeu HTTP ${response.status}.` };
}

async function checkInstagram(tenantId: string): Promise<RawCheck> {
  const [row] = await db.select().from(instagramConnectionsTable).where(eq(instagramConnectionsTable.tenantId, tenantId)).orderBy(desc(instagramConnectionsTable.updatedAt)).limit(1);
  if (!row || row.disconnectedAt || !row.pageAccessToken) return { configured: false, auth: 0, message: "Instagram não conectado." };
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()) return { configured: true, auth: 0, expired: true, sync: 0, webhook: 30, consistency: 50, errorCode: "TOKEN_EXPIRED", message: "Token do Instagram expirado." };
  const version = process.env.META_GRAPH_VERSION?.trim() || "v23.0";
  const url = `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(row.pageAccessToken)}`;
  const { response, latencyMs } = await timedFetch(url);
  if (!response) return { configured: true, auth: 30, sync: 20, webhook: 60, consistency: 70, latencyMs, errorCode: "NETWORK_ERROR", message: "Instagram conectado, porém o Graph API não respondeu." };
  if (response.ok) return { configured: true, auth: 100, sync: 95, webhook: 85, consistency: 95, latencyMs, message: "Instagram/Meta autenticado e respondendo." };
  return { configured: true, auth: response.status === 401 || response.status === 400 ? 0 : 30, sync: 20, webhook: 40, consistency: 60, latencyMs, errorCode: `HTTP_${response.status}`, message: `Instagram/Meta respondeu HTTP ${response.status}.` };
}

async function checkWhatsapp(tenantId: string): Promise<RawCheck> {
  const [row] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.tenantId, tenantId)).orderBy(desc(whatsappConnectionsTable.updatedAt)).limit(1);
  if (!row || row.disconnectedAt || row.status === "disconnected") return { configured: false, auth: 0, message: "WhatsApp não conectado." };
  if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now()) return { configured: true, auth: 0, expired: true, sync: 0, webhook: 20, consistency: 50, errorCode: "TOKEN_EXPIRED", message: "Token do WhatsApp expirado." };

  if (row.provider === "meta" && row.accessToken && row.phoneNumberId) {
    const version = process.env.META_GRAPH_VERSION?.trim() || "v23.0";
    const { response, latencyMs } = await timedFetch(`https://graph.facebook.com/${version}/${encodeURIComponent(row.phoneNumberId)}?fields=id,display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${row.accessToken}` } });
    if (!response) return { configured: true, auth: 30, sync: 20, webhook: 60, consistency: 70, latencyMs, errorCode: "NETWORK_ERROR", message: "WhatsApp Meta configurado, mas o Graph API não respondeu." };
    if (response.ok) return { configured: true, auth: 100, sync: 95, webhook: 90, consistency: 95, latencyMs, message: "WhatsApp Meta autenticado e respondendo." };
    return { configured: true, auth: response.status === 401 || response.status === 403 ? 0 : 30, sync: 20, webhook: 40, consistency: 60, latencyMs, errorCode: `HTTP_${response.status}`, message: `WhatsApp Meta respondeu HTTP ${response.status}.` };
  }

  if (row.provider === "evolution" && row.evolutionInstanceName) {
    const base = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
    const key = process.env.EVOLUTION_API_KEY;
    if (base && key) {
      const { response, latencyMs } = await timedFetch(`${base}/instance/connectionState/${encodeURIComponent(row.evolutionInstanceName)}`, { headers: { apikey: key } });
      if (response?.ok) return { configured: true, auth: 100, sync: 90, webhook: 85, consistency: 90, latencyMs, message: "WhatsApp Evolution respondendo." };
      return { configured: true, auth: response ? 50 : 30, sync: 30, webhook: 50, consistency: 60, latencyMs, errorCode: response ? `HTTP_${response.status}` : "NETWORK_ERROR", message: "WhatsApp Evolution configurado, mas com falha no health check." };
    }
    return { configured: true, auth: 70, sync: 65, webhook: 65, consistency: 80, message: "WhatsApp Evolution ativo; credenciais globais não disponíveis para teste remoto." };
  }

  return { configured: true, auth: row.accessToken ? 70 : 50, sync: 60, webhook: 60, consistency: 75, message: "WhatsApp conectado; provedor sem teste remoto específico." };
}

async function checkGoogleAds(tenantId: string): Promise<RawCheck> {
  const [row] = await db.select().from(googleAdsConnectionsTable).where(eq(googleAdsConnectionsTable.tenantId, tenantId)).orderBy(desc(googleAdsConnectionsTable.updatedAt)).limit(1);
  if (!row || row.disconnectedAt || row.status === "disconnected" || !row.refreshToken) return { configured: false, auth: 0, message: "Google Ads não conectado." };
  if (row.status !== "active" || !row.customerId) return { configured: true, auth: 70, sync: 35, webhook: 100, consistency: 65, message: "Google Ads autenticado, aguardando seleção/configuração completa da conta." };
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { configured: true, auth: 70, sync: 65, webhook: 100, consistency: 85, errorCode: "OAUTH_ENV_MISSING", message: "Google Ads conectado; faltam credenciais OAuth globais para validar renovação do token." };
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: row.refreshToken, grant_type: "refresh_token" });
  const { response, latencyMs } = await timedFetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (response?.ok) return { configured: true, auth: 100, sync: 90, webhook: 100, consistency: 95, latencyMs, message: "Google Ads OAuth validado com sucesso." };
  return { configured: true, auth: response?.status === 400 || response?.status === 401 ? 0 : 30, sync: 30, webhook: 100, consistency: 70, latencyMs, errorCode: response ? `HTTP_${response.status}` : "NETWORK_ERROR", message: "Falha ao renovar o token OAuth do Google Ads." };
}

async function checkNuvemFiscal(): Promise<RawCheck> {
  const configured = isNuvemFiscalConfigured();
  return configured
    ? { configured: true, auth: 80, sync: 75, webhook: 70, consistency: 90, message: "Nuvem Fiscal configurada; disponibilidade externa será confirmada durante emissão/consulta." }
    : { configured: false, auth: 0, message: "Nuvem Fiscal não configurada." };
}

function checkPlatformProvider(providerKey: string): RawCheck | null {
  const platform: Record<string, { configured: boolean; message: string }> = {
    openai: { configured: Boolean(process.env.OPENAI_API_KEY), message: "OpenAI configurada no ambiente da plataforma." },
    cloudflare: { configured: Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY), message: "Cloudflare configurado no ambiente da plataforma." },
    railway: { configured: Boolean(process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN), message: "Railway configurado no ambiente da plataforma." },
    supabase: { configured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)), message: "Supabase configurado no ambiente da plataforma." },
    n8n: { configured: Boolean(process.env.N8N_API_URL || process.env.N8N_WEBHOOK_URL), message: "n8n configurado no ambiente da plataforma." },
  };
  const item = platform[providerKey];
  if (!item) return null;
  return item.configured
    ? { configured: true, auth: 75, sync: 70, webhook: 70, consistency: 85, message: item.message }
    : { configured: false, auth: 0, message: `${providerKey} não configurado no ambiente.` };
}

async function runRawCheck(tenantId: string, providerKey: string): Promise<RawCheck> {
  if (providerKey === "asaas") return checkAsaas(tenantId);
  if (providerKey === "zapsign") return checkZapSign(tenantId);
  if (providerKey === "instagram" || providerKey === "meta") return checkInstagram(tenantId);
  if (providerKey === "whatsapp") return checkWhatsapp(tenantId);
  if (providerKey === "google-ads") return checkGoogleAds(tenantId);
  if (providerKey === "nuvem-fiscal") return checkNuvemFiscal();
  if (["inventory", "praca-ai", "public-api"].includes(providerKey)) return { configured: true, auth: 100, sync: 100, webhook: 100, consistency: 100, message: "Integração interna VendorAI disponível." };
  const platformCheck = checkPlatformProvider(providerKey);
  if (platformCheck) return platformCheck;
  return { configured: false, auth: 0, message: "Health check automático ainda não disponível para este provedor." };
}

export async function runFinanceIntegrationHealthCheck(tenantId: string, providerKey: string): Promise<FinanceHealthResult | null> {
  const [registry] = await db.select().from(financeIntegrationRegistryTable).where(and(eq(financeIntegrationRegistryTable.providerKey, providerKey), eq(financeIntegrationRegistryTable.isActive, true))).limit(1);
  if (!registry) return null;

  const checkedAt = new Date();
  const raw = await runRawCheck(tenantId, providerKey);
  const score = overall(raw, registry.webhookSupport);
  const status = deriveStatus(raw, score);
  const auth = pct(raw.auth);
  const sync = pct(raw.sync, raw.configured ? 70 : 0);
  const webhook = pct(raw.webhook, registry.webhookSupport ? (raw.configured ? 60 : 0) : 100);
  const consistency = pct(raw.consistency, raw.configured ? 80 : 0);

  const [connection] = await db.insert(financeIntegrationConnectionsTable).values({
    tenantId,
    integrationId: registry.id,
    status,
    syncDirection: registry.defaultDirection,
    authenticationHealthPercent: String(auth),
    syncHealthPercent: String(sync),
    webhookHealthPercent: String(webhook),
    dataConsistencyPercent: String(consistency),
    overallHealthPercent: String(score),
    lastHealthCheckAt: checkedAt,
    lastErrorCode: raw.errorCode ?? null,
    lastErrorMessage: status === "error" || status === "expired" ? raw.message : null,
    metadata: { healthMessage: raw.message, healthCheckVersion: 1, ...(raw.metadata ?? {}) },
    updatedAt: checkedAt,
  }).onConflictDoUpdate({
    target: [financeIntegrationConnectionsTable.tenantId, financeIntegrationConnectionsTable.integrationId],
    set: {
      status,
      authenticationHealthPercent: String(auth),
      syncHealthPercent: String(sync),
      webhookHealthPercent: String(webhook),
      dataConsistencyPercent: String(consistency),
      overallHealthPercent: String(score),
      lastHealthCheckAt: checkedAt,
      lastErrorCode: raw.errorCode ?? null,
      lastErrorMessage: status === "error" || status === "expired" ? raw.message : null,
      metadata: { healthMessage: raw.message, healthCheckVersion: 1, ...(raw.metadata ?? {}) },
      updatedAt: checkedAt,
    },
  }).returning();

  await db.insert(financeIntegrationSyncLogsTable).values({
    tenantId,
    integrationId: registry.id,
    connectionId: connection?.id ?? null,
    direction: registry.defaultDirection,
    objectType: "__health__",
    status: status === "connected" ? "success" : status === "not_configured" ? "skipped" : "warning",
    recordsProcessed: 0,
    recordsFailed: status === "error" || status === "expired" ? 1 : 0,
    latencyMs: raw.latencyMs ?? null,
    errorCode: raw.errorCode ?? null,
    errorMessage: status === "error" || status === "expired" ? raw.message : null,
    correlationId: crypto.randomUUID(),
  });

  return {
    providerKey,
    configured: raw.configured,
    status,
    authenticationHealthPercent: auth,
    syncHealthPercent: sync,
    webhookHealthPercent: webhook,
    dataConsistencyPercent: consistency,
    overallHealthPercent: score,
    latencyMs: raw.latencyMs ?? null,
    message: raw.message,
    errorCode: raw.errorCode ?? null,
    checkedAt,
  };
}

export async function runAllFinanceIntegrationHealthChecks(tenantId: string) {
  const providers = await db.select({ providerKey: financeIntegrationRegistryTable.providerKey }).from(financeIntegrationRegistryTable).where(eq(financeIntegrationRegistryTable.isActive, true));
  const supported = new Set(["asaas", "zapsign", "instagram", "meta", "whatsapp", "google-ads", "nuvem-fiscal", "inventory", "praca-ai", "public-api", "openai", "cloudflare", "railway", "supabase", "n8n"]);
  const results: FinanceHealthResult[] = [];
  for (const provider of providers) {
    if (!supported.has(provider.providerKey)) continue;
    const result = await runFinanceIntegrationHealthCheck(tenantId, provider.providerKey);
    if (result) results.push(result);
  }
  return results;
}
