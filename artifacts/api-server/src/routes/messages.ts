import { Router, type IRouter, type Request } from "express";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  messagesTable,
  mediaAssetsTable,
  insertMessageSchema,
  updateMessageSchema,
} from "@workspace/db";
import { maybeReanalyze } from "../lib/analyze-intelligence.js";
import { recordIntelligenceEvent, recordIntelligenceFact } from "../services/customer-intelligence-history.js";
import { resolveStageQuestionsFromInboundMessage } from "../services/stage-question-resolution.js";
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
const uploadedMidiaSchema = z.object({
  url: z.string().min(1),
  objectPath: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
});

// A Biblioteca envia somente o ID do ativo. O servidor resolve os demais
// campos dentro do tenant para impedir referência cruzada entre clientes e
// evitar confiar em objectPath/URL enviados pelo navegador.
const libraryMidiaSchema = z.object({
  mediaAssetId: z.string().min(1),
});

const midiaSchema = z.union([uploadedMidiaSchema, libraryMidiaSchema]);

type ResolvedMidia = z.infer<typeof uploadedMidiaSchema>;

function requestBaseOrigin(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = forwardedHost || req.get("host") || "localhost";
  return `${protocol}://${host}`;
}

async function resolveMidia(
  req: Request,
  tenantId: string,
  rawMidia: unknown,
): Promise<ResolvedMidia | undefined> {
  const parsed = midiaSchema.safeParse(rawMidia);
  if (!parsed.success) return undefined;

  if ("url" in parsed.data) return parsed.data;

  const [asset] = await db
    .select({
      id: mediaAssetsTable.id,
      storageUrl: mediaAssetsTable.storageUrl,
      mimeType: mediaAssetsTable.mimeType,
      originalFilename: mediaAssetsTable.originalFilename,
    })
    .from(mediaAssetsTable)
    .where(
      and(
        eq(mediaAssetsTable.id, parsed.data.mediaAssetId),
        eq(mediaAssetsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!asset) throw new Error("MEDIA_ASSET_NOT_FOUND");
  if (!asset.storageUrl?.startsWith("/objects/")) throw new Error("MEDIA_ASSET_NOT_INTERNAL");

  return {
    url: `${requestBaseOrigin(req)}/api/storage${asset.storageUrl}`,
    objectPath: asset.storageUrl,
    mimeType: asset.mimeType || "application/octet-stream",
    fileName: asset.originalFilename || `midia-${asset.id}`,
  };
}

router.post("/messages", async (req, res): Promise<void> => {
  const parsed = insertMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  let midia: ResolvedMidia | undefined;
  try {
    midia = await resolveMidia(req, parsed.data.tenantId, req.body?.midia);
  } catch (error) {
    if (error instanceof Error && error.message === "MEDIA_ASSET_NOT_FOUND") {
      res.status(404).json({ error: "Mídia da Biblioteca não encontrada neste tenant." });
      return;
    }
    if (error instanceof Error && error.message === "MEDIA_ASSET_NOT_INTERNAL") {
      res.status(422).json({ error: "Esta mídia ainda não possui arquivo interno reutilizável no Object Storage." });
      return;
    }
    throw error;
  }

  const { tenantId, leadId, canal, direcao, conteudo } = parsed.data;

  // For outgoing WhatsApp / Instagram messages, dispatch via omnichannel
  // (which handles actual delivery + DB insert in one step).
  if (direcao === "saida" && (canal === "whatsapp" || canal === "instagram") && leadId) {
    try {
      const { message } = await sendOutgoingMessage(
        { tenantId, leadId, conteudo, canal, midia, instagramConnectionId: typeof req.body?.instagramConnectionId === "string" ? req.body.instagramConnectionId : undefined },
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

  void recordIntelligenceEvent({
    tenantId: parsed.data.tenantId,
    leadId: parsed.data.leadId,
    eventType: parsed.data.direcao === "entrada" ? "message_received" : "message_sent",
    title: parsed.data.direcao === "entrada"
      ? `Mensagem recebida via ${parsed.data.canal}`
      : `Mensagem enviada via ${parsed.data.canal}`,
    summary: parsed.data.conteudo?.slice(0, 500) ?? null,
    sourceModule: "messages",
    sourceId: message.id,
    metadata: { canal: parsed.data.canal, direcao: parsed.data.direcao },
    log: req.log,
  });

  if (parsed.data.direcao === "entrada") {
    void resolveStageQuestionsFromInboundMessage({
      tenantId: parsed.data.tenantId,
      leadId: parsed.data.leadId,
      messageId: message.id,
      message: parsed.data.conteudo,
      log: req.log,
    }).catch((err) => {
      req.log.warn({ err, messageId: message.id }, "customer-intelligence: stage question resolution failed (non-fatal)");
    });

    void recordIntelligenceFact({
      tenantId: parsed.data.tenantId,
      leadId: parsed.data.leadId,
      kind: "declaracao_cliente",
      factKey: "ultima_interacao_cliente",
      value: {
        canal: parsed.data.canal,
        conteudo: parsed.data.conteudo?.slice(0, 1000) ?? "",
        em: new Date().toISOString(),
      },
      sourceType: "mensagem",
      sourceModule: "messages",
      sourceId: message.id,
      title: "Última interação recebida do cliente",
      log: req.log,
    });
  }

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