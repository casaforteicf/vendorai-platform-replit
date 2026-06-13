import { and, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
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

export async function sendOutgoingMessage(
  input: SendOutgoingMessageInput,
  log: Logger
): Promise<SendOutgoingMessageResult> {
  const { tenantId, leadId, conteudo, canal, agentName } = input;

  // ── 1. Fetch lead — validate tenant ownership + retrieve telefone ──────
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) throw new LeadNotFoundError(leadId);

  // ── 2. Find or create conversation for leadId + canal ─────────────────
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

  // ── 3. Insert outgoing message ─────────────────────────────────────────
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

  // ── 4. Update conversation: ultimaMensagemEm (no naoLidas for saida) ───
  await db
    .update(conversationsTable)
    .set({ ultimaMensagemEm: new Date(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  return { message, conversation, telefoneDestino: lead.telefone ?? null };
}
