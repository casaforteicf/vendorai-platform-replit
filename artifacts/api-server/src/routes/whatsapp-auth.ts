import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middlewares/auth.js";
import {
  buildWhatsappOAuthUrl,
  exchangeShortCodeForToken,
  exchangeForLongLivedToken,
  fetchWabaAccounts,
  fetchPhoneNumbers,
  saveWhatsappConnection,
  refreshWhatsappToken,
  disconnectWhatsapp,
  getWhatsappConnectionByTenantId,
} from "../services/whatsapp-oauth.js";

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
router.get("/auth/whatsapp", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user?.id as string;
    const tenantId = (req as any).user?.tenantId as string;
    if (!userId || !tenantId) {
      logger.warn("OAuth WhatsApp: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const state = encodeState(tenantId, userId);
    const url = buildWhatsappOAuthUrl(tenantId, state);
    logger.info({ tenantId, userId }, "Retornando URL OAuth WhatsApp");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 2. Callback ────────────────────────────────────────────
router.get("/auth/whatsapp/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback WhatsApp: parâmetros inválidos");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=access_denied`);
  }

  let tenantId: string;
  try {
    const decoded = decodeState(state);
    tenantId = decoded.tenantId;
  } catch {
    logger.warn("Callback WhatsApp: state inválido");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback WhatsApp");
    const tokenResponse = await exchangeShortCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(tokenResponse.access_token);

    const wabas = await fetchWabaAccounts(longLived.access_token);
    if (wabas.length === 0) {
      logger.warn({ tenantId }, "Nenhuma WABA encontrada para o usuário");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=no_waba`);
    }

    const waba = wabas[0];
    const phones = await fetchPhoneNumbers(waba.id, longLived.access_token);
    if (phones.length === 0) {
      logger.warn({ tenantId, wabaId: waba.id }, "Nenhum número de telefone encontrado");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=no_phone`);
    }

    const phone = phones[0];
    await saveWhatsappConnection(tenantId, waba.id, phone, longLived.access_token, longLived.expires_in);

    logger.info({ tenantId, wabaId: waba.id, phone: phone.display_phone_number }, "WhatsApp conectado com sucesso");
    return res.redirect(`${appUrl}/configuracoes?whatsappConnected=1`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback WhatsApp");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=exchange_failed`);
  }
});

// ── 3. Status da conexão ────────────────────────────────────
router.get("/tenants/:tenantId/whatsapp-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = (req as any).user?.tenantId;
    if (tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getWhatsappConnectionByTenantId(tenantId);
    if (!conn || conn.status === "disconnected" || conn.disconnectedAt) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      id: conn.id,
      wabaId: conn.wabaId,
      phoneNumberId: conn.phoneNumberId,
      businessName: conn.businessName,
      displayPhoneNumber: conn.displayPhoneNumber,
      tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
      connectedAt: conn.connectedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao buscar status da conexão WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 4. Renovar token ─────────────────────────────────────────
router.post("/tenants/:tenantId/whatsapp-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = (req as any).user?.tenantId;
    if (tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const conn = await getWhatsappConnectionByTenantId(tenantId);
    if (!conn) {
      return res.status(404).json({ error: "Connection not found" });
    }

    await refreshWhatsappToken(conn.id);
    const updated = await getWhatsappConnectionByTenantId(tenantId);
    return res.json({
      id: updated?.id,
      tokenExpiresAt: updated?.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: updated?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao renovar token WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── 5. Desconectar ───────────────────────────────────────────
router.delete("/tenants/:tenantId/whatsapp-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = (req as any).user?.tenantId;
    if (tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await disconnectWhatsapp(tenantId);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: String(req.params.tenantId) }, "Erro ao desconectar WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const whatsappCallbackRouter: IRouter = router;
