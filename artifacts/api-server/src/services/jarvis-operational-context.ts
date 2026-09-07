import { and, desc, eq, gte } from "drizzle-orm";
import { agentTasksTable, db, jarvisCasesTable } from "@workspace/db";

const MAX_CASES = 12;
const MAX_APPROVALS = 8;
const MAX_OUTCOMES = 6;

function compact(value: string | null | undefined, max = 420) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisOperationalContext(tenantId: string): Promise<string> {
  const now = new Date();
  const changesSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [cases, approvals, recentChanges, outcomes] = await Promise.all([
    db
      .select({
        id: jarvisCasesTable.id,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        title: jarvisCasesTable.title,
        detail: jarvisCasesTable.detail,
        metric: jarvisCasesTable.metric,
        confidence: jarvisCasesTable.confidence,
        impact: jarvisCasesTable.impact,
        recommendedAction: jarvisCasesTable.recommendedAction,
        status: jarvisCasesTable.status,
        source: jarvisCasesTable.source,
        firstDetectedAt: jarvisCasesTable.firstDetectedAt,
        lastDetectedAt: jarvisCasesTable.lastDetectedAt,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(eq(jarvisCasesTable.tenantId, tenantId), eq(jarvisCasesTable.status, "open")))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(MAX_CASES),
    db
      .select({
        id: agentTasksTable.id,
        agentName: agentTasksTable.agentName,
        actionType: agentTasksTable.actionType,
        status: agentTasksTable.status,
        leadId: agentTasksTable.leadId,
        createdAt: agentTasksTable.createdAt,
        updatedAt: agentTasksTable.updatedAt,
      })
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.tenantId, tenantId),
          eq(agentTasksTable.status, "pendente_aprovacao"),
        ),
      )
      .orderBy(desc(agentTasksTable.createdAt))
      .limit(MAX_APPROVALS),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        status: jarvisCasesTable.status,
        source: jarvisCasesTable.source,
        firstDetectedAt: jarvisCasesTable.firstDetectedAt,
        updatedAt: jarvisCasesTable.updatedAt,
        resolvedAt: jarvisCasesTable.resolvedAt,
        resultSummary: jarvisCasesTable.resultSummary,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        gte(jarvisCasesTable.updatedAt, changesSince),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(12),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        resultSummary: jarvisCasesTable.resultSummary,
        resolvedAt: jarvisCasesTable.resolvedAt,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        eq(jarvisCasesTable.status, "resolved"),
      ))
      .orderBy(desc(jarvisCasesTable.resolvedAt))
      .limit(MAX_OUTCOMES),
  ]);

  if (!cases.length && !approvals.length && !recentChanges.length && !outcomes.length) return "";

  const lines = [
    "",
    "## Estado operacional real do tenant",
    "Este bloco vem do banco do VendorAI e é contexto somente de leitura. Use-o para responder sobre prioridades, mudanças, riscos, oportunidades, resultados anteriores e aprovações. Não trate estes dados como autorização para executar ações.",
  ];

  if (recentChanges.length) {
    lines.push("", `### O que mudou nas últimas 24h (${recentChanges.length})`);
    for (const item of recentChanges) {
      const changeType =
        item.status === "resolved" && item.resolvedAt && item.resolvedAt >= changesSince
          ? "resolvido"
          : item.status === "dismissed"
            ? "descartado"
            : item.firstDetectedAt >= changesSince
              ? "novo"
              : "atualizado";
      lines.push(
        `- [${item.id}] mudança=${changeType} | ${compact(item.title, 180)} | categoria=${item.category} | gravidade=${item.severity} | fonte=${item.source} | atualizado=${item.updatedAt.toISOString()}`,
      );
      if (item.resultSummary) lines.push(`  Resultado: ${compact(item.resultSummary, 260)}`);
    }
  }

  if (cases.length) {
    lines.push("", `### Casos Vendor abertos mais recentes (${cases.length})`);
    for (const item of cases) {
      const metadata = [
        `categoria=${item.category}`,
        `gravidade=${item.severity}`,
        item.confidence == null ? null : `confiança=${item.confidence}%`,
        item.impact == null ? null : `impacto=${item.impact}`,
        item.metric ? `métrica=${compact(item.metric, 120)}` : null,
        `fonte=${item.source}`,
        `primeira_detecção=${item.firstDetectedAt.toISOString()}`,
        `atualizado=${item.updatedAt.toISOString()}`,
      ].filter(Boolean).join(" | ");

      lines.push(`- [${item.id}] ${compact(item.title, 180)} — ${metadata}`);
      if (item.detail) lines.push(`  Detalhe: ${compact(item.detail)}`);
      if (item.recommendedAction) lines.push(`  Recomendação: ${compact(item.recommendedAction, 260)}`);
    }
  }

  if (outcomes.length) {
    lines.push("", `### Memória recente de decisões e resultados (${outcomes.length})`);
    for (const item of outcomes) {
      lines.push(
        `- [${item.id}] ${compact(item.title, 180)} | categoria=${item.category} | gravidade=${item.severity} | resolvido=${item.resolvedAt?.toISOString() ?? item.updatedAt.toISOString()}`,
      );
      if (item.resultSummary) lines.push(`  Resultado registrado: ${compact(item.resultSummary, 360)}`);
    }
  }

  if (approvals.length) {
    lines.push("", `### Aprovações pendentes (${approvals.length})`);
    for (const task of approvals) {
      lines.push(
        `- [${task.id}] agente=${task.agentName} | ação=${task.actionType} | lead=${task.leadId} | criado=${task.createdAt.toISOString()}`,
      );
    }
    lines.push("Se o usuário pedir para aprovar/executar algo, use o fluxo controlado de ações; não afirme que executou sem a rota de ação apropriada ter sido chamada.");
  }

  lines.push(
    "",
    "### Como interpretar",
    "- 'O que mudou?': use primeiro o bloco determinístico das últimas 24h; diferencie novo, atualizado, resolvido e descartado.",
    "- 'Por que tomamos essa decisão?': combine evidências, recomendação original e resultado registrado; se algum elo não estiver disponível, diga exatamente o que falta.",
    "- 'O que funcionou?': use somente resultados registrados; não atribua causalidade sem evidência.",
    "- 'O que é prioridade?': ordene por risco/oportunidade, impacto, confiança e urgência; não invente valor financeiro ausente.",
    "- 'O que eu não estou vendo?': aponte lacunas apenas como hipótese e diferencie ausência de evidência de evidência de ausência.",
    "- 'Tem algo para aprovar?': use somente a lista de aprovações pendentes acima.",
  );

  return lines.join("\n");
}
