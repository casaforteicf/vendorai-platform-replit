import { and, desc, eq } from "drizzle-orm";
import { db, jarvisDecisionsTable, jarvisMissionsTable } from "@workspace/db";
import { loadJarvisMissionHealth } from "./jarvis-mission-health.js";

function compact(value: string | null | undefined, max = 360) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisMissionContext(tenantId: string): Promise<string> {
  const [missions, decisions, missionHealth] = await Promise.all([
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
    loadJarvisMissionHealth(tenantId),
  ]);

  if (!missions.length && !decisions.length) return "";

  const lines = [
    "",
    "## Missões e decisões persistentes do JARVIS",
    "Este bloco é tenant-scoped e representa objetivos e decisões explicitamente registrados. Use-o para manter continuidade entre conversas. Não altere missão, decisão ou resultado sem uma rota de escrita realmente executada.",
  ];

  if (missionHealth.items.length) {
    lines.push("", "### Saúde das Missões — acompanhamento automático");
    lines.push(`Ativas=${missionHealth.summary.active} | críticas=${missionHealth.summary.critical} | atenção=${missionHealth.summary.attention} | saudáveis=${missionHealth.summary.healthy} | revisões_de_decisão_vencidas=${missionHealth.summary.overdueDecisionReviews}`);
    for (const item of missionHealth.items.slice(0, 8)) {
      lines.push(`- [${item.id}] saúde=${item.level} | prioridade=${item.priority}/100 | ${compact(item.title, 180)}`);
      if (item.reasons.length) lines.push(`  Motivos: ${item.reasons.join("; ")}`);
      if (item.nextReviewAt) lines.push(`  Próxima revisão de decisão: ${item.nextReviewAt.toISOString()}`);
    }
    lines.push("Use saúde=critical antes dos demais itens quando o usuário pedir status geral, prioridades ou andamento das missões. Saúde é uma avaliação determinística de prazo, cobertura de baseline/meta/estado atual, recência de revisão e decisões vencidas; não é previsão estatística de sucesso.");
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
    "- 'Como estamos nas missões?' ou 'tem alguma missão atrasada?': use primeiro Saúde das Missões e destaque críticas/atenção antes das saudáveis.",
    "- 'Por que decidimos isso?': procure primeiro a Biblioteca de decisões explícitas e só depois Casos Vendor encerrados.",
    "- 'Funcionou?': compare resultado esperado, métrica e resultado observado; se ainda não foi medido, diga que a decisão permanece pendente de revisão.",
    "- Ao recomendar nova ação, considere as missões ativas e decisões anteriores para evitar contradizer estratégia registrada sem explicar por que a evidência mudou.",
  );

  return lines.join("\n");
}
