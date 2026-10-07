/**
 * Cmd-21 — SPIN Selling Briefing Automático
 *
 * GET  /api/leads/:leadId/spin-meeting         → último agendamento futuro + spin briefing
 * POST /api/leads/:leadId/spin-meeting/generate → gera/regenera SPIN para o último agendamento futuro
 * POST /api/leads/:leadId/spin-meeting/send-whatsapp → envia SPIN resumido para o WhatsApp do vendedor
 */

import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  activitiesTable,
  leadsTable,
  leadBriefingsTable,
  dealsTable,
  pipelineStagesTable,
  messagesTable,
  businessProfilesTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const router: IRouter = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SpinRoteiro {
  abertura: string;
  situacao: Array<{ pergunta: string; objetivo: string }>;
  problema: Array<{ pergunta: string; objetivo: string }>;
  implicacao: Array<{ pergunta: string; objetivo: string }>;
  necessidade: Array<{ pergunta: string; objetivo: string }>;
  objecoes: Array<{ objecao: string; resposta: string }>;
  fechamento: string;
  alertas: string[];
}

// ── Core generator ─────────────────────────────────────────────────────────────

export async function generateSpinForActivity(
  activityId: string,
  tenantId: string,
  log: Logger,
): Promise<SpinRoteiro | null> {
  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(and(eq(activitiesTable.id, activityId), eq(activitiesTable.tenantId, tenantId)))
    .limit(1);

  if (!activity) return null;

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, activity.leadId))
    .limit(1);

  const [briefing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, activity.leadId))
    .limit(1);

  let deal = null;
  if (activity.dealId) {
    const [d] = await db
      .select({ titulo: dealsTable.titulo, valor: canonicalDealValueSql, etapa: dealsTable.etapa, aiBriefing: dealsTable.aiBriefing, respostasEtapas: dealsTable.respostasEtapas })
      .from(dealsTable)
      .where(eq(dealsTable.id, activity.dealId))
      .limit(1);
    deal = d ?? null;
  }

  // Contexto coletado nas perguntas por etapa do funil (Central de
  // Trabalho) — cobre o que o SPIN não pergunta: pré-contato, o que foi
  // demonstrado/apresentado, feedback da proposta, objeções e condições
  // em negociação já registradas pelo vendedor nesta etapa e nas anteriores.
  let stageAnswersText = "";
  const respostasEtapas = (deal?.respostasEtapas ?? {}) as Record<string, Record<string, string>>;
  if (Object.keys(respostasEtapas).length) {
    const stages = await db
      .select({ key: pipelineStagesTable.key, label: pipelineStagesTable.label, perguntas: pipelineStagesTable.perguntas })
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.tenantId, tenantId));
    const blocks: string[] = [];
    for (const stage of stages) {
      const stageRespostas = respostasEtapas[stage.key];
      if (!stageRespostas) continue;
      const perguntas = (stage.perguntas ?? []) as { id: string; texto: string }[];
      const lines = perguntas
        .filter((p) => stageRespostas[p.id]?.trim())
        .map((p) => `  - P: ${p.texto}\n    R: ${stageRespostas[p.id]}`);
      if (lines.length) blocks.push(`[${stage.label}]\n${lines.join("\n")}`);
    }
    if (blocks.length) stageAnswersText = blocks.join("\n\n");
  }


  const recentMessages = await db
    .select({ direcao: messagesTable.direcao, conteudo: messagesTable.conteudo, createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(and(eq(messagesTable.leadId, activity.leadId), eq(messagesTable.tenantId, tenantId)))
    .orderBy(desc(messagesTable.createdAt))
    .limit(15);

  // Fetch previous reuniao activities (for history chain — BLOCO 26)
  const previousActivities = await db
    .select({
      id:             activitiesTable.id,
      titulo:         activitiesTable.titulo,
      dataHoraInicio: activitiesTable.dataHoraInicio,
      spinBriefing:   activitiesTable.spinBriefing,
    })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.leadId,  activity.leadId),
        eq(activitiesTable.tipo,    "reuniao"),
        isNotNull(activitiesTable.spinBriefing),
      ),
    )
    .orderBy(desc(activitiesTable.dataHoraInicio))
    .limit(3);

  const previousRoteiros = previousActivities
    .filter((a) => a.id !== activityId && a.spinBriefing)
    .slice(0, 2);

  const dataReuniao = activity.dataHoraInicio
    ? new Date(activity.dataHoraInicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" })
    : "data não definida";

  const briefingTexto = briefing
    ? [
        briefing.situationAnswers?.map((a) => `S: ${a.question}\nR: ${a.answer}`).join("\n"),
        briefing.problemAnswers?.map((a) => `P: ${a.question}\nR: ${a.answer}`).join("\n"),
        briefing.implicationAnswers?.map((a) => `I: ${a.question}\nR: ${a.answer}`).join("\n"),
        briefing.needAnswers?.map((a) => `N: ${a.question}\nR: ${a.answer}`).join("\n"),
        briefing.objections?.length ? `Objeções conhecidas: ${briefing.objections.map((o) => o.objection).join(", ")}` : "",
        briefing.freeNotes ? `Notas: ${briefing.freeNotes}` : "",
        briefing.implicationEstimatedValue ? `Valor estimado da dor: ${briefing.implicationEstimatedValue}` : "",
        briefing.needThermometer ? `Termômetro: ${briefing.needThermometer}` : "",
      ].filter(Boolean).join("\n\n")
    : "Sem briefing registrado ainda.";

  const messagesTexto = recentMessages.length
    ? recentMessages.reverse().map((m) => `[${m.direcao === "entrada" ? "Cliente" : "Vendedor"}]: ${m.conteudo}`).join("\n")
    : "Sem mensagens recentes.";

  // Build historical context from previous roteiros (BLOCO 26 — history chain)
  const historicalContext = previousRoteiros.length > 0
    ? previousRoteiros.map((a) => {
        const dataAnterior = a.dataHoraInicio
          ? new Date(a.dataHoraInicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "data anterior";
        try {
          const r = JSON.parse(a.spinBriefing!) as SpinRoteiro;
          const topQuestions = [...(r.situacao ?? []), ...(r.problema ?? [])]
            .slice(0, 3)
            .map((q) => q.pergunta)
            .join(" | ");
          return (
            `Reunião ${dataAnterior} — "${a.titulo}":\n` +
            `• Abertura usada: "${r.abertura}"\n` +
            `• Perguntas feitas: ${topQuestions || "—"}\n` +
            `• Fechamento tentado: "${r.fechamento}"\n` +
            (r.alertas?.length ? `• Alertas registrados: ${r.alertas.join(", ")}` : "")
          );
        } catch { return null; }
      }).filter(Boolean).join("\n\n---\n\n")
    : null;

  const systemPrompt = `Você é um especialista em SPIN Selling e vendas consultivas B2B.
Você vai gerar um roteiro de reunião personalizado para um vendedor, baseado no histórico real do lead.${historicalContext ? "\nIMPORTANTE: Há histórico de contatos anteriores. NÃO repita perguntas já feitas. Comece de onde o último contato parou e confirme o que mudou desde a última conversa." : ""}
Retorne APENAS um JSON válido com a estrutura exata abaixo — sem markdown, sem explicações extras:
{
  "abertura": "script de 2-3 frases para quebrar o gelo e estabelecer o contexto da reunião",
  "situacao": [{"pergunta": "pergunta situacional específica", "objetivo": "por que perguntar isso"}],
  "problema": [{"pergunta": "pergunta de problema específica", "objetivo": "dor que isso revela"}],
  "implicacao": [{"pergunta": "pergunta de implicação específica", "objetivo": "consequência a amplificar"}],
  "necessidade": [{"pergunta": "pergunta de necessidade específica", "objetivo": "valor que a solução entrega"}],
  "objecoes": [{"objecao": "objeção esperada", "resposta": "argumento de resposta"}],
  "fechamento": "script de fechamento adaptado ao estágio do lead",
  "alertas": ["atenção contextual para o vendedor baseada no histórico"]
}
Use no mínimo 2 e no máximo 4 itens em cada array SPIN. Objeções: 2-3. Alertas: 1-3.
Seja específico ao contexto do cliente — não use perguntas genéricas.`;

  const userPrompt = `## Lead
Nome: ${lead?.nome ?? "desconhecido"}
Empresa: ${lead?.empresa ?? "–"}
Segmento: ${lead?.mercadoSegmento ?? "–"}
Objetivo registrado: ${lead?.objetivo ?? "–"}

## Reunião agendada
${dataReuniao}
Título: ${activity.titulo}
${activity.descricao ? `Pauta: ${activity.descricao}` : ""}

## Deal
${deal ? `Título: ${deal.titulo}\nValor: R$ ${deal.valor ?? "–"}\nEtapa: ${deal.etapa}` : "Sem deal vinculado"}
${deal?.aiBriefing ? `\nBriefing IA do deal:\n${deal.aiBriefing}` : ""}

## Briefing SPIN coletado
${briefingTexto}

## Contexto registrado pelo vendedor ao longo do funil (pré-contato, demonstração, negociação)
${stageAnswersText || "Nenhum registrado ainda"}

## Histórico de contatos anteriores com este lead
${historicalContext ?? "Primeiro contato/roteiro para este lead — sem histórico anterior."}

## Últimas mensagens da conversa
${messagesTexto}

Gere o roteiro SPIN para essa reunião:`;

  try {
    const result = await callOpenAI(
      tenantId,
      "spin_briefing",
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "gpt-4o-mini",
        maxTokens: 1800,
        temperature: 0.5,
        responseFormat: { type: "json_object" },
        log,
      },
    );

    const roteiro = JSON.parse(result.content) as SpinRoteiro;

    await db
      .update(activitiesTable)
      .set({ spinBriefing: JSON.stringify(roteiro), spinGeneratedAt: new Date(), updatedAt: new Date() })
      .where(eq(activitiesTable.id, activityId));

    log.info({ activityId, tenantId }, "spin: roteiro gerado e salvo");
    return roteiro;
  } catch (err) {
    log.error({ err, activityId, tenantId }, "spin: falha ao gerar roteiro (non-fatal)");
    return null;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/leads/:leadId/spin-meeting", async (req, res) => {
  const { leadId } = req.params;

  const [lead] = await db
    .select({ tenantId: leadsTable.tenantId })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);

  if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== lead.tenantId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const now = new Date();

  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.leadId, leadId),
        eq(activitiesTable.tipo, "reuniao"),
        gte(activitiesTable.dataHoraInicio, now),
      ),
    )
    .orderBy(activitiesTable.dataHoraInicio)
    .limit(1);

  if (!activity) {
    res.json({ activity: null, roteiro: null, hasNewMessages: false });
    return;
  }

  let roteiro: SpinRoteiro | null = null;
  if (activity.spinBriefing) {
    try { roteiro = JSON.parse(activity.spinBriefing) as SpinRoteiro; } catch { roteiro = null; }
  }

  let hasNewMessages = false;
  if (activity.spinGeneratedAt) {
    const [newMsg] = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.leadId, leadId),
          eq(messagesTable.direcao, "entrada"),
          gte(messagesTable.createdAt, activity.spinGeneratedAt),
        ),
      )
      .limit(1);
    hasNewMessages = !!newMsg;
  }

  res.json({
    activity: {
      id: activity.id,
      titulo: activity.titulo,
      descricao: activity.descricao,
      dataHoraInicio: activity.dataHoraInicio,
      dataHoraFim: activity.dataHoraFim,
      meetLink: activity.meetLink,
      dealId: activity.dealId,
      spinGeneratedAt: activity.spinGeneratedAt,
    },
    roteiro,
    hasNewMessages,
  });
});

router.post("/leads/:leadId/spin-meeting/generate", async (req, res) => {
  const { leadId } = req.params;

  const [lead] = await db
    .select({ tenantId: leadsTable.tenantId })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);

  if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== lead.tenantId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const now = new Date();

  const [activity] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.leadId, leadId),
        eq(activitiesTable.tipo, "reuniao"),
        gte(activitiesTable.dataHoraInicio, now),
      ),
    )
    .orderBy(activitiesTable.dataHoraInicio)
    .limit(1);

  if (!activity) {
    res.status(404).json({ error: "Nenhuma reunião futura encontrada para este lead" });
    return;
  }

  const roteiro = await generateSpinForActivity(activity.id, lead.tenantId, req.log);

  if (!roteiro) {
    res.status(500).json({ error: "Falha ao gerar roteiro SPIN" });
    return;
  }

  res.json({ roteiro, spinGeneratedAt: new Date().toISOString() });
});

router.post("/leads/:leadId/spin-meeting/send-whatsapp", async (req, res) => {
  const { leadId } = req.params;

  const [lead] = await db
    .select({ tenantId: leadsTable.tenantId, nome: leadsTable.nome })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);

  if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== lead.tenantId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const now = new Date();

  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.leadId, leadId),
        eq(activitiesTable.tipo, "reuniao"),
        gte(activitiesTable.dataHoraInicio, now),
      ),
    )
    .orderBy(activitiesTable.dataHoraInicio)
    .limit(1);

  if (!activity?.spinBriefing) {
    res.status(404).json({ error: "Roteiro SPIN não encontrado. Gere o roteiro primeiro." });
    return;
  }

  const [profile] = await db
    .select({ telefone: businessProfilesTable.telefone })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, lead.tenantId))
    .limit(1);

  if (!profile?.telefone) {
    res.status(400).json({ error: "Telefone do negócio não configurado" });
    return;
  }

  let roteiro: SpinRoteiro | null = null;
  try { roteiro = JSON.parse(activity.spinBriefing) as SpinRoteiro; } catch { null; }
  if (!roteiro) { res.status(500).json({ error: "Roteiro inválido" }); return; }

  const dataHora = activity.dataHoraInicio
    ? new Date(activity.dataHoraInicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : "–";

  const lines: string[] = [
    `🧭 *Roteiro SPIN — ${lead.nome}*`,
    `📅 Reunião: ${dataHora}`,
    ``,
    `*Abertura:*`,
    roteiro.abertura,
    ``,
    `*Situação:*`,
    ...roteiro.situacao.map((q) => `• ${q.pergunta}`),
    ``,
    `*Problema:*`,
    ...roteiro.problema.map((q) => `• ${q.pergunta}`),
    ``,
    `*Implicação:*`,
    ...roteiro.implicacao.map((q) => `• ${q.pergunta}`),
    ``,
    `*Necessidade:*`,
    ...roteiro.necessidade.map((q) => `• ${q.pergunta}`),
    ``,
    `*Fechamento:*`,
    roteiro.fechamento,
  ];

  if (roteiro.alertas?.length) {
    lines.push(``, `⚠️ *Alertas:*`);
    roteiro.alertas.forEach((a) => lines.push(`• ${a}`));
  }

  await sendDirectWhatsAppMessage(lead.tenantId, profile.telefone, lines.join("\n"), req.log);

  res.json({ sent: true });
});

export default router;
