import { and, desc, eq } from "drizzle-orm";
import { db, jarvisDecisionsTable, jarvisMissionsTable } from "@workspace/db";
import { buildJarvisMissionTrackingSignals } from "./jarvis-mission-tracking.js";

function compact(value: string | null | undefined, max = 360) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisMissionContext(tenantId: string): Promise<string> {
  const [missions, decisions] = await Promise.all([
    db.select({
      id: jarvisMissionsTable.id,
      title: jarvisMissionsTable.title,
      objective: jarvisMissionsTable.objective,
      status: jarvisMissionsTable.status,
      priority: jarvisMissionsTable.priority,
      successMetric: jarvisMissionsTable.successMetric,
      target: jarvisMissionsTable.target,
      baseline: jarvisMissionsTable.baseline,
      currentState: jarvisMissionsTable.currentState,
      strategy: jarvisMissionsTable.strategy,
      deadlineAt: jarvisMissionsTable.deadlineAt,
      lastReviewedAt: jarvisMissionsTable.lastReviewedAt,
      createdAt: jarvisMissionsTable.createdAt,
      updatedAt: jarvisMissionsTable.updatedAt,
    }).from(jarvisMissionsTable)
      .where(and(eq(jarvisMissionsTable.tenantId, tenantId), eq(jarvisMissionsTable.status, "active")))
      .orderBy(desc(jarvisMissionsTable.priority), desc(jarvisMissionsTable.updatedAt))
      .limit(12),
    db.select({
      id: jarvisDecisionsTable.id,
      missionId: jarvisDecisionsTable.missionId,
      title: jarvisDecisionsTable.title,
      question: jarvisDecisionsTable.question,
      decision: jarvisDecisionsTable.decision,
      rationale: jarvisDecisionsTable.rationale,
      confidence: jarvisDecisionsTable.confidence,
      expectedOutcome: jarvisDecisionsTable.expectedOutcome,
      successMetric: jarvisDecisionsTable.successMetric,
      reviewAt: jarvisDecisionsTable.reviewAt,
      actualOutcome: jarvisDecisionsTable.actualOutcome,
      resultStatus: jarvisDecisionsTable.resultStatus,
      createdAt: jarvisDecisionsTable.createdAt,
      reviewedAt: jarvisDecisionsTable.reviewedAt,
    }).from(jarvisDecisionsTable)
      .where(eq(jarvisDecisionsTable.tenantId, tenantId))
      .orderBy(desc(jarvisDecisionsTable.createdAt))
      .limit(20),
  ]);

  if (!missions.length && !decisions.length) return "";

  const trackingSignals = buildJarvisMissionTrackingSignals(missions, decisions);
  const lines = [
    "",
    "## Missões e decisões persistentes do JARVIS",
    "Este bloco é tenant-scoped e representa objetivos e decisões explicitamente registrados. Use-o para manter continuidade entre conversas. Não altere missão, decisão ou resultado sem uma rota de escrita realmente executada.",
  ];

  if (trackingSignals.length) {
    lines.push("", `### Acompanhamento automático de Missões (${trackingSignals.length})`);
    lines.push("Estes sinais são determinísticos e derivados apenas de prazo, data de revisão e cobertura de medição. Em perguntas amplas sobre o negócio ou sobre Missões, apresente primeiro sinais critical/high e proponha a próxima revisão concreta. Não invente progresso.");
    for (const signal of trackingSignals.slice(0, 12)) {
      const relation = [
        signal.missionId ? `missão=${signal.missionId}` : null,
        signal.decisionId ? `decisão=${signal.decisionId}` : null,
      ].filter(Boolean).join(" | ");
      lines.push(`- ${signal.severity} | ${signal.type}${relation ? ` | ${relation}` : ""} | ${compact(signal.title, 180)}`);
      lines.push(`  ${compact(signal.detail, 360)}`);
    }
    lines.push("Atraso e lacuna de medição são alertas operacionais, não prova de fracasso. Data de revisão vencida significa que o resultado ainda precisa ser medido, não que a decisão foi ruim.");
  }

  if (missions.length) {
    lines.push("", `### Missões ativas (${missions.length})`);
    for (const mission of missions) {
      const deadline = mission.deadlineAt ? mission.deadlineAt.toISOString() : "sem_prazo";
      lines.push(`- [${mission.id}] prioridade=${mission.priority}/100 | ${compact(mission.title, 180)} | prazo=${deadline}`);
      lines.push(`  Objetivo: ${compact(mission.objective, 420)}`);
      if (mission.successMetric) lines.push(`  Métrica de sucesso: ${compact(mission.successMetric, 220)}`);
      if (mission.baseline) lines.push(`  Baseline: ${JSON.stringify(mission.baseline)}`);
      if (mission.target) lines.push(`  Meta: ${JSON.stringify(mission.target)}`);
      if (mission.currentState) lines.push(`  Estado atual: ${JSON.stringify(mission.currentState)}`);
      if (mission.strategy) lines.push(`  Estratégia registrada: ${JSON.stringify(mission.strategy)}`);
      if (mission.lastReviewedAt) lines.push(`  Última revisão: ${mission.lastReviewedAt.toISOString()}`);
    }
    lines.push("Quando uma pergunta ampla estiver ligada a uma missão ativa, conecte o diagnóstico à missão e diga se a próxima ação aproxima ou afasta o objetivo. Não invente progresso a partir da existência da missão.");
  }

  if (decisions.length) {
    lines.push("", `### Biblioteca de decisões explícitas (${decisions.length})`);
    for (const item of decisions) {
      const relation = item.missionId ? ` | missão=${item.missionId}` : "";
      const review = item.reviewAt ? ` | revisar=${item.reviewAt.toISOString()}` : "";
      lines.push(`- [${item.id}] ${compact(item.title, 180)} | resultado=${item.resultStatus}${relation}${review}`);
      if (item.question) lines.push(`  Questão: ${compact(item.question, 280)}`);
      lines.push(`  Decisão: ${compact(item.decision, 420)}`);
      if (item.rationale) lines.push(`  Motivo registrado: ${compact(item.rationale, 420)}`);
      if (item.confidence != null) lines.push(`  Confiança registrada: ${item.confidence}%`);
      if (item.expectedOutcome) lines.push(`  Resultado esperado: ${compact(item.expectedOutcome, 300)}`);
      if (item.successMetric) lines.push(`  Métrica: ${compact(item.successMetric, 220)}`);
      if (item.actualOutcome) lines.push(`  Resultado observado: ${compact(item.actualOutcome, 420)}`);
    }
    lines.push("Use decisões com resultado observado como precedente, não como prova universal. Compare resultado esperado versus observado quando ambos existirem e destaque lacunas de medição quando o resultado ainda estiver pendente.");
  }

  lines.push(
    "",
    "### Regras de continuidade",
    "- 'Qual é nossa missão?', 'onde queremos chegar?' ou equivalente: priorize Missões ativas.",
    "- 'Como estão nossas missões?' ou 'estamos avançando?': use primeiro Acompanhamento automático de Missões; depois detalhe baseline, meta, estado atual e prazo. Não calcule avanço percentual quando a medição não for compatível.",
    "- 'O que está atrasado?': destaque missões fora do prazo, missões sem revisão e decisões com revisão vencida; diferencie atraso de fracasso.",
    "- 'Por que decidimos isso?': procure primeiro a Biblioteca de decisões explícitas e só depois Casos Vendor encerrados.",
    "- 'Funcionou?': compare resultado esperado, métrica e resultado observado; se ainda não foi medido, diga que a decisão permanece pendente de revisão.",
    "- Ao recomendar nova ação, considere as missões ativas e decisões anteriores para evitar contradizer estratégia registrada sem explicar por que a evidência mudou.",
  );

  return lines.join("\n");
}
