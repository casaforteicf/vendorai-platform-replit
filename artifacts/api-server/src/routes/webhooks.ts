import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  leadsTable,
  conversationsTable,
  messagesTable,
  tenantsTable,
  billingEventsTable,
  tokenPurchasesTable,
  dealsTable,
  prospectorFlowExecutionsTable,
  campaignSentLogsTable,
} from "@workspace/db";
import { dispatchSkuDelivery } from "../lib/product-delivery.js";
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
import { transcribeAudio, transcribeAudioBuffer } from "../services/audio-transcription.js";
import { interpretImage, interpretPdf } from "../services/media-interpretation.js";

import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { handleAppointmentConfirmation } from "../jobs/appointmentReminders.js";

const router: IRouter = Router();

// ── Meta Cloud API media download ─────────────────────────────────────────────
async function downloadMetaMedia(mediaId: string, accessToken: string): Promise<Buffer> {
  const infoRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) throw new Error(`Meta media info failed: ${infoRes.status}`);
  const info = await infoRes.json() as { url?: string };
  if (!info.url) throw new Error(`Meta media ${mediaId}: no download URL in response`);

  const dataRes = await fetch(info.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!dataRes.ok) throw new Error(`Meta media download failed: ${dataRes.status}`);
  return Buffer.from(await dataRes.arrayBuffer());
}

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
    await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
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

  // ── 6. Update conversation: ultimaMensagemEm + lastInboundAt + naoLidas++ ──
  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      lastInboundAt: new Date(),
      naoLidas: sql`${conversationsTable.naoLidas} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 7. Confirmação de agendamento (SIM/NÃO) — intercept antes do agente ──
  const _apptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);

  if (!_apptHandled) {
    // ── 8. Auto-quote pipeline for leads from WhatsApp channel ─────────
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
//
// Z-API v2 payload contract (developer.z-api.io/webhooks/on-message-received-examples):
// - `type` is ALWAYS "ReceivedCallback" for every real inbound message (text, audio, image…)
//   — values like "AudioCallback", "ImageCallback" do NOT exist in real payloads.
// - `isMessage` field does NOT exist in real Z-API payloads; never use it to filter.
// - Content type is identified by which sub-object is present: audio, image, document, text…
const zapiNativeBody = z.object({
  type:             z.string().optional(),   // always "ReceivedCallback" for real messages
  fromMe:           z.boolean().optional(),
  isGroup:          z.boolean().optional(),
  phone:            z.string().optional(),
  participantPhone: z.string().nullable().optional(),
  chatName:         z.string().optional(),
  senderName:       z.string().optional(),
  // Text message — identified by payload.text?.message presence
  text: z.object({ message: z.string() }).optional(),
  body: z.string().optional(),              // fallback: older Z-API text format
  // Audio / PTT — identified by payload.audio?.audioUrl presence
  audio: z.object({
    ptt:      z.boolean().optional(),
    audioUrl: z.string().optional(),
    mimeType: z.string().optional(),
    seconds:  z.number().optional(),
    viewOnce: z.boolean().optional(),
  }).optional(),
  // Image — identified by payload.image?.imageUrl presence
  image: z.object({
    imageUrl: z.string().optional(),
    caption:  z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
  // Document — identified by payload.document?.documentUrl presence
  document: z.object({
    documentUrl: z.string().optional(),
    fileName:    z.string().optional(),
    mimeType:    z.string().optional(),
    caption:     z.string().optional(),
  }).optional(),
  // Video — identified by payload.video?.videoUrl presence
  video: z.object({
    videoUrl: z.string().optional(),
    caption:  z.string().optional(),
    mimeType: z.string().optional(),
    seconds:  z.number().optional(),
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
    req.log.warn(
      {
        reason: "invalid_payload",
        bodyPreview: JSON.stringify(req.body)?.slice(0, 300),
        zodIssues: parsed.error.issues.slice(0, 5),
      },
      "zapi-webhook: payload validation failed"
    );
    res.status(200).json({ ignored: true, reason: "invalid_payload" });
    return;
  }

  const payload = parsed.data;

  // ── 3. Guards — block self-echo and group messages ────────────────────────
  // Note: "isMessage" does NOT exist in real Z-API payloads — never use it.

  if (payload.fromMe === true) {
    req.log.info(
      { phone: payload.phone, type: payload.type },
      "zapi-webhook: discarded — fromMe=true (self-echo guard)"
    );
    res.status(200).json({ ignored: true, reason: "fromMe_true" });
    return;
  }

  if (!payload.phone) {
    req.log.info({ type: payload.type }, "zapi-webhook: discarded — no phone field");
    res.status(200).json({ ignored: true, reason: "no_phone" });
    return;
  }

  if (payload.participantPhone || payload.phone.includes("@g.us")) {
    req.log.info(
      { phone: payload.phone, type: payload.type },
      "zapi-webhook: discarded — group message"
    );
    res.status(200).json({ ignored: true, reason: "group_message" });
    return;
  }

  // ── 4. Identify content type by field presence (Z-API v2 ReceivedCallback) ─
  // `type` is always "ReceivedCallback" for real messages — never compare it to
  // identify content. Instead, check which content sub-object is present.

  let mensagem = "";
  let tipoConteudo: "texto" | "audio" | "imagem" | "documento" = "texto";

  if (payload.audio?.audioUrl) {
    // ── Audio / PTT ──────────────────────────────────────────────────────────
    const url = payload.audio.audioUrl;
    req.log.info(
      { phone: payload.phone, ptt: payload.audio.ptt, seconds: payload.audio.seconds, url: url.slice(0, 80) },
      "zapi-webhook: audio — starting transcription"
    );
    try {
      mensagem = await transcribeAudio(url, tenantId, req.log);
      tipoConteudo = "audio";
      req.log.info({ chars: mensagem.length }, "zapi-webhook: audio transcription succeeded");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      req.log.error({ err, url: url.slice(0, 80) }, "zapi-webhook: audio transcription failed");
      res.status(200).json({ ignored: true, reason: "audio_transcription_failed", detail: errMsg });
      return;
    }

  } else if (payload.image?.imageUrl) {
    // ── Image ────────────────────────────────────────────────────────────────
    const url = payload.image.imageUrl;
    req.log.info({ phone: payload.phone, url: url.slice(0, 80) }, "zapi-webhook: image — starting interpretation");
    try {
      mensagem = await interpretImage(url, tenantId, payload.image.caption, req.log);
      tipoConteudo = "imagem";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "zapi-webhook: image interpretation failed");
      res.status(200).json({ ignored: true, reason: "image_interpretation_failed" });
      return;
    }

  } else if (payload.document?.documentUrl) {
    // ── Document ─────────────────────────────────────────────────────────────
    const url = payload.document.documentUrl;
    const mimeType = payload.document.mimeType ?? "";
    const fileName = payload.document.fileName;
    const isSupportedDoc = mimeType.includes("pdf") || mimeType.includes("word") ||
      fileName?.endsWith(".pdf") || fileName?.endsWith(".doc") || fileName?.endsWith(".docx");
    if (!isSupportedDoc) {
      req.log.info({ mimeType, fileName }, "zapi-webhook: unsupported document type");
      res.status(200).json({ ignored: true, reason: "unsupported_document_type" });
      return;
    }
    req.log.info({ phone: payload.phone, fileName, url: url.slice(0, 80) }, "zapi-webhook: document — starting extraction");
    try {
      mensagem = await interpretPdf(url, tenantId, fileName, req.log);
      tipoConteudo = "documento";
    } catch (err) {
      req.log.error({ err, url: url.slice(0, 60) }, "zapi-webhook: document extraction failed");
      res.status(200).json({ ignored: true, reason: "document_extraction_failed" });
      return;
    }

  } else if (payload.text?.message || payload.body) {
    // ── Text ─────────────────────────────────────────────────────────────────
    mensagem = payload.text?.message ?? payload.body ?? "";
    tipoConteudo = "texto";

  } else {
    // No recognized content field — log payload keys for future diagnosis
    req.log.info(
      { type: payload.type, phone: payload.phone, payloadKeys: Object.keys(payload as object) },
      "zapi-webhook: discarded — no recognized content field (audio/image/document/text)"
    );
    res.status(200).json({ ignored: true, reason: "no_recognized_content" });
    return;
  }

  if (!mensagem.trim()) {
    res.status(200).json({ ignored: true, reason: "empty_message" });
    return;
  }

  const telefone = normalizeZapiPhone(payload.phone);
  const nome = payload.chatName ?? payload.senderName ?? telefone;

  req.log.info({ telefone, nome, tipoConteudo, type: payload.type }, "zapi-webhook: processing message");

  // ── 4-7. Find/create lead, conversa, inserir mensagem ───────────────────
  // CORREÇÃO DE AUDITORIA: até aqui, todo passo de detecção de conteúdo
  // (áudio/imagem/documento) sempre respondia 200 mesmo em erro — mas essa
  // parte central (lead/conversa/mensagem) não tinha a mesma proteção. Se
  // um insert falhasse por qualquer motivo transitório, o handler de erro
  // global (app.ts) devolvia 500 — inconsistente com o resto do arquivo, e
  // arriscado: Z-API reenviaria o mesmo webhook depois de um 500, podendo
  // duplicar lead/mensagem quando o reenvio desse certo.
  let lead: typeof leadsTable.$inferSelect;
  let conversation: typeof conversationsTable.$inferSelect;
  let message: typeof messagesTable.$inferSelect;
  try {
    const normalized = storePhone(telefone);
    const match = await findLeadByDedup(tenantId, telefone, null, null);

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
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
    }

    // ── 5. Find or create whatsapp conversation ──────────────────────────
    const [existingConv] = await db
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

    if (existingConv) {
      conversation = existingConv;
    } else {
      [conversation] = await db
        .insert(conversationsTable)
        .values({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", naoLidas: 0 })
        .returning();
    }

    // ── 6. Insert incoming message ───────────────────────────────────────
    [message] = await db
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

    // ── 7. Update conversation counters ──────────────────────────────────
    await db
      .update(conversationsTable)
      .set({
        ultimaMensagemEm: new Date(),
        lastInboundAt: new Date(),
        naoLidas: sql`${conversationsTable.naoLidas} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, conversation.id));
  } catch (persistErr) {
    req.log.error({ err: persistErr, tenantId, telefone }, "zapi-webhook: falha ao persistir lead/conversa/mensagem");
    res.status(200).json({ ignored: true, reason: "persist_failed" });
    return;
  }

  // ── 8. Confirmação de agendamento (SIM/NÃO) — intercept antes do agente ──
  const _zapiApptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);

  if (!_zapiApptHandled) {
    // ── 9. Auto-quote pipeline for Z-API channel leads ───────────────────
    if (lead.source === "whatsapp") {
      let autoQuoteHandled = false;
      try {
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
          autoQuoteHandled = true;
        }
      } catch (autoQuoteErr) {
        req.log.error({ err: autoQuoteErr, leadId: lead.id }, "zapi-webhook: auto-quote pipeline failed — falling back to agent dispatch");
      }

      if (!autoQuoteHandled) {
        dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
        req.log.info({ messageId: message.id, leadId: lead.id }, "zapi-webhook: agent dispatched");
      }
    } else {
      dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
      req.log.info({ messageId: message.id, leadId: lead.id }, "zapi-webhook: agent dispatched");
    }
  }

  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    agentDispatched: !_zapiApptHandled,
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
    // Dedup check: name-only match must NOT auto-merge; create separate lead
    // and flag as possible duplicate for manual review
    const match = await findLeadByDedup(tenantId, null, null, nome);
    if (match.found === false && match.similar !== null) {
      // Similar name found — create NEW lead, mark as possible duplicate
      const similarId = match.similar.id;
      [lead] = await db
        .insert(leadsTable)
        .values({
          tenantId,
          nome: nome ?? `Instagram @${igsid.slice(0, 8)}`,
          instagramScopedId: igsid,
          status: "novo",
          source: "instagram",
          possivelDuplicata: true,
          leadSimilarId: similarId,
        })
        .returning();
      req.log.info({ leadId: lead.id, igsid, similarId, matchBy: "nome" }, "webhook/instagram: new lead created, flagged as possible duplicate (name-only match)");
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
    } else {
      [lead] = await db
        .insert(leadsTable)
        .values({ tenantId, nome: nome ?? `Instagram @${igsid.slice(0, 8)}`, instagramScopedId: igsid, status: "novo", source: "instagram" })
        .returning();
      req.log.info({ leadId: lead.id, igsid }, "webhook/instagram: new lead created");
      await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
    }
  } else if (!lead.instagramScopedId) {
    // Backfill if lead existed without IGSID
    await db
      .update(leadsTable)
      .set({ instagramScopedId: igsid, updatedAt: new Date() })
      .where(eq(leadsTable.id, lead.id));
  } else {
    // Lead reused by IGSID — bump updatedAt
    await db
      .update(leadsTable)
      .set({ updatedAt: new Date() })
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

  // Resolve a deal linked to this charge (customer-level cobrança, distinct from
  // the tenant's own subscription billing above). externalReference is either
  // the bare dealId (single payment) or `${dealId}-${parcela}` (installments);
  // dealId is always a 36-char crypto.randomUUID().
  let linkedDealId: string | null = null;
  const isKnownPrefixedRef =
    payment.externalReference?.startsWith("monthly:") ||
    payment.externalReference?.startsWith("token_topup:") ||
    payment.externalReference?.startsWith("sku_delivery:");
  if (!isKnownPrefixedRef && payment.externalReference) {
    if (payment.externalReference.length === 36) {
      linkedDealId = payment.externalReference;
    } else if (payment.externalReference.length > 36 && payment.externalReference[36] === "-") {
      linkedDealId = payment.externalReference.slice(0, 36);
    }
  }

  const [linkedDeal] = linkedDealId
    ? await db
        .select({ id: dealsTable.id, tenantId: dealsTable.tenantId })
        .from(dealsTable)
        .where(eq(dealsTable.id, linkedDealId))
        .limit(1)
    : await db
        .select({ id: dealsTable.id, tenantId: dealsTable.tenantId })
        .from(dealsTable)
        .where(eq(dealsTable.asaasChargeId, payment.id))
        .limit(1);

  if (linkedDeal) {
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      await db
        .update(dealsTable)
        .set({ chargeStatus: "paid", updatedAt: new Date() })
        .where(eq(dealsTable.id, linkedDeal.id));
      req.log.info({ dealId: linkedDeal.id, paymentId: payment.id }, "asaas-webhook: deal charge marked paid");
    } else if (event === "PAYMENT_OVERDUE") {
      if (payment.dueDate) {
        const due = new Date(payment.dueDate);
        const threeDaysAfterDue = new Date(due);
        threeDaysAfterDue.setDate(threeDaysAfterDue.getDate() + 3);
        if (new Date() >= threeDaysAfterDue) {
          await db
            .update(dealsTable)
            .set({ chargeStatus: "overdue", updatedAt: new Date() })
            .where(eq(dealsTable.id, linkedDeal.id));
          req.log.warn({ dealId: linkedDeal.id, paymentId: payment.id }, "asaas-webhook: deal charge marked overdue ≥3 days");
        }
      }
    }
  }

  if (!tenantId) {
    if (!linkedDeal) {
      req.log.warn({ paymentId: payment.id }, "asaas-webhook: no tenant found for payment — ignoring");
    }
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

    // ── SKU-based product delivery ──────────────────────────────────────────
    if (payment.externalReference?.startsWith("sku_delivery:")) {
      const propostaId = payment.externalReference.split(":")[1] ?? null;
      if (propostaId) {
        req.log.info({ propostaId, paymentId: payment.id }, "asaas-webhook: sku_delivery triggered");
        void dispatchSkuDelivery(propostaId).catch((err) =>
          req.log.error({ err, propostaId }, "asaas-webhook: sku_delivery failed")
        );
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
          .select({ tenantId: agentConfigsTable.tenantId, metaAccessToken: agentConfigsTable.metaAccessToken })
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
          const msgType   = msg["type"] as string;
          const phone     = String(msg["from"] ?? "");
          if (!phone) continue;

          const senderName = (contacts[0] as any)?.profile?.name as string | undefined;

          let mensagem     = "";
          let tipoConteudo: "texto" | "audio" | "imagem" | "documento" = "texto";

          if (msgType === "text") {
            mensagem = ((msg["text"] as Record<string, string>)?.body) ?? "";
            if (!mensagem) continue;

          } else if (msgType === "audio" || msgType === "voice") {
            if (!agentCfg.metaAccessToken) {
              req.log.warn({ phone, msgType }, "meta-webhook: audio received but no access token — skipping");
              continue;
            }
            const audioId = ((msg["audio"] ?? msg["voice"]) as Record<string, string>)?.id;
            if (!audioId) continue;
            try {
              const buf = await downloadMetaMedia(audioId, agentCfg.metaAccessToken);
              mensagem = await transcribeAudioBuffer(buf, tenantId, req.log);
              tipoConteudo = "audio";
              req.log.info({ audioId, chars: mensagem.length }, "meta-webhook: audio transcribed");
            } catch (err) {
              req.log.error({ err, audioId }, "meta-webhook: audio transcription failed — skipping");
              continue;
            }

          } else if (msgType === "image") {
            if (!agentCfg.metaAccessToken) {
              req.log.warn({ phone }, "meta-webhook: image received but no access token — skipping");
              continue;
            }
            const imageData = (msg["image"] as Record<string, string>) ?? {};
            const imageId   = imageData.id;
            const caption   = imageData.caption;
            const mimeType  = (imageData as any).mime_type as string || "image/jpeg";
            if (!imageId) continue;
            try {
              const buf    = await downloadMetaMedia(imageId, agentCfg.metaAccessToken);
              const dataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
              mensagem = await interpretImage(dataUrl, tenantId, caption, req.log);
              tipoConteudo = "imagem";
              req.log.info({ imageId, chars: mensagem.length }, "meta-webhook: image interpreted");
            } catch (err) {
              req.log.error({ err, imageId }, "meta-webhook: image interpretation failed — skipping");
              continue;
            }

          } else {
            req.log.info({ type: msgType, phone }, "meta-webhook: unsupported message type — skipping");
            continue;
          }

          if (!mensagem.trim()) continue;

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
              possivelDuplicata: match.similar ? true : false,
              leadSimilarId: match.similar?.id ?? null,
            }).returning();
            req.log.info({ leadId: lead.id, phone: normalized }, "meta-webhook: new lead created");
            await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
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
            conteudo: mensagem,
            enviadoPor: "lead",
            tipoConteudo,
            status: "entregue",
          }).returning();

          // Update conversation counters + last inbound timestamp
          await db.update(conversationsTable).set({
            naoLidas: sql`${conversationsTable.naoLidas} + 1`,
            ultimaMensagemEm: new Date(),
            lastInboundAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(conversationsTable.id, conversation.id));

          req.log.info({ messageId: message.id, tenantId, phone, tipoConteudo }, "meta-webhook: message processed");

          // Confirmação de agendamento (SIM/NÃO) ou dispatch AI agent
          const _metaApptHandled = await handleAppointmentConfirmation(tenantId, lead.id, mensagem, req.log);
          if (!_metaApptHandled) {
            dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem, log: req.log });
          }
        }

        // ── Rastreamento de leitura (read receipts) ──────────────────────
        const statuses = (value.statuses ?? []) as Array<Record<string, unknown>>;
        for (const statusEvt of statuses) {
          if (statusEvt["status"] !== "read") continue;
          const wamidEvt = statusEvt["id"] as string | undefined;
          if (!wamidEvt) continue;

          // Marca abertura em execuções de fluxo de nutrição
          await db
            .update(prospectorFlowExecutionsTable)
            .set({ abertaEm: new Date() })
            .where(
              and(
                eq(prospectorFlowExecutionsTable.wamid, wamidEvt),
                isNull(prospectorFlowExecutionsTable.abertaEm)
              )
            )
            .catch(() => {});

          // Marca leitura em logs de campanha
          await db
            .update(campaignSentLogsTable)
            .set({ readAt: new Date() })
            .where(
              and(
                eq(campaignSentLogsTable.wamid, wamidEvt),
                isNull(campaignSentLogsTable.readAt)
              )
            )
            .catch(() => {});

          req.log.debug({ wamidEvt }, "meta-webhook: read receipt processado");
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
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe" || !token) {
    req.log.warn({ mode }, "meta/instagram: invalid verification request");
    return res.status(400).json({ error: "Invalid verification request" });
  }

  // Aceita o verify token global do app (env) OU um metaVerifyToken por tenant —
  // consistente com a verificação do webhook do WhatsApp.
  const envToken = process.env["WHATSAPP_VERIFY_TOKEN"];
  let verified = !!envToken && token === envToken;

  if (!verified) {
    const [config] = await db
      .select({ id: agentConfigsTable.id })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.metaVerifyToken, token))
      .limit(1);
    verified = !!config;
  }

  if (!verified) {
    req.log.warn({ mode }, "meta/instagram: verify_token mismatch");
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
      // Instagram Page ID is entry.id — used to resolve tenant for comment events
      const pageId = String(entry.id ?? "");
      const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
      for (const change of changes) {
        // ── Comment events (change.field === "comments") ──────────────────────
        // Payload: { field: "comments", value: { id, text, from: { id, username }, media: { id }, timestamp } }
        // NOTE: to receive these events, subscribe the "comments" field in the Meta App Dashboard
        // under Instagram → Webhooks → Subscribed Fields.
        if (change.field === "comments") {
          const v = change.value as Record<string, unknown>;
          const from = v["from"] as Record<string, string> | undefined;
          const media = v["media"] as Record<string, string> | undefined;
          const commentText = String(v["text"] ?? "").trim();
          const commentId = String(v["id"] ?? "");
          const commentTimestamp = v["timestamp"]
            ? new Date(Number(v["timestamp"]) * 1000)
            : new Date();
          const igsid = from?.id ?? "";
          const username = from?.username ?? `Instagram @${igsid.slice(0, 8)}`;
          const postId = media?.id ?? "";

          if (!igsid || !commentText) {
            req.log.warn({ commentId }, "meta/instagram/comment: missing igsid or text, skipping");
            continue;
          }

          // Resolve tenant by Instagram Page ID
          let tenantId: string | null = null;
          if (pageId) {
            const [agentCfg] = await db
              .select({ tenantId: agentConfigsTable.tenantId, commentKeywords: agentConfigsTable.commentKeywords })
              .from(agentConfigsTable)
              .where(eq(agentConfigsTable.instagramPageId, pageId))
              .limit(1);
            if (agentCfg) {
              tenantId = agentCfg.tenantId;

              // Keyword filter — case-insensitive match against any configured keyword
              const keywords: string[] = Array.isArray(agentCfg.commentKeywords) && agentCfg.commentKeywords.length > 0
                ? agentCfg.commentKeywords
                : [];

              if (keywords.length > 0) {
                const textUpper = commentText.toUpperCase();
                const matched = keywords.some((kw) => textUpper.includes(kw.toUpperCase()));
                if (!matched) {
                  req.log.info(
                    { commentId, igsid, postId, keywords },
                    "meta/instagram/comment: no keyword match, skipping"
                  );
                  continue;
                }
              }

              req.log.info(
                { commentId, igsid, username, postId, commentText, commentTimestamp, tenantId },
                "meta/instagram/comment: keyword match captured"
              );

              // ── Passo 3: criar lead automaticamente ──────────────────────
              // Dedup: reusa lead existente pelo IGSID (pode ser alguém que
              // já enviou DM antes). Não cria duplicata paralela.
              let lead: typeof leadsTable.$inferSelect | null = null;

              const [existingByIgsid] = await db
                .select()
                .from(leadsTable)
                .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, igsid)))
                .limit(1);

              if (existingByIgsid) {
                lead = existingByIgsid;
                req.log.info(
                  { leadId: lead.id, igsid },
                  "meta/instagram/comment: reusing existing lead (IGSID match)"
                );
              } else {
                // Contexto do comentário gravado em notasNutricao (texto visível
                // no CRM) e em discoveryData (estruturado, para automações futuras)
                const notasNutricao = `Comentou no post Instagram [${postId}]: "${commentText}"`;
                const discoveryData: Record<string, unknown> = {
                  origin: "instagram_comment",
                  commentText,
                  postId,
                  commentId,
                  commentedAt: commentTimestamp.toISOString(),
                };

                const similarCheck = await findLeadByDedup(tenantId, null, null, username);
                const hasSimilar = similarCheck.found === false && similarCheck.similar !== null;
                const similarId = hasSimilar ? (similarCheck.similar?.id ?? null) : null;

                [lead] = await db
                  .insert(leadsTable)
                  .values({
                    tenantId,
                    nome: username,
                    instagramScopedId: igsid,
                    instagramHandle: username,
                    status: "novo",
                    source: "instagram_comment",
                    notasNutricao,
                    discoveryData,
                    possivelDuplicata: hasSimilar,
                    leadSimilarId: similarId,
                  })
                  .returning();

                req.log.info(
                  { leadId: lead.id, igsid, username, source: "instagram_comment" },
                  "meta/instagram/comment: new lead created"
                );

                await db.insert(dealsTable).values({
                  tenantId,
                  leadId: lead.id,
                  titulo: lead.nome,
                  etapa: "em_aquecimento",
                });
              }

              // ── Conversa Instagram (reutiliza se já existir de DMs) ───────
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
                req.log.info(
                  { conversationId: conversation.id },
                  "meta/instagram/comment: new conversation created"
                );
              }

              // ── Registra o comentário como mensagem de entrada ────────────
              const conteudoMsg = `[Comentário no post ${postId}] ${commentText}`;
              const [dbMessage] = await db
                .insert(messagesTable)
                .values({
                  tenantId,
                  conversationId: conversation.id,
                  leadId: lead.id,
                  direcao: "entrada",
                  canal: "instagram",
                  conteudo: conteudoMsg,
                  enviadoPor: "lead",
                  tipoConteudo: "texto",
                  status: "entregue",
                })
                .returning();

              await db
                .update(conversationsTable)
                .set({
                  ultimaMensagemEm: new Date(),
                  naoLidas: sql`${conversationsTable.naoLidas} + 1`,
                  updatedAt: new Date(),
                })
                .where(eq(conversationsTable.id, conversation.id));

              req.log.info(
                { messageId: dbMessage.id, leadId: lead.id, conversationId: conversation.id },
                "meta/instagram/comment: lead created — dispatching SDR"
              );

              // ── Passo 4: aciona SDR automaticamente ──────────────────────
              // Usa forcedAgent: "sdr" — igual ao fluxo do Prospector —
              // garantindo que o SDR assume independentemente do agente padrão
              // do tenant. O conteúdo da mensagem é o próprio comentário.
              dispatchAgentBackground({
                tenantId,
                leadId: lead.id,
                mensagem: commentText,
                log: req.log,
                forcedAgent: "sdr",
              });
            }
          }

          if (!tenantId) {
            req.log.warn({ igsid, pageId }, "meta/instagram/comment: no tenant found for page");
          }
          continue;
        }

        // ── DM events (value.messaging array) ────────────────────────────────
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

          // Find or create lead: 1) by IGSID (exact), 2) check for similar name
          let lead: typeof leadsTable.$inferSelect | null = null;

          const [existingByIgsid] = await db
            .select()
            .from(leadsTable)
            .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.instagramScopedId, igsid)))
            .limit(1);

          if (existingByIgsid) {
            lead = existingByIgsid;
            req.log.info({ leadId: lead.id, igsid }, "meta/instagram: existing lead found by IGSID");
          } else {
            const match = await findLeadByDedup(tenantId, null, null, `Instagram @${igsid.slice(0, 8)}`);
            const hasSimilar = match.found === false && match.similar !== null;
            const similarId = match.found === false ? match.similar?.id ?? null : null;

            [lead] = await db
              .insert(leadsTable)
              .values({
                tenantId,
                nome: `Instagram @${igsid.slice(0, 8)}`,
                instagramScopedId: igsid,
                status: "novo",
                source: "instagram",
                possivelDuplicata: hasSimilar,
                leadSimilarId: similarId,
              })
              .returning();
            req.log.info({ leadId: lead.id, igsid, tenantId, possivelDuplicata: lead.possivelDuplicata }, "meta/instagram: new lead created");
            await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
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

// ═════════════════════════════════════════════════════════════════════════════
// Meta Graph API Messenger Webhook
// ═════════════════════════════════════════════════════════════════════════════
// GET /api/webhooks/meta/messenger — Subscription verification
// POST /api/webhooks/meta/messenger — Receive incoming messages
//
// Mesma família de API do Instagram/WhatsApp (Meta Graph API), mas payload
// próprio: object="page", entry[].messaging[] com sender.id (PSID) e
// message.text — não usa a estrutura de "comments" do Instagram nem o
// formato de mensagem do WhatsApp Business.

router.get("/webhooks/meta/messenger", async (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe" || !token) {
    req.log.warn({ mode }, "meta/messenger: invalid verification request");
    return res.status(400).json({ error: "Invalid verification request" });
  }

  // Mesmo padrão de verificação já usado pro WhatsApp/Instagram: aceita o
  // verify token global do app (env) OU um metaVerifyToken por tenant.
  const envToken = process.env["WHATSAPP_VERIFY_TOKEN"];
  let verified = !!envToken && token === envToken;

  if (!verified) {
    const [config] = await db
      .select({ id: agentConfigsTable.id })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.metaVerifyToken, token))
      .limit(1);
    verified = !!config;
  }

  if (!verified) {
    req.log.warn({ mode }, "meta/messenger: verify_token mismatch");
    return res.status(403).json({ error: "Forbidden" });
  }

  req.log.info("meta/messenger: webhook verified");
  return res.status(200).send(challenge);
});

router.post("/webhooks/meta/messenger", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  req.log.info(
    { object: body.object, entries: (body.entry as any[])?.length },
    "meta/messenger: webhook received"
  );

  // Acknowledge immediately (200 OK) — mesmo padrão seguro já usado nos
  // outros webhooks Meta: nunca deixa uma falha de processamento virar 500
  // e disparar reenvio (que poderia duplicar lead/mensagem).
  res.status(200).json({ status: "received" });

  try {
    if (body.object !== "page") {
      req.log.warn({ object: body.object }, "meta/messenger: ignoring non-page object");
      return;
    }

    const entries = (body.entry ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const pageId = String(entry.id ?? "");
      const messagingEvents = (entry.messaging ?? []) as Array<Record<string, unknown>>;

      for (const event of messagingEvents) {
        const sender = event.sender as Record<string, unknown> | undefined;
        const psid = String(sender?.id ?? "");
        if (!psid) continue;

        const message = event.message as Record<string, unknown> | undefined;

        // Echo da própria página respondendo (via API ou manualmente no
        // Meta Business Suite) — nunca processar como mensagem de entrada.
        if (message?.is_echo) {
          req.log.debug({ psid }, "meta/messenger: discarded — echo message");
          continue;
        }

        // Read receipts, delivery, postbacks etc. sem texto — nada a
        // processar como mensagem de entrada por enquanto.
        const texto = typeof message?.text === "string" ? message.text.trim() : "";
        if (!texto) {
          req.log.debug({ psid }, "meta/messenger: discarded — no text content");
          continue;
        }

        // Resolve tenant a partir do pageId
        const [agentCfg] = await db
          .select({ tenantId: agentConfigsTable.tenantId })
          .from(agentConfigsTable)
          .where(eq(agentConfigsTable.messengerPageId, pageId))
          .limit(1);

        if (!agentCfg) {
          req.log.warn({ pageId }, "meta/messenger: no tenant found for pageId");
          continue;
        }

        const { tenantId } = agentCfg;

        try {
          // Lead: encontra por messengerScopedId (não tem telefone, PSID é
          // o identificador único aqui — diferente do fluxo de WhatsApp).
          let [lead] = await db
            .select()
            .from(leadsTable)
            .where(and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.messengerScopedId, psid)))
            .limit(1);

          if (lead) {
            await db.update(leadsTable).set({ updatedAt: new Date() }).where(eq(leadsTable.id, lead.id));
          } else {
            [lead] = await db
              .insert(leadsTable)
              .values({
                tenantId,
                nome: `Contato Messenger ${psid.slice(-6)}`,
                status: "novo",
                source: "messenger",
                messengerScopedId: psid,
              })
              .returning();
            req.log.info({ leadId: lead.id, psid }, "meta/messenger: new lead created");
            await db.insert(dealsTable).values({ tenantId, leadId: lead.id, titulo: lead.nome, etapa: "em_aquecimento" });
          }

          let [conversation] = await db
            .select()
            .from(conversationsTable)
            .where(
              and(
                eq(conversationsTable.tenantId, tenantId),
                eq(conversationsTable.leadId, lead.id),
                eq(conversationsTable.channel, "messenger")
              )
            )
            .limit(1);

          if (!conversation) {
            [conversation] = await db
              .insert(conversationsTable)
              .values({ tenantId, leadId: lead.id, channel: "messenger", status: "open", naoLidas: 0 })
              .returning();
          }

          const [insertedMessage] = await db
            .insert(messagesTable)
            .values({
              tenantId,
              conversationId: conversation.id,
              leadId: lead.id,
              direcao: "entrada",
              canal: "messenger",
              conteudo: texto,
              enviadoPor: "lead",
              tipoConteudo: "texto",
              status: "entregue",
            })
            .returning();

          await db
            .update(conversationsTable)
            .set({
              ultimaMensagemEm: new Date(),
              lastInboundAt: new Date(),
              naoLidas: sql`${conversationsTable.naoLidas} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, conversation.id));

          dispatchAgentBackground({ tenantId, leadId: lead.id, mensagem: texto, log: req.log });
          req.log.info({ messageId: insertedMessage.id, leadId: lead.id }, "meta/messenger: agent dispatched");
        } catch (persistErr) {
          // Mesma proteção aplicada hoje no webhook Z-API: falha de
          // persistência não pode propagar (resposta já foi enviada, isso
          // só afeta o log — mas mantém o padrão do resto do arquivo).
          req.log.error({ err: persistErr, tenantId, psid }, "meta/messenger: falha ao persistir lead/conversa/mensagem");
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "meta/messenger: error processing webhook");
  }
});
