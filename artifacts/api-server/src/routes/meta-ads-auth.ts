import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import { writeConfigurationAudit } from "../lib/configuration-audit.js";
import {
  buildMetaAdsOAuthUrl,
  getMetaAdsRedirectUri,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listAccessibleAdAccounts,
  saveMetaAdsPendingConnection,
  selectMetaAdsAccount,
  refreshMetaAdsToken,
  disconnectMetaAds,
  getMetaAdsConnectionByTenantId,
} from "../services/meta-ads-oauth.js";

const router: IRouter = Router();
const META_PAGE_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const requireIntegrationAdmin = requireRole("tenant_admin", "super_admin");

function getAppUrl(): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }
  return process.env["APP_URL"]?.replace(/\/$/, "") || "http://localhost:3000";
}

function integrationsRedirect(appUrl: string, params: string): string {
  return `${appUrl}/configuracoes?tab=integracoes&${params}`;
}

function actorFromRequest(req: Request, userId?: string | null) {
  return {
    userId: userId ?? req.user?.sub ?? req.user?.sub ?? null,
    ip: req.ip ?? null,
  };
}

async function auditMetaAdsChange(input: {
  tenantId: string;
  action: "criar" | "atualizar" | "excluir";
  before?: unknown;
  after?: unknown;
  req: Request;
  userId?: string | null;
}) {
  try {
    const audited = await writeConfigurationAudit({
      tenantId: input.tenantId,
      action: input.action,
      entity: "integration_meta_ads",
      entityId: input.tenantId,
      before: input.before,
      after: input.after,
      actor: actorFromRequest(input.req, input.userId),
    });
    if (!audited) logger.warn({ tenantId: input.tenantId }, "configuracoes: falha ao auditar Meta Ads");
  } catch (error) {
    logger.warn({ error, tenantId: input.tenantId }, "configuracoes: auditoria Meta Ads indisponível");
  }
}

router.get("/auth/meta-ads", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth Meta Ads: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const redirectUri = getMetaAdsRedirectUri();
    const state = createOAuthState(tenantId, userId, "meta-ads", redirectUri);
    const oauthUrl = new URL(buildMetaAdsOAuthUrl(state, redirectUri));
    const currentScopes = (oauthUrl.searchParams.get("scope") || "").split(",").map((value) => value.trim()).filter(Boolean);
    oauthUrl.searchParams.set("scope", Array.from(new Set([...currentScopes, ...META_PAGE_SCOPES])).join(","));
    const url = oauthUrl.toString();
    logger.info({ tenantId, userId, redirectUri, pagePublishingScopes: META_PAGE_SCOPES }, "Retornando URL OAuth Meta com Ads + Page orgânica");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth Meta Ads");
    const isNotConfigured = err instanceof Error && err.message.startsWith("Meta Ads não configurado:");
    return res.status(isNotConfigured ? 503 : 500).json({
      error: isNotConfigured
        ? "Meta Ads ainda não está configurado no servidor. Verifique META_ADS_APP_ID e META_ADS_APP_SECRET no Railway."
        : "Não foi possível iniciar a conexão com Meta Ads.",
    });
  }
});

router.get("/auth/meta-ads/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback Meta Ads: parâmetros inválidos");
    return res.redirect(integrationsRedirect(appUrl, "metaAdsError=access_denied"));
  }

  let tenantId: string;
  let oauthUserId: string | null = null;
  let exactRedirectUri: string | undefined;
  try {
    const decoded = consumeOAuthState(state, "meta-ads");
    tenantId = decoded.tenantId;
    oauthUserId = decoded.userId ?? null;
    exactRedirectUri = decoded.returnTo?.startsWith("https://") ? decoded.returnTo : undefined;
  } catch (err) {
    logger.warn({ err }, "Callback Meta Ads: state inválido, expirado ou reutilizado");
    return res.redirect(integrationsRedirect(appUrl, "metaAdsError=invalid_state"));
  }

  try {
    logger.info({ tenantId }, "Processando callback Meta Ads");
    const before = await getMetaAdsConnectionByTenantId(tenantId);
    let shortToken;
    try {
      shortToken = await exchangeCodeForToken(code, exactRedirectUri);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar codigo OAuth do Meta Ads");
      return res.redirect(integrationsRedirect(appUrl, "metaAdsError=token_exchange"));
    }

    let longLived;
    try {
      longLived = await exchangeForLongLivedToken(shortToken.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao converter token Meta Ads pra long-lived");
      return res.redirect(integrationsRedirect(appUrl, "metaAdsError=token_exchange"));
    }

    await saveMetaAdsPendingConnection(tenantId, longLived);

    let accounts;
    try {
      accounts = await listAccessibleAdAccounts(longLived.access_token);
    } catch (err) {
      const after = await getMetaAdsConnectionByTenantId(tenantId);
      await auditMetaAdsChange({ tenantId, action: before ? "atualizar" : "criar", before, after, req, userId: oauthUserId });
      logger.error({ err, tenantId }, "Erro ao listar Ad Accounts Meta acessíveis");
      return res.redirect(integrationsRedirect(appUrl, "metaAdsConnected=pending"));
    }

    if (accounts.length === 0) {
      const after = await getMetaAdsConnectionByTenantId(tenantId);
      await auditMetaAdsChange({ tenantId, action: before ? "atualizar" : "criar", before, after, req, userId: oauthUserId });
      logger.warn({ tenantId }, "Nenhuma Ad Account Meta acessível para o usuário");
      return res.redirect(integrationsRedirect(appUrl, "metaAdsError=no_account"));
    }

    if (accounts.length === 1 && accounts[0]) {
      try {
        await selectMetaAdsAccount(tenantId, accounts[0]);
        const after = await getMetaAdsConnectionByTenantId(tenantId);
        await auditMetaAdsChange({ tenantId, action: before ? "atualizar" : "criar", before, after, req, userId: oauthUserId });
        logger.info({ tenantId, adAccountId: accounts[0].adAccountId }, "Meta Ads conectado com sucesso");
        return res.redirect(integrationsRedirect(appUrl, "metaAdsConnected=1"));
      } catch (err) {
        const after = await getMetaAdsConnectionByTenantId(tenantId);
        await auditMetaAdsChange({ tenantId, action: before ? "atualizar" : "criar", before, after, req, userId: oauthUserId });
        logger.error({ err, tenantId }, "Erro ao selecionar automaticamente a única Ad Account Meta");
        return res.redirect(integrationsRedirect(appUrl, "metaAdsConnected=pending"));
      }
    }

    const after = await getMetaAdsConnectionByTenantId(tenantId);
    await auditMetaAdsChange({ tenantId, action: before ? "atualizar" : "criar", before, after, req, userId: oauthUserId });
    logger.info({ tenantId, count: accounts.length }, "Múltiplas Ad Accounts Meta encontradas, aguardando seleção");
    return res.redirect(integrationsRedirect(appUrl, "metaAdsConnected=pending"));
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Meta Ads");
    return res.redirect(integrationsRedirect(appUrl, "metaAdsError=exchange_failed"));
  }
});

function assertTenantAccess(req: Request, tenantId: string): boolean {
  const userTenantId = req.user?.tenantId;
  return req.user?.platformRole === "super_admin" || tenantId === userTenantId;
}

router.get("/tenants/:tenantId/meta-ads-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const conn = await getMetaAdsConnectionByTenantId(tenantId);
    if (!conn || conn.status === "disconnected" || conn.disconnectedAt) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      pendingAccountSelection: conn.status === "pending_account_selection",
      id: conn.id,
      adAccountId: conn.adAccountId,
      adAccountName: conn.adAccountName,
      currency: conn.currency,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao buscar status da conexão Meta Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/tenants/:tenantId/meta-ads-connection/accounts", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const conn = await getMetaAdsConnectionByTenantId(tenantId);
    if (!conn || !conn.accessToken) return res.status(404).json({ error: "Connection not found" });

    const accounts = await listAccessibleAdAccounts(conn.accessToken);
    return res.json({ accounts });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao listar Ad Accounts Meta");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/meta-ads-connection/select-account", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const adAccountId = String(req.body?.adAccountId ?? "").trim();
    if (!adAccountId) return res.status(400).json({ error: "adAccountId is required" });

    const conn = await getMetaAdsConnectionByTenantId(tenantId);
    if (!conn?.accessToken) return res.status(404).json({ error: "Connection not found" });

    const accounts = await listAccessibleAdAccounts(conn.accessToken);
    const account = accounts.find((a) => a.adAccountId === adAccountId);
    if (!account) return res.status(404).json({ error: "Ad account not found or not accessible" });

    const before = conn;
    await selectMetaAdsAccount(tenantId, account);
    const updated = await getMetaAdsConnectionByTenantId(tenantId);
    await auditMetaAdsChange({ tenantId, action: "atualizar", before, after: updated, req });
    return res.json({
      connected: true,
      adAccountId: updated?.adAccountId,
      adAccountName: updated?.adAccountName,
      currency: updated?.currency,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao selecionar Ad Account Meta");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/meta-ads-connection/refresh", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const conn = await getMetaAdsConnectionByTenantId(tenantId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    const before = conn;
    await refreshMetaAdsToken(conn.id);
    const updated = await getMetaAdsConnectionByTenantId(tenantId);
    await auditMetaAdsChange({ tenantId, action: "atualizar", before, after: updated, req });
    return res.json({
      id: updated?.id,
      tokenExpiresAt: updated?.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: updated?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao renovar token Meta Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/meta-ads-connection", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const before = await getMetaAdsConnectionByTenantId(tenantId);
    await disconnectMetaAds(tenantId);
    if (before) await auditMetaAdsChange({ tenantId, action: "excluir", before, req });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar Meta Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const metaAdsCallbackRouter: IRouter = router;
