import { Router, type IRouter } from "express";
import { Resend } from "resend";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  activitiesTable,
  conversationsTable,
  db,
  leadsTable,
  messagesTable,
} from "@workspace/db";
import {
  extractEmailAddress,
  isProspectorOptOut,
  parseProspectorReplyAddress,
  sanitizeProspectorInboundText,
} from "../services/prospector-email.js";
import { isColdProspectSource } from "../lib/prospector-consultive.js";
import { processAgentInternal } from "../services/agent-dispatch.js";

const router: IRouter = Router();
const MAX_INBOUND_PER_LEAD_HOUR = 20;

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
}

router.post("/", async (req, res) => {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const webhookSecret = process.env["RESEND_WEBHOOK_SECRET"]?.trim();
  if (!apiKey || !webhookSecret) {
    return res.status(503).json({ error: "resend_inbound_not_configured" });
  }

  if (!Buffer.isBuffer(req.body)) {
    req.log.warn("prospector-email-webhook: raw body missing");
    return res.status(400).json({ error: "raw_body_required" });
  }

  const resend = new Resend(apiKey);
  const payload = req.body.toString("utf8");

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = await resend.webhooks.verify({
      payload,
      headers: {
        "svix-id": String(req.header("svix-id") ?? ""),
        "svix-timestamp": String(req.header("svix-timestamp") ?? ""),
        "svix-signature": String(req.header("svix-signature") ?? ""),
      },
      secret: webhookSecret,
    }) as { type?: string; data?: Record<string, unknown> };
  } catch (err) {
    req.log.warn({ err }, "prospector-email-webhook: invalid signature");
    return res.status(400).json({ error: "invalid_signature" });
  }

  if (event.type !== "email.received") {
    return res.status(200).json({ received: true, ignored: "event_type" });
  }

  const eventData = event.data ?? {};
  const emailId = String(eventData["email_id"] ?? "").trim();
  if (!emailId) {
    return res.status(200).json({ received: true, ignored: "missing_email_id" });
  }

  // Idempotência global do webhook: o mesmo email.received pode ser reentregue.
  const [duplicate] = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(and(eq(messagesTable.canal, "email"), eq(messagesTable.externalId, emailId)))
    .limit(1);
  if (duplicate) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  let email: {
    from?: string | null;
    to?: string[] | string | null;
    text?: string | null;
    html?: string | null;
    subject?: string | null;
  };
  try {
    const received = await resend.emails.receiving.get(emailId);
    if (received.error || !received.data) {
      req.log.warn({ emailId, error: received.error }, "prospector-email-webhook: failed to fetch received email");
      return res.status(200).json({ received: true, ignored: "email_fetch_failed" });
    }
    email = received.data as typeof email;
  } catch (err) {
    req.log.warn({ err, emailId }, "prospector-email-webhook: received email fetch threw");
    return res.status(200).json({ received: true, ignored: "email_fetch_failed" });
  }

  const recipients = [
    ...stringArray(email.to),
    ...stringArray(eventData["to"]),
  ];
  const routed = recipients
    .map((address) => ({ address, leadId: parseProspectorReplyAddress(address) }))
    .find((item) => Boolean(item.leadId));

  if (!routed?.leadId) {
    req.log.info({ emailId }, "prospector-email-webhook: not a Prospector reply address");
    return res.status(200).json({ received: true, ignored: "not_prospector_reply" });
  }

  const sender = extractEmailAddress(String(email.from ?? eventData["from"] ?? ""));
  if (!sender) {
    return res.status(200).json({ received: true, ignored: "invalid_sender" });
  }

  const [lead] = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      email: leadsTable.email,
      nome: leadsTable.nome,
      source: leadsTable.source,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, routed.leadId))
    .limit(1);

  if (!lead?.tenantId || !lead.email) {
    return res.status(200).json({ received: true, ignored: "lead_not_found" });
  }

  // Allowlist por lead: apenas o e-mail que recebeu a prospecção pode responder
  // para esse endereço roteável. Headers externos nunca definem tenant/lead.
  if (extractEmailAddress(lead.email) !== sender) {
    req.log.warn({ leadId: lead.id, emailId }, "prospector-email-webhook: sender does not match lead");
    return res.status(200).json({ received: true, ignored: "sender_mismatch" });
  }

  if (!isColdProspectSource(lead.source)) {
    return res.status(200).json({ received: true, ignored: "not_cold_prospect" });
  }

  // A rota só processa respostas de leads que receberam uma abordagem real do
  // Prospecctor por e-mail. Impede usar o endereço como inbox genérica do agente.
  const [priorOutbound] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.tenantId, lead.tenantId),
      eq(activitiesTable.leadId, lead.id),
      eq(activitiesTable.tipo, "email"),
      sql`${activitiesTable.resultadoExecucao} LIKE '%prospector_consultivo:%'`,
    ))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  if (!priorOutbound) {
    return res.status(200).json({ received: true, ignored: "no_prior_prospector_email" });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentInbound = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.tenantId, lead.tenantId),
      eq(messagesTable.leadId, lead.id),
      eq(messagesTable.canal, "email"),
      eq(messagesTable.direcao, "entrada"),
      gte(messagesTable.createdAt, oneHourAgo),
    ))
    .limit(MAX_INBOUND_PER_LEAD_HOUR);

  if (recentInbound.length >= MAX_INBOUND_PER_LEAD_HOUR) {
    req.log.warn({ leadId: lead.id }, "prospector-email-webhook: inbound rate limit reached");
    return res.status(200).json({ received: true, ignored: "rate_limited" });
  }

  const messageText = sanitizeProspectorInboundText({
    text: email.text,
    html: email.html,
  });
  if (!messageText) {
    return res.status(200).json({ received: true, ignored: "empty_message" });
  }

  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.tenantId, lead.tenantId),
      eq(conversationsTable.leadId, lead.id),
      eq(conversationsTable.channel, "email"),
    ))
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(1);

  const now = new Date();
  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({
        tenantId: lead.tenantId,
        leadId: lead.id,
        channel: "email",
        status: "open",
        naoLidas: 1,
        currentAgent: "sdr",
        ultimaMensagemEm: now,
        lastInboundAt: now,
      })
      .returning();
  } else {
    [conversation] = await db
      .update(conversationsTable)
      .set({
        status: "open",
        currentAgent: "sdr",
        ultimaMensagemEm: now,
        lastInboundAt: now,
        naoLidas: sql`${conversationsTable.naoLidas} + 1`,
        updatedAt: now,
      })
      .where(eq(conversationsTable.id, conversation.id))
      .returning();
  }

  if (!conversation) {
    req.log.error({ leadId: lead.id }, "prospector-email-webhook: conversation could not be resolved");
    return res.status(200).json({ received: true, ignored: "conversation_error" });
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId: lead.tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      direcao: "entrada",
      canal: "email",
      conteudo: messageText,
      enviadoPor: "lead",
      tipoConteudo: "texto",
      status: "entregue",
      externalId: emailId,
    })
    .returning();

  if (isProspectorOptOut(messageText)) {
    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    await db
      .update(leadsTable)
      .set({
        metadata: {
          ...metadata,
          doNotContact: true,
          outreach_status: "opt_out",
          prospector_opt_out_at: now.toISOString(),
          prospector_opt_out_channel: "email",
        },
        proximaAcao: "Não contatar — opt-out confirmado",
        updatedAt: now,
      })
      .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, lead.tenantId)));

    await db.insert(activitiesTable).values({
      tenantId: lead.tenantId,
      leadId: lead.id,
      tipo: "email",
      titulo: "Prospecctor — opt-out por e-mail",
      descricao: "Prospect solicitou interrupção das mensagens.",
      status: "concluida",
      concluidaEm: now,
      resultadoExecucao: "prospector_opt_out:email",
    });

    req.log.info({ leadId: lead.id, messageId: message?.id }, "prospector-email-webhook: opt-out recorded");
    return res.status(200).json({ received: true, optOut: true });
  }

  // ACK antes da geração de IA. A mensagem já está persistida e idempotente;
  // o processamento subsequente não dá ao remetente acesso a nenhuma ação
  // além do fluxo comercial normal do próprio lead.
  res.status(200).json({ received: true });

  void processAgentInternal({
    tenantId: lead.tenantId,
    leadId: lead.id,
    mensagem: messageText,
    log: req.log,
    forcedAgent: "sdr",
    scenario: {
      cold_outreach: true,
      origem: "prospector_email_reply",
      response_channel: "email",
    },
  }).catch((err) => {
    req.log.error({ err, leadId: lead.id }, "prospector-email-webhook: agent dispatch failed after persistence");
  });
});

export default router;
