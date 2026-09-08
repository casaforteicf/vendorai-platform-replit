import { and, asc, desc, eq, gte } from "drizzle-orm";
import { agendamentosTable, agentTasksTable, db, jarvisCasesTable } from "@workspace/db";
import { loadJarvisWatchlistIntelligence } from "./jarvis-watchlist-intelligence.js";
import { loadJarvisPriorityIntelligence } from "./jarvis-priority-intelligence.js";

const MAX_CASES = 12;
const MAX_APPROVALS = 8;
const MAX_OUTCOMES = 6;
const MAX_UPCOMING_APPOINTMENTS = 8;

function compact(value: string | null | undefined, max = 420) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisOperationalContext(tenantId: string): Promise<string> {
  const now = new Date();
  const changesSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [cases, approvals, recentChanges, outcomes, upcomingAppointments, watchlistIntelligence, priorityIntelligence] = await Promise.all([
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
    db
      .select({
        id: agendamentosTable.id,
        leadId: agendamentosTable.leadId,
        dealId: agendamentosTable.dealId,
        tipo: agendamentosTable.tipo,
        modalidade: agendamentosTable.modalidade,
        titulo: agendamentosTable.titulo,
        dataHoraInicio: agendamentosTable.dataHoraInicio,
        dataHoraFim: agendamentosTable.dataHoraFim,
        local: agendamentosTable.local,
        status: agendamentosTable.status,
        responsavelId: agendamentosTable.responsavelId,
        observacoes: agendamentosTable.observacoes,
        meetLink: agendamentosTable.meetLink,
        criadoPor: agendamentosTable.criadoPor,
      })
      .from(agendamentosTable)
      .where(and(
        eq(agendamentosTable.tenantId, tenantId),
        gte(agendamentosTable.dataHoraInicio, now),
      ))
      .orderBy(asc(agendamentosTable.dataHoraInicio))
      .limit(MAX_UPCOMING_APPOINTMENTS * 2),
    loadJarvisWatchlistIntelligence(tenantId),
    loadJarvisPriorityIntelligence(tenantId, 5),
  ]);

  const activeUpcomingAppointments = upcomingAppointments
    .filter((item) => item.status === "agendado" || item.status === "confirmado")
    .slice(0, MAX_UPCOMING_APPOINTMENTS);
  const hasWatchlistContext = watchlistIntelligence.watchlist.length > 0 || watchlistIntelligence.blindSpots.length > 0;
  const hasPriorityContext = priorityIntelligence.items.length > 0;
  const hasAgendaContext = activeUpcomingAppointments.length > 0;
  if (!cases.length && !approvals.length && !recentChanges.length && !outcomes.length && !hasAgendaContext && !hasWatchlistContext && !hasPriorityContext) return "";

  const lines = [
    "",
    "## Estado operacional real do tenant",
    "Este bloco vem do banco do VendorAI e é contexto somente de leitura. Use-o para responder sobre prioridades, mudanças, riscos, oportunidades, agenda futura, resultados anteriores, monitoramento e aprovações. Não trate estes dados como autorização para executar ações.",
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

  if (priorityIntelligence.items.length) {
    lines.push("", `### Prioridades do JARVIS (${priorityIntelligence.items.length})`);
    for (const item of priorityIntelligence.items) {
      const financial = item.explicitFinancialImpact
        ? ` | impacto_financeiro_explícito=R$ ${item.explicitFinancialImpact.amount.toFixed(2)}`
        : " | impacto_financeiro_explícito=desconhecido";
      lines.push(
        `- [${item.id}] prioridade=${item.priorityScore}/100 | mudança=${item.changeType} | ${compact(item.title, 180)} | gravidade=${item.severity} | impacto=${item.impact ?? "desconhecido"} | confiança=${item.confidence ?? "desconhecida"}${financial}`,
      );
      if (item.metric) lines.push(`  Métrica informada: ${compact(item.metric, 180)}`);
      if (item.recommendedAction) lines.push(`  Ação recomendada: ${compact(item.recommendedAction, 260)}`);
    }
    lines.push("Prioridade é um ranking determinístico de gravidade, impacto, confiança, recência e existência de valor financeiro explícito. Valor financeiro só pode ser citado quando vier explicitamente da métrica persistida; caso contrário, trate como desconhecido.");
  }

  if (activeUpcomingAppointments.length) {
    lines.push("", `### Agenda de Inteligência — próximos compromissos (${activeUpcomingAppointments.length})`);
    for (const item of activeUpcomingAppointments) {
      const minutesUntil = Math.max(0, Math.round((item.dataHoraInicio.getTime() - now.getTime()) / 60000));
      const timing = minutesUntil < 60
        ? `em_${minutesUntil}_min`
        : minutesUntil < 24 * 60
          ? `em_${Math.round(minutesUntil / 60)}h`
          : `em_${Math.round(minutesUntil / (24 * 60))}d`;
      const metadata = [
        `tipo=${item.tipo}`,
        item.modalidade ? `modalidade=${item.modalidade}` : null,
        `status=${item.status}`,
        `início=${item.dataHoraInicio.toISOString()}`,
        `fim=${item.dataHoraFim.toISOString()}`,
        `proximidade=${timing}`,
        item.leadId ? `lead=${item.leadId}` : null,
        item.dealId ? `deal=${item.dealId}` : null,
        item.responsavelId ? `responsável=${item.responsavelId}` : null,
        item.criadoPor ? `criado_por=${item.criadoPor}` : null,
      ].filter(Boolean).join(" | ");
      lines.push(`- [${item.id}] ${compact(item.titulo, 180)} — ${metadata}`);
      if (item.local) lines.push(`  Local: ${compact(item.local, 180)}`);
      if (item.meetLink) lines.push(`  Meet: disponível`);
      if (item.observacoes) lines.push(`  Observações: ${compact(item.observacoes, 280)}`);
    }
    lines.push("A Agenda de Inteligência usa somente compromissos persistidos e futuros do tenant. Não invente preparação, risco ou prioridade sem cruzar o compromisso com Casos Vendor, prioridades, lead/deal ou outra evidência disponível.");
  }

  if (watchlistIntelligence.watchlist.length) {
    const visible = watchlistIntelligence.watchlist.slice(0, 20);
    lines.push("", `### Watchlist automática (${watchlistIntelligence.watchlist.length})`);
    for (const item of visible) {
      lines.push(
        `- ${item.kind}=${compact(item.label, 140)} | origem=${item.origin} | monitoramento=${item.monitoringStatus}${item.recentCaseIds.length ? ` | casos_recentes=${item.recentCaseIds.join(",")}` : ""}`,
      );
    }
    if (watchlistIntelligence.watchlist.length > visible.length) {
      lines.push(`- … +${watchlistIntelligence.watchlist.length - visible.length} itens monitorados fora deste contexto curto.`);
    }
  }

  if (watchlistIntelligence.blindSpots.length) {
    lines.push("", `### Pontos cegos verificáveis (${watchlistIntelligence.blindSpots.length})`);
    for (const gap of watchlistIntelligence.blindSpots) {
      lines.push(`- ${gap.severity} | ${gap.area} | ${compact(gap.title, 180)}`);
      lines.push(`  Lacuna: ${compact(gap.detail, 320)}`);
      lines.push(`  Próximo passo: ${compact(gap.recommendation, 260)}`);
    }
    lines.push("Ponto cego aqui significa ausência verificável de configuração/cobertura/evidência. Não transforme isso em afirmação de que existe uma ameaça específica.");
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
    "- 'O que é prioridade?': use primeiro Prioridades do JARVIS. Explique score, mudança, impacto, confiança e a ação recomendada; não invente valor financeiro ausente.",
    "- 'Qual o impacto financeiro?': cite apenas `impacto_financeiro_explícito` quando houver valor BRL persistido na métrica. Se estiver desconhecido, diga que ainda falta quantificação financeira em vez de estimar.",
    "- 'O que tenho na agenda?': use a Agenda de Inteligência futura e diferencie agendado de confirmado. Para preparação, cruze lead/deal e Casos Vendor quando houver evidência.",
    "- 'O que precisa de preparação?': priorize compromissos mais próximos que tenham vínculo com lead/deal e contexto relevante disponível; se o contexto não existir, diga que falta informação em vez de inventar briefing.",
    "- 'O que estamos monitorando?': use a Watchlist automática e diferencie item configurado, item monitorado sem sinal recente e item com sinal ativo.",
    "- 'O que eu não estou vendo?': use primeiro os Pontos cegos verificáveis. Não transforme falta de evidência em evidência de ausência nem invente concorrente, risco ou evento.",
    "- 'Por que tomamos essa decisão?': combine evidências, recomendação original e resultado registrado; se algum elo não estiver disponível, diga exatamente o que falta.",
    "- 'O que funcionou?': use somente resultados registrados; não atribua causalidade sem evidência.",
    "- 'Tem algo para aprovar?': use somente a lista de aprovações pendentes acima.",
  );

  return lines.join("\n");
}
