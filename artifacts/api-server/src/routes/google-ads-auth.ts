import { Router, type IRouter, type Request } from "express";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
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

const router: IRouter = Router();

function getAppUrl(): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");

  // Mesmo raciocínio do callback do WhatsApp: o callback OAuth roda na API
  // (Railway), mas a tela de configurações é o CRM em app.appvendorai.com.
  // Nunca usar REPLIT_DOMAINS ou o host do request como destino em produção.
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }

  return process.env["APP_URL"]?.replace(/\/$/, "") || "http://localhost:3000";
}

router.get("/auth/google-ads", authenticate, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth Google Ads: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const state = createOAuthState(tenantId, userId, "google-ads");
    const url = buildGoogleAdsOAuthUrl(tenantId, state);
    logger.info({ tenantId, userId }, "Retornando URL OAuth Google Ads");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/auth/google-ads/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback Google Ads: parâmetros inválidos");
    return res.redirect(`${appUrl}/configuracoes?googleAdsError=access_denied`);
  }

  let tenantId: string;
  try {
    const decoded = consumeOAuthState(state, "google-ads");
    tenantId = decoded.tenantId;
  } catch (err) {
    logger.warn({ err }, "Callback Google Ads: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}/configuracoes?googleAdsError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback Google Ads");
    let tokens;
    try {
      tokens = await exchangeCodeForTokens(code);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar codigo OAuth do Google Ads");
      return res.redirect(`${appUrl}/configuracoes?googleAdsError=token_exchange`);
    }

    if (!tokens.refresh_token) {
      // Acontece quando o usuário já tinha autorizado o app e o Google não
      // reemite um refresh_token sem prompt=consent. Como sempre mandamos
      // prompt=consent, isso não deveria ocorrer — mas falhar explicitamente
      // é melhor que salvar uma conexão que não sobrevive à expiração do
      // access token.
      logger.error({ tenantId }, "Google não retornou refresh_token no callback");
      return res.redirect(`${appUrl}/configuracoes?googleAdsError=no_refresh_token`);
    }

    await saveGoogleAdsPendingConnection(tenantId, tokens.refresh_token, tokens.access_token, tokens.expires_in);

    let accounts;
    try {
      accounts = await listAccessibleCustomers(tokens.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao listar contas Google Ads acessíveis");
      return res.redirect(`${appUrl}/configuracoes?googleAdsConnected=pending`);
    }

    if (accounts.length === 0) {
      logger.warn({ tenantId }, "Nenhuma conta Google Ads acessível para o usuário");
      return res.redirect(`${appUrl}/configuracoes?googleAdsError=no_account`);
    }

    if (accounts.length === 1 && accounts[0]) {
      // Só uma conta acessível — seleciona automaticamente, mesma lógica de
      // conveniência usada no WhatsApp (que auto-seleciona phones[0]).
      try {
        await selectGoogleAdsAccount(tenantId, accounts[0].customerId);
        logger.info({ tenantId, customerId: accounts[0].customerId }, "Google Ads conectado com sucesso");
        return res.redirect(`${appUrl}/configuracoes?googleAdsConnected=1`);
      } catch (err) {
        logger.error({ err, tenantId }, "Erro ao selecionar automaticamente a única conta Google Ads");
        return res.redirect(`${appUrl}/configuracoes?googleAdsConnected=pending`);
      }
    }

    // Mais de uma conta acessível: fica pendente até o usuário escolher em
    // /tenants/:tenantId/google-ads-connection/select-account.
    logger.info({ tenantId, count: accounts.length }, "Múltiplas contas Google Ads encontradas, aguardando seleção");
    return res.redirect(`${appUrl}/configuracoes?googleAdsConnected=pending`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Google Ads");
    return res.redirect(`${appUrl}/configuracoes?googleAdsError=exchange_failed`);
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
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao buscar status da conexão Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

// Lista as contas Google Ads acessíveis pelo refresh token já salvo — usada
// pelo frontend quando a conexão fica "pending_account_selection" (mais de
// uma conta disponível). O WhatsApp não precisa de um endpoint equivalente.
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

router.post("/tenants/:tenantId/google-ads-connection/select-account", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const customerId = String(req.body?.customerId ?? "").trim();
    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }

    await selectGoogleAdsAccount(tenantId, customerId);
    const updated = await getGoogleAdsConnectionByTenantId(tenantId);
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

router.post("/tenants/:tenantId/google-ads-connection/refresh", authenticate, async (req, res) => {
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
    return res.json({
      id: updated?.id,
      tokenExpiresAt: updated?.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: updated?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao renovar token Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/google-ads-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    if (!assertTenantAccess(req, tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await disconnectGoogleAds(tenantId);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar Google Ads");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const googleAdsCallbackRouter: IRouter = router;
