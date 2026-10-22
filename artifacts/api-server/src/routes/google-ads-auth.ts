import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import { writeConfigurationAudit } from "../lib/configuration-audit.js";
import {
  buildGoogleAdsOAuthUrl,
  exchangeCodeForTokens,
  listAccessibleCustomers,
  saveGoogleAdsPendingConnection,
  selectGoogleAdsAccount,
  refreshGoogleAdsToken,
  disconnectGoogleAds,
  getGoogleAdsConnectionByTenantId,
} from "../services/google-ads-oauth.js";
import { configureGoogleDataManagerActions } from "../services/google-data-manager-config.js";

const router: IRouter = Router();
const requireIntegrationAdmin = requireRole("tenant_admin", "super_admin");

function getAppUrl(): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");

  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }

  return process.env["APP_URL"]?.replace(/\/$/, "") || "http://localhost:3000";
}

function auditActor(req: Request, userId?: string | null) {
  return {
    userId: userId ?? req.user?.sub ?? req.user?.sub ?? null,
    ip: req.ip ?? null,
  };
}

async function auditGoogleAdsChange(
  req: Request,
  tenantId: string,
  before: unknown,
  after: unknown,
  userId?: string | null,
  action: "criar" | "atualizar" | "excluir" = "atualizar",
) {
  const audited = await writeConfigurationAudit({
    tenantId,
    action,
    entity: "google_ads_connection",
    entityId: tenantId,
    before: action === "criar" ? undefined : before,
    after: action === "excluir" ? undefined : after,
    actor: auditActor(req, userId),
  });
  if (!audited) logger.warn({ tenantId }, "configuracoes: falha ao auditar Google Ads");
}

router.get("/auth/google-ads", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth Google Ads: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const requestedReturnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "";
    const returnTo = requestedReturnTo === "/onboarding/integracoes" ? requestedReturnTo : "/configuracoes";
    const state = createOAuthState(tenantId, userId, "google-ads", returnTo);
    const url = buildGoogleAdsOAuthUrl(tenantId, state);
    logger.info({ tenantId, userId }, "Retornando URL OAuth Google Ads/Data Manager");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth Google Ads/Data Manager");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/auth/google-ads/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();
  let returnTo = "/configuracoes";

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback Google Ads: parâmetros inválidos");
    return res.redirect(`${appUrl}${returnTo}?googleAdsError=access_denied`);
  }

  let tenantId: string;
  let auditUserId: string | null = null;
  try {
    const decoded = consumeOAuthState(state, "google-ads");
    tenantId = decoded.tenantId;
    auditUserId = decoded.userId ?? null;
    if (decoded.returnTo === "/onboarding/integracoes") returnTo = decoded.returnTo;
  } catch (err) {
    logger.warn({ err }, "Callback Google Ads: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}${returnTo}?googleAdsError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback Google Ads/Data Manager");
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(code);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar código OAuth do Google Ads/Data Manager");
      return res.redirect(`${appUrl}${returnTo}?googleAdsError=token_exchange`);
    }

    if (!tokens.refresh_token) {
      logger.error({ tenantId }, "Google não retornou refresh_token no callback");
      return res.redirect(`${appUrl}${returnTo}?googleAdsError=no_refresh_token`);
    }

    const beforeConnection = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
    await saveGoogleAdsPendingConnection(tenantId, tokens.refresh_token, tokens.access_token, tokens.expires_in);
    const pendingConnection = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
    await auditGoogleAdsChange(
      req,
      tenantId,
      beforeConnection,
      pendingConnection,
      auditUserId,
      beforeConnection ? "atualizar" : "criar",
    );

    let accounts;
    try {
      accounts = await listAccessibleCustomers(tokens.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao listar contas Google Ads acessíveis");
      return res.redirect(`${appUrl}${returnTo}?googleAdsConnected=pending`);
    }

    if (accounts.length === 0) {
      logger.warn({ tenantId }, "Nenhuma conta Google Ads acessível para o usuário");
      return res.redirect(`${appUrl}${returnTo}?googleAdsError=no_account`);
    }

    if (accounts.length === 1 && accounts[0]) {
      try {
        const beforeSelection = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
        await selectGoogleAdsAccount(tenantId, accounts[0].customerId);
        const afterSelection = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
        await auditGoogleAdsChange(req, tenantId, beforeSelection, afterSelection, auditUserId);
        logger.info({ tenantId, customerId: accounts[0].customerId }, "Google Ads/Data Manager conectado com sucesso");
        return res.redirect(`${appUrl}${returnTo}?googleAdsConnected=1`);
      } catch (err) {
        logger.error({ err, tenantId }, "Erro ao selecionar automaticamente a única conta Google Ads");
        return res.redirect(`${appUrl}${returnTo}?googleAdsConnected=pending`);
      }
    }

    logger.info({ tenantId, count: accounts.length }, "Múltiplas contas Google Ads encontradas, aguardando seleção");
    return res.redirect(`${appUrl}${returnTo}?googleAdsConnected=pending`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Google Ads/Data Manager");
    return res.redirect(`${appUrl}${returnTo}?googleAdsError=exchange_failed`);
  }
});

function assertTenantAccess(req: Request, tenantId: string): boolean {
  const userTenantId = req.user?.tenantId;
  return req.user?.platformRole === "super_admin" || tenantId === userTenantId;
}

router.get("/tenants/:tenantId/google-ads-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!conn || conn.status === "disconnected" || conn.disconnectedAt) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      pendingAccountSelection: conn.status === "pending_account_selection",
      id: conn.id,
      customerId: conn.customerId,
      descriptiveName: conn.descriptiveName,
      currencyCode: conn.currencyCode,
      timeZone: conn.timeZone,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
      dataManager: {
        leadConversionActionId: conn.dataManagerLeadConversionActionId,
        trialConversionActionId: conn.dataManagerTrialConversionActionId,
        saleConversionActionId: conn.dataManagerSaleConversionActionId,
        configuredAt: conn.dataManagerConfiguredAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao buscar status da conexão Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.put("/tenants/:tenantId/google-ads-connection/data-manager", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const body = req.body as Record<string, unknown>;
    const normalizeInput = (key: string): string | null | undefined => {
      const value = body[key];
      if (value === null || value === undefined) return value as null | undefined;
      if (typeof value !== "string") throw new Error(`${key} deve ser string`);
      return value;
    };

    const before = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
    const configured = await configureGoogleDataManagerActions(tenantId, {
      leadConversionActionId: normalizeInput("leadConversionActionId"),
      trialConversionActionId: normalizeInput("trialConversionActionId"),
      saleConversionActionId: normalizeInput("saleConversionActionId"),
    });
    const after = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
    await auditGoogleAdsChange(req, tenantId, before, after);

    return res.json({
      success: true,
      dataManager: {
        ...configured,
        configuredAt: configured?.configuredAt?.toISOString() ?? null,
      },
      reconnectRequiredForExistingTokens: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid configuration";
    logger.warn({ err, tenantId: String(req.params.tenantId) }, "Erro ao configurar destinos Google Data Manager");
    return res.status(400).json({ error: message });
  }
});

router.get("/tenants/:tenantId/google-ads-connection/accounts", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!conn || !conn.accessToken) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const accounts = await listAccessibleCustomers(conn.accessToken);
    return res.json({ accounts });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao listar contas Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/google-ads-connection/select-account", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const customerId = String(req.body?.customerId ?? "").trim();
    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }

    const before = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
    await selectGoogleAdsAccount(tenantId, customerId);
    const updated = await getGoogleAdsConnectionByTenantId(tenantId);
    await auditGoogleAdsChange(req, tenantId, before, updated);
    return res.json({
      connected: true,
      customerId: updated?.customerId,
      descriptiveName: updated?.descriptiveName,
      currencyCode: updated?.currencyCode,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao selecionar conta Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/google-ads-connection/refresh", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }

    await refreshGoogleAdsToken(conn.id);
    const updated = await getGoogleAdsConnectionByTenantId(tenantId);
    await auditGoogleAdsChange(req, tenantId, conn, updated);
    return res.json({
      id: updated?.id,
      tokenExpiresAt: updated?.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: updated?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao renovar token Google Ads/Data Manager");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/google-ads-connection", authenticate, requireIntegrationAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const before = await getGoogleAdsConnectionByTenantId(tenantId).catch(() => null);
    await disconnectGoogleAds(tenantId);
    await auditGoogleAdsChange(req, tenantId, before, null, null, "excluir");
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const googleAdsCallbackRouter: IRouter = router;
