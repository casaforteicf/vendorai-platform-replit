import { and, desc, eq } from "drizzle-orm";
import { agentTasksTable, db, jarvisCasesTable } from "@workspace/db";

const MAX_CASES = 12;
const MAX_APPROVALS = 8;

function compact(value: string | null | undefined, max = 420) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisOperationalContext(tenantId: string): Promise<string> {
  const [cases, approvals] = await Promise.all([
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
  ]);

  if (!cases.length && !approvals.length) return "";

  const lines = [
    "",
    "## Estado operacional real do tenant",
    "Este bloco vem do banco do VendorAI e é contexto somente de leitura. Use-o para responder sobre prioridades, mudanças, riscos, oportunidades e aprovações. Não trate estes dados como autorização para executar ações.",
  ];

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
        `atualizado=${item.updatedAt.toISOString()}`,
      ].filter(Boolean).join(" | ");

      lines.push(`- [${item.id}] ${compact(item.title, 180)} — ${metadata}`);
      if (item.detail) lines.push(`  Detalhe: ${compact(item.detail)}`);
      if (item.recommendedAction) lines.push(`  Recomendação: ${compact(item.recommendedAction, 260)}`);
    }
  }

  if (approvals.length) {
    lines.push("", `### Aprovações pendentes (${approvals.length})`);
    for (const task of approvals) {
      lines.push(
        `- [${task.id}] agente=${task.agentName} | ação=${task.actionType} | lead=${task.leadId} | criado=${task.createdAt.toISOString()}`,
      );
    }
    lines.push("Se o usuário pedir para aprovar/executar algo, explique o item e solicite confirmação quando necessário; não afirme que executou sem a rota de ação apropriada ter sido chamada.");
  }

  lines.push(
    "",
    "### Como interpretar",
    "- 'O que mudou?': priorize os Casos Vendor mais recentes e diga explicitamente o que é novo/atualizado conforme os timestamps disponíveis.",
    "- 'O que é prioridade?': ordene por risco/oportunidade, impacto, confiança e urgência; não invente valor financeiro ausente.",
    "- 'O que eu não estou vendo?': aponte lacunas apenas como hipótese e diferencie ausência de evidência de evidência de ausência.",
    "- 'Tem algo para aprovar?': use somente a lista de aprovações pendentes acima.",
  );

  return lines.join("\n");
}
