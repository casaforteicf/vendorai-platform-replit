import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import { auditIntegrationChange } from "../lib/integration-configuration-audit.js";
import {
  buildWhatsappOAuthUrl,
  exchangeShortCodeForToken,
  exchangeForLongLivedToken,
  fetchWabaAccounts,
  findWhatsappPhoneNumber,
  findAllWhatsappPhoneNumbers,
  saveWhatsappConnection,
  refreshWhatsappToken,
  disconnectWhatsapp,
  getWhatsappConnectionByTenantId,
  listWhatsappConnections,
  updateWhatsappConnectionRouting,
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

function auditActor(req: any, userId?: string | null) {
  return { userId: userId ?? req.user?.sub ?? req.user?.id ?? null, ip: req.ip ?? null };
}

function routeTenantId(req: any): string {
  // tenant-audit: reviewed route tenant is accepted only by authenticated handlers that enforce same-tenant or super-admin access before tenant data access.
  return String(req.params.tenantId);
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
    const isNotConfigured = err instanceof Error && err.message.startsWith("WhatsApp oficial não configurado:");
    return res.status(isNotConfigured ? 503 : 500).json({
      error: isNotConfigured
        ? "WhatsApp oficial ainda não está configurado no servidor. Verifique as credenciais do Meta App no Railway."
        : "Não foi possível iniciar a conexão com WhatsApp oficial.",
    });
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
  let userId: string;
  try {
    const decoded = consumeOAuthState(state, "whatsapp");
    tenantId = decoded.tenantId;
    userId = decoded.userId;
  } catch (err) {
    logger.warn({ err }, "Callback WhatsApp: state inválido, expirado ou reutilizado");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=invalid_state`);
  }

  try {
    logger.info({ tenantId }, "Processando callback WhatsApp");
    const beforeConnections = await listWhatsappConnections(tenantId).catch(() => []);
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

    const selections = await findAllWhatsappPhoneNumbers(wabas, longLived.access_token);
    if (selections.length === 0) return res.redirect(appUrl + "/configuracoes?whatsappError=no_phone");
    for (const { waba, phone } of selections) {
      await saveWhatsappConnection(tenantId, waba.id, phone, longLived.access_token, longLived.expires_in, userId);
    }
    const afterConnections = await listWhatsappConnections(tenantId).catch(() => []);
    const audited = await auditIntegrationChange({
      tenantId,
      provider: "whatsapp",
      action: beforeConnections.length > 0 ? "atualizar" : "criar",
      before: beforeConnections,
      after: afterConnections,
      actor: auditActor(req, userId),
    });
    if (!audited) logger.warn({ tenantId }, "configuracoes: falha ao auditar conexão do WhatsApp");
    logger.info({ tenantId, count: selections.length }, "Numeros do WhatsApp conectados com sucesso");
    return res.redirect(`${appUrl}/configuracoes?whatsappConnected=1`);
  } catch (err) {
    logger.error({ err, tenantId }, "Erro no callback WhatsApp");
    return res.redirect(`${appUrl}/configuracoes?whatsappError=exchange_failed`);
  }
});

// tenant-audit: reviewed authenticated WhatsApp tenant route; handler enforces same-tenant or super-admin before data access.
router.get("/tenants/:tenantId/whatsapp-connection", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
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
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao buscar status da conexão WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

// tenant-audit: reviewed authenticated WhatsApp tenant route; handler enforces same-tenant or super-admin before data access.
router.get("/tenants/:tenantId/whatsapp-connections", authenticate, async (req, res) => {
  const tenantId = routeTenantId(req);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return res.status(403).json({ error: "Forbidden" });
  const connections = await listWhatsappConnections(tenantId);
  return res.json(connections.map(({ accessToken: _accessToken, ...connection }) => connection));
});
// tenant-audit: reviewed authenticated WhatsApp tenant route; handler enforces same-tenant or super-admin before data access.
router.patch("/tenants/:tenantId/whatsapp-connections/:connectionId", authenticate, async (req, res) => {
  const tenantId = routeTenantId(req);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) return res.status(403).json({ error: "Forbidden" });
  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") return res.status(403).json({ error: "Admin access required" });
  const connectionId = String(req.params.connectionId);
  const before = (await listWhatsappConnections(tenantId)).find((connection) => connection.id === connectionId) ?? null;
  const assignedUserId = typeof req.body?.assignedUserId === "string" ? req.body.assignedUserId : req.body?.assignedUserId === null ? null : undefined;
  const isDefault = typeof req.body?.isDefault === "boolean" ? req.body.isDefault : undefined;
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 80) : req.body?.label === null ? null : undefined;
  const updated = await updateWhatsappConnectionRouting(tenantId, connectionId, { assignedUserId, isDefault, label });
  if (!updated) return res.status(404).json({ error: "Connection not found" });
  await auditIntegrationChange({ tenantId, provider: "whatsapp", action: "atualizar", before, after: updated, actor: auditActor(req) });
  const { accessToken: _accessToken, ...safe } = updated;
  return res.json(safe);
});
// tenant-audit: reviewed authenticated WhatsApp tenant route; handler enforces same-tenant or super-admin before data access.
router.post("/tenants/:tenantId/whatsapp-connection/refresh", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
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
    await auditIntegrationChange({ tenantId, provider: "whatsapp", action: "atualizar", before: conn, after: updated, actor: auditActor(req) });
    return res.json({
      id: updated?.id,
      tokenExpiresAt: updated?.tokenExpiresAt?.toISOString() ?? null,
      updatedAt: updated?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao renovar token WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

// tenant-audit: reviewed authenticated WhatsApp tenant route; handler enforces same-tenant or super-admin before data access.
router.delete("/tenants/:tenantId/whatsapp-connection", authenticate, async (req, res) => {
  try {
    const tenantId = routeTenantId(req);
    const userTenantId = req.user?.tenantId;
    if (req.user?.platformRole !== "super_admin" && tenantId !== userTenantId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const before = await listWhatsappConnections(tenantId);
    await disconnectWhatsapp(tenantId);
    await auditIntegrationChange({ tenantId, provider: "whatsapp", action: "excluir", before, actor: auditActor(req) });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, tenantId: routeTenantId(req) }, "Erro ao desconectar WhatsApp");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
export const whatsappCallbackRouter: IRouter = router;