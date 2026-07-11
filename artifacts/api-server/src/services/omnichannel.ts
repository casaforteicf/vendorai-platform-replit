import { and, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
  agentConfigsTable,
  activitiesTable,
  notificationsTable,
  tenantsTable,
} from "@workspace/db";
import type { Message, Conversation } from "@workspace/db";
import type { Logger } from "pino";
import { ObjectStorageService } from "../lib/objectStorage.js";

export interface AgentAttachment {
  name: string;
  objectPath: string;
  mimeType: string;
  size?: number;
}

const objectStorage = new ObjectStorageService();

export interface SendOutgoingMessageInput {
  tenantId: string;
  leadId: string;
  conteudo: string;
  canal: "whatsapp" | "instagram" | "email" | "chat";
  agentName?: string | null;
}

export interface SendOutgoingMessageResult {
  message: Message;
  conversation: Conversation;
  telefoneDestino: string | null;
}

export class LeadNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(leadId: string) {
    super(`Lead "${leadId}" not found`);
    this.name = "LeadNotFoundError";
  }
}

export class InstagramNotConnectedError extends Error {
  readonly statusCode = 422;
  constructor() {
    super("Instagram não conectado. Configure o token de acesso em Configurações > Integrações.");
    this.name = "InstagramNotConnectedError";
  }
}

export class InstagramScopedIdMissingError extends Error {
  readonly statusCode = 422;
  constructor(leadId: string) {
    super(`Lead "${leadId}" não tem Instagram Scoped ID. O lead precisa ter enviado uma mensagem primeiro via Instagram.`);
    this.name = "InstagramScopedIdMissingError";
  }
}

export class WhatsAppNotConnectedError extends Error {
  readonly statusCode = 422;
  constructor() {
    super("WhatsApp não conectado. Configure as credenciais Meta WhatsApp Cloud API em Configurações > Integrações.");
    this.name = "WhatsAppNotConnectedError";
  }
}

export class WhatsAppPhoneMissingError extends Error {
  readonly statusCode = 422;
  constructor(leadId: string) {
    super(`Lead "${leadId}" não tem número de telefone cadastrado.`);
    this.name = "WhatsAppPhoneMissingError";
  }
}

export class WhatsApp24hWindowError extends Error {
  readonly statusCode = 422;
  constructor(leadId: string) {
    super(`Janela de 24h expirada para lead "${leadId}". Configure um template de reabertura em Configurações > Integrações.`);
    this.name = "WhatsApp24hWindowError";
  }
}

async function sendInstagramMessage(
  pageAccessToken: string,
  recipientIgsid: string,
  messageText: string,
  log: Logger
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/me/messages`;
  const body = {
    recipient: { id: recipientIgsid },
    message: { text: messageText },
    messaging_type: "RESPONSE",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log.error({ err, recipientIgsid }, "omnichannel: instagram send failed");
    throw new Error(`Instagram API error: ${JSON.stringify(err)}`);
  }

  log.info({ recipientIgsid }, "omnichannel: instagram message sent");
}

function normalizePhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return "55" + digits;
}

// ── Z-API send ────────────────────────────────────────────────────────────────

async function sendZapiWhatsAppMessage(
  instanceId: string,
  token: string,
  clientToken: string,
  phone: string,
  message: string,
  log: Logger,
  isAiResponse = false
): Promise<void> {
  if (isAiResponse) await simulateTypingDelay(message, log);

  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const normalized = digits.startsWith("55") ? digits : "55" + digits;

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify({ phone: normalized, message }),
  });

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ body, phone: normalized, instanceId }, "omnichannel: zapi send failed");
    throw new Error(`Z-API error ${res.status}: ${JSON.stringify(body)}`);
  }

  const zapiMessageId = (body as { zaapId?: string }).zaapId ?? null;
  log.info({ phone: normalized, zapiMessageId }, "omnichannel: whatsapp message sent via z-api");
}

// ── Z-API document send ───────────────────────────────────────────────────────

async function sendZapiDocument(
  instanceId: string,
  token: string,
  clientToken: string,
  phone: string,
  pdfBuffer: Buffer,
  fileName: string,
  caption: string,
  log: Logger,
): Promise<void> {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const normalized = digits.startsWith("55") ? digits : "55" + digits;
  const base64 = pdfBuffer.toString("base64");
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/pdf`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": clientToken },
    body: JSON.stringify({
      phone: normalized,
      document: `data:application/pdf;base64,${base64}`,
      fileName,
      caption,
    }),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ body, phone: normalized }, "omnichannel: zapi document send failed");
    throw new Error(`Z-API document error ${res.status}: ${JSON.stringify(body)}`);
  }
  log.info({ phone: normalized, fileName }, "omnichannel: document sent via z-api");
}

/**
 * Send a PDF buffer as a WhatsApp document attachment.
 * Picks Z-API when configured, falls back to Meta Cloud API.
 * Silently skips (logs warn) when no credentials are available.
 */
export async function sendDirectWhatsAppDocument(
  tenantId: string,
  phone: string,
  pdfBuffer: Buffer,
  fileName: string,
  caption: string,
  log: Logger,
): Promise<void> {
  const [config] = await db
    .select({
      zapiInstanceId:    agentConfigsTable.zapiInstanceId,
      zapiToken:         agentConfigsTable.zapiToken,
      zapiClientToken:   agentConfigsTable.zapiClientToken,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken:   agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const hasZapi = !!(config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken);
  const hasMeta = !!(config?.metaPhoneNumberId && config?.metaAccessToken);

  if (!hasZapi && !hasMeta) {
    log.warn({ tenantId }, "omnichannel: no credentials for document send — skipping PDF");
    return;
  }

  if (hasZapi) {
    await sendZapiDocument(
      config!.zapiInstanceId!, config!.zapiToken!, config!.zapiClientToken!,
      phone, pdfBuffer, fileName, caption, log,
    );
  } else {
    // Meta: upload to Media API, then send as document message
    const mediaId = await uploadMediaToMeta(
      config!.metaPhoneNumberId!, config!.metaAccessToken!,
      pdfBuffer, "application/pdf", fileName, log,
    );
    const normalizedPhone = phone.replace(/\D/g, "").replace(/^0+/, "");
    const url = `https://graph.facebook.com/v20.0/${config!.metaPhoneNumberId!}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config!.metaAccessToken!}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedPhone,
        type: "document",
        document: { id: mediaId, filename: fileName, caption },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`Meta document send error ${res.status}: ${JSON.stringify(data)}`);
    }
    log.info({ phone: normalizedPhone, fileName }, "omnichannel: document sent via meta");
  }
}

// ── Meta send ─────────────────────────────────────────────────────────────────

async function sendMetaWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  phone: string,
  message: string,
  log: Logger,
  isAiResponse = false
): Promise<void> {
  if (isAiResponse) await simulateTypingDelay(message, log);

  const normalizedPhone = phone.replace(/\D/g, "").replace(/^0+/, "");
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "text",
      text: { body: message },
    }),
  });

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ body, phone }, "omnichannel: meta send failed");
    throw new Error(`Meta WhatsApp API error ${res.status}: ${JSON.stringify(body)}`);
  }

  const metaMessageId = (body.messages as Array<{ id: string }>)?.[0]?.id;
  log.info({ phone, metaMessageId }, "omnichannel: whatsapp message sent via meta cloud api");
}

/**
 * Upload a file buffer to Meta's Media API and return the media_id.
 */
async function uploadMediaToMeta(
  phoneNumberId: string,
  accessToken: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
  log: Logger
): Promise<string> {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/media`;
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ data, phoneNumberId }, "omnichannel: meta media upload failed");
    throw new Error(`Meta Media Upload error ${res.status}: ${JSON.stringify(data)}`);
  }

  const mediaId = String(data["id"] ?? "");
  if (!mediaId) throw new Error("Meta Media Upload: no media id returned");
  return mediaId;
}

/**
 * Send a media file (document or image) via Meta WhatsApp Cloud API.
 * Downloads from object storage, uploads to Meta, then sends the message.
 */
async function sendMetaWhatsAppMedia(
  phoneNumberId: string,
  accessToken: string,
  phone: string,
  attachment: AgentAttachment,
  log: Logger
): Promise<void> {
  const normalizedPhone = phone.replace(/\D/g, "").replace(/^0+/, "");

  // 1. Download from GCS
  const file = await objectStorage.getObjectEntityFile(attachment.objectPath);
  const [buffer] = await file.download();

  // 2. Upload to Meta Media API
  const mediaId = await uploadMediaToMeta(
    phoneNumberId,
    accessToken,
    buffer,
    attachment.mimeType,
    attachment.name,
    log
  );

  // 3. Determine message type
  const isImage = attachment.mimeType.startsWith("image/");
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const messageBody = isImage
    ? { messaging_product: "whatsapp", to: normalizedPhone, type: "image", image: { id: mediaId, caption: attachment.name } }
    : { messaging_product: "whatsapp", to: normalizedPhone, type: "document", document: { id: mediaId, filename: attachment.name } };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(messageBody),
  });

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ data, phone }, "omnichannel: meta media send failed");
    throw new Error(`Meta WhatsApp Media error ${res.status}: ${JSON.stringify(data)}`);
  }

  log.info({ phone, filename: attachment.name, isImage }, "omnichannel: whatsapp media sent");
}

/**
 * Send all agent attachments to a lead's WhatsApp.
 * Silently skips individual files that fail (logs the error).
 */
export async function sendAgentAttachments(
  tenantId: string,
  phone: string,
  attachments: AgentAttachment[],
  log: Logger
): Promise<void> {
  if (!attachments.length) return;

  const [config] = await db
    .select({ metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId, metaAccessToken: agentConfigsTable.metaAccessToken })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  if (!config?.metaPhoneNumberId || !config?.metaAccessToken) {
    log.warn({ tenantId }, "omnichannel: skipping attachments — no meta credentials");
    return;
  }

  for (const attachment of attachments) {
    try {
      await sendMetaWhatsAppMedia(config.metaPhoneNumberId, config.metaAccessToken, phone, attachment, log);
    } catch (err) {
      log.error({ err, filename: attachment.name }, "omnichannel: failed to send attachment — skipping");
    }
  }
}

export async function sendDirectWhatsAppMessage(
  tenantId: string,
  phone: string,
  message: string,
  log: Logger
): Promise<void> {
  const [config] = await db
    .select({
      zapiInstanceId: agentConfigsTable.zapiInstanceId,
      zapiToken: agentConfigsTable.zapiToken,
      zapiClientToken: agentConfigsTable.zapiClientToken,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const hasZapi = !!(config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken);
  const hasMeta = !!(config?.metaPhoneNumberId && config?.metaAccessToken);

  if (!hasZapi && !hasMeta) {
    throw new WhatsAppNotConnectedError();
  }

  if (hasZapi) {
    await sendZapiWhatsAppMessage(config!.zapiInstanceId!, config!.zapiToken!, config!.zapiClientToken!, phone, message, log);
  } else {
    await sendMetaWhatsAppMessage(config!.metaPhoneNumberId!, config!.metaAccessToken!, phone, message, log);
  }
}

async function simulateTypingDelay(message: string, log: Logger): Promise<void> {
  const baseMs    = 3000;
  const perChar   = 40;
  const jitterMs  = Math.floor(Math.random() * 3000);
  const totalMs   = Math.min(baseMs + message.length * perChar + jitterMs, 12000);
  log.debug({ totalMs, chars: message.length }, "omnichannel: typing delay");
  await new Promise<void>((r) => setTimeout(r, totalMs));
}

export async function sendOutgoingMessage(
  input: SendOutgoingMessageInput,
  log: Logger
): Promise<SendOutgoingMessageResult> {
  const { tenantId, leadId, conteudo, canal, agentName } = input;

  // ── 0. Demo tenant — no-op: simulate locally without external APIs
  const [tenant] = await db
    .select({ isDemo: tenantsTable.isDemo })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (tenant?.isDemo) {
    log.info({ tenantId, leadId, canal }, "omnichannel: demo tenant — simulating message without external API");
    const [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId, channel: canal, status: "open", naoLidas: 0 })
      .onConflictDoNothing({ target: [conversationsTable.tenantId, conversationsTable.leadId, conversationsTable.channel] })
      .returning();
    // If onConflictDoNothing skipped, fetch the existing conversation
    const resolvedConversation =
      conversation ??
      (await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.tenantId, tenantId),
            eq(conversationsTable.leadId, leadId),
            eq(conversationsTable.channel, canal),
          ),
        )
        .limit(1))[0];
    if (!resolvedConversation) {
      throw new Error("Failed to resolve conversation for demo message");
    }
    const [message] = await db
      .insert(messagesTable)
      .values({
        tenantId,
        conversationId: resolvedConversation.id,
        leadId,
        conteudo,
        direcao: "saida",
        enviadoPor: agentName ? "agente_ia" : "humano",
        agentName: agentName ?? null,
        tipoConteudo: "texto",
        status: "enviado",
        canal,
      })
      .returning();
    return {
      message,
      conversation: resolvedConversation,
      telefoneDestino: null,
    };
  }

  // ── 1. Fetch lead — validate tenant ownership + retrieve telefone/instagramScopedId
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) throw new LeadNotFoundError(leadId);

  // ── 2. WhatsApp: pick provider (Z-API takes priority over Meta) + send
  if (canal === "whatsapp") {
    const [config] = await db
      .select({
        zapiInstanceId: agentConfigsTable.zapiInstanceId,
        zapiToken: agentConfigsTable.zapiToken,
        zapiClientToken: agentConfigsTable.zapiClientToken,
        metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
        metaAccessToken: agentConfigsTable.metaAccessToken,
        whatsappTemplateId: agentConfigsTable.whatsappTemplateId,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    if (!lead.telefone) {
      throw new WhatsAppPhoneMissingError(leadId);
    }

    const hasZapi = !!(config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken);
    const hasMeta = !!(config?.metaPhoneNumberId && config?.metaAccessToken);

    if (!hasZapi && !hasMeta) {
      throw new WhatsAppNotConnectedError();
    }

    if (hasZapi) {
      // ── Z-API path (no 24h window restriction) ───────────────────────────
      await sendZapiWhatsAppMessage(
        config!.zapiInstanceId!,
        config!.zapiToken!,
        config!.zapiClientToken!,
        lead.telefone,
        conteudo,
        log,
        !!agentName
      );
    } else {
      // ── Meta Cloud API path (24h window enforced) ─────────────────────────
      let skipTextSend = false;
      {
        const [existingConv] = await db
          .select({ lastInboundAt: conversationsTable.lastInboundAt })
          .from(conversationsTable)
          .where(
            and(
              eq(conversationsTable.tenantId, tenantId),
              eq(conversationsTable.leadId, leadId),
              eq(conversationsTable.channel, "whatsapp")
            )
          )
          .limit(1);

        // "Inside 24h" only when lastInboundAt is set AND recent.
        // Null / missing lastInboundAt (imported leads, legacy convs, no prior inbound)
        // is treated as outside the window — template required, free-text blocked.
        const windowMs = 24 * 60 * 60 * 1000;
        const lastInboundAt = existingConv?.lastInboundAt;
        const msSinceInbound = lastInboundAt
          ? Date.now() - new Date(lastInboundAt).getTime()
          : Infinity;
        const withinWindow = msSinceInbound <= windowMs;

        if (!withinWindow) {
          const templateId = config!.whatsappTemplateId;
          if (templateId) {
            const normalizedPhone = lead.telefone.replace(/\D/g, "").replace(/^0+/, "");
            const tplUrl = `https://graph.facebook.com/v20.0/${config!.metaPhoneNumberId}/messages`;
            const tplRes = await fetch(tplUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config!.metaAccessToken}`,
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: normalizedPhone,
                type: "template",
                template: { name: templateId, language: { code: "pt_BR" } },
              }),
            });
            const tplBody = await tplRes.json().catch(() => ({})) as Record<string, unknown>;
            if (!tplRes.ok) {
              log.error({ tplBody, phone: lead.telefone }, "omnichannel: meta template send failed (24h window)");
              throw new Error(`Meta WhatsApp Template error ${tplRes.status}: ${JSON.stringify(tplBody)}`);
            }
            log.info(
              { phone: lead.telefone, templateId, noLastInbound: !lastInboundAt },
              "omnichannel: whatsapp template sent (24h window enforced)"
            );
            skipTextSend = true;
          } else {
            const hoursElapsed = isFinite(msSinceInbound)
              ? Math.floor(msSinceInbound / 3600000)
              : null;
            log.warn(
              { tenantId, leadId, hoursElapsed, noLastInbound: !lastInboundAt },
              "omnichannel: 24h Meta window — no template configured, aborting send"
            );
            await db.insert(notificationsTable).values({
              tenantId,
              title: "⚠️ Mensagem WhatsApp não enviada — janela 24h expirada",
              message: `Lead "${lead.nome ?? leadId}" está fora da janela de 24h do Meta. Configure um template de reabertura em Configurações > Integrações para reabrir o contato.`,
              type: "warning",
              category: "whatsapp_24h_window",
            }).catch(() => undefined);
            throw new WhatsApp24hWindowError(leadId);
          }
        }
      }

      if (!skipTextSend) {
        await sendMetaWhatsAppMessage(
          config!.metaPhoneNumberId!,
          config!.metaAccessToken!,
          lead.telefone,
          conteudo,
          log,
          !!agentName
        );
      }
    }
  }

  // ── 3. Instagram: validate credentials + actually send
  if (canal === "instagram") {
    const [config] = await db
      .select({
        instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
        instagramPageId: agentConfigsTable.instagramPageId,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    if (!config?.instagramPageAccessToken) {
      throw new InstagramNotConnectedError();
    }

    if (!lead.instagramScopedId) {
      throw new InstagramScopedIdMissingError(leadId);
    }

    await sendInstagramMessage(
      config.instagramPageAccessToken,
      lead.instagramScopedId,
      conteudo,
      log
    );
  }

  // ── 4. Find or create conversation for leadId + canal
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, leadId),
        eq(conversationsTable.channel, canal)
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId, channel: canal, status: "open", naoLidas: 0 })
      .returning();
    log.info(
      { conversationId: conversation.id, canal },
      "omnichannel: new conversation created"
    );
  }

  // ── 5. Insert outgoing message
  const enviadoPor: "humano" | "agente_ia" = agentName ? "agente_ia" : "humano";

  const [message] = await db
    .insert(messagesTable)
    .values({
      tenantId,
      conversationId: conversation.id,
      leadId,
      direcao: "saida",
      canal,
      conteudo,
      enviadoPor,
      agentName: agentName ?? null,
      tipoConteudo: "texto",
      status: "enviado",
    })
    .returning();

  log.info(
    { messageId: message.id, enviadoPor, canal },
    "omnichannel: outgoing message inserted"
  );

  // ── 6. Update conversation: ultimaMensagemEm
  await db
    .update(conversationsTable)
    .set({ ultimaMensagemEm: new Date(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 7. Auto-complete pending activities when AI sends a message
  if (agentName) {
    const tipoMap: Partial<Record<typeof canal, typeof activitiesTable.tipo._.data>> = {
      whatsapp: "whatsapp",
      email: "email",
    };
    const matchingTipo = tipoMap[canal];
    if (matchingTipo) {
      const pending = await db
        .select({ id: activitiesTable.id })
        .from(activitiesTable)
        .where(
          and(
            eq(activitiesTable.tenantId, tenantId),
            eq(activitiesTable.leadId, leadId),
            eq(activitiesTable.status, "pendente"),
            eq(activitiesTable.tipo, matchingTipo)
          )
        )
        .limit(5);

      if (pending.length > 0) {
        const preview = conteudo.length > 120 ? conteudo.slice(0, 120) + "…" : conteudo;
        const resultado = `Mensagem enviada pelo agente IA (${agentName}): "${preview}"`;
        await db
          .update(activitiesTable)
          .set({
            status: "concluida",
            concluidaEm: new Date(),
            resultadoExecucao: resultado,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(activitiesTable.tenantId, tenantId),
              eq(activitiesTable.leadId, leadId),
              eq(activitiesTable.status, "pendente"),
              eq(activitiesTable.tipo, matchingTipo)
            )
          );
        log.info(
          { count: pending.length, tipo: matchingTipo, agentName },
          "omnichannel: auto-completed pending activities after AI message"
        );
      }
    }
  }

  return { message, conversation, telefoneDestino: lead.telefone ?? null };
}
