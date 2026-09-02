from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    p = ROOT / path
    return p, p.read_text(encoding='utf-8')

def write(p, text):
    p.write_text(text, encoding='utf-8')

def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {count}')
    return text.replace(old, new, 1)

# ─────────────────────────────────────────────────────────────────────────────
# API: cards ativos, contexto consolidado e avanço somente para frente
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/api-server/src/routes/entregas.ts')
text = once(text, 'import { and, desc, eq } from "drizzle-orm";', 'import { and, desc, eq, inArray } from "drizzle-orm";', 'entregas drizzle import')
text = once(text,
    'import { requestSupportFeedback } from "../services/support-feedback.js";\n',
    'import { requestSupportFeedback } from "../services/support-feedback.js";\nimport { canAdvanceWorkCard, TERMINAL_WORK_STAGES } from "../lib/pipeline-progress.js";\n',
    'entregas progress import')

# Prevent automatic delivery status sync from regressing an operational card.
old = '''  if (linkedCard) {
    const nextStage = deliveryStage(entrega);
    const stageChanged = nextStage !== linkedCard.etapa;
    const [updatedCard] = await db.update(workCardsTable).set({
      etapa: nextStage,
'''
new = '''  if (linkedCard) {
    const requestedStage = deliveryStage(entrega);
    const nextStage = canAdvanceWorkCard("execucao", linkedCard.etapa, requestedStage) ? requestedStage : linkedCard.etapa;
    const stageChanged = nextStage !== linkedCard.etapa;
    const [updatedCard] = await db.update(workCardsTable).set({
      etapa: nextStage,
'''
text = once(text, old, new, 'delivery monotonic sync')

# Replace work-card listing with active-by-default enriched board payload.
old = '''router.get("/tenants/:tenantId/work-cards", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const { pipeline, etapa, leadId, dealId, entregaId } = req.query as Record<string, string | undefined>;
  const conditions = [eq(workCardsTable.tenantId, tenantId)];
  if (pipeline) conditions.push(eq(workCardsTable.pipeline, pipeline));
  if (etapa) conditions.push(eq(workCardsTable.etapa, etapa));
  if (leadId) conditions.push(eq(workCardsTable.leadId, leadId));
  if (dealId) conditions.push(eq(workCardsTable.dealId, dealId));
  if (entregaId) conditions.push(eq(workCardsTable.entregaId, entregaId));
  if (restrictedToOwnWork(req) && req.user?.sub) conditions.push(eq(workCardsTable.responsavelId, req.user.sub));

  const cards = await db.select().from(workCardsTable)
    .where(and(...conditions))
    .orderBy(workCardsTable.updatedAt, workCardsTable.createdAt);
  res.json(cards);
});
'''
new = '''router.get("/tenants/:tenantId/work-cards", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const { pipeline, etapa, leadId, dealId, entregaId, includeClosed } = req.query as Record<string, string | undefined>;
  const conditions = [eq(workCardsTable.tenantId, tenantId)];
  if (pipeline) conditions.push(eq(workCardsTable.pipeline, pipeline));
  if (etapa) conditions.push(eq(workCardsTable.etapa, etapa));
  if (leadId) conditions.push(eq(workCardsTable.leadId, leadId));
  if (dealId) conditions.push(eq(workCardsTable.dealId, dealId));
  if (entregaId) conditions.push(eq(workCardsTable.entregaId, entregaId));
  if (restrictedToOwnWork(req) && req.user?.sub) conditions.push(eq(workCardsTable.responsavelId, req.user.sub));

  const storedCards = await db.select().from(workCardsTable)
    .where(and(...conditions))
    .orderBy(workCardsTable.updatedAt, workCardsTable.createdAt);
  const cards = includeClosed === "1" ? storedCards : storedCards.filter((card) => !TERMINAL_WORK_STAGES.has(card.etapa));

  const leadIds = [...new Set(cards.map((card) => card.leadId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(cards.map((card) => card.responsavelId).filter((id): id is string => Boolean(id)))];
  const dealIds = [...new Set(cards.map((card) => card.dealId).filter((id): id is string => Boolean(id)))];
  const [leadRows, userRows, dealRows] = await Promise.all([
    leadIds.length ? db.select({ id: leadsTable.id, nome: leadsTable.nome, empresa: leadsTable.empresa }).from(leadsTable).where(inArray(leadsTable.id, leadIds)) : Promise.resolve([]),
    userIds.length ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
    dealIds.length ? db.select({ id: dealsTable.id, titulo: dealsTable.titulo }).from(dealsTable).where(inArray(dealsTable.id, dealIds)) : Promise.resolve([]),
  ]);
  const leadLabels = new Map(leadRows.map((lead) => [lead.id, lead.nome || lead.empresa || "Cliente"]));
  const userLabels = new Map(userRows.map((user) => [user.id, user.name || user.email || "Responsável"]));
  const dealLabels = new Map(dealRows.map((deal) => [deal.id, deal.titulo]));

  res.json(cards.map((card) => ({
    ...card,
    leadLabel: card.leadId ? leadLabels.get(card.leadId) ?? null : null,
    responsavelLabel: card.responsavelId ? userLabels.get(card.responsavelId) ?? null : null,
    dealTitle: card.dealId ? dealLabels.get(card.dealId) ?? null : null,
  })));
});

router.get("/tenants/:tenantId/leads-overview-context", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const dealConditions = [eq(dealsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, dealsTable)];
  const workConditions = [eq(workCardsTable.tenantId, tenantId)];
  if (restrictedToOwnWork(req) && req.user?.sub) workConditions.push(eq(workCardsTable.responsavelId, req.user.sub));

  const [deals, workCards, proposals, users] = await Promise.all([
    db.select({
      id: dealsTable.id,
      leadId: dealsTable.leadId,
      titulo: dealsTable.titulo,
      etapa: dealsTable.etapa,
      aquecimentoTipo: dealsTable.aquecimentoTipo,
      relationshipStage: dealsTable.relationshipStage,
    }).from(dealsTable).where(and(...dealConditions)),
    db.select({
      id: workCardsTable.id,
      leadId: workCardsTable.leadId,
      codigo: workCardsTable.codigo,
      pipeline: workCardsTable.pipeline,
      etapa: workCardsTable.etapa,
    }).from(workCardsTable).where(and(...workConditions)),
    db.select({ leadId: propostasTable.leadId, valorTotal: propostasTable.valorTotal }).from(propostasTable).where(eq(propostasTable.tenantId, tenantId)),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.tenantId, tenantId)),
  ]);

  const byLeadId: Record<string, Array<{ pipeline: string; etapa: string; label: string; id: string; codigo?: string }>> = {};
  const push = (leadId: string | null, process: { pipeline: string; etapa: string; label: string; id: string; codigo?: string }) => {
    if (!leadId) return;
    (byLeadId[leadId] ??= []).push(process);
  };
  const commercialLabels: Record<string, string> = {
    novo: "Novo", qualificado: "Qualificado", proposta: "Orçamento", negociacao: "Negociação",
    conferencia_estoque: "Fechamento", contrato: "Contrato",
  };
  const partnerLabels: Record<string, string> = {
    parceiro_identificado: "Parceiro identificado", contato: "Contato", qualificacao: "Qualificação",
    proposta_parceria: "Proposta de parceria", negociacao: "Negociação",
  };

  for (const deal of deals) {
    if (!deal.leadId) continue;
    if (commercialLabels[deal.etapa]) {
      push(deal.leadId, { pipeline: "comercial", etapa: deal.etapa, label: commercialLabels[deal.etapa], id: deal.id });
      continue;
    }
    if (deal.etapa === "em_aquecimento" && deal.relationshipStage !== "aquecimento_retomado") {
      push(deal.leadId, { pipeline: "aquecimento", etapa: deal.relationshipStage || "aquecimento_lead", label: deal.aquecimentoTipo === "cliente" ? "Cliente em aquecimento" : "Lead em aquecimento", id: deal.id });
      continue;
    }
    if (deal.etapa === "parceiro" && !["parceiro_ativo", "inativo"].includes(deal.relationshipStage || "parceiro_identificado")) {
      const relationshipStage = deal.relationshipStage || "parceiro_identificado";
      push(deal.leadId, { pipeline: "parceiros", etapa: relationshipStage, label: partnerLabels[relationshipStage] || relationshipStage, id: deal.id });
    }
  }
  for (const card of workCards) {
    if (!card.leadId || TERMINAL_WORK_STAGES.has(card.etapa)) continue;
    push(card.leadId, {
      pipeline: card.pipeline,
      etapa: card.etapa,
      label: WORK_STAGE_LABELS[card.etapa] ?? card.etapa,
      id: card.id,
      codigo: card.codigo,
    });
  }

  const proposalTotalsByLeadId: Record<string, string> = {};
  for (const proposal of proposals) {
    if (!proposal.leadId || !proposal.valorTotal) continue;
    const current = Number(proposalTotalsByLeadId[proposal.leadId] || 0);
    const next = Number(proposal.valorTotal || 0);
    if (next > current) proposalTotalsByLeadId[proposal.leadId] = proposal.valorTotal;
  }
  const userLabelsById = Object.fromEntries(users.map((user) => [user.id, user.name || user.email || user.id]));
  res.json({ activeProcessesByLeadId: byLeadId, proposalTotalsByLeadId, userLabelsById });
});
'''
text = once(text, old, new, 'work cards active/context route')

# Enforce immutability of pipeline and forward-only stage progression.
anchor = '''  const targetPipeline = parsed.data.pipeline ?? existing.pipeline;
  const targetStage = parsed.data.etapa ?? existing.etapa;
'''
replace = '''  const targetPipeline = parsed.data.pipeline ?? existing.pipeline;
  const targetStage = parsed.data.etapa ?? existing.etapa;
  if (parsed.data.pipeline && parsed.data.pipeline !== existing.pipeline) {
    res.status(409).json({ error: "CARD_PIPELINE_IMMUTABLE", message: "Um card não muda de pipeline. A transferência cria um novo processo vinculado ao anterior." });
    return;
  }
  if (targetStage !== existing.etapa && !canAdvanceWorkCard(existing.pipeline, existing.etapa, targetStage)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card só pode avançar. Para retrabalho ou retorno, crie um novo ciclo vinculado ao card anterior." });
    return;
  }
'''
text = once(text, anchor, replace, 'work card forward guard')

# Report not solved => close current attempt and create a linked continuation, never rewind.
start = text.index('  const solved = parsed.data.situacaoFinal === "resolvido";\n', text.index('router.post("/work-cards/:id/support-report/confirm"'))
end_marker = '  res.json({ card: updated, feedbackRequested: solved });\n'
end = text.index(end_marker, start) + len(end_marker)
old_block = text[start:end]
new_block = '''  const solved = parsed.data.situacaoFinal === "resolvido";
  const now = new Date();
  if (solved) {
    const [updated] = await db.update(workCardsTable).set({
      etapa: "feedback_cliente",
      metadata: {
        ...(card.metadata ?? {}),
        supportReport: parsed.data,
        supportReportConfirmed: true,
        supportReportConfirmedAt: now.toISOString(),
        supportReportConfirmedBy: req.user?.sub ?? null,
      },
      updatedAt: now,
    }).where(eq(workCardsTable.id, card.id)).returning();
    await recordWorkHistory({
      tenantId: card.tenantId, leadId: card.leadId, dealId: card.dealId, tipo: "assistencia",
      titulo: `${card.codigo}: relatório da assistência confirmado`,
      descricao: `Diagnóstico: ${parsed.data.diagnostico || "não informado"}\nServiço: ${parsed.data.servicoExecutado || "não informado"}\nSituação: resolvido.`,
      responsavelId: card.responsavelId,
    });
    await ensureWorkStageTask(updated);
    void requestSupportFeedback(card.tenantId, card.id, req.log);
    res.json({ card: updated, feedbackRequested: true });
    return;
  }

  const [closedAttempt] = await db.update(workCardsTable).set({
    etapa: "fechamento_assistencia",
    dataFimEfetiva: now,
    metadata: {
      ...(card.metadata ?? {}),
      supportReport: parsed.data,
      supportReportConfirmed: true,
      supportReportConfirmedAt: now.toISOString(),
      supportReportConfirmedBy: req.user?.sub ?? null,
      supportCycleOutcome: "necessita_continuidade",
      substatus: parsed.data.situacaoFinal,
    },
    updatedAt: now,
  }).where(eq(workCardsTable.id, card.id)).returning();
  const [continuation] = await db.insert(workCardsTable).values({
    tenantId: card.tenantId,
    codigo: workCode("AST"),
    pipeline: "suporte",
    tipo: "assistencia_retorno",
    etapa: "execucao_assistencia",
    titulo: `Retorno • ${card.titulo}`,
    descricao: parsed.data.observacoes || parsed.data.recomendacoes || card.descricao,
    prioridade: card.prioridade,
    leadId: card.leadId,
    dealId: card.dealId,
    propostaId: card.propostaId,
    parentCardId: card.id,
    responsavelId: card.responsavelId,
    dataInicioEfetiva: now,
    metadata: {
      categoria: (card.metadata as any)?.categoria ?? null,
      produtos: (card.metadata as any)?.produtos ?? [],
      origem: "continuidade_relatorio",
      continuationOf: card.codigo,
      previousWorkCardId: card.id,
      previousOutcome: parsed.data.situacaoFinal,
      supportCycle: Number((card.metadata as any)?.supportCycle ?? 1) + 1,
    },
  }).returning();
  await recordWorkHistory({
    tenantId: card.tenantId, leadId: card.leadId, dealId: card.dealId, tipo: "assistencia",
    titulo: `${closedAttempt.codigo}: ciclo encerrado com necessidade de continuidade`,
    descricao: `O card não retrocedeu. Foi criado o retorno ${continuation.codigo} para continuar a execução. Situação: ${parsed.data.situacaoFinal}.`,
    responsavelId: card.responsavelId,
  });
  await ensureWorkStageTask(continuation);
  res.json({ card: continuation, previousCard: closedAttempt, feedbackRequested: false, continuationCreated: true });
'''
text = text[:start] + new_block + text[end:]
write(p, text)

# ─────────────────────────────────────────────────────────────────────────────
# API: comercial e relacionamento monotônicos
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/api-server/src/routes/deals.ts')
text = once(text,
    'import { z } from "zod";\n',
    'import { z } from "zod";\nimport { COMMERCIAL_STAGE_ORDER, PARTNER_STAGE_ORDER, SAAS_STAGE_ORDER, TERMINAL_DEAL_STAGES, isBackwardMove } from "../lib/pipeline-progress.js";\n',
    'deals progress import')
text = once(text,
    '    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa, assignedTo: dealsTable.assignedTo, wonAt: dealsTable.wonAt, vehicleReservationBlocked: dealsTable.vehicleReservationBlocked })\n',
    '    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa, etapaSaas: dealsTable.etapaSaas, relationshipStage: dealsTable.relationshipStage, assignedTo: dealsTable.assignedTo, wonAt: dealsTable.wonAt, vehicleReservationBlocked: dealsTable.vehicleReservationBlocked })\n',
    'deal existing select')
# Insert progression guards before handoff validation.
anchor = '''  if (handoff && (!parsed.data.etapa || parsed.data.etapa === existing.etapa)) {
'''
guard = '''  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa) {
    const target = parsed.data.etapa;
    if (TERMINAL_DEAL_STAGES.has(existing.etapa)) {
      res.status(409).json({ error: "CARD_CLOSED", message: "Processo comercial encerrado não pode ser reaberto. Inicie um novo processo vinculado ao mesmo cliente." });
      return;
    }
    if (existing.etapa === "em_aquecimento" || existing.etapa === "parceiro") {
      res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "A retomada de Aquecimento/Parceiros cria um novo processo; o card anterior permanece no histórico." });
      return;
    }
    const targetIsTransfer = target === "em_aquecimento" || target === "parceiro" || target === "perdido";
    if (!targetIsTransfer && isBackwardMove(COMMERCIAL_STAGE_ORDER, existing.etapa, target)) {
      res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card comercial só pode avançar. Etapas já concluídas permanecem no histórico." });
      return;
    }
  }
  if (existing.etapa === "parceiro" && parsed.data.relationshipStage && isBackwardMove(PARTNER_STAGE_ORDER, existing.relationshipStage || "parceiro_identificado", parsed.data.relationshipStage)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O processo de parceiro só pode avançar." });
    return;
  }
  if (parsed.data.etapaSaas && existing.etapaSaas && isBackwardMove(SAAS_STAGE_ORDER, existing.etapaSaas, parsed.data.etapaSaas)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card SaaS só pode avançar." });
    return;
  }

  if (handoff && (!parsed.data.etapa || parsed.data.etapa === existing.etapa)) {
'''
text = once(text, anchor, guard, 'deal forward guards')
write(p, text)

# ─────────────────────────────────────────────────────────────────────────────
# API: feedback negativo cria retorno, sem regressão do AST
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/api-server/src/services/support-feedback.ts')
text = once(text,
    'import { findLeadByDedup } from "../lib/dedup.js";\n',
    'import { findLeadByDedup } from "../lib/dedup.js";\nimport { randomUUID } from "node:crypto";\n',
    'feedback random import')
text = text.replace('"Se não tiver sido resolvido, o chamado volta automaticamente para execução.",', '"Se não tiver sido resolvido, abriremos automaticamente um retorno vinculado a esta assistência.",')
start = text.index('  const now = new Date();\n  const resolved = result === "sim";')
end_marker = '  return { handled: true, cardId: card.id, codigo: card.codigo, result: resolved ? "resolved" : "reopened" };\n'
end = text.index(end_marker, start) + len(end_marker)
new_block = '''  const now = new Date();
  const resolved = result === "sim";
  const feedbackLabel = result === "sim" ? "Resolvido" : result === "parcial" ? "Parcialmente resolvido" : "Não resolvido";

  if (resolved) {
    await db.update(workCardsTable).set({
      etapa: "fechamento_assistencia",
      dataFimEfetiva: now,
      metadata: {
        ...(card.metadata ?? {}),
        supportFeedbackStatus: result,
        supportFeedbackText: input.text.slice(0, 5000),
        supportFeedbackAt: now.toISOString(),
        supportCycleOutcome: "resolvido",
      },
      updatedAt: now,
    }).where(eq(workCardsTable.id, card.id));
    await db.insert(activitiesTable).values({
      tenantId: input.tenantId, leadId: lead.id, dealId: card.dealId, tipo: "assistencia",
      titulo: `${card.codigo}: feedback do cliente — ${feedbackLabel}`,
      descricao: "Cliente confirmou que a assistência resolveu o problema. Ciclo encerrado e preservado no histórico.",
      status: "concluida", concluidaEm: now, responsavelId: card.responsavelId,
    });
    input.log?.info?.({ workCardId: card.id, codigo: card.codigo, feedback: result }, "support-feedback: assistência encerrada");
    return { handled: true, cardId: card.id, codigo: card.codigo, result: "resolved" };
  }

  const reopenCount = Number((card.metadata as any)?.supportReopenCount ?? 0) + 1;
  await db.update(workCardsTable).set({
    etapa: "fechamento_assistencia",
    dataFimEfetiva: now,
    metadata: {
      ...(card.metadata ?? {}),
      supportFeedbackStatus: result,
      supportFeedbackText: input.text.slice(0, 5000),
      supportFeedbackAt: now.toISOString(),
      supportReopenCount: reopenCount,
      supportCycleOutcome: "necessita_retorno",
    },
    updatedAt: now,
  }).where(eq(workCardsTable.id, card.id));

  const returnCode = `AST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const [returnCard] = await db.insert(workCardsTable).values({
    tenantId: input.tenantId,
    codigo: returnCode,
    pipeline: "suporte",
    tipo: "assistencia_retorno",
    etapa: "execucao_assistencia",
    titulo: `Retorno • ${card.titulo}`,
    descricao: `Retorno aberto após feedback do cliente: ${feedbackLabel}.`,
    prioridade: card.prioridade,
    leadId: card.leadId,
    dealId: card.dealId,
    propostaId: card.propostaId,
    parentCardId: card.id,
    responsavelId: card.responsavelId,
    dataInicioEfetiva: now,
    metadata: {
      categoria: (card.metadata as any)?.categoria ?? null,
      produtos: (card.metadata as any)?.produtos ?? [],
      origem: "feedback_cliente",
      returnOf: card.codigo,
      previousWorkCardId: card.id,
      previousFeedback: result,
      supportReopenCount: reopenCount,
      supportCycle: Number((card.metadata as any)?.supportCycle ?? 1) + 1,
    },
  }).returning();

  await db.insert(activitiesTable).values({
    tenantId: input.tenantId, leadId: lead.id, dealId: card.dealId, tipo: "assistencia",
    titulo: `${card.codigo}: feedback do cliente — ${feedbackLabel}`,
    descricao: `O card anterior foi encerrado sem regressão. Retorno ${returnCard.codigo} criado automaticamente para nova execução.`,
    status: "concluida", concluidaEm: now, responsavelId: card.responsavelId,
  });
  await db.insert(activitiesTable).values({
    tenantId: input.tenantId, leadId: lead.id, dealId: card.dealId, tipo: "assistencia",
    titulo: `Executar retorno ${returnCard.codigo}`,
    descricao: `Feedback recebido: ${feedbackLabel}. Revisar diagnóstico, definir próxima ação e reagendar se necessário.`,
    status: "planejado", responsavelId: card.responsavelId,
    dataVencimento: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  input.log?.info?.({ previousWorkCardId: card.id, workCardId: returnCard.id, codigo: returnCard.codigo, feedback: result }, "support-feedback: retorno criado sem regressão");
  return { handled: true, cardId: returnCard.id, codigo: returnCard.codigo, result: "reopened" };
'''
text = text[:start] + new_block + text[end:]
write(p, text)

# ─────────────────────────────────────────────────────────────────────────────
# UI: Pipeline Operacional — uma chamada inicial, padrão visual e forward-only
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/frontend/src/pages/PipelineOperacional.tsx')
text = once(text,
    'import { SupportReportPanel } from "@/components/SupportReportPanel";\n',
    'import { SupportReportPanel } from "@/components/SupportReportPanel";\nimport { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";\n',
    'operational pipeline nav import')
text = text.replace('  updatedAt?: string;\n};', '  updatedAt?: string;\n  leadLabel?: string | null;\n  responsavelLabel?: string | null;\n  dealTitle?: string | null;\n};', 1)
# Lazy context queries to stop HTTP burst / 429.
text = once(text,
    '''  const leadsQuery = useQuery<Lead[]>({
    queryKey: ["work-card-leads", tenantId], enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/leads`),
  });
  const usersQuery = useQuery<User[]>({
    queryKey: ["work-card-users", tenantId], enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/users`),
  });
  const dealsQuery = useQuery<Deal[]>({
    queryKey: ["work-card-deals", tenantId], enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/deals`),
  });
  const proposalsQuery = useQuery<Proposal[]>({
    queryKey: ["work-card-proposals", tenantId], enabled: !!tenantId,
    queryFn: () => api(`/api/tenants/${tenantId}/propostas`),
  });
''',
    '''  const needsContext = supportOpen || deliveryOpen || Boolean(selectedCard);
  const leadsQuery = useQuery<Lead[]>({
    queryKey: ["work-card-leads", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/leads`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const usersQuery = useQuery<User[]>({
    queryKey: ["work-card-users", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/users`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const dealsQuery = useQuery<Deal[]>({
    queryKey: ["work-card-deals", tenantId], enabled: !!tenantId && needsContext,
    queryFn: () => api(`/api/tenants/${tenantId}/deals`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const proposalsQuery = useQuery<Proposal[]>({
    queryKey: ["work-card-proposals", tenantId], enabled: !!tenantId && (supportOpen || deliveryOpen),
    queryFn: () => api(`/api/tenants/${tenantId}/propostas`), staleTime: 60_000, refetchOnWindowFocus: false,
  });
''',
    'operational lazy queries')
# cards query cache options
text = text.replace('    queryFn: () => api(`/api/tenants/${tenantId}/work-cards?pipeline=${pipeline}`),\n  });', '    queryFn: () => api(`/api/tenants/${tenantId}/work-cards?pipeline=${pipeline}`),\n    staleTime: 15_000, refetchOnWindowFocus: false,\n  });', 1)
# Replace nav area
nav_old = '''      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
        <Button size="sm" variant="ghost" onClick={() => setPipeline("comercial")}>Comercial</Button>
        <Button size="sm" variant={pipeline === "execucao" ? "default" : "ghost"} onClick={() => setPipeline("execucao")}>Execução / Pedidos</Button>
        <Button size="sm" variant={pipeline === "suporte" ? "default" : "ghost"} onClick={() => setPipeline("suporte")}>Suporte / Assistência</Button>
        <Button size="sm" variant="ghost" onClick={() => setPipeline("aquecimento")}>Aquecimento</Button>
        <Button size="sm" variant="ghost" onClick={() => setPipeline("parceiros")}>Parceiros</Button>
      </div>
'''
text = once(text, nav_old, '      <PipelineNav active={pipeline} />\n', 'operational shared nav')
# Add forward-only helper after cards.
text = once(text,
    '  const stages = pipeline === "suporte" ? SUPPORT_STAGES : EXECUTION_STAGES;\n  const cards = cardsQuery.data ?? [];\n',
    '  const stages = pipeline === "suporte" ? SUPPORT_STAGES : EXECUTION_STAGES;\n  const cards = cardsQuery.data ?? [];\n  const stageIndex = (stage: string) => stages.findIndex(([key]) => key === stage);\n  const canMoveForward = (card: WorkCard, target: string) => target === card.etapa || stageIndex(target) >= stageIndex(card.etapa);\n',
    'operational forward helper')
# Column class and drop guard.
text = text.replace('className="flex w-80 shrink-0 flex-col rounded-xl border bg-muted/20"', 'className={PIPELINE_COLUMN_CLASS}', 1)
text = text.replace('''              onDrop={() => {
                if (draggedId) patchCard.mutate({ id: draggedId, data: { etapa: key } });
                setDraggedId(null);
              }}''', '''              onDrop={() => {
                const dragged = cards.find((card) => card.id === draggedId);
                if (dragged && !canMoveForward(dragged, key)) {
                  toast({ title: "Movimento não permitido", description: "O card só pode avançar. Etapas já concluídas ficam no histórico.", variant: "destructive" });
                } else if (draggedId) {
                  patchCard.mutate({ id: draggedId, data: { etapa: key } });
                }
                setDraggedId(null);
              }}''', 1)
text = text.replace('className="flex items-center justify-between border-b px-3 py-2.5"', 'className={PIPELINE_COLUMN_HEADER_CLASS}', 1)
text = text.replace('className="cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition hover:shadow-md"', 'className={PIPELINE_CARD_CLASS}', 1)
# Use enriched labels without loading 4 extra resources.
text = text.replace('''                  const lead = card.leadId ? leadMap.get(card.leadId) : undefined;
                  const responsible = card.responsavelId ? userMap.get(card.responsavelId) : undefined;
''', '''                  const lead = card.leadLabel || (card.leadId ? (leadMap.get(card.leadId)?.nome || leadMap.get(card.leadId)?.empresa) : undefined);
                  const responsible = card.responsavelLabel || (card.responsavelId ? (userMap.get(card.responsavelId)?.name || userMap.get(card.responsavelId)?.email) : undefined);
''', 1)
text = text.replace('{lead && <p className="mt-2 truncate text-xs text-muted-foreground">{lead.nome || lead.empresa || "Cliente"}</p>}', '{lead && <p className="mt-2 truncate text-xs text-muted-foreground">{lead}</p>}', 1)
text = text.replace('<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" /> {responsible.name || responsible.email}</p>', '<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" /> {responsible}</p>', 1)
text = text.replace('{selectedCard.leadId ? (leadMap.get(selectedCard.leadId)?.nome || leadMap.get(selectedCard.leadId)?.empresa || "—") : "—"}', '{selectedCard.leadLabel || (selectedCard.leadId ? (leadMap.get(selectedCard.leadId)?.nome || leadMap.get(selectedCard.leadId)?.empresa || "—") : "—")}', 1)
text = text.replace('{selectedCard.dealId ? (dealMap.get(selectedCard.dealId)?.titulo || "—") : "—"}', '{selectedCard.dealTitle || (selectedCard.dealId ? (dealMap.get(selectedCard.dealId)?.titulo || "—") : "—")}', 1)
# Dropdown only current/future stages.
text = text.replace('{stages.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}', '{stages.filter(([key]) => stageIndex(key) >= stageIndex(selectedCard.etapa)).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}', 1)
write(p, text)

# ─────────────────────────────────────────────────────────────────────────────
# UI: Relacionamento — padrão visual, avanço de parceiros e retomada em novo ciclo
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/frontend/src/pages/PipelineRelacionamento.tsx')
text = once(text,
    'import { UserRound, Flame, Handshake, ArrowRight, CalendarDays } from "lucide-react";\n',
    'import { UserRound, ArrowRight, CalendarDays } from "lucide-react";\nimport { PipelineNav, PIPELINE_CARD_CLASS, PIPELINE_COLUMN_CLASS, PIPELINE_COLUMN_HEADER_CLASS } from "@/components/PipelineNav";\n',
    'relationship shared nav import')
text = text.replace('  const warmingDeals = deals.filter((d) => d.etapa === "em_aquecimento");', '  const warmingDeals = deals.filter((d) => d.etapa === "em_aquecimento" && d.relationshipStage !== "aquecimento_retomado");')
text = text.replace('  const partnerDeals = deals.filter((d) => d.etapa === "parceiro");', '  const partnerDeals = deals.filter((d) => d.etapa === "parceiro" && !["parceiro_ativo", "inativo"].includes(d.relationshipStage || "parceiro_identificado"));')
# Add resume mutation after patchDeal.
anchor = '''  const patchDeal = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api(`/api/deals/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["relationship-deals", tenantId] }); },
    onError: (error) => toast({ title: "Não foi possível atualizar o card", description: String(error), variant: "destructive" }),
  });
'''
replacement = anchor + '''
  const resumeCommercial = useMutation({
    mutationFn: async (deal: Deal) => {
      if (!deal.leadId) throw new Error("O processo precisa estar vinculado a um cliente.");
      const created = await api<Deal>("/api/deals", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ tenantId, leadId: deal.leadId, titulo: `${deal.titulo} — Retomada`, etapa: "novo", assignedTo: deal.assignedTo ?? null }),
      });
      await api(`/api/deals/${deal.id}`, {
        method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ relationshipStage: "aquecimento_retomado" }),
      });
      return created;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["relationship-deals", tenantId] });
      toast({ title: "Novo ciclo comercial criado", description: "O card de aquecimento foi encerrado no histórico e uma nova oportunidade entrou em Novo." });
      navigate("/deals");
    },
    onError: (error) => toast({ title: "Não foi possível retomar o comercial", description: String(error), variant: "destructive" }),
  });
'''
text = once(text, anchor, replacement, 'relationship resume mutation')
# Card class.
text = text.replace('className="cursor-pointer rounded-lg border bg-card p-3 shadow-sm hover:shadow-md"', 'className={PIPELINE_CARD_CLASS}', 1)
# Shared nav replace.
nav_start = text.index('      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">')
nav_end = text.index('      </div>\n\n      {tab === "aquecimento"', nav_start) + len('      </div>\n')
text = text[:nav_start] + '      <PipelineNav active={tab} />\n' + text[nav_end:]
# Warming column styles and resume action.
text = text.replace('className="min-h-[420px] rounded-xl border bg-muted/20"', 'className={`${PIPELINE_COLUMN_CLASS} min-h-[420px] w-full`}', 1)
text = text.replace('className="flex items-center justify-between border-b px-3 py-2.5"', 'className={PIPELINE_COLUMN_HEADER_CLASS}', 1)
text = text.replace('onClick={() => patchDeal.mutate({ id: deal.id, data: { etapa: "novo", aquecimentoTipo: null, relationshipStage: null } })}', 'onClick={() => resumeCommercial.mutate(deal)}', 1)
# Partner forward-only drop, style, terminal columns stay as drop targets but cards disappear after drop.
old = '''              <section key={key} className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (draggedId) patchDeal.mutate({ id: draggedId, data: { etapa: "parceiro", relationshipStage: key } }); setDraggedId(null); }}>'''
new = '''              <section key={key} className={PIPELINE_COLUMN_CLASS} onDragOver={(e) => e.preventDefault()} onDrop={() => {
                const dragged = partnerDeals.find((deal) => deal.id === draggedId);
                const currentIndex = PARTNER_STAGES.findIndex(([stage]) => stage === (dragged?.relationshipStage || "parceiro_identificado"));
                const targetIndex = PARTNER_STAGES.findIndex(([stage]) => stage === key);
                if (dragged && targetIndex < currentIndex) {
                  toast({ title: "Movimento não permitido", description: "O card de parceiro só pode avançar. Etapas anteriores ficam no histórico.", variant: "destructive" });
                } else if (draggedId) {
                  patchDeal.mutate({ id: draggedId, data: { etapa: "parceiro", relationshipStage: key } });
                }
                setDraggedId(null);
              }}>'''
text = once(text, old, new, 'partner forward drop')
# second occurrence header class partner
text = text.replace('className="flex items-center justify-between border-b px-3 py-2.5"', 'className={PIPELINE_COLUMN_HEADER_CLASS}', 1)
write(p, text)

# ─────────────────────────────────────────────────────────────────────────────
# UI: Leads — processos ativos + menos chamadas simultâneas
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/frontend/src/pages/Leads.tsx')
# React Query import
text = once(text, 'import { useMutation, useQueryClient } from "@tanstack/react-query";', 'import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";', 'leads useQuery import')
# Remove proposal hooks imports; keep user hooks for lazy assignment dialog.
text = text.replace('  useListPropostas,\n  getListPropostasQueryKey,\n', '')
# Insert process type/component after STATUS_STYLES.
anchor = '''const STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700 border-blue-200",
  qualificado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  nao_qualificado: "bg-zinc-100 text-zinc-600 border-zinc-200",
  convertido: "bg-violet-100 text-violet-700 border-violet-200",
  perdido: "bg-red-100 text-red-600 border-red-200",
  quente: "bg-amber-100 text-amber-700 border-amber-200",
};
'''
addition = anchor + '''
type ActiveProcess = { pipeline: string; etapa: string; label: string; id: string; codigo?: string };
type LeadsOverviewContext = {
  activeProcessesByLeadId: Record<string, ActiveProcess[]>;
  proposalTotalsByLeadId: Record<string, string>;
  userLabelsById: Record<string, string>;
};

const PROCESS_LABELS: Record<string, string> = {
  comercial: "COMERCIAL",
  execucao: "EXECUÇÃO",
  suporte: "SUPORTE",
  aquecimento: "AQUECIMENTO",
  parceiros: "PARCEIROS",
};

function ActiveProcessBadges({ processes }: { processes: ActiveProcess[] | undefined }) {
  if (!processes?.length) return <span className="text-xs text-muted-foreground">—</span>;
  const visible = processes.slice(0, 2);
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((process) => (
        <Badge key={`${process.pipeline}-${process.id}`} variant="outline" className="max-w-[220px] text-[10px] font-medium">
          <span className="font-semibold">{PROCESS_LABELS[process.pipeline] || process.pipeline.toUpperCase()}</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="truncate">{process.label}</span>
        </Badge>
      ))}
      {processes.length > visible.length && <Badge variant="secondary" className="text-[10px]">+{processes.length - visible.length}</Badge>}
    </div>
  );
}
'''
text = once(text, anchor, addition, 'lead process badges')
# Replace proposals hook + eager users with overview and lazy users.
old = '''  const { data: propostas } = useListPropostas(tenantId, undefined, {
    query: {
      enabled: !!tenantId,
      queryKey: getListPropostasQueryKey(tenantId),
    },
  });

  const { data: briefings = [] } = useListTenantBriefings(tenantId, {
'''
new = '''  const { data: overview } = useQuery<LeadsOverviewContext>({
    queryKey: ["leads-overview-context", tenantId],
    enabled: !!tenantId && viewMode === "ativos",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/leads-overview-context`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(`Erro ${response.status}`);
      return response.json();
    },
  });

  const { data: briefings = [] } = useListTenantBriefings(tenantId, {
'''
text = once(text, old, new, 'lead overview query')
old = '''  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId, queryKey: getListTenantUsersQueryKey(tenantId) },
  });

  const userMap = new Map(tenantUsers.map((u) => [u.id, u.name || u.email || u.id]));
'''
new = '''  const { data: tenantUsers = [] } = useListTenantUsers(tenantId, {
    query: { enabled: !!tenantId && assignDialog.open, queryKey: getListTenantUsersQueryKey(tenantId), staleTime: 60_000, refetchOnWindowFocus: false },
  });

  const userMap = new Map(Object.entries(overview?.userLabelsById ?? {}));
'''
text = once(text, old, new, 'lead lazy users')
# Replace proposal total map block.
pattern = re.compile(r'  // Map: leadId → maior valor total de proposta\n  const leadValorMap = new Map<string, string>\(\);\n  for \(const p of propostas \?\? \[\]\) \{[\s\S]*?\n  \}\n', re.M)
m = pattern.search(text)
if not m:
    raise SystemExit('lead proposal total block not found')
text = text[:m.start()] + '  const leadValorMap = new Map<string, string>(Object.entries(overview?.proposalTotalsByLeadId ?? {}));\n' + text[m.end():]
# Add processes to mobile badges.
mobile_anchor = '''                        <BriefingBadge briefing={briefingMap.get(lead.id)} />
                        {churnBadge(ci?.churnRisk, ci?.churnReasons)}
'''
text = once(text, mobile_anchor, '''                        <BriefingBadge briefing={briefingMap.get(lead.id)} />
                        {churnBadge(ci?.churnRisk, ci?.churnReasons)}
                        <ActiveProcessBadges processes={overview?.activeProcessesByLeadId?.[lead.id]} />
''', 'lead mobile active process')
# Desktop table header new column after status.
text = once(text, '                  <TableHead>Status</TableHead>\n                  <TableHead>Responsável</TableHead>', '                  <TableHead>Status</TableHead>\n                  <TableHead>Pipelines ativas</TableHead>\n                  <TableHead>Responsável</TableHead>', 'lead desktop process header')
# skeleton count and colspan
text = text.replace('Array.from({ length: 7 })', 'Array.from({ length: 8 })', 1)
text = text.replace('colSpan={8}', 'colSpan={9}', 1)
# Add desktop process cell after status cell.
status_cell = '''                        <TableCell>
                          <Badge
                            variant="outline"
                            className={STATUS_STYLES[lead.status] ?? ""}
                          >
                            {LEAD_STATUSES.find((s) => s.value === lead.status)?.label ??
                              lead.status}
                          </Badge>
                        </TableCell>
'''
text = once(text, status_cell, status_cell + '''                        <TableCell className="min-w-[180px]">
                          <ActiveProcessBadges processes={overview?.activeProcessesByLeadId?.[lead.id]} />
                        </TableCell>
''', 'lead desktop process cell')
write(p, text)

# ─────────────────────────────────────────────────────────────────────────────
# UI: Comercial — selector único, cartões terminais somem e SaaS forward-only
# ─────────────────────────────────────────────────────────────────────────────
p, text = read('artifacts/frontend/src/pages/Deals.tsx')
text = once(text,
    'import { ContractGeneratorModal } from "@/components/ContractGeneratorModal";\n',
    'import { ContractGeneratorModal } from "@/components/ContractGeneratorModal";\nimport { PipelineNav } from "@/components/PipelineNav";\n',
    'deals shared nav import')
# Terminal cards are history; terminal columns remain empty drop targets.
old = '''function dealsForColumn(col: KanbanColumnDef, deals: Deal[]): Deal[] {
  if (col.dropId === "aquecimento_nao_cliente") {
'''
new = '''function dealsForColumn(col: KanbanColumnDef, deals: Deal[]): Deal[] {
  if (["ganho", "perdido"].includes(col.onDrop.etapa)) return [];
  if (col.dropId === "aquecimento_nao_cliente") {
'''
text = once(text, old, new, 'commercial terminal hide')
# Standardize commercial column dimensions/fonts.
text = text.replace('className="flex flex-col w-72 shrink-0 h-full min-h-0"', 'className="flex w-80 shrink-0 flex-col h-full min-h-0 rounded-xl border bg-muted/20"', 1)
text = text.replace('className="sticky top-0 z-10 flex items-center justify-between mb-2 px-1 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"', 'className="sticky top-0 z-10 flex min-h-11 items-center justify-between border-b px-3 py-2.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"', 1)
text = text.replace('className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}', 'className="text-sm font-semibold text-foreground"', 1)
text = text.replace('className={`flex-1 min-h-0 overflow-y-auto rounded-lg p-2 space-y-2 transition-colors ${', 'className={`flex-1 min-h-0 overflow-y-auto rounded-b-xl p-2 space-y-2 transition-colors ${', 1)
# Header count excludes terminal and relationship cards.
text = text.replace('{deals.filter((d) => !["em_aquecimento", "parceiro", "em_execucao", "entregue"].includes(d.etapa)).length} negócios na pipeline comercial', '{deals.filter((d) => !["em_aquecimento", "parceiro", "em_execucao", "ganho", "entregue", "perdido"].includes(d.etapa)).length} negócios ativos na pipeline comercial', 1)
# Remove old Pipelines button and insert shared selector after header.
text = text.replace('        <Button variant="outline" className="gap-2" onClick={() => navigate("/pipeline-operacional")}><KanbanSquare className="h-4 w-4" /> Pipelines</Button>\n', '', 1)
header_end = '      </div>\n\n      {/* Pipeline mode tabs */}'
if header_end in text:
    text = text.replace(header_end, '      </div>\n\n      <PipelineNav active="comercial" />\n\n      {/* Pipeline mode tabs */}', 1)
else:
    # fallback insert before first desktop/mobile pipeline body marker
    marker = '      {/* Mobile column selector */}'
    if marker not in text:
        raise SystemExit('Deals pipeline selector insertion marker not found')
    text = text.replace(marker, '      <PipelineNav active="comercial" />\n\n' + marker, 1)
# SaaS cards cannot regress either.
saas_anchor = '''      if (!draggedDeal || !targetEtapa) return;
      if (draggedDeal.etapaSaas === targetEtapa.value) return;

      const novaProb = ETAPA_SAAS_PROBABILIDADE[targetEtapa.value];
'''
saas_replace = '''      if (!draggedDeal || !targetEtapa) return;
      if (draggedDeal.etapaSaas === targetEtapa.value) return;
      const currentSaasIndex = ETAPAS_SAAS.findIndex((stage) => stage.value === draggedDeal.etapaSaas);
      const targetSaasIndex = ETAPAS_SAAS.findIndex((stage) => stage.value === targetEtapa.value);
      if (currentSaasIndex >= 0 && targetSaasIndex < currentSaasIndex) {
        toast({ title: "Movimento não permitido", description: "O card SaaS só pode avançar. Etapas já concluídas permanecem no histórico.", variant: "destructive" });
        return;
      }

      const novaProb = ETAPA_SAAS_PROBABILIDADE[targetEtapa.value];
'''
text = once(text, saas_anchor, saas_replace, 'saas forward guard')
write(p, text)

print('pipeline active-process patch applied')
