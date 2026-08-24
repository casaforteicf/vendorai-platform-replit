import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  messagesTable,
  insertMessageSchema,
  updateMessageSchema,
} from "@workspace/db";
import { maybeReanalyze } from "../lib/analyze-intelligence.js";
import {
  sendOutgoingMessage,
  WhatsAppNotConnectedError,
  WhatsAppPhoneMissingError,
  InstagramNotConnectedError,
  InstagramScopedIdMissingError,
  LeadNotFoundError,
} from "../services/omnichannel.js";

const router: IRouter = Router();

// Anexo do botão de anexar do chat interno — não faz parte da tabela
// messages em si (midiaUrl na tabela é preenchido pelo omnichannel
// depois do envio), então valida separado do insertMessageSchema.
const midiaSchema = z.object({
  url: z.string().min(1),
  objectPath: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
});

router.post("/messages", async (req, res): Promise<void> => {
  const parsed = insertMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const midiaParsed = midiaSchema.safeParse(req.body?.midia);
  const midia = midiaParsed.success ? midiaParsed.data : undefined;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const { tenantId, leadId, canal, direcao, conteudo } = parsed.data;

  // For outgoing WhatsApp / Instagram messages, dispatch via omnichannel
  // (which handles actual delivery + DB insert in one step).
  if (direcao === "saida" && (canal === "whatsapp" || canal === "instagram") && leadId) {
    try {
      const { message } = await sendOutgoingMessage(
        { tenantId, leadId, conteudo, canal, midia },
        req.log
      );
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof WhatsAppNotConnectedError) {
        res.status(422).json({ error: "WhatsApp não configurado para este tenant. Configure as credenciais Z-API em Configurações." });
        return;
      }
      if (err instanceof WhatsAppPhoneMissingError) {
        res.status(422).json({ error: "Este lead não possui número de telefone cadastrado." });
        return;
      }
      if (err instanceof InstagramNotConnectedError) {
        res.status(422).json({ error: "Instagram não configurado para este tenant. Configure o token em Configurações." });
        return;
      }
      if (err instanceof InstagramScopedIdMissingError) {
        res.status(422).json({ error: "Este lead não possui ID do Instagram. A conversa deve ter sido iniciada pelo lead via webhook." });
        return;
      }
      if (err instanceof LeadNotFoundError) {
        res.status(404).json({ error: "Lead não encontrado." });
        return;
      }
      req.log.error({ err }, "messages: unexpected error sending outgoing message");
      res.status(500).json({ error: "Falha ao enviar mensagem. Verifique as configurações do canal." });
      return;
    }

    maybeReanalyze({ tenantId, leadId, log: req.log });
    return;
  }

  // All other cases (incoming, chat channel, agent inserts): plain DB insert.
  const [message] = await db
    .insert(messagesTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(message);

  // Fire-and-forget: check whether this lead's intelligence is stale or has
  // accumulated enough new messages to warrant automatic re-analysis.
  maybeReanalyze({
    tenantId: parsed.data.tenantId,
    leadId:   parsed.data.leadId,
    log:      req.log,
  });
});

router.get(
  "/tenants/:tenantId/conversations/:conversationId/messages",
  async (req, res) => {
    const messages = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.tenantId, String(req.params.tenantId)),
          eq(messagesTable.conversationId, String(req.params.conversationId))
        )
      )
      .orderBy(asc(messagesTable.createdAt));

    res.json(messages);
  }
);

router.get("/tenants/:tenantId/messages", async (req, res) => {
  const { conversationId, leadId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(messagesTable.tenantId, String(req.params.tenantId))];
  if (conversationId) conditions.push(eq(messagesTable.conversationId, conversationId));
  if (leadId) conditions.push(eq(messagesTable.leadId, leadId));

  const messages = await db
    .select()
    .from(messagesTable)
    .where(and(...conditions))
    .orderBy(asc(messagesTable.createdAt));

  res.json(messages);
});

router.get("/messages/:id", async (req, res) => {
  const [message] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, String(req.params.id)));

  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  res.json(message);
});

router.patch("/messages/:id", async (req, res) => {
  const parsed = updateMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: messagesTable.id, tenantId: messagesTable.tenantId })
    .from(messagesTable)
    .where(eq(messagesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [message] = await db
    .update(messagesTable)
    .set(parsed.data)
    .where(eq(messagesTable.id, existing.id))
    .returning();

  res.json(message);
});

router.delete("/messages/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: messagesTable.id, tenantId: messagesTable.tenantId })
    .from(messagesTable)
    .where(eq(messagesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(messagesTable).where(eq(messagesTable.id, existing.id));

  res.status(204).send();
});

export default router;
