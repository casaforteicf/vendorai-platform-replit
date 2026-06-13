import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  leadsTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyToken } from "../lib/jwt.js";

const router: IRouter = Router();

// ── Dual-auth helper ─────────────────────────────────────────────────────────
// Accepts either X-Webhook-Secret (n8n / agents) or Authorization: Bearer JWT
// (frontend). Returns true and sets req.user on JWT path; returns false and
// sends the error response otherwise.
async function dualAuth(
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
      // super_admin can act on any tenant; others must match
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

  // ── 1. Validate webhook secret ──────────────────────────────────────────
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

  // ── 3. Find or create lead by phone ───────────────────────────────────
  let [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(eq(leadsTable.tenantId, tenantId), eq(leadsTable.telefone, telefone))
    )
    .limit(1);

  if (!lead) {
    [lead] = await db
      .insert(leadsTable)
      .values({
        tenantId,
        nome: nome ?? telefone,
        telefone,
        status: "novo",
      })
      .returning();
    req.log.info({ leadId: lead.id, telefone }, "webhook: new lead created");
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
      .values({
        tenantId,
        leadId: lead.id,
        channel: "whatsapp",
        status: "open",
        naoLidas: 0,
      })
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

  // ── 7. Respond ─────────────────────────────────────────────────────────
  res.status(200).json({
    leadId: lead.id,
    conversationId: conversation.id,
    messageId: message.id,
    leadCreated: !lead.updatedAt || lead.createdAt === lead.updatedAt,
  });
});

// ── POST /tenants/:tenantId/messages/send ────────────────────────────────────
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

  const { leadId, conteudo, canal, agentName } = parsed.data;

  // ── 3. Fetch lead (validate ownership + get telefone) ──────────────────
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId))
    )
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  // ── 4. Find or create conversation for leadId + canal ─────────────────
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
      .values({
        tenantId,
        leadId,
        channel: canal,
        status: "open",
        naoLidas: 0,
      })
      .returning();
    req.log.info(
      { conversationId: conversation.id, canal },
      "send: new conversation created"
    );
  }

  // ── 5. Insert outgoing message ─────────────────────────────────────────
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

  req.log.info(
    { messageId: message.id, enviadoPor, canal },
    "send: outgoing message inserted"
  );

  // ── 6. Update conversation: ultimaMensagemEm only (no naoLidas for saida)
  await db
    .update(conversationsTable)
    .set({
      ultimaMensagemEm: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  // ── 7. Respond with message + telefoneDestino for n8n → Z-API ─────────
  res.status(201).json({
    ...message,
    telefoneDestino: lead.telefone ?? null,
  });
});

export default router;
