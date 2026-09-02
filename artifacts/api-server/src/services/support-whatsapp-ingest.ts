import { and, desc, eq } from "drizzle-orm";
import {
  activitiesTable,
  db,
  usersTable,
  workCardAttachmentsTable,
  workCardsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";

const objectStorage = new ObjectStorageService();

const CLOSED_SUPPORT_STAGES = new Set(["fechamento_assistencia", "cancelado"]);

type LogLike = {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

export type TechnicianSupportIngestInput = {
  tenantId: string;
  phone: string;
  text: string;
  mediaUrl?: string | null;
  mediaType?: "texto" | "audio" | "imagem" | "video" | "documento";
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  transcription?: string | null;
  sourceMessageId?: string | null;
  provider: "normalized" | "zapi" | "evolution" | "meta";
  log: LogLike;
};

export type TechnicianSupportIngestResult =
  | { handled: false }
  | {
      handled: true;
      reason: "attached" | "internal_user_without_case" | "ambiguous_case" | "case_not_assigned";
      technicianId: string;
      cardId?: string;
      codigo?: string;
      attachmentId?: string | null;
    };

function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // Brasil: tolera presença/ausência do DDI 55, mas exige pelo menos 10 dígitos
  // para não gerar falso positivo com ramais ou números incompletos.
  if (Math.min(da.length, db.length) < 10) return false;
  return da.endsWith(db) || db.endsWith(da) || da.slice(-11) === db.slice(-11);
}

function extractAssistenciaCode(text: string): string | null {
  return text.match(/\bAST-[A-Z0-9]+-[A-Z0-9]+\b/i)?.[0]?.toUpperCase() ?? null;
}

function attachmentCategory(mimeType: string | null | undefined) {
  if (mimeType?.startsWith("image/")) return "imagem" as const;
  if (mimeType?.includes("pdf") || mimeType?.includes("word") || mimeType?.includes("document")) {
    return "documento" as const;
  }
  return "outras_informacoes" as const;
}

async function persistExternalMedia(input: {
  url: string;
  mimeType?: string | null;
  fileName?: string | null;
  log: LogLike;
}): Promise<{ url: string; mimeType: string | null; size: number | null }> {
  // Evolution já salva em /api/storage antes de chegar aqui. Não copia de novo.
  if (input.url.startsWith("/api/storage") || input.url.includes("/api/storage/")) {
    return { url: input.url, mimeType: input.mimeType ?? null, size: null };
  }

  try {
    const response = await fetch(input.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = input.mimeType || response.headers.get("content-type") || "application/octet-stream";
    const objectPath = await objectStorage.savePrivateBuffer(
      buffer,
      mimeType,
      input.fileName || "whatsapp-anexo.bin",
    );
    return { url: `/api/storage${objectPath}`, mimeType, size: buffer.length };
  } catch (error) {
    input.log.warn({ err: error, url: input.url }, "support-whatsapp: mídia externa não pôde ser persistida; mantendo URL original");
    return { url: input.url, mimeType: input.mimeType ?? null, size: null };
  }
}

async function replyAmbiguousCases(input: {
  tenantId: string;
  phone: string;
  technicianName: string;
  cards: Array<{ codigo: string; titulo: string }>;
  log: LogLike;
}) {
  const lines = input.cards.slice(0, 5).map((card) => `• ${card.codigo} — ${card.titulo}`);
  const text = [
    `Olá, ${input.technicianName}. Você tem mais de uma assistência ativa.`,
    "Para eu anexar sua atualização no chamado certo, reenvie a mensagem começando pelo código AST correspondente:",
    ...lines,
    input.cards.length > 5 ? `• +${input.cards.length - 5} chamado(s) no VendorAI` : null,
  ].filter(Boolean).join("\n");

  try {
    await sendDirectWhatsAppMessage(input.tenantId, input.phone, text, input.log as any);
  } catch (error) {
    input.log.warn({ err: error }, "support-whatsapp: não foi possível pedir desambiguação ao técnico");
  }
}

/**
 * Intercepta mensagens recebidas de números cadastrados em users.telefone.
 * Se houver assistência atribuída ao usuário, registra a atualização no card e
 * na timeline do cliente. Isso acontece ANTES do fluxo de deduplicação de lead,
 * evitando que o técnico vire lead por mandar áudio/foto/texto para o WhatsApp
 * oficial do tenant.
 */
export async function tryIngestTechnicianSupportMessage(
  input: TechnicianSupportIngestInput,
): Promise<TechnicianSupportIngestResult> {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      telefone: usersTable.telefone,
      active: usersTable.active,
    })
    .from(usersTable)
    .where(eq(usersTable.tenantId, input.tenantId));

  const technician = users.find((user) => user.active && user.telefone && samePhone(user.telefone, input.phone));
  if (!technician) return { handled: false };

  const assignedCards = await db
    .select()
    .from(workCardsTable)
    .where(and(
      eq(workCardsTable.tenantId, input.tenantId),
      eq(workCardsTable.pipeline, "suporte"),
      eq(workCardsTable.responsavelId, technician.id),
    ))
    .orderBy(desc(workCardsTable.updatedAt), desc(workCardsTable.createdAt));

  const activeCards = assignedCards.filter((card) => !CLOSED_SUPPORT_STAGES.has(card.etapa));
  if (activeCards.length === 0) {
    input.log.info(
      { tenantId: input.tenantId, technicianId: technician.id },
      "support-whatsapp: usuário interno identificado, mas sem assistência ativa",
    );
    return { handled: true, reason: "internal_user_without_case", technicianId: technician.id };
  }

  const requestedCode = extractAssistenciaCode(input.text);
  let card = requestedCode
    ? activeCards.find((candidate) => candidate.codigo.toUpperCase() === requestedCode)
    : undefined;

  if (requestedCode && !card) {
    try {
      await sendDirectWhatsAppMessage(
        input.tenantId,
        input.phone,
        `O chamado ${requestedCode} não está atribuído a você ou já foi encerrado. Confira a Pipeline de Suporte antes de enviar o relatório.`,
        input.log as any,
      );
    } catch (error) {
      input.log.warn({ err: error, requestedCode }, "support-whatsapp: falha ao avisar código não atribuído");
    }
    return { handled: true, reason: "case_not_assigned", technicianId: technician.id };
  }

  if (!card && activeCards.length === 1) card = activeCards[0];

  if (!card) {
    await replyAmbiguousCases({
      tenantId: input.tenantId,
      phone: input.phone,
      technicianName: technician.name,
      cards: activeCards.map((candidate) => ({ codigo: candidate.codigo, titulo: candidate.titulo })),
      log: input.log,
    });
    return { handled: true, reason: "ambiguous_case", technicianId: technician.id };
  }

  let attachmentId: string | null = null;
  let persistedMedia:
    | { url: string; mimeType: string | null; size: number | null }
    | null = null;

  if (input.mediaUrl) {
    persistedMedia = await persistExternalMedia({
      url: input.mediaUrl,
      mimeType: input.mimeType,
      fileName: input.fileName,
      log: input.log,
    });

    const [attachment] = await db
      .insert(workCardAttachmentsTable)
      .values({
        tenantId: input.tenantId,
        workCardId: card.id,
        leadId: card.leadId,
        criadoPor: technician.id,
        origem: `whatsapp_tecnico:${input.provider}`,
        nome: input.fileName || `whatsapp-${input.mediaType || "anexo"}`,
        url: persistedMedia.url,
        mimeType: persistedMedia.mimeType,
        tamanho: input.fileSize ?? persistedMedia.size,
        descricao: input.mediaType === "audio" ? null : input.text.slice(0, 10000),
        transcricao: input.transcription?.slice(0, 20000) ?? null,
        metadata: {
          provider: input.provider,
          sourceMessageId: input.sourceMessageId ?? null,
          technicianId: technician.id,
          technicianPhone: digits(input.phone),
        },
      })
      .returning({ id: workCardAttachmentsTable.id });
    attachmentId = attachment?.id ?? null;
  }

  if (card.leadId) {
    const detail = [
      `Técnico/responsável: ${technician.name}`,
      input.mediaType && input.mediaType !== "texto" ? `Tipo: ${input.mediaType}` : null,
      input.transcription ? `Transcrição: ${input.transcription}` : input.text ? `Relato: ${input.text}` : null,
    ].filter(Boolean).join("\n");

    await db.insert(activitiesTable).values({
      tenantId: input.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: "assistencia",
      titulo: `${card.codigo}: atualização via WhatsApp do técnico`,
      descricao: detail.slice(0, 30000),
      status: "concluida",
      concluidaEm: new Date(),
      responsavelId: technician.id,
      ...(persistedMedia ? {
        anexoNome: input.fileName || `whatsapp-${input.mediaType || "anexo"}`,
        anexoUrl: persistedMedia.url,
        anexoMimeType: persistedMedia.mimeType,
        anexoTamanho: input.fileSize ?? persistedMedia.size,
        anexoCategoria: attachmentCategory(persistedMedia.mimeType),
      } : {}),
    });
  }

  await db
    .update(workCardsTable)
    .set({
      metadata: {
        ...(card.metadata ?? {}),
        lastTechnicianWhatsappAt: new Date().toISOString(),
        lastTechnicianWhatsappBy: technician.id,
        lastTechnicianWhatsappPhone: digits(input.phone),
        lastTechnicianWhatsappType: input.mediaType ?? "texto",
        lastTechnicianWhatsappMessageId: input.sourceMessageId ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(workCardsTable.id, card.id));

  input.log.info(
    {
      tenantId: input.tenantId,
      technicianId: technician.id,
      workCardId: card.id,
      codigo: card.codigo,
      attachmentId,
      mediaType: input.mediaType,
    },
    "support-whatsapp: atualização do técnico vinculada à assistência",
  );

  return {
    handled: true,
    reason: "attached",
    technicianId: technician.id,
    cardId: card.id,
    codigo: card.codigo,
    attachmentId,
  };
}
