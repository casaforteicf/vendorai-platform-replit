import { and, asc, desc, eq, gte } from "drizzle-orm";
import { agendamentosTable, agentTasksTable, db, jarvisCasesTable } from "@workspace/db";
import { loadJarvisWatchlistIntelligence } from "./jarvis-watchlist-intelligence.js";
import { loadJarvisPriorityIntelligence } from "./jarvis-priority-intelligence.js";
import { loadJarvisComparisonIntelligence } from "./jarvis-comparison-intelligence.js";
import { loadJarvisScenarioIntelligence } from "./jarvis-scenario-intelligence.js";
import { loadJarvisTenantLearningIntelligence } from "./jarvis-tenant-learning-intelligence.js";

const MAX_CASES = 12;
const MAX_APPROVALS = 8;
const MAX_OUTCOMES = 10;
const MAX_UPCOMING_APPOINTMENTS = 8;

function compact(value: string | null | undefined, max = 420) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisOperationalContext(tenantId: string): Promise<string> {
  const now = new Date();
  const changesSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [cases, approvals, recentChanges, outcomes, upcomingAppointments, watchlistIntelligence, priorityIntelligence, comparisonIntelligence, scenarioIntelligence, tenantLearning] = await Promise.all([
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
        signalKey: jarvisCasesTable.signalKey,
        title: jarvisCasesTable.title,
        detail: jarvisCasesTable.detail,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        metric: jarvisCasesTable.metric,
        confidence: jarvisCasesTable.confidence,
        impact: jarvisCasesTable.impact,
        source: jarvisCasesTable.source,
        evidence: jarvisCasesTable.evidence,
        recommendedAction: jarvisCasesTable.recommendedAction,
        resultSummary: jarvisCasesTable.resultSummary,
        firstDetectedAt: jarvisCasesTable.firstDetectedAt,
        lastDetectedAt: jarvisCasesTable.lastDetectedAt,
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
    loadJarvisComparisonIntelligence(tenantId),
    loadJarvisScenarioIntelligence(tenantId),
    loadJarvisTenantLearningIntelligence(tenantId),
  ]);

  const activeUpcomingAppointments = upcomingAppointments
    .filter((item) => item.status === "agendado" || item.status === "confirmado")
    .slice(0, MAX_UPCOMING_APPOINTMENTS);
  const outcomesWithResult = outcomes.filter((item) => Boolean(item.resultSummary?.trim()));
  const outcomeCoveragePercent = outcomes.length
    ? Math.round((outcomesWithResult.length / outcomes.length) * 100)
    : 0;
  const hasWatchlistContext = watchlistIntelligence.watchlist.length > 0 || watchlistIntelligence.blindSpots.length > 0;
  const hasPriorityContext = priorityIntelligence.items.length > 0;
  const hasAgendaContext = activeUpcomingAppointments.length > 0;
  const hasComparisonContext = comparisonIntelligence.competitors.length > 0 || comparisonIntelligence.suppliers.length > 0 || comparisonIntelligence.products.length > 0;
  const hasScenarioContext = scenarioIntelligence.summary.activeDeals > 0 || scenarioIntelligence.summary.openCasesEvaluated > 0;
  const hasLearningContext = tenantLearning.sampleSize > 0;
  if (!cases.length && !approvals.length && !recentChanges.length && !outcomes.length && !hasAgendaContext && !hasWatchlistContext && !hasPriorityContext && !hasComparisonContext && !hasScenarioContext && !hasLearningContext) return "";

  const lines = [
    "",
    "## Estado operacional real do tenant",
    "Este bloco vem do banco do VendorAI e é contexto somente de leitura. Use-o para responder sobre prioridades, mudanças, riscos, oportunidades, agenda futura, comparações, cenários, resultados anteriores, monitoramento, aprendizado acumulado e aprovações. Não trate estes dados como autorização para executar ações.",
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

  if (hasScenarioContext) {
    lines.push("", "### Cenários e Previsões — testes de cenário verificáveis");
    lines.push(`Cobertura: negócios_ativos=${scenarioIntelligence.summary.activeDeals} | negócios_com_valor_e_probabilidade=${scenarioIntelligence.summary.measurableDeals} | casos_abertos=${scenarioIntelligence.summary.openCasesEvaluated} | cobertura_pipeline=${Math.round(scenarioIntelligence.summary.coverageRatio * 100)}%`);
    if (scenarioIntelligence.summary.explicitRiskAmountBrl != null) lines.push(`Impacto financeiro explícito em riscos: R$ ${scenarioIntelligence.summary.explicitRiskAmountBrl.toFixed(2)}`);
    if (scenarioIntelligence.summary.explicitOpportunityAmountBrl != null) lines.push(`Impacto financeiro explícito em oportunidades: R$ ${scenarioIntelligence.summary.explicitOpportunityAmountBrl.toFixed(2)}`);
    for (const scenario of scenarioIntelligence.scenarios) {
      const projected = scenario.projectedPipelineBrl == null ? "desconhecido" : `R$ ${scenario.projectedPipelineBrl.toFixed(2)}`;
      lines.push(`- ${scenario.label} | pipeline_projetado=${projected} | ${scenario.description}`);
      lines.push(`  Premissas: ${scenario.assumptions.join(" ")}`);
      if (scenario.supportingCaseIds.length) lines.push(`  Casos de suporte: ${scenario.supportingCaseIds.join(",")}`);
    }
    lines.push("Cenários são testes condicionais construídos sobre dados persistidos, não previsões garantidas. Nunca apresente cenário otimista/adverso como probabilidade real sem um modelo validado e dados históricos suficientes.");
  }

  if (hasComparisonContext) {
    lines.push("", "### Comparador Inteligente — base verificável");
    if (comparisonIntelligence.competitors.length) {
      lines.push(`Concorrentes configurados (${comparisonIntelligence.competitors.length}):`);
      for (const item of comparisonIntelligence.competitors.slice(0, 20)) {
        lines.push(`- concorrente=${compact(item.name, 140)} | sinais_30d=${item.recentSignalCount}${item.caseIds.length ? ` | casos=${item.caseIds.join(",")}` : ""}`);
      }
    }
    if (comparisonIntelligence.suppliers.length) {
      lines.push(`Fornecedores comparáveis (${comparisonIntelligence.suppliers.length}):`);
      for (const item of comparisonIntelligence.suppliers.slice(0, 25)) {
        const metadata = [
          `fornecedor=${compact(item.name, 140)}`,
          `cobertura_contato=${item.contactCoverage}/3`,
          `amostras_compra=${item.purchaseSamples}`,
          item.latestQuote == null ? null : `cotação_atual=R$ ${item.latestQuote.toFixed(2)}`,
          item.latestPaid == null ? null : `último_pago=R$ ${item.latestPaid.toFixed(2)}`,
          item.latestDeliveryDays == null ? null : `prazo_dias=${item.latestDeliveryDays}`,
          item.latestPaymentTerms ? `pagamento=${compact(item.latestPaymentTerms, 120)}` : null,
          `sinais_30d=${item.recentSignalCount}`,
        ].filter(Boolean).join(" | ");
        lines.push(`- [${item.id}] ${metadata}`);
      }
    }
    if (comparisonIntelligence.products.length) {
      lines.push(`Produtos comparáveis (${comparisonIntelligence.products.length}):`);
      for (const item of comparisonIntelligence.products.slice(0, 35)) {
        const metadata = [
          `produto=${compact(item.name, 140)}`,
          item.sku ? `sku=${compact(item.sku, 80)}` : null,
          item.brand ? `marca=${compact(item.brand, 100)}` : null,
          item.price == null ? null : `preço=R$ ${item.price.toFixed(2)}`,
          item.promotionalPrice == null ? null : `promo=R$ ${item.promotionalPrice.toFixed(2)}`,
          item.cost == null ? null : `custo=R$ ${item.cost.toFixed(2)}`,
          item.marginPercent == null ? null : `margem=${item.marginPercent}%`,
          item.deliveryDays == null ? null : `prazo_dias=${item.deliveryDays}`,
          item.supplier ? `fornecedor=${compact(item.supplier, 100)}` : null,
          item.stockControlled ? `estoque=${item.stockQuantity ?? 0}` : "estoque=não_controlado",
          `sinais_30d=${item.recentSignalCount}`,
        ].filter(Boolean).join(" | ");
        lines.push(`- [${item.id}] ${metadata}`);
      }
    }
    lines.push("O Comparador Inteligente só compara atributos persistidos e sinais reais do tenant. Para concorrentes, quantidade de sinais indica cobertura observada, não superioridade. Não declare vencedor quando os critérios necessários estiverem ausentes; explicite quais dados faltam.");
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
    lines.push("", `### Biblioteca de Decisões — casos encerrados (${outcomes.length})`);
    lines.push(`Cobertura de resultado registrado nesta amostra: ${outcomesWithResult.length}/${outcomes.length} (${outcomeCoveragePercent}%).`);
    for (const item of outcomes) {
      const metadata = [
        `categoria=${item.category}`,
        `gravidade=${item.severity}`,
        item.confidence == null ? null : `confiança_original=${item.confidence}%`,
        item.impact == null ? null : `impacto_original=${item.impact}`,
        item.metric ? `métrica_original=${compact(item.metric, 120)}` : null,
        `fonte=${item.source}`,
        `primeira_detecção=${item.firstDetectedAt.toISOString()}`,
        `última_detecção=${item.lastDetectedAt.toISOString()}`,
        `resolvido=${item.resolvedAt?.toISOString() ?? item.updatedAt.toISOString()}`,
      ].filter(Boolean).join(" | ");
      lines.push(`- [${item.id}] ${compact(item.title, 180)} — ${metadata}`);
      if (item.detail) lines.push(`  Sinal/evidência contextual: ${compact(item.detail, 300)}`);
      if (item.recommendedAction) lines.push(`  Decisão/recomendação registrada: ${compact(item.recommendedAction, 300)}`);
      if (item.resultSummary) {
        lines.push(`  Resultado observado registrado: ${compact(item.resultSummary, 420)}`);
        lines.push("  Aprendizado permitido: usar este resultado como histórico do tenant, sem assumir causalidade entre recomendação e resultado quando ela não estiver explicitamente documentada.");
      } else {
        lines.push("  Resultado observado: não registrado; este caso não deve ser usado para afirmar o que funcionou ou falhou.");
      }
    }
    lines.push("A Biblioteca de Decisões é tenant-scoped e deriva dos próprios Casos Vendor encerrados. Ela não cria uma memória paralela e não compartilha aprendizado entre tenants. Casos sem resultado documentado contam como lacuna de aprendizado, não como sucesso ou fracasso.");
  }

  if (hasLearningContext) {
    lines.push("", "### Aprendizado acumulado do tenant — memória operacional isolada");
    lines.push(`Amostra recente=${tenantLearning.sampleSize} | casos_resolvidos=${tenantLearning.resolvedCases} | casos_com_resultado=${tenantLearning.casesWithOutcome} | cobertura_resultados=${tenantLearning.outcomeCoveragePercent}% | feedbacks=${tenantLearning.feedbackCount} | relevantes=${tenantLearning.relevantFeedback} | irrelevantes=${tenantLearning.irrelevantFeedback}`);
    for (const insight of tenantLearning.insights) {
      lines.push(`- aprendizado=${insight.kind} | confiança=${insight.confidence}% | amostra=${insight.sampleSize} | ${compact(insight.title, 180)}`);
      lines.push(`  Leitura: ${compact(insight.detail, 420)}`);
      if (insight.caseIds.length) lines.push(`  Evidências/Casos: ${insight.caseIds.join(",")}`);
    }
    lines.push("Este aprendizado pertence exclusivamente ao tenant atual. Use recorrência e feedback para ajustar prioridade e contexto, nunca para esconder sinais críticos. Resultados documentados podem servir como precedente, mas não prove causalidade sem evidência explícita. Não transfira preferências, padrões ou conclusões entre tenants.");
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
    "- 'Crie cenários' ou 'o que pode acontecer?': use Cenários e Previsões. Diferencie sempre dado observado, premissa e resultado do teste. Base usa pipeline ponderado persistido; otimista/adverso só incorporam impactos financeiros explícitos dos Casos Vendor.",
    "- 'Qual a previsão?': não transforme os cenários em probabilidade estatística. Informe a cobertura dos dados e explique que são testes condicionais até existir histórico suficiente para um modelo validado.",
    "- 'Compare X com Y': use primeiro a Base do Comparador Inteligente e compare somente critérios presentes dos dois lados. Separe fato persistido de sinal observado e diga quais critérios faltam para uma conclusão melhor.",
    "- 'Qual é melhor?': não dê vencedor genérico. Defina o critério pedido (preço, margem, prazo, estoque, condição, sinais etc.) e só conclua quando houver dados equivalentes para os candidatos.",
    "- 'O que estamos monitorando?': use a Watchlist automática e diferencie item configurado, item monitorado sem sinal recente e item com sinal ativo.",
    "- 'O que eu não estou vendo?': use primeiro os Pontos cegos verificáveis. Não transforme falta de evidência em evidência de ausência nem invente concorrente, risco ou evento.",
    "- 'Por que tomamos essa decisão?': use a Biblioteca de Decisões e combine sinal/evidência, recomendação original e resultado registrado; se algum elo não estiver disponível, diga exatamente o que falta.",
    "- 'O que funcionou?': use somente casos da Biblioteca com resultado observado registrado. Não atribua causalidade à recomendação sem documentação explícita.",
    "- 'O que aprendemos?' ou 'o que você sabe sobre minha empresa?': use primeiro Aprendizado acumulado do tenant, depois a Biblioteca de Decisões. Diferencie padrão observado, feedback, resultado e lacuna de cobertura. Nunca use aprendizado de outro tenant.",
    "- 'Como você está ficando mais inteligente?': explique a amostra, cobertura de resultados, feedbacks e padrões do tenant; não diga que o modelo-base foi treinado quando o que ocorreu foi aprendizado operacional persistido.",
    "- 'Tem algo para aprovar?': use somente a lista de aprovações pendentes acima.",
  );

  return lines.join("\n");
}
