import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import {
  buildInstagramOAuthUrl,
  getInstagramRedirectUri,
  exchangeShortCodeForToken,
  fetchDirectInstagramAccountInfo,
  saveDirectInstagramConnection,
  refreshInstagramToken,
  disconnectInstagram,
  getInstagramConnectionByTenantId,
  getInstagramConnectionsByTenantId,
} from "../services/instagram-oauth.js";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import { auditIntegrationChange } from "../lib/integration-configuration-audit.js";

const router: IRouter = Router();

function getAppUrl(host?: string): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");

  const normalizedHost = host?.split(":")[0]?.toLowerCase();
  if (["appvendorai.com", "www.appvendorai.com", "app.appvendorai.com"].includes(normalizedHost ?? "")) {
    return "https://app.appvendorai.com";
  }
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }
  const configured = process.env["APP_URL"];
  if (configured) return configured.replace(/\/$/, "");
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}`;
  return "http://localhost:3000";
}

function auditActor(req: any, userId?: string | null) {
  return { userId: userId ?? req.user?.sub ?? req.user?.sub ?? null, ip: req.ip ?? null };
}

router.get("/auth/instagram", authenticate, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth Instagram: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const redirectUri = getInstagramRedirectUri(req.hostname);
    const state = createOAuthState(tenantId, userId, "instagram", redirectUri);
    const url = buildInstagramOAuthUrl(tenantId, state, req.hostname, redirectUri);
    logger.info({ tenantId, userId, host: req.hostname, redirectUri }, "Retornando URL OAuth Instagram");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth Instagram");
    const isNotConfigured = err instanceof Error && err.message.startsWith("Instagram não configurado:");
    return res.status(isNotConfigured ? 503 : 500).json({
      error: isNotConfigured
        ? "Instagram ainda não está configurado no servidor. Verifique INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET no Railway."
        : "Não foi possível iniciar a conexão com Instagram.",
    });
  }
});

router.get("/auth/instagram/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl(req.hostname);

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback Instagram: parâmetros inválidos");
    return res.redirect(`${appUrl}/configuracoes?tab=integracoes&instagramError=access_denied`);
  }

  let tenantId: string;
  let userId: string;
  let exactRedirectUri: string | undefined;
  try {
    const decoded = consumeOAuthState(state, "instagram");
    tenantId = decoded.tenantId;
    userId = decoded.userId;
    exactRedirectUri = decoded.returnTo?.startsWith("https://") ? decoded.returnTo : undefined;
  } catch (err) {
    logger.warn({ err }, "Callback Instagram: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}/configuracoes?tab=integracoes&instagramError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback Instagram");
    const before = await getInstagramConnectionByTenantId(tenantId).catch(() => null);
    let tokenResponse;
    try {
      tokenResponse = await exchangeShortCodeForToken(code, req.hostname, exactRedirectUri);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar código OAuth do Instagram");
      const longLivedFailed = err instanceof Error && err.message.startsWith("Instagram long-lived");
      const accountNotAuthorized =
        longLivedFailed &&
        err instanceof Error &&
        err.message.includes("Unsupported request - method type");
      const errorCode = accountNotAuthorized
        ? "account_not_authorized"
        : longLivedFailed
          ? "long_token_exchange"
          : "short_token_exchange";
      return res.redirect(
        `${appUrl}/configuracoes?tab=integracoes&instagramError=${errorCode}`,
      );
    }

    let directAccount;
    try {
      directAccount = await fetchDirectInstagramAccountInfo(tokenResponse.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao consultar conta profissional do Instagram");
      return res.redirect(`${appUrl}/configuracoes?tab=integracoes&instagramError=profile_lookup`);
    }

    try {
      await saveDirectInstagramConnection(tenantId, directAccount, tokenResponse);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao salvar conexão do Instagram");
      const accountInUse = err instanceof Error && err.message.includes("outro tenant");
      return res.redirect(
        `${appUrl}/configuracoes?tab=integracoes&instagramError=${accountInUse ? "account_in_use" : "persist_failed"}`,
      );
    }
    const after = await getInstagramConnectionByTenantId(tenantId).catch(() => null);
    const audited = await auditIntegrationChange({
      tenantId,
      provider: "instagram",
      action: before ? "atualizar" : "criar",
      before,
      after,
      actor: auditActor(req, userId),
    });
    if (!audited) logger.warn({ tenantId }, "configuracoes: falha ao auditar conexão do Instagram");
    logger.info(
      { tenantId, username: directAccount.username, tokenMode: tokenResponse.token_mode ?? "long_lived" },
      "Instagram conectado com sucesso",
    );
    const temporary = tokenResponse.token_mode === "short_lived_fallback" ? "&instagramTemporary=1" : "";
    return res.redirect(`${appUrl}/configuracoes?tab=integracoes&instagramConnected=1${temporary}`);

    /* Fluxo legado Facebook Pages removido em favor do Instagram Login.
    const pages = await fetchUserPages(tokenResponse.access_token);
    if (pages.length === 0) {
      logger.warn({ tenantId }, "Nenhuma página encontrada para o usuário");
      return res.redirect(`${appUrl}/configuracoes?instagramError=no_pages`);
    }

    const page = pages.find((p) => p.instagram_business_account) ?? pages[0];
    const igInfo = await fetchInstagramAccountInfo(page.id, page.access_token);
    const longLivedPageToken = await exchangeForPageLongLivedToken(page.access_token);

    await saveInstagramConnection(tenantId, page, igInfo, {
      access_token: longLivedPageToken,
      expires_in: tokenResponse.expires_in,
    });

    logger.info({ tenantId, username: igInfo.username }, "Instagram conectado com sucesso");
    return res.redirect(`${appUrl}/configuracoes?instagramConnected=1`);
    */
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Instagram");
    return res.redirect(`${appUrl}/configuracoes?instagramError=exchange_failed`);
  }
});

router.get("/tenants/:tenantId/instagram-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const connections = await getInstagramConnectionsByTenantId(tenantId);
    const activeConnections = connections.filter((item) => !item.disconnectedAt);
    const conn = activeConnections[0] ?? connections[0] ?? null;
    const tokenExpired = Boolean(conn?.tokenExpiresAt && conn.tokenExpiresAt <= new Date());
    const publishReady = Boolean(conn?.pageAccessToken && conn.accountId);
    if (!conn || conn.disconnectedAt || !publishReady || tokenExpired) {
      return res.json({
        connected: false,
        needsReconnect: Boolean(conn && !conn.disconnectedAt),
        reason: tokenExpired ? "token_expired" : conn && !publishReady ? "missing_publish_credentials" : "not_connected",
        connections: activeConnections.map((item) => ({
          id: item.id,
          username: item.username,
          accountId: item.accountId,
          pageId: item.pageId,
          tokenExpiresAt: item.tokenExpiresAt?.toISOString() ?? null,
          connectedAt: item.connectedAt?.toISOString() ?? null,
          updatedAt: item.updatedAt?.toISOString() ?? null,
        })),
      });
    }

    try {
      const liveAccount = await fetchDirectInstagramAccountInfo(conn.pageAccessToken!);
      if (liveAccount.id !== conn.accountId) {
        logger.warn({ tenantId, storedAccountId: conn.accountId, liveAccountId: liveAccount.id }, "Instagram: conta do token diverge da conexão salva");
        return res.json({ connected: false, needsReconnect: true, reason: "account_mismatch" });
      }
    } catch (validationError) {
      logger.warn({ validationError, tenantId }, "Instagram: token salvo não passou na validação ao vivo");
      return res.json({ connected: false, needsReconnect: true, reason: "token_invalid" });
    }

    return res.json({
      connected: true,
      publishReady: true,
      id: conn.id,
      username: conn.username,
      accountId: conn.accountId,
      pageId: conn.pageId,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
      connectionCount: activeConnections.length,
      connections: activeConnections.map((item) => ({
        id: item.id,
        username: item.username,
        accountId: item.accountId,
        pageId: item.pageId,
        tokenExpiresAt: item.tokenExpiresAt?.toISOString() ?? null,
        connectedAt: item.connectedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao buscar status da conexão Instagram");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/instagram-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const requestedConnectionId = typeof req.body?.connectionId === "string" ? req.body.connectionId : undefined;
    const connections = await getInstagramConnectionsByTenantId(tenantId);
    const conn = requestedConnectionId
      ? connections.find((item) => item.id === requestedConnectionId && !item.disconnectedAt)
      : connections.find((item) => !item.disconnectedAt);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }

    await refreshInstagramToken(conn.id);
    const updated = await getInstagramConnectionByTenantId(tenantId);
    await auditIntegrationChange({ tenantId, provider: "instagram", action: "atualizar", before: conn, after: updated, actor: auditActor(req) });
    return res.json({
      id: updated?.id,
      tokenExpiresAt: updated?.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: updated?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao renovar token Instagram");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/instagram-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : undefined;
    const beforeConnections = await getInstagramConnectionsByTenantId(tenantId);
    const before = connectionId
      ? beforeConnections.find((item) => item.id === connectionId) ?? null
      : beforeConnections;
    await disconnectInstagram(tenantId, connectionId);
    await auditIntegrationChange({ tenantId, provider: "instagram", action: "excluir", before, actor: auditActor(req) });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar Instagram");
    return res.status(500).json({ error: "Internal error" });
  }
});

async function exchangeForPageLongLivedToken(pageToken: string): Promise<string> {
  const url = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env["INSTAGRAM_APP_ID"] ?? "");
  url.searchParams.set("client_secret", process.env["INSTAGRAM_APP_SECRET"] ?? "");
  url.searchParams.set("fb_exchange_token", pageToken);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body }, "Falha ao converter page token para long-lived");
    throw new Error(`Page token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export default router;
export const instagramCallbackRouter: IRouter = router;
