import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
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

function getAppUrl(): string {
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");

  // O callback OAuth roda na API (appvendorai.com/Railway), mas a tela de
  // configurações pertence ao CRM hospedado em app.appvendorai.com.
  // Nunca use REPLIT_DOMAINS ou o host do request como destino em produção.
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com";
  }

  return process.env["APP_URL"]?.replace(/\/$/, "") || "http://localhost:3000";
}

router.get("/auth/whatsapp", authenticate, async (req, res) => {
  try {
    const userId = req.user?.sub;
    const tenantId = req.user?.tenantId;
    if (!userId || !tenantId) {
      logger.warn("OAuth WhatsApp: usuário não autenticado");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const state = createOAuthState(tenantId, userId, "whatsapp");
    const url = buildWhatsappOAuthUrl(tenantId, state);
    logger.info({ tenantId, userId }, "Retornando URL OAuth WhatsApp");
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "Erro ao iniciar OAuth WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/auth/whatsapp/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const appUrl = getAppUrl();

  if (error || !code || !state) {
    logger.warn({ error, hasCode: !!code, hasState: !!state }, "Callback WhatsApp: parâmetros inválidos");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=access_denied`);
  }

  let tenantId: string;
  try {
    const decoded = consumeOAuthState(state, "whatsapp");
    tenantId = decoded.tenantId;
  } catch (err) {
    logger.warn({ err }, "Callback WhatsApp: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback WhatsApp");
    let tokenResponse;
    try {
      tokenResponse = await exchangeShortCodeForToken(code);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao trocar codigo OAuth do WhatsApp");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=token_exchange`);
    }

    let longLived;
    try {
      longLived = await exchangeForLongLivedToken(tokenResponse.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao obter token duradouro do WhatsApp");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=token_extension`);
    }

    let wabas;
    try {
      wabas = await fetchWabaAccounts(longLived.access_token);
    } catch (err) {
      logger.error({ err, tenantId }, "Erro ao localizar conta WhatsApp Business");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=waba_lookup`);
    }
    if (wabas.length === 0) {
      logger.warn({ tenantId }, "Nenhuma WABA encontrada para o usuário");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=no_waba`);
    }

    const waba = wabas[0];
    let phones;
    try {
      phones = await fetchPhoneNumbers(waba.id, longLived.access_token);
    } catch (err) {
      logger.error({ err, tenantId, wabaId: waba.id }, "Erro ao localizar numero do WhatsApp");
      return res.redirect(`${appUrl}/configuracoes?whatsappError=phone_lookup`);
    }
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

router.get("/tenants/:tenantId/whatsapp-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
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

router.post("/tenants/:tenantId/whatsapp-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
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

router.delete("/tenants/:tenantId/whatsapp-connection", authenticate, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
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
