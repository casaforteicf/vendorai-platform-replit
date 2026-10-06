import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { Resend } from "resend";
import { db, activitiesTable, messagesTable, notificationsTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { disconnectWebmail, getWebmailConnection, saveWebmailConnection, testWebmailImap, testWebmailSmtp, updateWebmailSettings, webmailConfigFromConnection } from "../services/webmail-email.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";
import { consumeOAuthState, createOAuthState } from "../lib/oauth-state.js";
import {
  buildEmailOAuthUrl,
  disconnectEmail,
  emailIntegrationRedirect,
  emailProviderAvailability,
  exchangeEmailCode,
  listEmailConnections,
  syncConnectedEmailInbox,
  updateEmailSettings,
  type EmailProvider,
} from "../services/email-platforms.js";

const router: IRouter = Router();
const callbackRouter: IRouter = Router();

function provider(value: unknown): EmailProvider | null {
  const candidate = String(value || "");
  return candidate === "google" || candidate === "microsoft" || candidate === "webmail" ? candidate : null;
}

function stateProvider(selected: EmailProvider) {
  if (selected === "webmail") throw new Error("webmail_does_not_use_oauth");
  return selected === "google" ? "email-google" as const : "email-microsoft" as const;
}

function canAccess(req: Request, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const webmailConfigSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  imapHost: z.string().trim().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  smtpHost: z.string().trim().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpStartTls: z.boolean(),
  signature: z.string().max(4000).optional(),
});

router.put("/tenants/:tenantId/email-connections/webmail", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = webmailConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "invalid_webmail_config", details: parsed.error.flatten() });
  try {
    const connection = await saveWebmailConnection(tenantId, parsed.data);
    return res.json({
      success: true,
      connection: {
        id: connection.id,
        provider: "webmail",
        email: connection.accountName,
        status: connection.status,
      },
    });
  } catch (error) {
    req.log?.warn?.({ error, tenantId }, "webmail connection validation failed");
    const detail = error instanceof Error ? error.message : "webmail_connection_failed";
    return res.status(422).json({ error: "webmail_connection_failed", detail });
  }
});

router.post("/tenants/:tenantId/email-connections/webmail/test", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = webmailConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "invalid_webmail_config", details: parsed.error.flatten() });
  try {
    await testWebmailImap(parsed.data);
    await testWebmailSmtp(parsed.data);
    return res.json({ ok: true, imap: true, smtp: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "webmail_connection_failed";
    return res.status(422).json({ ok: false, error: "webmail_connection_failed", detail });
  }
});

router.get("/tenants/:tenantId/email-connections", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json({ connections: await listEmailConnections(tenantId) });
});

router.get("/tenants/:tenantId/email-connections/availability", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json({
    google: emailProviderAvailability("google"),
    microsoft: emailProviderAvailability("microsoft"),
    resend: {
      apiConfigured: Boolean(process.env["RESEND_API_KEY"]),
      webhookConfigured: Boolean(process.env["RESEND_WEBHOOK_SECRET"]),
      configured: Boolean(process.env["RESEND_API_KEY"] && process.env["RESEND_WEBHOOK_SECRET"]),
    },
  });
});

router.get("/tenants/:tenantId/email-connections/:provider/auth-url", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  const selected = provider(req.params.provider);
  if (!selected || selected === "webmail") return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!req.user?.sub) return res.status(401).json({ error: "Unauthorized" });
  const availability = emailProviderAvailability(selected);
  if (!availability.configured) return res.status(503).json({ error: "provider_not_configured", provider: selected });
  try {
    const state = createOAuthState(tenantId, req.user.sub, stateProvider(selected), "/configuracoes");
    return res.json({ url: buildEmailOAuthUrl(selected, state) });
  } catch (error) {
    req.log?.warn?.({ error, provider: selected }, "email oauth url failed");
    return res.status(503).json({ error: "provider_not_configured", provider: selected });
  }
});

router.delete("/tenants/:tenantId/email-connections/:provider", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (selected === "webmail") await disconnectWebmail(tenantId);
  else await disconnectEmail(tenantId, selected);
  return res.json({ success: true });
});

router.patch("/tenants/:tenantId/email-connections/:provider/settings", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = z.object({ signature: z.string().max(4000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "invalid_email_settings" });
  const updated = selected === "webmail"
    ? await updateWebmailSettings(tenantId, parsed.data)
    : await updateEmailSettings(tenantId, selected, parsed.data);
  if (!updated) return res.status(404).json({ error: "connection_not_found" });
  return res.json({
    success: true,
    provider: selected,
    signature: typeof updated.metadata?.["signature"] === "string" ? updated.metadata["signature"] : "",
  });
});

router.post("/tenants/:tenantId/email-connections/:provider/test", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (selected === "webmail") {
    const connection = await getWebmailConnection(tenantId);
    if (!connection) return res.status(404).json({ error: "connection_not_found" });
    try {
      const config = webmailConfigFromConnection(connection);
      await testWebmailImap(config);
      await testWebmailSmtp(config);
      return res.json({ ok: true, connection: { provider: "webmail", email: connection.accountName } });
    } catch (error) {
      return res.status(422).json({ ok: false, error: "webmail_connection_failed", detail: error instanceof Error ? error.message : "unknown" });
    }
  }
  const connections = await listEmailConnections(tenantId);
  const found = connections.find((connection) => connection.provider === selected);
  return found ? res.json({ ok: true, connection: found }) : res.status(404).json({ error: "connection_not_found" });
});

router.post("/tenants/:tenantId/email-connections/:provider/sync", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await syncConnectedEmailInbox(tenantId, selected);
    for (const item of result.results) {
      if (item.status !== "imported" || typeof item.leadId !== "string" || typeof item.mensagem !== "string") continue;
      dispatchAgentBackground({
        tenantId,
        leadId: item.leadId,
        mensagem: item.mensagem,
        log: req.log,
        scenario: {
          canal: "email",
          subject: typeof item.subject === "string" ? item.subject : "",
          externalId: typeof item.externalId === "string" ? item.externalId : "",
        },
      });
    }
    return res.json(result);
  } catch (error) {
    req.log?.error?.({ error, tenantId, provider: selected }, "email inbox sync failed");
    const message = error instanceof Error ? error.message : "email_sync_failed";
    if (message === "email_connection_not_found") return res.status(404).json({ error: message });
    return res.status(422).json({ error: "email_sync_failed", detail: message });
  }
});

router.get("/tenants/:tenantId/email-unmatched", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(notificationsTable).where(and(
    eq(notificationsTable.tenantId, tenantId),
    eq(notificationsTable.category, "email_unmatched"),
  )).orderBy(desc(notificationsTable.createdAt)).limit(200);
  return res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title.replace(/^\[email:[^\]]+\]\s*/, ""),
      rawTitle: row.title,
      message: row.message,
      createdAt: row.createdAt,
      readAt: row.readAt,
    })),
  });
});

router.post("/tenants/:tenantId/email-unmatched/:id/dismiss", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const [updated] = await db.update(notificationsTable).set({ readAt: new Date() }).where(and(
    eq(notificationsTable.id, String(req.params.id)),
    eq(notificationsTable.tenantId, tenantId),
    eq(notificationsTable.category, "email_unmatched"),
  )).returning({ id: notificationsTable.id });
  return updated ? res.json({ success: true }) : res.status(404).json({ error: "not_found" });
});

callbackRouter.post("/webhooks/email/resend", async (req, res) => {
  const apiKey = process.env["RESEND_API_KEY"];
  const webhookSecret = process.env["RESEND_WEBHOOK_SECRET"];
  if (!apiKey || !webhookSecret) {
    req.log?.error?.("Resend webhook received but provider secrets are not configured");
    return res.status(503).json({ error: "resend_webhook_not_configured" });
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody;
  const id = req.header("svix-id");
  const timestamp = req.header("svix-timestamp");
  const signature = req.header("svix-signature");
  if (!rawBody || !id || !timestamp || !signature) {
    return res.status(400).json({ error: "invalid_webhook_headers" });
  }

  let event: {
    type: string;
    created_at: string;
    data?: { email_id?: string; [key: string]: unknown };
  };
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret,
    }) as typeof event;
  } catch (error) {
    req.log?.warn?.({ error }, "Invalid Resend webhook signature");
    return res.status(401).json({ error: "invalid_webhook_signature" });
  }

  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  if (!emailId || !event.type.startsWith("email.")) {
    return res.json({ received: true, ignored: true });
  }

  const [message] = await db.select({
    id: messagesTable.id,
    tenantId: messagesTable.tenantId,
    leadId: messagesTable.leadId,
  }).from(messagesTable).where(eq(messagesTable.externalId, emailId)).limit(1);

  if (!message) {
    return res.json({ received: true, ignored: true, reason: "message_not_found" });
  }

  const status =
    event.type === "email.delivered" ? "entregue" :
    event.type === "email.opened" || event.type === "email.clicked" ? "lido" :
    event.type === "email.bounced" || event.type === "email.failed" ||
    event.type === "email.complained" || event.type === "email.suppressed" ? "erro" :
    event.type === "email.sent" ? "enviado" :
    null;

  if (status) {
    await db.update(messagesTable).set({ status }).where(and(
      eq(messagesTable.id, message.id),
      eq(messagesTable.tenantId, message.tenantId),
    ));
  }

  const eventKey = `resend_event:${event.type}:${emailId}:${event.created_at}`;
  const [existingActivity] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
    eq(activitiesTable.tenantId, message.tenantId),
    eq(activitiesTable.leadId, message.leadId),
    eq(activitiesTable.resultadoExecucao, eventKey),
  )).limit(1);

  if (!existingActivity && ["email.opened", "email.clicked", "email.bounced", "email.failed", "email.complained", "email.suppressed"].includes(event.type)) {
    const titles: Record<string, string> = {
      "email.opened": "E-mail aberto",
      "email.clicked": "Link do e-mail clicado",
      "email.bounced": "E-mail devolvido (bounce)",
      "email.failed": "Falha no envio do e-mail",
      "email.complained": "Reclamação de spam no e-mail",
      "email.suppressed": "E-mail suprimido pelo provedor",
    };
    const detail =
      event.type === "email.clicked" && typeof event.data?.["click"] === "object"
        ? JSON.stringify(event.data["click"])
        : event.type === "email.bounced" && typeof event.data?.["bounce"] === "object"
          ? JSON.stringify(event.data["bounce"])
          : event.type === "email.failed" && typeof event.data?.["failed"] === "object"
            ? JSON.stringify(event.data["failed"])
            : null;

    await db.insert(activitiesTable).values({
      tenantId: message.tenantId,
      leadId: message.leadId,
      tipo: "email",
      titulo: titles[event.type] ?? "Evento de e-mail",
      descricao: detail,
      status: "concluida",
      concluidaEm: new Date(event.created_at || Date.now()),
      resultadoExecucao: eventKey,
      origem: "integracao_email",
      estadoExecucao: "concluida",
    });
  }

  return res.json({ received: true, messageId: message.id, status, event: event.type });
});

callbackRouter.get("/auth/email/:provider/callback", async (req, res) => {
  const selected = provider(req.params.provider);
  if (!selected || selected === "webmail") return res.status(404).send("Provider not supported");
  const { code, state, error } = req.query as Record<string, string>;
  const redirect = emailIntegrationRedirect();
  if (error || !code || !state) return res.redirect(`${redirect}?emailError=access_denied&provider=${selected}`);
  try {
    const payload = consumeOAuthState(state, stateProvider(selected));
    await exchangeEmailCode(selected, code, payload.tenantId);
    return res.redirect(`${redirect}?emailConnected=${selected}`);
  } catch (callbackError) {
    req.log?.error?.({ error: callbackError, provider: selected }, "email oauth callback failed");
    return res.redirect(`${redirect}?emailError=connection_failed&provider=${selected}`);
  }
});

export default router;
export const emailIntegrationsCallbackRouter: IRouter = callbackRouter;
