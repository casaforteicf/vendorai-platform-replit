from pathlib import Path
import re

ROOT = Path('.')

def load(path):
    p = ROOT / path
    return p, p.read_text(encoding='utf-8')

def save(p, text):
    p.write_text(text, encoding='utf-8')

def once(text, old, new, label):
    c = text.count(old)
    if c != 1:
        raise SystemExit(f'{label}: esperado 1 match, encontrado {c}')
    return text.replace(old, new, 1)

# ── deals schema: contexto de relacionamento ────────────────────────────────
p, text = load('lib/db/src/schema/deals.ts')
text = once(text,
    '  aquecimentoTipo: text("aquecimento_tipo"),\n',
    '  aquecimentoTipo: text("aquecimento_tipo"),\n  relationshipStage: text("relationship_stage"),\n',
    'deals relationshipStage')
save(p, text)

# ── App: rota Pipeline Relacionamento ───────────────────────────────────────
p, text = load('artifacts/frontend/src/App.tsx')
text = once(text,
    'const PipelineOperacional = lazy(() => import("@/pages/PipelineOperacional"));\n',
    'const PipelineOperacional = lazy(() => import("@/pages/PipelineOperacional"));\nconst PipelineRelacionamento = lazy(() => import("@/pages/PipelineRelacionamento"));\n',
    'App import relationship')
text = once(text,
    '        <Route path="/pipeline-operacional">\n          <ProtectedRoute component={PipelineOperacional} />\n        </Route>\n',
    '        <Route path="/pipeline-operacional">\n          <ProtectedRoute component={PipelineOperacional} />\n        </Route>\n        <Route path="/pipeline-relacionamento">\n          <ProtectedRoute component={PipelineRelacionamento} />\n        </Route>\n',
    'App relationship route')
save(p, text)

# ── Sidebar: um único item Pipelines ────────────────────────────────────────
p, text = load('artifacts/frontend/src/components/layout/SidebarLayout.tsx')
text = once(text,
    '"/deals", "/pipeline-operacional", "/base-conhecimento"',
    '"/deals", "/pipeline-operacional", "/pipeline-relacionamento", "/base-conhecimento"',
    'sidebar start plan')
text = once(text,
    'leads:      ["/leads", "/deals", "/pipeline-operacional"],',
    'leads:      ["/leads", "/deals", "/pipeline-operacional", "/pipeline-relacionamento"],',
    'sidebar module hrefs')
text = once(text,
    '{ name: "Pipeline Execução / Suporte", href: "/pipeline-operacional", icon: KanbanSquare, sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },',
    '{ name: "Pipelines", href: "/pipeline-operacional", icon: KanbanSquare, sellerHidden: false, section: "crm", fn: ["vendedor", "suporte", "entrega", "administrador", "outro"] as UserFunction[] },',
    'sidebar pipelines label')
save(p, text)

# ── Deals: Comercial separado, Fechamento → Contrato → Pedido ───────────────
p, text = load('artifacts/frontend/src/pages/Deals.tsx')
start = text.index('const ETAPAS:')
end = text.index('// ─── Kanban Column Definitions', start)
new_constants = '''const ETAPAS: { value: string; label: string; color: string; bg: string }[] = [
  { value: "novo",                label: "Novo",        color: "text-slate-600",   bg: "bg-slate-100" },
  { value: "qualificado",         label: "Qualificado", color: "text-blue-600",    bg: "bg-blue-100" },
  { value: "proposta",            label: "Orçamento",   color: "text-violet-600",  bg: "bg-violet-100" },
  { value: "negociacao",          label: "Negociação",  color: "text-amber-600",   bg: "bg-amber-100" },
  { value: "conferencia_estoque", label: "Fechamento",  color: "text-indigo-600",  bg: "bg-indigo-100" },
  { value: "contrato",            label: "Contrato",    color: "text-sky-600",     bg: "bg-sky-100" },
  { value: "ganho",               label: "Pedido",      color: "text-emerald-600", bg: "bg-emerald-100" },
  { value: "perdido",             label: "Perdido",     color: "text-red-600",     bg: "bg-red-100" },
];

const ETAPA_PROBABILIDADE: Record<string, number> = {
  em_aquecimento: 5,
  novo: 10,
  qualificado: 25,
  proposta: 50,
  negociacao: 70,
  conferencia_estoque: 82,
  contrato: 92,
  ganho: 100,
  em_execucao: 100,
  entregue: 100,
  perdido: 0,
  parceiro: 5,
};

'''
text = text[:start] + new_constants + text[end:]

start = text.index('const KANBAN_COLUMNS:')
end = text.index('/** Map deals to their visual column ID', start)
new_kanban = '''const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { dropId: "novo", label: "Novo", color: "text-slate-600", bg: "bg-slate-100", order: 1, isSpecial: false, onDrop: { etapa: "novo" } },
  { dropId: "qualificado", label: "Qualificado", color: "text-blue-600", bg: "bg-blue-100", order: 2, isSpecial: false, onDrop: { etapa: "qualificado" } },
  { dropId: "proposta", label: "Orçamento", color: "text-violet-600", bg: "bg-violet-100", order: 3, isSpecial: false, onDrop: { etapa: "proposta" } },
  { dropId: "negociacao", label: "Negociação", color: "text-amber-600", bg: "bg-amber-100", order: 4, isSpecial: false, onDrop: { etapa: "negociacao" } },
  { dropId: "conferencia_estoque", label: "Fechamento", color: "text-indigo-600", bg: "bg-indigo-100", order: 5, isSpecial: false, onDrop: { etapa: "conferencia_estoque" } },
  { dropId: "contrato", label: "Contrato", color: "text-sky-600", bg: "bg-sky-100", order: 6, isSpecial: false, onDrop: { etapa: "contrato" } },
  { dropId: "ganho", label: "Pedido", color: "text-emerald-600", bg: "bg-emerald-100", order: 7, isSpecial: false, onDrop: { etapa: "ganho" } },
  { dropId: "perdido", label: "Perdido", color: "text-red-600", bg: "bg-red-100", order: -1, isSpecial: true, onDrop: { etapa: "perdido" } },
];

'''
text = text[:start] + new_kanban + text[end:]
text = text.replace('onDrop: { etapa: DealEtapa; aquecimentoTipo?: string | null };', 'onDrop: { etapa: string; aquecimentoTipo?: string | null };')
text = text.replace('const TERMINAL_ETAPAS = new Set<string>(["ganho", "entregue", "perdido", "parceiro"]);', 'const TERMINAL_ETAPAS = new Set<string>(["ganho", "entregue", "perdido"]);')
text = text.replace('description: "Cards só podem avançar no funil. Retroceder é permitido de Novo → Aquecimento e Ganho → Aquecimento.",', 'description: "Cards só podem avançar no funil comercial. Aquecimento e Parceiros possuem pipelines próprias.",')
text = text.replace('const isGanhoToAquecimento =\n        sourceColId === "ganho" &&\n        (targetCol.dropId === "aquecimento_nao_cliente" || targetCol.dropId === "aquecimento_cliente");\n      const isNovoToAquecimento =\n        sourceColId === "novo" &&\n        (targetCol.dropId === "aquecimento_nao_cliente" || targetCol.dropId === "aquecimento_cliente");\n\n', '')
text = text.replace('        !isGanhoToAquecimento &&\n        !isNovoToAquecimento\n', '')
text = text.replace('<KanbanSquare className="h-4 w-4" /> Execução / Suporte', '<KanbanSquare className="h-4 w-4" /> Pipelines')
text = text.replace('{deals.length} negócios no pipeline', '{deals.filter((d) => !["em_aquecimento", "parceiro", "em_execucao", "entregue"].includes(d.etapa)).length} negócios na pipeline comercial')
save(p, text)

# ── Pipeline Operacional: nav 5 pipelines + painel de relatório ─────────────
p, text = load('artifacts/frontend/src/pages/PipelineOperacional.tsx')
text = once(text,
    'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";\n',
    'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";\nimport { SupportReportPanel } from "@/components/SupportReportPanel";\n',
    'operational report import')
text = once(text,
    '  function setPipeline(next: PipelineKind | "comercial") {\n    if (next === "comercial") navigate("/deals");\n    else navigate(`/pipeline-operacional?tab=${next}`);\n  }\n',
    '  function setPipeline(next: PipelineKind | "comercial" | "aquecimento" | "parceiros") {\n    if (next === "comercial") navigate("/deals");\n    else if (next === "aquecimento" || next === "parceiros") navigate(`/pipeline-relacionamento?tab=${next}`);\n    else navigate(`/pipeline-operacional?tab=${next}`);\n  }\n',
    'operational setPipeline')
text = text.replace('Comercial, execução de pedidos e suporte ligados ao mesmo cliente.', 'Comercial, execução, suporte, aquecimento e parceiros ligados à mesma base de clientes.')
text = once(text,
    '        <Button size="sm" variant={pipeline === "suporte" ? "default" : "ghost"} onClick={() => setPipeline("suporte")}>Suporte / Assistência</Button>\n',
    '        <Button size="sm" variant={pipeline === "suporte" ? "default" : "ghost"} onClick={() => setPipeline("suporte")}>Suporte / Assistência</Button>\n        <Button size="sm" variant="ghost" onClick={() => setPipeline("aquecimento")}>Aquecimento</Button>\n        <Button size="sm" variant="ghost" onClick={() => setPipeline("parceiros")}>Parceiros</Button>\n',
    'operational nav buttons')
anchor = '                {selectedCard.descricao && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Relato / observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{selectedCard.descricao}</p></div>}\n\n'
report = '''                {selectedCard.descricao && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">Relato / observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{selectedCard.descricao}</p></div>}

                {selectedCard.pipeline === "suporte" && (
                  <SupportReportPanel
                    card={selectedCard}
                    token={token ?? ""}
                    onChanged={async () => {
                      const fresh = await api<WorkCard>(`/api/work-cards/${selectedCard.id}`);
                      setSelectedCard(fresh);
                      await queryClient.invalidateQueries({ queryKey: ["work-cards", tenantId, "suporte"] });
                    }}
                  />
                )}

'''
text = once(text, anchor, report, 'operational report panel')
save(p, text)

# ── Deals API: labels + tarefa automática por etapa ─────────────────────────
p, text = load('artifacts/api-server/src/routes/deals.ts')
old_labels = '''const DEAL_STAGE_LABELS: Record<string, string> = {
  em_aquecimento: "Em aquecimento", novo: "Novo", qualificado: "Qualificado",
  proposta: "Proposta", negociacao: "Negociação", conferencia_estoque: "Conferência de estoque",
  ganho: "Ganho", em_execucao: "Em execução", entregue: "Entregue", perdido: "Perdido", parceiro: "Parceiro",
};
'''
new_labels = '''const DEAL_STAGE_LABELS: Record<string, string> = {
  em_aquecimento: "Em aquecimento", novo: "Novo", qualificado: "Qualificado",
  proposta: "Orçamento", negociacao: "Negociação", conferencia_estoque: "Fechamento",
  contrato: "Contrato", ganho: "Pedido", em_execucao: "Em execução", entregue: "Entregue", perdido: "Perdido", parceiro: "Parceiro",
};

const COMMERCIAL_STAGE_TASKS: Record<string, string> = {
  novo: "Fazer primeiro contato e qualificar",
  qualificado: "Preparar orçamento e próximos passos",
  proposta: "Acompanhar orçamento enviado",
  negociacao: "Conduzir negociação e registrar condições",
  conferencia_estoque: "Confirmar condições finais de fechamento",
  contrato: "Providenciar e acompanhar contrato",
  ganho: "Confirmar pedido e transferir para execução",
};

async function ensureCommercialStageTask(deal: typeof dealsTable.$inferSelect) {
  if (!deal.leadId || !deal.assignedTo) return;
  const taskTitle = COMMERCIAL_STAGE_TASKS[deal.etapa];
  if (!taskTitle) return;
  const title = `${taskTitle} — ${deal.titulo}`;
  const [existingTask] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
    eq(activitiesTable.tenantId, deal.tenantId),
    eq(activitiesTable.leadId, deal.leadId),
    eq(activitiesTable.titulo, title),
    eq(activitiesTable.status, "planejado"),
  )).limit(1);
  if (existingTask) return;
  await db.insert(activitiesTable).values({
    tenantId: deal.tenantId,
    leadId: deal.leadId,
    dealId: deal.id,
    tipo: "tarefa",
    titulo: title,
    descricao: `Tarefa criada automaticamente ao entrar na etapa ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}.`,
    status: "planejado",
    responsavelId: deal.assignedTo,
    dataVencimento: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}
'''
text = once(text, old_labels, new_labels, 'deals labels/tasks')
journey_anchor = '''  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa) {
    await recordDealJourney({
      tenantId: existing.tenantId, leadId: deal.leadId, dealId: deal.id,
      title: `Negócio avançou para ${DEAL_STAGE_LABELS[parsed.data.etapa] ?? parsed.data.etapa}`,
      description: `Etapa anterior: ${DEAL_STAGE_LABELS[existing.etapa] ?? existing.etapa}. Nova etapa: ${DEAL_STAGE_LABELS[parsed.data.etapa] ?? parsed.data.etapa}.`,
      responsavelId: req.user?.sub,
    });
  }
'''
journey_new = journey_anchor[:-2] + '    await ensureCommercialStageTask(deal);\n  }\n'
text = once(text, journey_anchor, journey_new, 'deals stage task call')
save(p, text)

# ── Entregas/API: relatório, feedback, tarefas, fechamento operacional ──────
p, text = load('artifacts/api-server/src/routes/entregas.ts')
text = once(text,
    'import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";\n',
    'import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";\nimport { generateSupportReportDraft } from "../services/support-report.js";\nimport { requestSupportFeedback } from "../services/support-feedback.js";\n',
    'entregas support imports')
record_end = '''  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTREGAS / LOTES PARCIAIS
'''
helpers = '''  });
}

const WORK_STAGE_TASKS: Record<string, string> = {
  pedido_confirmado: "Revisar pedido confirmado",
  liberacao_financeira: "Validar liberação financeira",
  liberacao_medidas: "Providenciar e confirmar medidas",
  projeto: "Desenvolver/aprovar projeto",
  producao_a_iniciar: "Preparar início da produção",
  producao_em_andamento: "Acompanhar produção",
  producao_finalizada: "Confirmar produção finalizada",
  aguardando_liberacao: "Acompanhar liberação do lote",
  liberado: "Preparar expedição do lote liberado",
  agenda_entrega: "Agendar e confirmar entrega",
  em_transporte: "Acompanhar entrega em transporte",
  instalacao_a_iniciar: "Preparar instalação",
  instalacao_em_andamento: "Acompanhar instalação",
  instalacao_finalizada: "Validar instalação finalizada",
  entrega_obra: "Realizar entrega/aceite da obra",
  pos_venda: "Realizar pós-venda e validar conclusão operacional",
  chamado_cliente: "Triar chamado e confirmar informações",
  agendamento_assistencia: "Agendar assistência",
  execucao_assistencia: "Executar assistência",
  relatorio_assistencia: "Gerar e confirmar relatório da assistência",
  feedback_cliente: "Acompanhar feedback do cliente",
  fechamento_assistencia: "Fechar assistência",
};

async function ensureWorkStageTask(card: typeof workCardsTable.$inferSelect) {
  if (!card.leadId || !card.responsavelId) return;
  const base = WORK_STAGE_TASKS[card.etapa];
  if (!base) return;
  const title = `${base} — ${card.codigo}`;
  const [existingTask] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
    eq(activitiesTable.tenantId, card.tenantId),
    eq(activitiesTable.leadId, card.leadId),
    eq(activitiesTable.titulo, title),
    eq(activitiesTable.status, "planejado"),
  )).limit(1);
  if (existingTask) return;
  await db.insert(activitiesTable).values({
    tenantId: card.tenantId,
    leadId: card.leadId,
    dealId: card.dealId,
    tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
    titulo: title,
    descricao: `Tarefa automática da etapa ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}.`,
    status: "planejado",
    responsavelId: card.responsavelId,
    dataVencimento: card.dataFimPrevista ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}

async function maybeCompleteOrder(parentOrChild: typeof workCardsTable.$inferSelect) {
  const parentId = parentOrChild.tipo === "pedido" ? parentOrChild.id : parentOrChild.parentCardId;
  if (!parentId) return;
  const [parent] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, parentId)).limit(1);
  if (!parent || parent.pipeline !== "execucao" || parent.tipo !== "pedido" || parent.etapa !== "pos_venda" || !parent.dealId) return;

  const children = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, parent.tenantId),
    eq(workCardsTable.parentCardId, parent.id),
  ));
  const relevantChildren = children.filter((c) => c.pipeline === "execucao" && c.etapa !== "cancelado");
  const childDone = relevantChildren.every((c) => ["concluido", "instalacao_finalizada"].includes(c.etapa));
  const balance = await getDeliveryBalance(parent.tenantId, parent.dealId, parent.propostaId);
  const itemsDone = balance.proposal ? balance.items.every((item) => Number(item.saldoEntregar ?? 0) <= 0) : true;
  if (!childDone || !itemsDone) return;

  const now = new Date();
  await db.update(workCardsTable).set({ etapa: "concluido", dataFimEfetiva: now, updatedAt: now }).where(eq(workCardsTable.id, parent.id));
  await db.update(dealsTable).set({ etapa: "entregue", updatedAt: now }).where(and(eq(dealsTable.id, parent.dealId), eq(dealsTable.tenantId, parent.tenantId)));
  await recordWorkHistory({
    tenantId: parent.tenantId,
    leadId: parent.leadId,
    dealId: parent.dealId,
    tipo: "tarefa",
    titulo: `${parent.codigo}: pedido operacionalmente concluído`,
    descricao: "Todos os lotes/itens estão concluídos e o pedido já passou pelo Pós-venda.",
    responsavelId: parent.responsavelId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTREGAS / LOTES PARCIAIS
'''
text = once(text, record_end, helpers, 'entregas helpers')

stage_history = '''  if (card.etapa !== existing.etapa && card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
      titulo: `${card.codigo}: ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}`,
      descricao: `Etapa anterior: ${WORK_STAGE_LABELS[existing.etapa] ?? existing.etapa}. Nova etapa: ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}.`,
      responsavelId: card.responsavelId,
    });
  }

  res.json(card);
});

router.get("/work-cards/:id/attachments", async (req, res) => {
'''
stage_history_new = '''  if (card.etapa !== existing.etapa && card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
      titulo: `${card.codigo}: ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}`,
      descricao: `Etapa anterior: ${WORK_STAGE_LABELS[existing.etapa] ?? existing.etapa}. Nova etapa: ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}.`,
      responsavelId: card.responsavelId,
    });
    await ensureWorkStageTask(card);
    if (card.pipeline === "suporte" && card.etapa === "feedback_cliente") {
      void requestSupportFeedback(card.tenantId, card.id, req.log);
    }
    if (card.pipeline === "execucao") await maybeCompleteOrder(card);
  }

  res.json(card);
});

const supportReportSchema = z.object({
  problemaRelatado: z.string().trim().min(1).max(10000),
  diagnostico: z.string().max(10000).default(""),
  servicoExecutado: z.string().max(10000).default(""),
  materiaisUtilizados: z.array(z.string().trim().min(1)).max(100).default([]),
  situacaoFinal: z.enum(["resolvido", "parcial", "nao_resolvido", "aguardando_peca", "aguardando_retorno"]),
  clienteAcompanhou: z.boolean().nullable().default(null),
  recomendacoes: z.string().max(10000).default(""),
  observacoes: z.string().max(10000).default(""),
});

router.post("/work-cards/:id/support-report/draft", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "suporte") { res.status(404).json({ error: "Assistência não encontrada" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) { res.status(403).json({ error: "Este card pertence a outro responsável" }); return; }
  try {
    const draft = await generateSupportReportDraft(card.tenantId, card.id, req.log);
    res.json({ draft });
  } catch (error) {
    req.log.error({ err: error, workCardId: card.id }, "support-report: falha ao gerar rascunho");
    res.status(500).json({ error: "Não foi possível gerar o relatório da assistência" });
  }
});

router.post("/work-cards/:id/support-report/confirm", async (req, res) => {
  const parsed = supportReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "suporte") { res.status(404).json({ error: "Assistência não encontrada" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) { res.status(403).json({ error: "Este card pertence a outro responsável" }); return; }

  const solved = parsed.data.situacaoFinal === "resolvido";
  const nextStage = solved ? "feedback_cliente" : "execucao_assistencia";
  const [updated] = await db.update(workCardsTable).set({
    etapa: nextStage,
    metadata: {
      ...(card.metadata ?? {}),
      supportReport: parsed.data,
      supportReportConfirmed: true,
      supportReportConfirmedAt: new Date().toISOString(),
      supportReportConfirmedBy: req.user?.sub ?? null,
      ...(solved ? {} : { substatus: parsed.data.situacaoFinal }),
    },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id)).returning();

  await recordWorkHistory({
    tenantId: card.tenantId,
    leadId: card.leadId,
    dealId: card.dealId,
    tipo: "assistencia",
    titulo: `${card.codigo}: relatório da assistência confirmado`,
    descricao: `Diagnóstico: ${parsed.data.diagnostico || "não informado"}\nServiço: ${parsed.data.servicoExecutado || "não informado"}\nSituação: ${parsed.data.situacaoFinal}.`,
    responsavelId: card.responsavelId,
  });
  await ensureWorkStageTask(updated);
  if (solved) void requestSupportFeedback(card.tenantId, card.id, req.log);
  res.json({ card: updated, feedbackRequested: solved });
});

router.get("/work-cards/:id/attachments", async (req, res) => {
'''
text = once(text, stage_history, stage_history_new, 'entregas patch/report routes')

# When delivery patch finishes, attempt parent completion too.
text = text.replace('  res.json(entrega);\n});\n\n// ─────────────────────────────────────────────────────────────────────────────\n// CARDS OPERACIONAIS', '  if (linkedCard) await maybeCompleteOrder(linkedCard);\n  res.json(entrega);\n});\n\n// ─────────────────────────────────────────────────────────────────────────────\n// CARDS OPERACIONAIS', 1)
save(p, text)

# ── Webhooks: feedback do cliente antes de seguir para lead/IA ──────────────
p, text = load('artifacts/api-server/src/routes/webhooks.ts')
text = once(text,
    'import { tryIngestTechnicianSupportMessage } from "../services/support-whatsapp-ingest.js";\n',
    'import { tryIngestTechnicianSupportMessage } from "../services/support-whatsapp-ingest.js";\nimport { tryHandleSupportFeedbackMessage } from "../services/support-feedback.js";\n',
    'webhooks feedback import')
# normalized
old = '''  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const match = await findLeadByDedup(tenantId, telefone, null, null);
'''
new = '''  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone: telefone, text: mensagem, log: req.log });
  if (supportFeedback.handled) {
    res.status(200).json({ supportFeedback: true, ...supportFeedback });
    return;
  }
  const match = await findLeadByDedup(tenantId, telefone, null, null);
'''
text = once(text, old, new, 'webhook normalized feedback')
# zapi
old = '''  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const nome = payload.chatName ?? payload.senderName ?? telefone;
'''
new = '''  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone: telefone, text: mensagem, log: req.log });
  if (supportFeedback.handled) {
    res.status(200).json({ supportFeedback: true, ...supportFeedback });
    return;
  }
  const nome = payload.chatName ?? payload.senderName ?? telefone;
'''
text = once(text, old, new, 'webhook zapi feedback')
# evolution
old = '''  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const nome = (data as { pushName?: string }).pushName ?? telefone;
'''
new = '''  if (supportIngest.handled) {
    res.status(200).json({ supportTechnicianUpdate: true, ...supportIngest });
    return;
  }
  const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone: telefone, text: mensagem, log: req.log });
  if (supportFeedback.handled) {
    res.status(200).json({ supportFeedback: true, ...supportFeedback });
    return;
  }
  const nome = (data as { pushName?: string }).pushName ?? telefone;
'''
text = once(text, old, new, 'webhook evolution feedback')
# meta
old = '''          if (supportIngest.handled) {
            req.log.info({ supportIngest, phone }, "meta-webhook: atualização de técnico absorvida pela assistência");
            continue;
          }

          // Find or create lead (dedup by normalized phone)
'''
new = '''          if (supportIngest.handled) {
            req.log.info({ supportIngest, phone }, "meta-webhook: atualização de técnico absorvida pela assistência");
            continue;
          }
          const supportFeedback = await tryHandleSupportFeedbackMessage({ tenantId, phone, text: mensagem, log: req.log });
          if (supportFeedback.handled) {
            req.log.info({ supportFeedback, phone }, "meta-webhook: feedback da assistência processado");
            continue;
          }

          // Find or create lead (dedup by normalized phone)
'''
text = once(text, old, new, 'webhook meta feedback')
save(p, text)

print('patch completo aplicado')
