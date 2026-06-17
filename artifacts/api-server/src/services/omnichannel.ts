import { and, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
  agentConfigsTable,
  activitiesTable,
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

async function sendMetaWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  phone: string,
  message: string,
  log: Logger,
  isAiResponse = false
): Promise<void> {
  if (isAiResponse) await simulateTypingDelay(message, log);

  // Meta requires international digits only, no "+"
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

export async function sendDirectWhatsAppMessage(
  tenantId: string,
  phone: string,
  message: string,
  log: Logger
): Promise<void> {
  const [config] = await db
    .select({
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
      zapiInstanceId: agentConfigsTable.zapiInstanceId,
      zapiToken: agentConfigsTable.zapiToken,
      zapiClientToken: agentConfigsTable.zapiClientToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  // Prefer Meta Cloud API; fall back to Z-API if still configured
  if (config?.metaPhoneNumberId && config?.metaAccessToken) {
    await sendMetaWhatsAppMessage(config.metaPhoneNumberId, config.metaAccessToken, phone, message, log);
  } else if (config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken) {
    await sendZapiWhatsAppMessage(config.zapiInstanceId, config.zapiToken, config.zapiClientToken, phone, message, log);
  } else {
    throw new WhatsAppNotConnectedError();
  }
}

// ── Anti-ban: typing delay ────────────────────────────────────────────────────
// Simula o tempo que um humano levaria para digitar a mensagem.
// Só é chamado em respostas de IA (agentName definido).
// Fórmula: base 3s + 40 ms/char + jitter 0–3s, limitado a 12s.
async function simulateTypingDelay(message: string, log: Logger): Promise<void> {
  const baseMs    = 3000;
  const perChar   = 40;
  const jitterMs  = Math.floor(Math.random() * 3000);
  const totalMs   = Math.min(baseMs + message.length * perChar + jitterMs, 12000);
  log.debug({ totalMs, chars: message.length }, "omnichannel: typing delay");
  await new Promise<void>((r) => setTimeout(r, totalMs));
}

async function sendZapiWhatsAppMessage(
  instanceId: string,
  token: string,
  clientToken: string,
  phone: string,
  message: string,
  log: Logger,
  isAiResponse = false
): Promise<void> {
  // ── Anti-ban: typing delay para respostas de IA ──────────────────────────
  if (isAiResponse) await simulateTypingDelay(message, log);

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

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    log.error({ body, phone }, "omnichannel: zapi send failed (non-2xx)");
    throw new Error(`Z-API error ${res.status}: ${JSON.stringify(body)}`);
  }

  // Z-API returns HTTP 200 with {"value": false} when the instance is not connected
  // or the phone number is invalid — treat this as a hard failure.
  if (body.value === false) {
    log.error({ body, phone }, "omnichannel: zapi returned value=false (instance not connected or invalid phone)");
    throw new Error(`Z-API rejected message: ${JSON.stringify(body)}`);
  }

  log.info({ phone, zaapId: body.zaapId ?? body.id }, "omnichannel: whatsapp message sent via z-api");
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

  // ── 2. WhatsApp: validate credentials + actually send ─────────────────────
  if (canal === "whatsapp") {
    const [config] = await db
      .select({
        metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
        metaAccessToken: agentConfigsTable.metaAccessToken,
        zapiInstanceId: agentConfigsTable.zapiInstanceId,
        zapiToken: agentConfigsTable.zapiToken,
        zapiClientToken: agentConfigsTable.zapiClientToken,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1);

    if (!lead.telefone) {
      throw new WhatsAppPhoneMissingError(leadId);
    }

    // agentName definido = resposta do IA → aplica typing delay anti-ban
    if (config?.metaPhoneNumberId && config?.metaAccessToken) {
      await sendMetaWhatsAppMessage(
        config.metaPhoneNumberId,
        config.metaAccessToken,
        lead.telefone,
        conteudo,
        log,
        !!agentName
      );
    } else if (config?.zapiInstanceId && config?.zapiToken && config?.zapiClientToken) {
      await sendZapiWhatsAppMessage(
        config.zapiInstanceId,
        config.zapiToken,
        config.zapiClientToken,
        lead.telefone,
        conteudo,
        log,
        !!agentName
      );
    } else {
      throw new WhatsAppNotConnectedError();
    }
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

  // ── 7. Auto-complete pending activities when AI sends a message ────────────
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
