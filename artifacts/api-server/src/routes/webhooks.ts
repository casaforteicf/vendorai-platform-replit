import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  leadsTable,
  conversationsTable,
  messagesTable,
  tenantsTable,
  billingEventsTable,
  tokenPurchasesTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyToken } from "../lib/jwt.js";
import {
  sendOutgoingMessage,
  LeadNotFoundError,
  InstagramNotConnectedError,
  InstagramScopedIdMissingError,
} from "../services/omnichannel.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";
import { runAutoQuotePipeline } from "../services/auto-quote.js";
import { transcribeAudio } from "../services/audio-transcription.js";
import { interpretImage, interpretPdf } from "../services/media-interpretation.js";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";

const router: IRouter = Router();

// ── Dual-auth helper ─────────────────────────────────────────────────────────
// Accepts either X-Webhook-Secret (n8n / agents) or Authorization: Bearer JWT
// (frontend). Returns true and sets req.user on JWT path.
export async function dualAuth(
  req: Request,
  res: Response,
  tenantId: string
): Promise<boolean> {
  const secret = req.headers["x-webhook-secret"];
  const authHeader = req.headers["authorization"];

  // ── Path A: webhook secret ────────────────────────────────────────────────
  if (secret) {
    if (typeof secret !== "string") {
      res.status(401).json({ error: "Invalid X-Webhook-Secret header" });
      return false;
    }

    const [agentConfig] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));

    if (!agentConfig) {
      res.status(404).json({ error: "Tenant agent config not found" });
      return false;
    }

    if (!agentConfig.webhookSecret || agentConfig.webhookSecret !== secret) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return false;
    }

    return true;
  }

  // ── Path B: Bearer JWT ────────────────────────────────────────────────────
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);
      if (
        payload.platformRole !== "super_admin" &&
        payload.tenantId !== tenantId
      ) {
        res.status(403).json({ error: "Access denied to this tenant" });
        return false;
      }
      req.user = payload;
      return true;
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return false;
    }
  }

  res.status(401).json({
    error: "Provide either X-Webhook-Secret or Authorization: Bearer <token>",
  });
  return false;
}

// ── POST /tenants/:tenantId/webhooks/whatsapp ────────────────────────────────
const whatsappWebhookBody = z.object({
  telefone: z.string().min(1),
  nome: z.string().optional(),
  mensagem: z.string().min(1),
});

router.post("/tenants/:tenantId/webhooks/whatsapp", async (req, res) => {
  const { tenantId } = req.params;
  const secret = req.headers["x-webhook-secret"];

  // ── 1. Validate webhook secret ─────────────────────────────────────────
  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing X-Webhook-Secret header" });
    return;
  }

  const [agentConfig] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig) {
    res.status(404).json({ error: "Tenant agent config not found" });
    return;
  }

  if (!agentConfig.webhookSecret || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  // ── 2. Validate body ───────────────────────────────────────────────────
  const parsed = whatsappWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { telefone, nome, mensagem } = parsed.data;

  // ── 3. Find or create lead by phone (dedup-aware) ────────────────────
  const normalized = storePhone(telefone);
  const match = await findLeadByDedup(tenantId, telefone, null, null);

  let lead: typeof leadsTable.$inferSelect;
  if (match.found) {
    lead = match.lead;
    await db
      .update(leadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
    req.log.info({ leadId: lead.id, telefone: normalized, matchBy: match.matchBy }, "webhook: existing lead found (dedup)");
  } else {
    [lead] = await db
      .insert(leadsTable)
      .values({ tenantId, nome: nome ?? telefone, telefone: normalized, status: "novo", source: "whatsapp" })
      .returning();
    req.log.info({ leadId: lead.id, telefone: normalized }, "webhook: new lead created");
  }

  // ── 4. Find or create whatsapp conversation for this lead ──────────────
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, lead.id),
        eq(conversationsTable.channel, "whatsapp")
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", naoLidas: 0 })
      .returning();
    req.log.info(
      { conversationId: conversation.id },
      "webhook: new conversation created"
    );
  }

  // ── 5. Insert incoming message ─────────────────────────────────────────
  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      direcao: "entrada",
      canal: "whatsapp",
      conteudo: mensagem,
      enviadoPor: "lead",
      tipoConteudo: "texto",
      status: "entregue",
    })
    .returning();

  req.log.info({ messageId: message.id }, "webhook: message inserted");

  // ── 6. Update conversation: ultimaMensagemEm + naoLidas++ ──────────────
  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 7. Auto-quote pipeline for leads from WhatsApp channel ───────────
  // Only for leads created by the channel (source === "whatsapp"), not manual leads.
  if (lead.source === "whatsapp") {
    const { generated, message: quoteMessage } = await runAutoQuotePipeline({
      tenantId,
      leadId: lead.id,
      mensagem,
      log: req.log,
    });

    if (generated) {
      // Send the quote summary via WhatsApp
      await sendOutgoingMessage(
        { tenantId, leadId: lead.id, conteudo: quoteMessage, canal: "whatsapp", agentName: "auto-quote" },
        req.log
      );
      req.log.info({ leadId: lead.id }, "webhook: auto-quote sent");
    } else {
      // No quote generated — dispatch AI agent to handle the conversation
      dispatchAgentBackground({
        tenantId,
        leadId: lead.id,
        mensagem,
        log: req.log,
      });
      req.log.info({ leadId: lead.id, conversationId: conversation.id }, "webhook: agent dispatch triggered");
    }
  } else {
    // Manual lead — dispatch AI agent normally (no auto-quote)
    dispatchAgentBackground({
      tenantId,
      leadId: lead.id,
      mensagem,
      log: req.log,
    });
    req.log.info({ leadId: lead.id, conversationId: conversation.id }, "webhook: agent dispatch triggered");
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    leadCreated: !lead.updatedAt || lead.createdAt === lead.updatedAt,
    agentDispatched: true,
  });
});

// ── POST /tenants/:tenantId/webhooks/zapi ────────────────────────────────────
// Receives incoming WhatsApp messages directly from Z-API (native payload).
// Auth: ?secret=<webhookSecret> query param (Z-API doesn't support custom headers).
// Only processes: isMessage=true, fromMe=false, direct messages (not groups).
const zapiNativeBody = z.object({
  isMessage: z.boolean().optional(),
  fromMe: z.boolean().optional(),
  phone: z.string().optional(),
  participantPhone: z.string().nullable().optional(),
  chatName: z.string().optional(),
  senderName: z.string().optional(),
  text: z.object({ message: z.string() }).optional(),
  body: z.string().optional(),  // older Z-API format
  type: z.string().optional(),
  // Audio (type: "audio" | "ptt")
  audio: z.object({
    audioUrl: z.string().optional(),
    mimeType: z.string().optional(),
    seconds: z.number().optional(),
  }).optional(),
  // Image (type: "image")
  image: z.object({
    imageUrl: z.string().optional(),
    caption: z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
  // Document / PDF (type: "document")
  document: z.object({
    documentUrl: z.string().optional(),
    fileName: z.string().optional(),
    mimeType: z.string().optional(),
    caption: z.string().optional(),
  }).optional(),
}).passthrough();

function normalizeZapiPhone(raw: string): string {
  // Strip WhatsApp suffixes: @c.us, @s.whatsapp.net, etc.
  return raw.replace(/@.*$/, "").replace(/\D/g, "");
}

router.post("/tenants/:tenantId/webhooks/zapi", async (req, res) => {
  const { tenantId } = req.params;
  const secret = req.query["secret"];

  // ── 1. Auth via secret query param ────────────────────────────────────────
  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing secret query param" });
    return;
  }

  const [agentConfig] = await db
    .select({ webhookSecret: agentConfigsTable.webhookSecret, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid secret" });
    return;
  }

  // ── 2. Parse payload ───────────────────────────────────────────────────────
  const parsed = zapiNativeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(200).json({ ignored: true, reason: "invalid_payload" });
    return;
  }

  const payload = parsed.data;

  // ── 3. Filter — only incoming messages from direct chats ──────────────────
  if (payload.isMessage === false || payload.fromMe === true) {
    res.status(200).json({ ignored: true, reason: "outgoing_or_non_message" });
    return;
  }
  if (!payload.phone) {
    res.status(200).json({ ignored: true, reason: "no_phone" });
    return;
  }
  // Ignore group messages (participantPhone is set for groups)
  if (payload.participantPhone) {
    res.status(200).json({ ignored: true, reason: "group_message" });
    return;
  }
  // Ignore group chat IDs (contain @g.us)
  if (payload.phone.includes("@g.us")) {
    res.status(200).json({ ignored: true, reason: "group_chat" });
    return;
  }

  let mensagem = "";
  let tipoConteudo: "texto" | "audio" | "imagem" | "documento" = "texto";

  const msgType = payload.type ?? "chat";

  if (msgType === "chat" || msgType === "text") {
    mensagem = payload.text?.message ?? payload.body ?? "";

  } else if (msgType === "audio" || msgType === "ptt") {
    const url = payload.audio?.audioUrl;
    if (!url) {
      res.status(200).json({ ignored: true, reason: "audio_without_url" });
      return;
    }
    try {
      mensagem = await transcribeAudio(url, tenantId, req.log);
      tipoConteudo = "audio";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "audio: transcription failed");
      res.status(200).json({ ignored: true, reason: "audio_transcription_failed" });
      return;
    }

  } else if (msgType === "image") {
    const url = payload.image?.imageUrl;
    if (!url) {
      res.status(200).json({ ignored: true, reason: "image_without_url" });
      return;
    }
    try {
      mensagem = await interpretImage(url, tenantId, payload.image?.caption, req.log);
      tipoConteudo = "imagem";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "image: interpretation failed");
      res.status(200).json({ ignored: true, reason: "image_interpretation_failed" });
      return;
    }

  } else if (msgType === "document") {
    const url = payload.document?.documentUrl;
    if (!url) {
      res.status(200).json({ ignored: true, reason: "document_without_url" });
      return;
    }
    const mimeType = payload.document?.mimeType ?? "";
    const fileName = payload.document?.fileName;
    // Only interpret PDF and Word documents; skip other binary types
    const isSupportedDoc = mimeType.includes("pdf") || mimeType.includes("word") ||
      fileName?.endsWith(".pdf") || fileName?.endsWith(".doc") || fileName?.endsWith(".docx");
    if (!isSupportedDoc) {
      req.log.info({ mimeType, fileName }, "zapi-webhook: unsupported document type");
      res.status(200).json({ ignored: true, reason: "unsupported_document_type" });
      return;
    }
    try {
      mensagem = await interpretPdf(url, tenantId, fileName, req.log);
      tipoConteudo = "documento";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "document: extraction failed");
      res.status(200).json({ ignored: true, reason: "document_extraction_failed" });
      return;
    }

  } else {
    // Unsupported message type (video, sticker, location, etc.)
    req.log.info({ type: msgType }, "zapi-webhook: unsupported message type");
    res.status(200).json({ ignored: true, reason: `unsupported_type_${msgType}` });
    return;
  }

  if (!mensagem.trim()) {
    res.status(200).json({ ignored: true, reason: "empty_message" });
    return;
  }

  const telefone = normalizeZapiPhone(payload.phone);
  const nome = payload.chatName ?? payload.senderName ?? telefone;

  req.log.info({ telefone, nome, tipoConteudo }, "zapi-webhook: incoming message received");

  // ── 4. Find or create lead (dedup-aware) ───────────────────────────────────
  const normalized = storePhone(telefone);
  const match = await findLeadByDedup(tenantId, telefone, null, null);

  let lead: typeof leadsTable.$inferSelect;
  if (match.found) {
    lead = match.lead;
    await db
      .update(leadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
    req.log.info({ leadId: lead.id, telefone: normalized, matchBy: match.matchBy }, "zapi-webhook: existing lead found (dedup)");
  } else {
    [lead] = await db
      .insert(leadsTable)
      .values({ tenantId, nome, telefone: normalized, status: "novo", source: "whatsapp" })
      .returning();
    req.log.info({ leadId: lead.id, telefone: normalized }, "zapi-webhook: new lead created");
  }

  // ── 5. Find or create whatsapp conversation ────────────────────────────────
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, lead.id),
        eq(conversationsTable.channel, "whatsapp")
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", naoLidas: 0 })
      .returning();
  }

  // ── 6. Insert incoming message ─────────────────────────────────────────────
  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      direcao: "entrada",
      canal: "whatsapp",
      conteudo: mensagem,
      enviadoPor: "lead",
      tipoConteudo,
      status: "entregue",
    })
    .returning();

  // ── 7. Update conversation counters ───────────────────────────────────────
  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 8. Auto-quote pipeline for Z-API channel leads ─────────────────────────
  if (lead.source === "whatsapp") {
    const { generated, message: quoteMessage } = await runAutoQuotePipeline({
      tenantId,
      leadId: lead.id,
      mensagem,
      log: req.log,
    });

    if (generated) {
      await sendOutgoingMessage(
        { tenantId, leadId: lead.id, conteudo: quoteMessage, canal: "whatsapp", agentName: "auto-quote" },
        req.log
      );
      req.log.info({ leadId: lead.id }, "zapi-webhook: auto-quote sent");
    } else {
      dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
      req.log.info({ messageId: message.id, leadId: lead.id }, "zapi-webhook: agent dispatched");
    }
  } else {
    dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
    req.log.info({ messageId: message.id, leadId: lead.id }, "zapi-webhook: agent dispatched");
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    agentDispatched: true,
  });
});

// ── POST /tenants/:tenantId/webhooks/instagram ───────────────────────────────
// Receives Instagram DM events forwarded by Meta webhook (via n8n or directly).
// Payload shape mirrors Meta's Messenger/Instagram webhook format.
const instagramWebhookBody = z.object({
  igsid: z.string().min(1),           // Instagram Scoped User ID of the sender
  nome: z.string().optional(),
  mensagem: z.string().min(1),
});

router.post("/tenants/:tenantId/webhooks/instagram", async (req, res) => {
  const { tenantId } = req.params;
  const secret = req.headers["x-webhook-secret"];

  if (!secret || typeof secret !== "string") {
    res.status(401).json({ error: "Missing X-Webhook-Secret header" });
    return;
  }

  const [agentConfig] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!agentConfig) {
    res.status(404).json({ error: "Tenant agent config not found" });
    return;
  }

  if (!agentConfig.webhookSecret || agentConfig.webhookSecret !== secret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const parsed = instagramWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { igsid, nome, mensagem } = parsed.data;

  // Find or create lead by Instagram Scoped ID (dedup-aware)
  let [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, igsid))
    )
    .limit(1);

  if (!lead) {
    // Try to match by name as fallback — if exact name match, backfill IGSID
    const match = await findLeadByDedup(tenantId, null, null, nome);
    if (match.found && match.matchBy === "nome") {
      lead = match.lead;
      await db
        .update(leadsTable)
        .set({ instagramScopedId: igsid, updatedAt: new Date() })
        .where(eq(leadsTable.id, lead.id));
      req.log.info({ leadId: lead.id, igsid, matchBy: "nome" }, "webhook/instagram: existing lead found by name, backfilled IGSID");
    } else {
      [lead] = await db
        .insert(leadsTable)
        .values({ tenantId, nome: nome ?? `Instagram @${igsid.slice(0, 8)}`, instagramScopedId: igsid, status: "novo", source: "instagram" })
        .returning();
      req.log.info({ leadId: lead.id, igsid }, "webhook/instagram: new lead created");
    }
  } else if (!lead.instagramScopedId) {
    // Backfill if lead existed without IGSID
    await db
      .update(leadsTable)
      .set({ instagramScopedId: igsid, updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
  }

  // ── Find or create Instagram conversation ────────────────────────────────
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, lead.id),
        eq(conversationsTable.channel, "instagram")
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId: lead.id, channel: "instagram", status: "open", naoLidas: 0 })
      .returning();
    req.log.info({ conversationId: conversation.id }, "webhook/instagram: new conversation created");
  }

  // ── Insert incoming message ──────────────────────────────────────────────
  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      direcao: "entrada",
      canal: "instagram",
      conteudo: mensagem,
      enviadoPor: "lead",
      tipoConteudo: "texto",
      status: "entregue",
    })
    .returning();

  req.log.info({ messageId: message.id }, "webhook/instagram: message inserted");

  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // Auto-quote pipeline for Instagram channel leads
  if (lead.source === "instagram") {
    const { generated, message: quoteMessage } = await runAutoQuotePipeline({
      tenantId,
      leadId: lead.id,
      mensagem,
      log: req.log,
    });

    if (generated) {
      await sendOutgoingMessage(
        { tenantId, leadId: lead.id, conteudo: quoteMessage, canal: "instagram", agentName: "auto-quote" },
        req.log
      );
      req.log.info({ leadId: lead.id }, "webhook/instagram: auto-quote sent");
    } else {
      dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
      req.log.info({ messageId: message.id, leadId: lead.id }, "webhook/instagram: agent dispatched");
    }
  } else {
    dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
    req.log.info({ messageId: message.id, leadId: lead.id }, "webhook/instagram: agent dispatched");
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    agentDispatched: true,
  });
});

// ── POST /tenants/:tenantId/messages/send ─────────────────────────────────────
const sendMessageBody = z.object({
  leadId: z.string().min(1),
  conteudo: z.string().min(1),
  canal: z
    .enum(["whatsapp", "instagram", "email", "chat"])
    .optional()
    .default("whatsapp"),
  agentName: z.string().optional(),
});

router.post("/tenants/:tenantId/messages/send", async (req, res) => {
  const { tenantId } = req.params;

  // ── 1. Dual auth ───────────────────────────────────────────────────────
  const authorized = await dualAuth(req, res, tenantId);
  if (!authorized) return;

  // ── 2. Validate body ───────────────────────────────────────────────────
  const parsed = sendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // ── 3. Execute via shared service ──────────────────────────────────────
  try {
    const { message, telefoneDestino } = await sendOutgoingMessage(
      { ...parsed.data, tenantId },
      req.log
    );
    res.status(201).json({ ...message, telefoneDestino });
  } catch (err) {
    if (err instanceof LeadNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InstagramNotConnectedError || err instanceof InstagramScopedIdMissingError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── POST /webhooks/asaas ──────────────────────────────────────────────────────
// Asaas sends payment events here. No auth — protected by checking event metadata.
// Relevant events:
//   PAYMENT_OVERDUE   → if overdue ≥ 3 days, suspend tenant
//   PAYMENT_RECEIVED  → reactivate tenant + mark billing_event as paid
//   PAYMENT_CONFIRMED → same as RECEIVED

const asaasWebhookBody = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    externalReference: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    status: z.string().optional(),
  }),
});

router.post("/webhooks/asaas", async (req, res) => {
  const parsed = asaasWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid payload" });
    return;
  }

  const { event, payment } = parsed.data;
  req.log.info({ event, paymentId: payment.id }, "asaas-webhook: received");

  // Resolve tenantId from the billing_event linked to this charge
  const [billingEvent] = await db
    .select({ id: billingEventsTable.id, tenantId: billingEventsTable.tenantId })
    .from(billingEventsTable)
    .where(eq(billingEventsTable.asaasChargeId, payment.id))
    .limit(1);

  // Also try via externalReference for monthly charges (format: "monthly:<tenantId>:<mes>")
  let tenantId: string | null = billingEvent?.tenantId ?? null;
  if (!tenantId && payment.externalReference?.startsWith("monthly:")) {
    const parts = payment.externalReference.split(":");
    tenantId = parts[1] ?? null;
  }

  if (!tenantId) {
    req.log.warn({ paymentId: payment.id }, "asaas-webhook: no tenant found for payment — ignoring");
    res.status(200).json({ ok: true });
    return;
  }

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    // ── Token top-up: credit tokens to tenant ──────────────────────────────
    if (payment.externalReference?.startsWith("token_topup:")) {
      const parts = payment.externalReference.split(":");
      const purchaseId = parts[2] ?? null;
      if (purchaseId) {
        const [purchase] = await db
          .select({ id: tokenPurchasesTable.id, credits: tokenPurchasesTable.credits, status: tokenPurchasesTable.status })
          .from(tokenPurchasesTable)
          .where(eq(tokenPurchasesTable.id, purchaseId));

        if (purchase && purchase.status !== "paid") {
          await db
            .update(tokenPurchasesTable)
            .set({ status: "paid", paidAt: new Date() })
            .where(eq(tokenPurchasesTable.id, purchase.id));

          await db
            .update(tenantsTable)
            .set({ tokenCredits: sql`token_credits + ${purchase.credits}`, updatedAt: new Date() })
            .where(eq(tenantsTable.id, tenantId));

          req.log.info({ tenantId, purchaseId, credits: purchase.credits }, "asaas-webhook: token top-up credited");
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Mark billing_event paid
    if (billingEvent) {
      await db
        .update(billingEventsTable)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(billingEventsTable.id, billingEvent.id));
    }

    // Reactivate tenant if it was suspended due to overdue
    await db
      .update(tenantsTable)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.status, "suspended")));

    req.log.info({ tenantId, paymentId: payment.id }, "asaas-webhook: payment received — tenant reactivated if suspended");
  } else if (event === "PAYMENT_OVERDUE") {
    // Only suspend if overdue by ≥ 3 calendar days
    if (payment.dueDate) {
      const due = new Date(payment.dueDate);
      const threeDaysAfterDue = new Date(due);
      threeDaysAfterDue.setDate(threeDaysAfterDue.getDate() + 3);

      if (new Date() >= threeDaysAfterDue) {
        if (billingEvent) {
          await db
            .update(billingEventsTable)
            .set({ status: "overdue" })
            .where(eq(billingEventsTable.id, billingEvent.id));
        }

        await db
          .update(tenantsTable)
          .set({ status: "suspended", updatedAt: new Date() })
          .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.status, "active")));

        req.log.warn({ tenantId, paymentId: payment.id, dueDate: payment.dueDate }, "asaas-webhook: payment overdue ≥3 days — tenant suspended");
      } else {
        req.log.info({ tenantId, paymentId: payment.id }, "asaas-webhook: payment overdue but < 3 days — not suspending yet");
      }
    }
  }

  res.status(200).json({ ok: true });
});

// ── GET /webhooks/meta/whatsapp — Meta webhook URL verification ──────────────
router.get("/webhooks/meta/whatsapp", async (req, res) => {
  const mode      = String(req.query["hub.mode"] ?? "");
  const token     = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (mode !== "subscribe" || !token) {
    res.status(400).json({ error: "Invalid verification request" });
    return;
  }

  const [config] = await db
    .select({ id: agentConfigsTable.id })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.metaVerifyToken, token))
    .limit(1);

  if (!config) {
    req.log.warn({ token }, "meta-webhook: verify_token not found in any agent config");
    res.status(403).json({ error: "verify_token mismatch" });
    return;
  }

  req.log.info("meta-webhook: webhook URL verified successfully");
  res.status(200).send(challenge);
});

// ── POST /webhooks/meta/whatsapp — incoming Meta WhatsApp messages ───────────
router.post("/webhooks/meta/whatsapp", async (req, res) => {
  // ACK immediately — Meta retries if it doesn't get 200 within 20s
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as Record<string, unknown>;
    if (body.object !== "whatsapp_business_account") return;

    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
      for (const change of changes) {
        if (change.field !== "messages") continue;

        const value    = change.value as Record<string, unknown>;
        const metadata = (value.metadata ?? {}) as Record<string, string>;
        const phoneNumberId = metadata["phone_number_id"];
        if (!phoneNumberId) continue;

        // Resolve tenant from phoneNumberId
        const [agentCfg] = await db
          .select({ tenantId: agentConfigsTable.tenantId })
          .from(agentConfigsTable)
          .where(eq(agentConfigsTable.metaPhoneNumberId, phoneNumberId))
          .limit(1);
        if (!agentCfg) {
          req.log.warn({ phoneNumberId }, "meta-webhook: no tenant found for phoneNumberId");
          continue;
        }
        const { tenantId } = agentCfg;

        const incomingMsgs = (value.messages ?? []) as Array<Record<string, unknown>>;
        const contacts     = (value.contacts ?? []) as Array<Record<string, unknown>>;

        for (const msg of incomingMsgs) {
          if (msg["type"] !== "text") continue;

          const phone      = String(msg["from"] ?? "");
          const textBody   = ((msg["text"] as Record<string, string>)?.body) ?? "";
          if (!phone || !textBody) continue;

          const senderName = (contacts[0] as any)?.profile?.name as string | undefined;

          // Find or create lead (dedup by normalized phone)
          const normalized = storePhone(phone) ?? phone;
          const match = await findLeadByDedup(tenantId, normalized, null, senderName ?? null);

          let lead: typeof leadsTable.$inferSelect | null = null;

          if (match.found === true) {
            lead = match.lead;
            await db
              .update(leadsTable)
              .set({ updatedAt: new Date() })
              .where(eq(leadsTable.id, lead.id));
            req.log.info({ leadId: lead.id, phone: normalized, matchBy: match.matchBy }, "meta-webhook: existing lead found (dedup)");
          } else {
            [lead] = await db.insert(leadsTable).values({
              tenantId,
              nome: senderName ?? `WhatsApp ${normalized}`,
              telefone: normalized,
              status: "novo",
              source: "whatsapp",
              possivelDuplicata: match.similar ? "true" : "false",
              leadSimilarId: match.similar?.id ?? null,
            }).returning();
            req.log.info({ leadId: lead.id, phone: normalized }, "meta-webhook: new lead created");
          }

          // Find or create conversation
          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(and(
              eq(conversationsTable.tenantId, tenantId),
              eq(conversationsTable.leadId, lead.id),
              eq(conversationsTable.channel, "whatsapp")
            ))
            .limit(1);

          if (!conversation) {
            [conversation] = await db.insert(conversationsTable).values({
              tenantId,
              leadId: lead.id,
              channel: "whatsapp",
              status: "open",
              naoLidas: 0,
            }).returning();
          }

          // Insert incoming message
          const [message] = await db.insert(messagesTable).values({
            tenantId,
            conversationId: conversation.id,
            leadId: lead.id,
            direcao: "entrada",
            canal: "whatsapp",
            conteudo: textBody,
            enviadoPor: "lead",
            tipoConteudo: "texto",
            status: "entregue",
          }).returning();

          // Update conversation counters
          await db.update(conversationsTable).set({
            naoLidas: sql`${conversationsTable.naoLidas} + 1`,
            ultimaMensagemEm: new Date(),
            updatedAt: new Date(),
          }).where(eq(conversationsTable.id, conversation.id));

          req.log.info({ messageId: message.id, tenantId, phone }, "meta-webhook: message processed");

          // Dispatch AI agent
          dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem: textBody, log: req.log });
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "meta-webhook: error processing incoming webhook");
  }
});

// ── Meta Graph API Instagram Webhook ───────────────────────────────────────────
// GET /api/webhooks/meta/instagram — Subscription verification
// POST /api/webhooks/meta/instagram — Receive events

router.get("/webhooks/meta/instagram", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode !== "subscribe" || token !== verifyToken) {
    req.log.warn({ mode, tokenMatch: token === verifyToken }, "meta/instagram: verification failed");
    return res.status(403).json({ error: "Forbidden" });
  }

  req.log.info("meta/instagram: webhook verified");
  return res.status(200).send(challenge);
});

router.post("/webhooks/meta/instagram", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  req.log.info(
    { object: body.object, entries: (body.entry as any[])?.length },
    "meta/instagram: webhook received"
  );

  // Acknowledge immediately (200 OK)
  res.status(200).json({ status: "received" });

  try {
    if (body.object !== "instagram") {
      req.log.warn({ object: body.object }, "meta/instagram: ignoring non-instagram object");
      return;
    }

    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
      for (const change of changes) {
        const value = change.value as Record<string, unknown>;
        const messaging = (value.messaging ?? []) as Array<Record<string, unknown>>;

        for (const msg of messaging) {
          const sender = msg["sender"] as Record<string, string> | undefined;
          const message = msg["message"] as Record<string, unknown> | undefined;
          if (!sender || !message) continue;

          // Ignore echo messages (sent by the bot itself)
          if (message["is_echo"] === true) continue;

          const igsid = sender.id;
          const text = (message["text"] as string) ?? "";
          if (!igsid) continue;

          // Resolve tenant by Instagram Page ID (recipient)
          const recipient = (msg["recipient"] as Record<string, string>)?.id;
          let tenantId: string | null = null;

          if (recipient) {
            const [agentCfg] = await db
              .select({ tenantId: agentConfigsTable.tenantId })
              .from(agentConfigsTable)
              .where(eq(agentConfigsTable.instagramPageId, recipient))
              .limit(1);
            if (agentCfg) tenantId = agentCfg.tenantId;
          }

          if (!tenantId) {
            req.log.warn({ igsid, recipient }, "meta/instagram: no tenant found for page");
            continue;
          }

          // Find or create lead (dedup by name first, then IGSID)
          const match = await findLeadByDedup(tenantId, null, null, `Instagram @${igsid.slice(0, 8)}`);

          let lead: typeof leadsTable.$inferSelect | null = null;

          if (match.found === true) {
            lead = match.lead;
            // Backfill IGSID if missing
            await db
              .update(leadsTable)
              .set({ instagramScopedId: igsid, updatedAt: new Date() })
              .where(eq(leadsTable.id, lead.id));
            req.log.info({ leadId: lead.id, igsid, matchBy: match.matchBy }, "meta/instagram: existing lead found (dedup), backfilled IGSID");
          } else {
            [lead] = await db
              .insert(leadsTable)
              .values({
                tenantId,
                nome: `Instagram @${igsid.slice(0, 8)}`,
                instagramScopedId: igsid,
                status: "novo",
                source: "instagram",
                possivelDuplicata: match.similar ? "true" : "false",
                leadSimilarId: match.similar?.id ?? null,
              })
              .returning();
            req.log.info({ leadId: lead.id, igsid, tenantId }, "meta/instagram: new lead created");
          }

          // Find or create Instagram conversation
          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(
              and(
                eq(conversationsTable.tenantId, tenantId),
                eq(conversationsTable.leadId, lead.id),
                eq(conversationsTable.channel, "instagram")
              )
            )
            .limit(1);

          if (!conversation) {
            [conversation] = await db
              .insert(conversationsTable)
              .values({
                tenantId,
                leadId: lead.id,
                channel: "instagram",
                status: "open",
                naoLidas: 0,
              })
              .returning();
            req.log.info({ conversationId: conversation.id, tenantId }, "meta/instagram: new conversation created");
          }

          // Insert incoming message
          const [dbMessage] = await db
            .insert(messagesTable)
            .values({
              tenantId,
              conversationId: conversation.id,
              leadId: lead.id,
              direcao: "entrada",
              canal: "instagram",
              conteudo: text,
              enviadoPor: "lead",
              tipoConteudo: "texto",
              status: "entregue",
            })
            .returning();

          // Update conversation counters
          await db
            .update(conversationsTable)
            .set({
              ultimaMensagemEm: new Date(),
              naoLidas: sql`${conversationsTable.naoLidas} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, conversation.id));

          req.log.info({ messageId: dbMessage.id, leadId: lead.id, tenantId }, "meta/instagram: message processed");

          // Dispatch AI agent in background
          dispatchAgentBackground({
            tenantId,
            leadId: lead.id,
            mensagem: text,
            log: req.log,
          });
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "meta/instagram: error processing webhook");
  }
});

export default router;
