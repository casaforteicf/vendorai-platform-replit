import { and, desc, eq } from "drizzle-orm";
import {
  activitiesTable,
  db,
  workCardAttachmentsTable,
  workCardsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";

export type SupportReportDraft = {
  problemaRelatado: string;
  diagnostico: string;
  servicoExecutado: string;
  materiaisUtilizados: string[];
  situacaoFinal: "resolvido" | "parcial" | "nao_resolvido" | "aguardando_peca" | "aguardando_retorno";
  clienteAcompanhou: boolean | null;
  recomendacoes: string;
  observacoes: string;
};

function extractJson(content: string): Record<string, unknown> {
  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return {}; }
  }
}

function normalizeDraft(raw: Record<string, unknown>, fallbackProblem: string): SupportReportDraft {
  const situation = String(raw.situacaoFinal ?? "parcial");
  const validSituations = new Set(["resolvido", "parcial", "nao_resolvido", "aguardando_peca", "aguardando_retorno"]);
  return {
    problemaRelatado: String(raw.problemaRelatado ?? fallbackProblem ?? "").slice(0, 10000),
    diagnostico: String(raw.diagnostico ?? "").slice(0, 10000),
    servicoExecutado: String(raw.servicoExecutado ?? "").slice(0, 10000),
    materiaisUtilizados: Array.isArray(raw.materiaisUtilizados)
      ? raw.materiaisUtilizados.map((v) => String(v).trim()).filter(Boolean).slice(0, 100)
      : [],
    situacaoFinal: (validSituations.has(situation) ? situation : "parcial") as SupportReportDraft["situacaoFinal"],
    clienteAcompanhou: typeof raw.clienteAcompanhou === "boolean" ? raw.clienteAcompanhou : null,
    recomendacoes: String(raw.recomendacoes ?? "").slice(0, 10000),
    observacoes: String(raw.observacoes ?? "").slice(0, 10000),
  };
}

export async function generateSupportReportDraft(tenantId: string, workCardId: string, log?: any): Promise<SupportReportDraft> {
  const [card] = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.id, workCardId),
    eq(workCardsTable.tenantId, tenantId),
    eq(workCardsTable.pipeline, "suporte"),
  )).limit(1);
  if (!card) throw new Error("Assistência não encontrada");

  const attachments = await db.select().from(workCardAttachmentsTable)
    .where(eq(workCardAttachmentsTable.workCardId, card.id))
    .orderBy(desc(workCardAttachmentsTable.createdAt));

  const activities = card.leadId
    ? await db.select({ titulo: activitiesTable.titulo, descricao: activitiesTable.descricao, createdAt: activitiesTable.createdAt })
        .from(activitiesTable)
        .where(and(eq(activitiesTable.tenantId, tenantId), eq(activitiesTable.leadId, card.leadId)))
        .orderBy(desc(activitiesTable.createdAt))
        .limit(30)
    : [];

  const attachmentContext = attachments.slice(0, 30).map((a) => [
    `Arquivo: ${a.nome}`,
    a.descricao ? `Descrição: ${a.descricao}` : null,
    a.transcricao ? `Transcrição: ${a.transcricao}` : null,
    `Origem: ${a.origem}`,
  ].filter(Boolean).join("\n")).join("\n\n");

  const activityContext = activities.map((a) => `${a.titulo}${a.descricao ? `: ${a.descricao}` : ""}`).join("\n");

  const result = await callOpenAI(
    tenantId,
    "agent_service",
    [
      {
        role: "system",
        content: "Você estrutura relatórios técnicos de assistência. Use somente os fatos fornecidos. Não invente diagnóstico, peças, medidas, execução nem aceite do cliente. Quando algo não estiver comprovado, deixe o campo vazio ou use situação parcial. Responda SOMENTE JSON válido em português.",
      },
      {
        role: "user",
        content: `Gere um rascunho estruturado para a assistência ${card.codigo}.\n\nRelato inicial:\n${card.descricao ?? ""}\n\nAtualizações/anexos:\n${attachmentContext || "Sem anexos"}\n\nHistórico recente do cliente:\n${activityContext || "Sem histórico adicional"}\n\nJSON obrigatório:\n{\n  "problemaRelatado": "",\n  "diagnostico": "",\n  "servicoExecutado": "",\n  "materiaisUtilizados": [],\n  "situacaoFinal": "resolvido|parcial|nao_resolvido|aguardando_peca|aguardando_retorno",\n  "clienteAcompanhou": true|false|null,\n  "recomendacoes": "",\n  "observacoes": ""\n}`,
      },
    ],
    { model: "gpt-4o-mini", maxTokens: 900, log },
  );

  const draft = normalizeDraft(extractJson(result.content), card.descricao ?? "");
  await db.update(workCardsTable).set({
    metadata: {
      ...(card.metadata ?? {}),
      supportReportDraft: draft,
      supportReportDraftGeneratedAt: new Date().toISOString(),
      supportReportConfirmed: false,
    },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id));

  return draft;
}
