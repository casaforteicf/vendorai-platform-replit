import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import {
  buildMetaAdsOAuthUrl,
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

function getAppUrl(): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }
  return process.env["APP_URL"]?.replace(/\/$/, "") || "http://localhost:3000";
}

router.get("/auth/meta-ads", authenticate, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth Meta Ads: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const state = createOAuthState(tenantId, userId, "meta-ads");
    const url = buildMetaAdsOAuthUrl(state);
    logger.info({ tenantId, userId }, "Retornando URL OAuth Meta Ads");
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
    return res.redirect(`${appUrl}/configuracoes?metaAdsError=access_denied`);
  }

  let tenantId: string;
  try {
    const decoded = consumeOAuthState(state, "meta-ads");
    tenantId = decoded.tenantId;
  } catch (err) {
    logger.warn({ err }, "Callback Meta Ads: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}/configuracoes?metaAdsError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback Meta Ads");
    let shortToken;
    try {
      shortToken = await exchangeCodeForToken(code);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar codigo OAuth do Meta Ads");
      return res.redirect(`${appUrl}/configuracoes?metaAdsError=token_exchange`);
    }

    let longLived;
    try {
      longLived = await exchangeForLongLivedToken(shortToken.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao converter token Meta Ads pra long-lived");
      return res.redirect(`${appUrl}/configuracoes?metaAdsError=token_exchange`);
    }

    await saveMetaAdsPendingConnection(tenantId, longLived);

    let accounts;
    try {
      accounts = await listAccessibleAdAccounts(longLived.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao listar Ad Accounts Meta acessíveis");
      return res.redirect(`${appUrl}/configuracoes?metaAdsConnected=pending`);
    }

    if (accounts.length === 0) {
      logger.warn({ tenantId }, "Nenhuma Ad Account Meta acessível para o usuário");
      return res.redirect(`${appUrl}/configuracoes?metaAdsError=no_account`);
    }

    if (accounts.length === 1 && accounts[0]) {
      try {
        await selectMetaAdsAccount(tenantId, accounts[0]);
        logger.info({ tenantId, adAccountId: accounts[0].adAccountId }, "Meta Ads conectado com sucesso");
        return res.redirect(`${appUrl}/configuracoes?metaAdsConnected=1`);
      } catch (err) {
        logger.error({ err, tenantId }, "Erro ao selecionar automaticamente a única Ad Account Meta");
        return res.redirect(`${appUrl}/configuracoes?metaAdsConnected=pending`);
      }
    }

    logger.info({ tenantId, count: accounts.length }, "Múltiplas Ad Accounts Meta encontradas, aguardando seleção");
    return res.redirect(`${appUrl}/configuracoes?metaAdsConnected=pending`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Meta Ads");
    return res.redirect(`${appUrl}/configuracoes?metaAdsError=exchange_failed`);
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

router.post("/tenants/:tenantId/meta-ads-connection/select-account", authenticate, async (req, res) => {
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

    await selectMetaAdsAccount(tenantId, account);
    const updated = await getMetaAdsConnectionByTenantId(tenantId);
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

router.post("/tenants/:tenantId/meta-ads-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const conn = await getMetaAdsConnectionByTenantId(tenantId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    await refreshMetaAdsToken(conn.id);
    const updated = await getMetaAdsConnectionByTenantId(tenantId);
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

router.delete("/tenants/:tenantId/meta-ads-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    await disconnectMetaAds(tenantId);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar Meta Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const metaAdsCallbackRouter: IRouter = router;
