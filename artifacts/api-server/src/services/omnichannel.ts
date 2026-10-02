import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
  agentConfigsTable,
  activitiesTable,
  notificationsTable,
  tenantsTable,
  whatsappConnectionsTable,
  instagramConnectionsTable,
} from "@workspace/db";
import type { Message, Conversation } from "@workspace/db";
import type { Logger } from "pino";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { sendEvolutionWhatsAppMessage, sendEvolutionDocument, sendEvolutionMedia } from "./evolution-whatsapp.js";
import { recordIntelligenceEvent, recordIntelligenceFact } from "./customer-intelligence-history.js";

export interface AgentAttachment {
  name: string;
  objectPath: string;
  mimeType: string;
  size?: number;
}

const objectStorage = new ObjectStorageService();

// Busca o buffer de um anexo do nosso object storage — usado pelos
// provedores que exigem bytes em vez de aceitar a URL diretamente
// (Meta precisa fazer upload pro Media API dela primeiro; Evolution
// manda em base64 inline). Z-API e Instagram/Messenger aceitam a URL
// pública direto, não precisam disso.
async function fetchMidiaBuffer(objectPath: string): Promise<Buffer> {
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();
  return buffer;
}

function inferTipoConteudo(mimeType: string): "imagem" | "audio" | "documento" | "video" {
  if (mimeType.startsWith("image/")) return "imagem";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "documento";
}

export interface SendOutgoingMessageInput {
  tenantId: string;
  leadId: string;
  conteudo: string;
  canal: "whatsapp" | "instagram" | "messenger" | "email" | "chat";
  agentName?: string | null;
  instagramConnectionId?: string;
  // Anexo do chat interno (botão de anexar) — quando presente, a
  // mensagem é enviada como mídia em vez de texto no canal escolhido.
  midia?: {
    url: string;       // URL pública absoluta (baseOrigin + /api/storage/...)
    objectPath: string; // caminho no object storage próprio, pra buscar buffer quando o provedor exige (Meta/Evolution)
    mimeType: string;
    fileName: string;
  };
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

export class MessengerNotConnectedError extends Error {
  readonly statusCode = 422;
  constructor() {
    super("Messenger não conectado. Configure o token de acesso da página em Configurações > Integrações.");
    this.name = "MessengerNotConnectedError";
  }
}

export class MessengerScopedIdMissingError extends Error {
  readonly statusCode = 422;
  constructor(leadId: string) {
    super(`Lead "${leadId}" não tem Messenger PSID. O lead precisa ter enviado uma mensagem primeiro via Messenger.`);
    this.name = "MessengerScopedIdMissingError";
  }
}

export class WhatsAppNotConnectedError extends Error {
  readonly statusCode = 422;
  constructor() {
    super("WhatsApp não conectado. Abra Configurações > Integrações e conecte o número lendo o QR Code.");
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

// Instagram DM e Messenger usam o mesmo formato de anexo por URL da
// Graph API (a Meta baixa o arquivo da URL informada, não precisa
// upload prévio) — reutilizado pelos dois abaixo.
function graphAttachmentType(mimeType: string): "image" | "video" | "audio" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

async function sendMetaGraphMedia(
  pageAccessToken: string,
  recipientId: string,
  mediaUrl: string,
  mimeType: string,
  log: Logger,
  logLabel: "instagram" | "messenger",
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/me/messages`;
  const body = {
    recipient: { id: recipientId },
    message: { attachment: { type: graphAttachmentType(mimeType), payload: { url: mediaUrl, is_reusable: false } } },
    messaging_type: "RESPONSE",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pageAccessToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log.error({ err, recipientId }, `omnichannel: ${logLabel} media send failed`);
    throw new Error(`${logLabel} media error: ${JSON.stringify(err)}`);
  }
  log.info({ recipientId, mediaUrl }, `omnichannel: ${logLabel} media sent`);
}

// Messenger usa exatamente o mesmo endpoint da Graph API (/me/messages) —
// só troca o token de página e o campo de log/erro, pra não confundir com
// Instagram nos logs quando os dois estiverem configurados no mesmo tenant.
async function sendMessengerMessage(
  pageAccessToken: string,
  recipientPsid: string,
  messageText: string,
  log: Logger
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/me/messages`;
  const body = {
    recipient: { id: recipientPsid },
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
    log.error({ err, recipientPsid }, "omnichannel: messenger send failed");
    throw new Error(`Messenger API error: ${JSON.stringify(err)}`);
  }

  log.info({ recipientPsid }, "omnichannel: messenger message sent");
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

// Z-API aceita URL pública direta (não precisa baixar+base64) pra
// imagem/áudio/vídeo — confirmado na doc oficial (developer.z-api.io).
// Documento usa /send-document/{ext} com base64 (padrão já validado em
// produção via sendZapiDocument); os outros usam endpoint próprio por
// tipo com o campo nomeado igual ao tipo (image/audio/video).
async function sendZapiMediaByUrl(
  instanceId: string,
  token: string,
  clientToken: string,
  phone: string,
  mediaUrl: string,
  mimeType: string,
  fileName: string,
  caption: string,
  log: Logger,
): Promise<void> {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const normalized = digits.startsWith("55") ? digits : "55" + digits;
  const base = `https://api.z-api.io/instances/${instanceId}/token/${token}`;

  let endpoint: string;
  let field: string;
  if (mimeType.startsWith("image/")) { endpoint = "send-image"; field = "image"; }
  else if (mimeType.startsWith("video/")) { endpoint = "send-video"; field = "video"; }
  else if (mimeType.startsWith("audio/")) { endpoint = "send-audio"; field = "audio"; }
  else {
    const ext = (fileName.split(".").pop() || "pdf").toLowerCase();
    endpoint = `send-document/${ext}`;
    field = "document";
  }

  const res = await fetch(`${base}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": clientToken },
    body: JSON.stringify({ phone: normalized, [field]: mediaUrl, ...(field === "document" ? { fileName, caption } : { caption }) }),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ body, phone: normalized, endpoint }, "omnichannel: zapi media send failed");
    throw new Error(`Z-API ${endpoint} error ${res.status}: ${JSON.stringify(body)}`);
  }
  log.info({ phone: normalized, fileName, endpoint }, "omnichannel: media sent via z-api");
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
      evolutionInstanceName: agentConfigsTable.evolutionInstanceName,
      evolutionConnected:    agentConfigsTable.evolutionConnected,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken:   agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const hasZapi = !!(config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken);
  const hasEvolution = !!(config?.evolutionInstanceName && config?.evolutionConnected);
  const hasMeta = !!(config?.metaPhoneNumberId && config?.metaAccessToken);

  if (!hasZapi && !hasEvolution && !hasMeta) {
    log.warn({ tenantId }, "omnichannel: no credentials for document send — skipping PDF");
    return;
  }

  if (hasEvolution) {
    await sendEvolutionDocument(config!.evolutionInstanceName!, phone, pdfBuffer, fileName, caption, log);
  } else if (hasZapi) {
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
): Promise<string | undefined> {
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
  return metaMessageId;
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
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const messageBody = metaMediaMessageBody(normalizedPhone, mediaId, attachment.mimeType, attachment.name);

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

  log.info({ phone, filename: attachment.name, mimeType: attachment.mimeType }, "omnichannel: whatsapp media sent");
}

// Monta o corpo da mensagem de mídia da Cloud API por tipo — imagem,
// vídeo e áudio usam o campo próprio (sem "filename", a Meta ignora),
// qualquer outro mimetype vira documento (único tipo que aceita
// "filename"/nome do arquivo visível pro destinatário).
function metaMediaMessageBody(to: string, mediaId: string, mimeType: string, fileName: string): Record<string, unknown> {
  if (mimeType.startsWith("image/")) return { messaging_product: "whatsapp", to, type: "image", image: { id: mediaId, caption: fileName } };
  if (mimeType.startsWith("video/")) return { messaging_product: "whatsapp", to, type: "video", video: { id: mediaId, caption: fileName } };
  if (mimeType.startsWith("audio/")) return { messaging_product: "whatsapp", to, type: "audio", audio: { id: mediaId } };
  return { messaging_product: "whatsapp", to, type: "document", document: { id: mediaId, filename: fileName } };
}

// Generaliza sendMetaWhatsAppMedia pra qualquer buffer (não só anexo do
// agente via objectPath) — usado pelo botão de anexar do chat interno.
async function sendMetaMediaByBuffer(
  phoneNumberId: string,
  accessToken: string,
  phone: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  log: Logger,
): Promise<void> {
  const normalizedPhone = phone.replace(/\D/g, "").replace(/^0+/, "");
  const mediaId = await uploadMediaToMeta(phoneNumberId, accessToken, buffer, mimeType, fileName, log);
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(metaMediaMessageBody(normalizedPhone, mediaId, mimeType, fileName)),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    log.error({ data, phone }, "omnichannel: meta media send failed");
    throw new Error(`Meta WhatsApp Media error ${res.status}: ${JSON.stringify(data)}`);
  }
  log.info({ phone, fileName, mimeType }, "omnichannel: media sent via meta");
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
    .select({
      evolutionInstanceName: agentConfigsTable.evolutionInstanceName,
      evolutionConnected: agentConfigsTable.evolutionConnected,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const hasEvolution = !!(config?.evolutionInstanceName && config?.evolutionConnected);
  const hasMeta = !!(config?.metaPhoneNumberId && config?.metaAccessToken);

  if (!hasEvolution && !hasMeta) {
    log.warn({ tenantId }, "omnichannel: skipping attachments — WhatsApp QR not connected and no legacy Meta fallback");
    return;
  }

  for (const attachment of attachments) {
    try {
      if (hasEvolution) {
        const buffer = await fetchMidiaBuffer(attachment.objectPath);
        await sendEvolutionMedia(
          config!.evolutionInstanceName!,
          phone,
          buffer,
          attachment.mimeType,
          attachment.name,
          attachment.name,
          log,
        );
      } else {
        await sendMetaWhatsAppMedia(config!.metaPhoneNumberId!, config!.metaAccessToken!, phone, attachment, log);
      }
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
): Promise<string | undefined> {
  const [config] = await db
    .select({
      zapiInstanceId: agentConfigsTable.zapiInstanceId,
      zapiToken: agentConfigsTable.zapiToken,
      zapiClientToken: agentConfigsTable.zapiClientToken,
      evolutionInstanceName: agentConfigsTable.evolutionInstanceName,
      evolutionConnected: agentConfigsTable.evolutionConnected,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const hasZapi = !!(config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken);
  const hasEvolution = !!(config?.evolutionInstanceName && config?.evolutionConnected);
  const hasMeta = !!(config?.metaPhoneNumberId && config?.metaAccessToken);

  if (!hasZapi && !hasEvolution && !hasMeta) {
    throw new WhatsAppNotConnectedError();
  }

  if (hasEvolution) {
    await sendEvolutionWhatsAppMessage(config!.evolutionInstanceName!, phone, message, log);
    return undefined;
  } else if (hasZapi) {
    await sendZapiWhatsAppMessage(config!.zapiInstanceId!, config!.zapiToken!, config!.zapiClientToken!, phone, message, log);
    return undefined;
  } else {
    return sendMetaWhatsAppMessage(config!.metaPhoneNumberId!, config!.metaAccessToken!, phone, message, log);
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
        tipoConteudo: input.midia ? inferTipoConteudo(input.midia.mimeType) : "texto",
        midiaUrl: input.midia?.url ?? null,
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

  let selectedWhatsappConnection: typeof whatsappConnectionsTable.$inferSelect | null = null;
  if (canal === "whatsapp") {
    const [latestConversation] = await db.select({ whatsappConnectionId: conversationsTable.whatsappConnectionId })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, leadId), eq(conversationsTable.channel, "whatsapp")))
      .orderBy(desc(conversationsTable.ultimaMensagemEm))
      .limit(1);
    const connections = await db.select().from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")));
    const evolutionConnections = connections.filter((connection) => connection.provider === "evolution");
    selectedWhatsappConnection =
      evolutionConnections.find((connection) => connection.id === latestConversation?.whatsappConnectionId) ??
      evolutionConnections.find((connection) => connection.assignedUserId === lead.assignedTo) ??
      evolutionConnections.find((connection) => connection.isDefault) ??
      evolutionConnections[0] ??
      connections.find((connection) => connection.id === latestConversation?.whatsappConnectionId) ??
      connections.find((connection) => connection.assignedUserId === lead.assignedTo) ??
      connections.find((connection) => connection.isDefault) ??
      connections[0] ??
      null;
  }
  // ── 2. WhatsApp: QR/Evolution é o provedor padrão; Z-API e Meta são fallback legado
  if (canal === "whatsapp") {
    const [config] = await db
      .select({
        zapiInstanceId: agentConfigsTable.zapiInstanceId,
        zapiToken: agentConfigsTable.zapiToken,
        zapiClientToken: agentConfigsTable.zapiClientToken,
        evolutionInstanceName: agentConfigsTable.evolutionInstanceName,
        evolutionConnected: agentConfigsTable.evolutionConnected,
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

    const hasZapi = !selectedWhatsappConnection && !!(config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken);
    const evolutionInstance = selectedWhatsappConnection?.provider === "evolution" ? selectedWhatsappConnection.evolutionInstanceName : config?.evolutionInstanceName;
    const hasEvolution = !!evolutionInstance && (
      selectedWhatsappConnection?.provider === "evolution" || config?.evolutionConnected === true
    );
    const metaPhoneNumberId = selectedWhatsappConnection?.provider === "meta" ? selectedWhatsappConnection.phoneNumberId : config?.metaPhoneNumberId;
    const metaAccessToken = selectedWhatsappConnection?.provider === "meta" ? selectedWhatsappConnection.accessToken : config?.metaAccessToken;
    const hasMeta = !!(metaPhoneNumberId && metaAccessToken);

    if (!hasZapi && !hasEvolution && !hasMeta) {
      throw new WhatsAppNotConnectedError();
    }

    if (hasEvolution) {
      // ── Evolution API path (QR Code padrão, sem restrição de janela de 24h) ──
      if (input.midia) {
        const buffer = await fetchMidiaBuffer(input.midia.objectPath);
        await sendEvolutionMedia(evolutionInstance!, lead.telefone, buffer, input.midia.mimeType, input.midia.fileName, conteudo, log);
      } else {
        await sendEvolutionWhatsAppMessage(evolutionInstance!, lead.telefone, conteudo, log);
      }
    } else if (hasZapi) {
      // ── Z-API path legado (fallback) ──────────────────────────────────────
      if (input.midia) {
        await sendZapiMediaByUrl(
          config!.zapiInstanceId!, config!.zapiToken!, config!.zapiClientToken!,
          lead.telefone, input.midia.url, input.midia.mimeType, input.midia.fileName, conteudo, log,
        );
      } else {
        await sendZapiWhatsAppMessage(
          config!.zapiInstanceId!,
          config!.zapiToken!,
          config!.zapiClientToken!,
          lead.telefone,
          conteudo,
          log,
          !!agentName
        );
      }
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
            const tplUrl = `https://graph.facebook.com/v20.0/${metaPhoneNumberId}/messages`;
            const tplRes = await fetch(tplUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${metaAccessToken}`,
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
        if (input.midia) {
          const buffer = await fetchMidiaBuffer(input.midia.objectPath);
          await sendMetaMediaByBuffer(metaPhoneNumberId!, metaAccessToken!, lead.telefone, buffer, input.midia.mimeType, input.midia.fileName, log);
        } else {
          await sendMetaWhatsAppMessage(
            metaPhoneNumberId!,
            metaAccessToken!,
            lead.telefone,
            conteudo,
            log,
            !!agentName
          );
        }
      }
    }
  }

  // ── 3. Instagram: validate credentials + actually send
  if (canal === "instagram") {
    const [latestInstagramConversation] = await db
      .select({ metadata: conversationsTable.metadata })
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, leadId),
        eq(conversationsTable.channel, "instagram"),
      ))
      .orderBy(desc(conversationsTable.ultimaMensagemEm))
      .limit(1);

    const instagramMetadata = latestInstagramConversation?.metadata && typeof latestInstagramConversation.metadata === "object"
      ? latestInstagramConversation.metadata as Record<string, unknown>
      : {};
    const routedConnectionId =
      input.instagramConnectionId ||
      (typeof instagramMetadata["instagramConnectionId"] === "string"
        ? instagramMetadata["instagramConnectionId"] as string
        : undefined);
    const routedScopedId =
      typeof instagramMetadata["instagramScopedId"] === "string"
        ? instagramMetadata["instagramScopedId"] as string
        : lead.instagramScopedId;

    const [selectedConnection] = await db
      .select({
        id: instagramConnectionsTable.id,
        accessToken: instagramConnectionsTable.pageAccessToken,
      })
      .from(instagramConnectionsTable)
      .where(routedConnectionId
        ? and(
            eq(instagramConnectionsTable.tenantId, tenantId),
            eq(instagramConnectionsTable.id, routedConnectionId),
            isNull(instagramConnectionsTable.disconnectedAt),
          )
        : and(
            eq(instagramConnectionsTable.tenantId, tenantId),
            isNull(instagramConnectionsTable.disconnectedAt),
          ))
      .limit(1);

    const [legacyConfig] = await db
      .select({
        instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    const instagramAccessToken = selectedConnection?.accessToken ?? legacyConfig?.instagramPageAccessToken;
    if (!instagramAccessToken) {
      throw new InstagramNotConnectedError();
    }

    if (!routedScopedId) {
      throw new InstagramScopedIdMissingError(leadId);
    }

    if (input.midia) {
      await sendMetaGraphMedia(instagramAccessToken, routedScopedId, input.midia.url, input.midia.mimeType, log, "instagram");
    } else {
      await sendInstagramMessage(
        instagramAccessToken,
        routedScopedId,
        conteudo,
        log
      );
    }
  }

  // ── 3b. Messenger: validate credentials + actually send
  if (canal === "messenger") {
    const [config] = await db
      .select({
        messengerPageAccessToken: agentConfigsTable.messengerPageAccessToken,
        messengerPageId: agentConfigsTable.messengerPageId,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    if (!config?.messengerPageAccessToken) {
      throw new MessengerNotConnectedError();
    }

    if (!lead.messengerScopedId) {
      throw new MessengerScopedIdMissingError(leadId);
    }

    if (input.midia) {
      await sendMetaGraphMedia(config.messengerPageAccessToken, lead.messengerScopedId, input.midia.url, input.midia.mimeType, log, "messenger");
    } else {
      await sendMessengerMessage(
        config.messengerPageAccessToken,
        lead.messengerScopedId,
        conteudo,
        log
      );
    }
  }

  // ── 4. Find or create conversation for leadId + canal
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.tenantId, tenantId),
        eq(conversationsTable.leadId, leadId),
        eq(conversationsTable.channel, canal),
        ...(canal === "whatsapp" && selectedWhatsappConnection ? [eq(conversationsTable.whatsappConnectionId, selectedWhatsappConnection.id)] : [])
      )
    )
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({ tenantId, leadId, channel: canal, status: "open", naoLidas: 0, assignedTo: canal === "whatsapp" ? selectedWhatsappConnection?.assignedUserId ?? lead.assignedTo : null, whatsappConnectionId: canal === "whatsapp" ? selectedWhatsappConnection?.id ?? null : null })
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
      tipoConteudo: input.midia ? inferTipoConteudo(input.midia.mimeType) : "texto",
      midiaUrl: input.midia?.url ?? null,
      status: "enviado",
    })
    .returning();

  log.info(
    { messageId: message.id, enviadoPor, canal },
    "omnichannel: outgoing message inserted"
  );

  void recordIntelligenceEvent({
    tenantId,
    leadId,
    eventType: "message_sent",
    title: `Mensagem enviada via ${canal}`,
    summary: conteudo.slice(0, 500),
    sourceModule: "messages",
    sourceId: message.id,
    metadata: { canal, enviadoPor, agentName: agentName ?? null },
    log,
  });
  void recordIntelligenceFact({
    tenantId,
    leadId,
    kind: "evento_operacional",
    factKey: "ultima_interacao_saida",
    value: { canal, conteudo: conteudo.slice(0, 1000), em: new Date().toISOString(), agentName: agentName ?? null },
    sourceType: "mensagem",
    sourceModule: "messages",
    sourceId: message.id,
    title: "Última interação de saída",
    log,
  });

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
