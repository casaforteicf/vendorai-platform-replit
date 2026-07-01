import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, instagramConnectionsTable, agentConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  buildInstagramOAuthUrl,
  exchangeShortCodeForToken,
  fetchUserPages,
  fetchInstagramAccountInfo,
  saveInstagramConnection,
  refreshInstagramToken,
  disconnectInstagram,
  getInstagramConnectionByTenantId,
} from "../services/instagram-oauth.js";
import { authenticate } from "../middlewares/auth.js";

const router: IRouter = Router();

const stateSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
});

function encodeState(tenantId: string, userId: string): string {
  return Buffer.from(JSON.stringify({ tenantId, userId })).toString("base64url");
}

function decodeState(state: string): { tenantId: string; userId: string } {
  return JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
}

function getAppUrl(): string {
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}`;
  return "http://localhost:3000";
}

// ── 1. Redirect para OAuth ──────────────────────────────────────
router.get("/auth/instagram", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id as string;
    const tenantId = (req as any).user?.tenantId as string;
    if (!userId || !tenantId) {
      logger.warn("OAuth Instagram: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const state = encodeState(tenantId, userId);
    const url = buildInstagramOAuthUrl(tenantId, state);
    logger.info({ tenantId, userId }, "Retornando URL OAuth Instagram");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth Instagram");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 2. Callback ────────────────────────────────────────────
router.get("/auth/instagram/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback Instagram: parâmetros inválidos");
    return res.redirect(`${appUrl}/configuracoes?instagramError=access_denied`);
  }

  let tenantId: string;
  try {
    const decoded = decodeState(state);
    tenantId = decoded.tenantId;
  } catch {
    logger.warn("Callback Instagram: state inválido");
    return res.redirect(`${appUrl}/configuracoes?instagramError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback Instagram");
    const tokenResponse = await exchangeShortCodeForToken(code);

    const pages = await fetchUserPages(tokenResponse.access_token);
    if (pages.length === 0) {
      logger.warn({ tenantId }, "Nenhuma página encontrada para o usuário");
      return res.redirect(`${appUrl}/configuracoes?instagramError=no_pages`);
    }

    // Usa a primeira página que tem Instagram Business
    const page = pages.find((p) => p.instagram_business_account) ?? pages[0];

    const igInfo = await fetchInstagramAccountInfo(page.id, page.access_token);

    // Converte o token da página para long-lived
    const longLivedPageToken = await exchangeForPageLongLivedToken(page.access_token);

    await saveInstagramConnection(tenantId, page, igInfo, {
      access_token: longLivedPageToken,
      expires_in: tokenResponse.expires_in,
    });

    logger.info({ tenantId, username: igInfo.username }, "Instagram conectado com sucesso");
    return res.redirect(`${appUrl}/configuracoes?instagramConnected=1`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback Instagram");
    return res.redirect(`${appUrl}/configuracoes?instagramError=exchange_failed`);
  }
});

// ── 3. Status da conexão ────────────────────────────────────
router.get("/tenants/:tenantId/instagram-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = (req as any).user?.tenantId;
    if (tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getInstagramConnectionByTenantId(tenantId);
    if (!conn || conn.disconnectedAt) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      id: conn.id,
      username: conn.username,
      accountId: conn.accountId,
      pageId: conn.pageId,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao buscar status da conexão Instagram");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 4. Renovar token ─────────────────────────────────────────
router.post("/tenants/:tenantId/instagram-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = (req as any).user?.tenantId;
    if (tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getInstagramConnectionByTenantId(tenantId);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }

    await refreshInstagramToken(conn.id);
    const updated = await getInstagramConnectionByTenantId(tenantId);
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

// ── 5. Desconectar ───────────────────────────────────────────
router.delete("/tenants/:tenantId/instagram-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = (req as any).user?.tenantId;
    if (tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await disconnectInstagram(tenantId);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar Instagram");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Helper: converte token da página para long-lived ───────────────
async function exchangeForPageLongLivedToken(pageToken: string): Promise<string> {
  const url = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env["INSTAGRAM_APP_ID"] ?? "");
  url.searchParams.set("client_secret", process.env["INSTAGRAM_APP_SECRET"] ?? "");
  url.searchParams.set("fb_exchange_token", pageToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao converter page token para long-lived");
    throw new Error(`Page token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export default router;
export const instagramCallbackRouter: IRouter = router;
