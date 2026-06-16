import { and, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
  agentConfigsTable,
} from "@workspace/db";
import type { Message, Conversation } from "@workspace/db";
import type { Logger } from "pino";

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
    super("WhatsApp não conectado. Configure as credenciais Z-API em Configurações > Integrações.");
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
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  if (!config?.zapiInstanceId || !config?.zapiToken || !config?.zapiClientToken) {
    throw new WhatsAppNotConnectedError();
  }

  await sendZapiWhatsAppMessage(
    config.zapiInstanceId,
    config.zapiToken,
    config.zapiClientToken,
    phone,
    message,
    log
  );
}

async function sendZapiWhatsAppMessage(
  instanceId: string,
  token: string,
  clientToken: string,
  phone: string,
  message: string,
  log: Logger
): Promise<void> {
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  const normalizedPhone = normalizePhoneBR(phone);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify({ phone: normalizedPhone, message }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log.error({ err, phone }, "omnichannel: zapi send failed");
    throw new Error(`Z-API error: ${JSON.stringify(err)}`);
  }

  log.info({ phone }, "omnichannel: whatsapp message sent via z-api");
}

export async function sendOutgoingMessage(
  input: SendOutgoingMessageInput,
  log: Logger
): Promise<SendOutgoingMessageResult> {
  const { tenantId, leadId, conteudo, canal, agentName } = input;

  // ── 1. Fetch lead — validate tenant ownership + retrieve telefone/instagramScopedId ──
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) throw new LeadNotFoundError(leadId);

  // ── 2. WhatsApp: validate Z-API credentials + actually send ───────────────
  if (canal === "whatsapp") {
    const [config] = await db
      .select({
        zapiInstanceId: agentConfigsTable.zapiInstanceId,
        zapiToken: agentConfigsTable.zapiToken,
        zapiClientToken: agentConfigsTable.zapiClientToken,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    if (!config?.zapiInstanceId || !config?.zapiToken || !config?.zapiClientToken) {
      throw new WhatsAppNotConnectedError();
    }

    if (!lead.telefone) {
      throw new WhatsAppPhoneMissingError(leadId);
    }

    await sendZapiWhatsAppMessage(
      config.zapiInstanceId,
      config.zapiToken,
      config.zapiClientToken,
      lead.telefone,
      conteudo,
      log
    );
  }

  // ── 3. Instagram: validate credentials + actually send ─────────────────────
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

  // ── 4. Find or create conversation for leadId + canal ─────────────────────
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

  // ── 5. Insert outgoing message ─────────────────────────────────────────────
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

  // ── 6. Update conversation: ultimaMensagemEm ───────────────────────────────
  await db
    .update(conversationsTable)
    .set({ ultimaMensagemEm: new Date(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  return { message, conversation, telefoneDestino: lead.telefone ?? null };
}
