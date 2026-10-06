import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import multer from "multer";
import {
  db,
  dealsTable,
  insertDealSchema,
  updateDealSchema,
  tenantsTable,
  leadsTable,
  tenantInvitesTable,
  partnersTable,
  notificationsTable,
  propostasTable,
  plansTable,
  planAssignmentLogTable,
  dealClosingStatusTable,
  contractsTable,
  billingRecordsTable,
  automationLogsTable,
  activitiesTable,
  reactivationQueueTable,
  agentTasksTable,
  usersTable,
  sellerCommissionsTable,
  produtosCatalogoTable,
  farmaciaPedidoTable,
  workCardsTable,
  pipelineStagesTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { sendDirectWhatsAppMessage, WhatsAppNotConnectedError } from "../services/omnichannel.js";
import { checkCatalogMatch, type CatalogCheckItem } from "../lib/catalog-price-check.js";
import { ensureTenantPlanAndCommission } from "../lib/deal-closure-commission.js";
import { buildInviteUrl } from "./invites.js";
import { sendInviteEmail } from "../lib/email.js";
import {
  isAsaasConfigured,
  getTenantAsaasApiKey,
  createOrGetCustomer,
  createCharge,
  formaPagamentoToBillingType,
  type AsaasBillingType,
} from "../lib/asaas.js";
import {
  isZapSignConfigured,
  createDocument,
} from "../lib/zapsign.js";
import { billingEventsTable } from "@workspace/db";
import { extractQuoteData } from "../lib/document-extraction.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { generateContractPDF } from "../lib/contract-generation.js";
import { requireRole, buildUserFunctionFilter, type UserFunction } from "../middlewares/auth.js";
import { captureLeadFeatureSnapshot, backfillResultadoSnapshots } from "../lib/mlFeatureStore.js";
import { finalizeVehicleReservation } from "../services/vehicle-reservation.js";
import { finalizeItemReservation } from "../services/item-reservation.js";
import { z } from "zod";
import { COMMERCIAL_STAGE_ORDER, PARTNER_STAGE_ORDER, SAAS_STAGE_ORDER, TERMINAL_DEAL_STAGES, TERMINAL_WORK_STAGES, isBackwardMove } from "../lib/pipeline-progress.js";
import { recordIntelligenceEvent, recordStageAnswers } from "../services/customer-intelligence-history.js";
import { suggestDynamicStageQuestions } from "../services/stage-question-intelligence.js";
import { evaluatePipelineAI } from "../services/pipeline-ai-orchestrator.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const DEAL_STAGE_LABELS: Record<string, string> = {
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

async function ensureCommercialStageTasks(deal: typeof dealsTable.$inferSelect) {
  if (!deal.leadId) return;

  const [stageConfig] = await db
    .select({
      id: pipelineStagesTable.id,
      responsavelAgenteKey: pipelineStagesTable.responsavelAgenteKey,
      aiConfig: pipelineStagesTable.aiConfig,
      atividadePadraoTitulo: pipelineStagesTable.atividadePadraoTitulo,
      atividadePadraoDescricao: pipelineStagesTable.atividadePadraoDescricao,
      atividadePadraoPrazoMinutos: pipelineStagesTable.atividadePadraoPrazoMinutos,
      atividadesPadrao: pipelineStagesTable.atividadesPadrao,
    })
    .from(pipelineStagesTable)
    .where(and(
      eq(pipelineStagesTable.tenantId, deal.tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, deal.etapa),
    ))
    .limit(1);

  const configured = stageConfig?.atividadesPadrao ?? [];
  const fallbackTitle = stageConfig?.atividadePadraoTitulo?.trim() || COMMERCIAL_STAGE_TASKS[deal.etapa];
  const templates = configured.length > 0 ? configured : (fallbackTitle ? [{
    id: "legacy-default",
    titulo: fallbackTitle,
    descricao: stageConfig?.atividadePadraoDescricao ?? null,
    categoria: "sugerida" as const,
    prazoMinutos: stageConfig?.atividadePadraoPrazoMinutos ?? 24 * 60,
    responsavel: "deal_owner" as const,
    prioridade: "normal" as const,
    bloqueiaAvanco: false,
    condicao: "sempre" as const,
    tipo: "tarefa" as const,
  }] : []);

  for (const template of templates) {
    const templateKey = template.id || template.titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    const [existingTask] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
      eq(activitiesTable.tenantId, deal.tenantId),
      eq(activitiesTable.dealId, deal.id),
      eq(activitiesTable.origemEtapaKey, deal.etapa),
      eq(activitiesTable.origemTemplateKey, templateKey),
      inArray(activitiesTable.status, ["planejado", "pendente", "concluida"]),
    )).limit(1);
    if (existingTask) continue;

    if (template.condicao === "sem_atividade_aberta") {
      const [openActivity] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
        eq(activitiesTable.tenantId, deal.tenantId),
        eq(activitiesTable.dealId, deal.id),
        inArray(activitiesTable.status, ["planejado", "pendente"]),
      )).limit(1);
      if (openActivity) continue;
    }

    const automatic = template.categoria === "automatica";
    const assignedToHuman = template.responsavel !== "stage_agent" ? deal.assignedTo : null;
    const dueMinutes = template.prazoMinutos ?? 24 * 60;
    const title = `${template.titulo} — ${deal.titulo}`;

    await db.insert(activitiesTable).values({
      tenantId: deal.tenantId,
      leadId: deal.leadId,
      dealId: deal.id,
      tipo: template.tipo ?? "tarefa",
      titulo: title,
      descricao: template.descricao?.trim()
        || `Atividade criada automaticamente ao entrar na etapa ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}.`,
      objetivo: template.objetivo ?? null,
      resultadoEsperado: template.resultadoEsperado ?? null,
      prioridade: template.prioridade ?? "normal",
      estadoExecucao: automatic ? "planejada_ia" : "planejada",
      categoriaExecucao: template.categoria,
      origem: "pipeline_stage",
      origemEtapaId: stageConfig?.id ?? null,
      origemEtapaKey: deal.etapa,
      origemTemplateKey: templateKey,
      bloqueiaAvanco: Boolean(template.bloqueiaAvanco || template.categoria === "obrigatoria"),
      agenteResponsavelKey: template.responsavel === "stage_agent" ? stageConfig?.responsavelAgenteKey ?? null : null,
      status: "planejado",
      responsavelId: assignedToHuman ?? null,
      dataVencimento: new Date(Date.now() + dueMinutes * 60 * 1000),
    });
  }
}

async function recordDealJourney(input: {
  tenantId: string; leadId: string | null; dealId: string; title: string; description: string; responsavelId?: string | null;
}) {
  if (!input.leadId) return;
  try {
    await db.insert(activitiesTable).values({
      tenantId: input.tenantId, leadId: input.leadId, dealId: input.dealId,
      tipo: "tarefa", titulo: input.title, descricao: input.description,
      status: "concluida", concluidaEm: new Date(), responsavelId: input.responsavelId ?? null,
    });
  } catch {
    // A auditoria não pode impedir a operação comercial principal. O erro é
    // observado pelo logger/monitoramento do banco e pode ser recomposto.
  }
}

const uploadQuote = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/deals", async (req, res) => {
  const parsed = insertDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Todo card comercial precisa de um lead real do mesmo tenant. Isso evita
  // negócios órfãos que aparecem na pipeline, mas somem da Central/Leads.
  if (!parsed.data.leadId) {
    res.status(422).json({
      error: "Selecione ou crie um lead antes de iniciar o negócio.",
      code: "DEAL_LEAD_REQUIRED",
    });
    return;
  }
  const [linkedLead] = await db
    .select({ id: leadsTable.id, naoLeadTipo: leadsTable.naoLeadTipo })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.id, parsed.data.leadId),
      eq(leadsTable.tenantId, parsed.data.tenantId),
    ));
  if (!linkedLead) {
    res.status(422).json({
      error: "O lead informado não existe neste tenant.",
      code: "DEAL_LEAD_INVALID",
    });
    return;
  }
  if (linkedLead.naoLeadTipo) {
    res.status(422).json({
      error: "Contato classificado como Não lead não pode ser incluído na pipeline.",
      code: "NON_LEAD_PIPELINE_EXEMPT",
    });
    return;
  }
  const assignedTo = parsed.data.assignedTo ?? (
    req.user?.platformRole !== "super_admin" && req.user?.sub ? req.user.sub : null
  );
  const [deal] = await db.insert(dealsTable).values({ ...parsed.data, assignedTo }).returning();
  await recordDealJourney({
    tenantId: deal.tenantId, leadId: deal.leadId, dealId: deal.id,
    title: "Negócio iniciado",
    description: `O negócio entrou na etapa ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}. O mesmo fluxo é usado por usuários e agentes de IA.`,
    responsavelId: assignedTo,
  });
  res.status(201).json(deal);
});

const MOVABLE_PIPELINES = ["comercial", "aquecimento", "parceiros", "execucao", "suporte"] as const;
type MovablePipeline = (typeof MOVABLE_PIPELINES)[number];

const transferDealPipelineSchema = z.object({
  targetPipeline: z.enum(MOVABLE_PIPELINES),
  targetStage: z.string().trim().min(1).max(120),
  responsavelId: z.string().min(1).optional(),
  justificativa: z.string().trim().min(5, "Informe a justificativa do movimento.").max(2000),
});

function currentDealPipeline(deal: typeof dealsTable.$inferSelect): { pipeline: MovablePipeline; stage: string } {
  if (deal.etapa === "em_aquecimento") {
    return { pipeline: "aquecimento", stage: deal.relationshipStage || deal.aquecimentoTipo || "aquecimento_lead" };
  }
  if (deal.etapa === "parceiro") {
    return { pipeline: "parceiros", stage: deal.relationshipStage || "parceiro_identificado" };
  }
  return { pipeline: "comercial", stage: deal.etapa };
}

router.post("/deals/:id/transfer-pipeline", async (req, res) => {
  const parsed = transferDealPipelineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, String(req.params.id))).limit(1);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && deal.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!deal.leadId) {
    res.status(422).json({ error: "O negócio precisa estar vinculado a um lead para ser movido." });
    return;
  }

  const [targetStageConfig] = await db.select({
    id: pipelineStagesTable.id,
    key: pipelineStagesTable.key,
    label: pipelineStagesTable.label,
  }).from(pipelineStagesTable).where(and(
    eq(pipelineStagesTable.tenantId, deal.tenantId),
    eq(pipelineStagesTable.pipeline, parsed.data.targetPipeline),
    eq(pipelineStagesTable.key, parsed.data.targetStage),
  )).limit(1);

  if (!targetStageConfig) {
    res.status(422).json({ error: "A etapa escolhida não existe na pipeline de destino." });
    return;
  }

  const responsavelId = parsed.data.responsavelId ?? deal.assignedTo ?? req.user?.sub ?? null;
  if (responsavelId) {
    const [responsavel] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
      eq(usersTable.id, responsavelId),
      eq(usersTable.tenantId, deal.tenantId),
    )).limit(1);
    if (!responsavel) {
      res.status(422).json({ error: "Responsável inválido para este tenant." });
      return;
    }
  }

  const movedAt = new Date();
  let source = currentDealPipeline(deal);
  let sourceOperationalCard: typeof workCardsTable.$inferSelect | null = null;
  let destinationCard: typeof workCardsTable.$inferSelect | null = null;

  const operationalSourcePipeline =
    deal.relationshipStage === "transferido_execucao"
      ? "execucao"
      : deal.relationshipStage === "transferido_suporte"
        ? "suporte"
        : null;

  if (operationalSourcePipeline) {
    const sourceCards = await db.select().from(workCardsTable).where(and(
      eq(workCardsTable.tenantId, deal.tenantId),
      eq(workCardsTable.pipeline, operationalSourcePipeline),
      eq(workCardsTable.dealId, deal.id),
    )).orderBy(desc(workCardsTable.updatedAt));

    sourceOperationalCard = sourceCards.find((card) => !TERMINAL_WORK_STAGES.has(card.etapa)) ?? sourceCards[0] ?? null;
    source = {
      pipeline: operationalSourcePipeline,
      stage: sourceOperationalCard?.etapa ?? operationalSourcePipeline,
    };
  }

  if (
    sourceOperationalCard
    && source.pipeline !== parsed.data.targetPipeline
    && !TERMINAL_WORK_STAGES.has(sourceOperationalCard.etapa)
  ) {
    await db.update(workCardsTable).set({
      etapa: "cancelado",
      metadata: {
        ...(sourceOperationalCard.metadata ?? {}),
        ativoNaPipeline: false,
        etapaAntesTransferencia: sourceOperationalCard.etapa,
        transferidoParaPipeline: parsed.data.targetPipeline,
        transferidoParaEtapa: parsed.data.targetStage,
        transferidoEm: movedAt.toISOString(),
        transferidoPor: req.user?.sub ?? null,
        justificativaMovimento: parsed.data.justificativa,
      },
      updatedAt: movedAt,
    }).where(eq(workCardsTable.id, sourceOperationalCard.id));
  }

  if (parsed.data.targetPipeline === "comercial") {
    await db.update(dealsTable).set({
      etapa: parsed.data.targetStage,
      assignedTo: responsavelId,
      relationshipStage: null,
      updatedAt: movedAt,
    }).where(eq(dealsTable.id, deal.id));
  } else if (parsed.data.targetPipeline === "aquecimento") {
    const aquecimentoTipo = parsed.data.targetStage === "aquecimento_cliente" ? "cliente" : "nao_cliente";
    await db.update(dealsTable).set({
      etapa: "em_aquecimento",
      aquecimentoTipo,
      relationshipStage: parsed.data.targetStage,
      assignedTo: responsavelId,
      updatedAt: movedAt,
    }).where(eq(dealsTable.id, deal.id));
  } else if (parsed.data.targetPipeline === "parceiros") {
    await db.update(dealsTable).set({
      etapa: "parceiro",
      relationshipStage: parsed.data.targetStage,
      assignedTo: responsavelId,
      updatedAt: movedAt,
    }).where(eq(dealsTable.id, deal.id));
  } else {
    const [existingCard] = await db.select().from(workCardsTable).where(and(
      eq(workCardsTable.tenantId, deal.tenantId),
      eq(workCardsTable.pipeline, parsed.data.targetPipeline),
      eq(workCardsTable.leadId, deal.leadId),
      eq(workCardsTable.dealId, deal.id),
    )).limit(1);

    const metadata = {
      ...(existingCard?.metadata ?? {}),
      ativoNaPipeline: true,
      origemPipeline: source.pipeline,
      origemEtapa: source.stage,
      transferidoParaPipeline: null,
      transferidoParaEtapa: null,
      transferidoEm: movedAt.toISOString(),
      transferidoPor: req.user?.sub ?? null,
      justificativaMovimento: parsed.data.justificativa,
    };

    if (existingCard) {
      [destinationCard] = await db.update(workCardsTable).set({
        etapa: parsed.data.targetStage,
        responsavelId,
        descricao: parsed.data.justificativa,
        metadata,
        updatedAt: movedAt,
      }).where(eq(workCardsTable.id, existingCard.id)).returning();
    } else {
      [destinationCard] = await db.insert(workCardsTable).values({
        tenantId: deal.tenantId,
        pipeline: parsed.data.targetPipeline,
        tipo: parsed.data.targetPipeline === "suporte" ? "assistencia" : "pedido",
        etapa: parsed.data.targetStage,
        titulo: `${parsed.data.targetPipeline === "suporte" ? "Suporte" : "Execução"} • ${deal.titulo}`,
        descricao: parsed.data.justificativa,
        prioridade: "normal",
        leadId: deal.leadId,
        dealId: deal.id,
        responsavelId,
        metadata,
      }).returning();
    }

    await db.update(dealsTable).set({
      relationshipStage: `transferido_${parsed.data.targetPipeline}`,
      assignedTo: responsavelId,
      updatedAt: movedAt,
    }).where(eq(dealsTable.id, deal.id));
  }

  await recordDealJourney({
    tenantId: deal.tenantId,
    leadId: deal.leadId,
    dealId: deal.id,
    title: `Movido de ${source.pipeline} / ${source.stage} para ${parsed.data.targetPipeline} / ${targetStageConfig.label}`,
    description: `Justificativa obrigatória: ${parsed.data.justificativa}`,
    responsavelId,
  });

  res.json({
    ok: true,
    dealId: deal.id,
    source,
    destination: {
      pipeline: parsed.data.targetPipeline,
      stage: parsed.data.targetStage,
      stageLabel: targetStageConfig.label,
    },
    workCard: destinationCard,
  });
});

router.get("/tenants/:tenantId/deals", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const { etapa, funilId, leadId, includeNaoLead } = req.query as Record<string, string | undefined>;

  const conditions = [eq(dealsTable.tenantId, tenantId)];
  if (etapa) conditions.push(eq(dealsTable.etapa, etapa as typeof dealsTable.etapa._.data));
  if (funilId) conditions.push(eq(dealsTable.funilId, funilId));
  if (leadId) conditions.push(eq(dealsTable.leadId, leadId));

  conditions.push(...buildUserFunctionFilter(req, dealsTable));

  // Na pipeline comercial, contatos classificados como "Não Lead" ficam fora.
  // Pipelines de relacionamento (Aquecimento/Parceiros) precisam enxergar esses
  // registros para preservar o histórico e permitir retomada comercial.
  if (includeNaoLead !== "true") {
    conditions.push(notExists(
      db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(and(
          eq(leadsTable.id, dealsTable.leadId),
          isNotNull(leadsTable.naoLeadTipo),
        )),
    ));
  }

  const deals = await db
    .select()
    .from(dealsTable)
    .where(and(...conditions))
    .orderBy(dealsTable.createdAt);

  res.json(deals);
});

router.get("/deals/:id", async (req, res) => {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && deal.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && deal.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }
  if (!isAdmin && userFn === "entrega" && deal.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  // Attach lead data when requested (for contract generation modal)
  let lead = null;
  if (deal.leadId && req.query.includeLead === "1") {
    const [leadRow] = await db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        email: leadsTable.email,
        telefone: leadsTable.telefone,
        empresa: leadsTable.empresa,
        documento: leadsTable.documento,
      })
      .from(leadsTable)
      .where(eq(leadsTable.id, deal.leadId));
    lead = leadRow ?? null;
  }

  res.json({ ...deal, lead });
});

const commercialReviewSchema = z.object({
  discountPercent: z.number().min(0).max(100),
  reason: z.string().trim().min(3).max(1000),
  requestManagement: z.boolean().default(false),
});

router.post("/deals/:id/commercial-review", async (req, res) => {
  const parsed = commercialReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, String(req.params.id)));
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && deal.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!deal.leadId) {
    res.status(422).json({ error: "O negócio precisa estar vinculado a um lead" });
    return;
  }

  const originalValue = Number(deal.valor || 0);
  const discountedValue = Math.max(0, originalValue * (1 - parsed.data.discountPercent / 100));
  const canApplyDirectly = !parsed.data.requestManagement && parsed.data.discountPercent <= 10;

  if (canApplyDirectly) {
    const [updated] = await db.update(dealsTable).set({ valor: String(discountedValue.toFixed(2)), updatedAt: new Date() })
      .where(eq(dealsTable.id, deal.id)).returning();
    await recordDealJourney({
      tenantId: deal.tenantId, leadId: deal.leadId, dealId: deal.id,
      title: `Desconto de ${parsed.data.discountPercent}% aplicado`,
      description: `Valor anterior: R$ ${originalValue.toFixed(2)}. Novo valor: R$ ${discountedValue.toFixed(2)}. Justificativa: ${parsed.data.reason}`,
      responsavelId: req.user?.sub,
    });
    res.json({ status: "applied", deal: updated });
    return;
  }

  const [task] = await db.insert(agentTasksTable).values({
    tenantId: deal.tenantId, leadId: deal.leadId, agentName: "closer",
    actionType: "aprovacao_desconto",
    payload: { dealId: deal.id, discountPercent: parsed.data.discountPercent, reason: parsed.data.reason, originalValue, discountedValue },
  }).returning();
  await db.insert(notificationsTable).values({
    tenantId: deal.tenantId, title: "Análise comercial pendente",
    message: `O negócio "${deal.titulo}" solicita ${parsed.data.discountPercent}% de desconto. Justificativa: ${parsed.data.reason}`,
    type: "warning", category: "deal_discount_approval",
  });
  await recordDealJourney({
    tenantId: deal.tenantId, leadId: deal.leadId, dealId: deal.id,
    title: "Análise comercial solicitada",
    description: `Desconto solicitado: ${parsed.data.discountPercent}%. Justificativa: ${parsed.data.reason}`,
    responsavelId: req.user?.sub,
  });
  res.status(202).json({ status: "pending_approval", agentTaskId: task.id });
});

const dealHandoffSchema = z.object({
  responsavelId: z.string().min(1),
  atividadeTitulo: z.string().trim().min(3).max(200),
  atividadeDescricao: z.string().trim().max(2000).optional(),
  dataVencimento: z.coerce.date().optional(),
  observacaoPassagem: z.string().trim().max(2000).optional(),
});

router.post("/deals/:id/resume-commercial", async (req, res) => {
  const parsed = dealHandoffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && (userFn === "vendedor" || userFn === "entrega") && existing.assignedTo && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  if (existing.etapa !== "em_aquecimento") {
    res.status(409).json({
      error: "INVALID_RESUME_SOURCE_STAGE",
      message: "Somente um atendimento em Aquecimento pode ser retomado por este fluxo.",
    });
    return;
  }

  if (!existing.leadId) {
    res.status(422).json({
      error: "DEAL_LEAD_REQUIRED",
      message: "O atendimento precisa estar vinculado a um lead para ser retomado.",
    });
    return;
  }

  const [responsavel] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, parsed.data.responsavelId),
      eq(usersTable.tenantId, existing.tenantId),
    ))
    .limit(1);

  if (!responsavel) {
    res.status(422).json({
      error: "INVALID_NEXT_OWNER",
      message: "O próximo responsável não pertence a esta empresa.",
    });
    return;
  }

  if (existing.relationshipStage === "aquecimento_retomado") {
    const candidates = await db
      .select()
      .from(dealsTable)
      .where(and(
        eq(dealsTable.tenantId, existing.tenantId),
        eq(dealsTable.leadId, existing.leadId),
      ))
      .orderBy(desc(dealsTable.createdAt));

    const active = candidates.find((item) =>
      item.id !== existing.id &&
      !["em_aquecimento", "parceiro", "ganho", "perdido", "entregue", "concluido", "cancelado"].includes(item.etapa)
    );

    if (active) {
      res.json({ deal: active, resumedDealId: existing.id, alreadyResumed: true });
      return;
    }
  }

  const handoff = parsed.data;
  const createdDeal = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dealsTable)
      .values({
        tenantId: existing.tenantId,
        leadId: existing.leadId,
        titulo: existing.titulo + " — Retomada",
        etapa: "novo",
        assignedTo: handoff.responsavelId,
      })
      .returning();

    if (!created) throw new Error("Failed to create resumed commercial deal");

    await tx
      .update(dealsTable)
      .set({
        relationshipStage: "aquecimento_retomado",
        updatedAt: new Date(),
      })
      .where(eq(dealsTable.id, existing.id));

    await tx.insert(activitiesTable).values({
      tenantId: existing.tenantId,
      leadId: existing.leadId,
      dealId: created.id,
      tipo: "tarefa",
      titulo: handoff.atividadeTitulo,
      descricao: [
        handoff.atividadeDescricao,
        handoff.observacaoPassagem ? "Passagem: " + handoff.observacaoPassagem : null,
      ].filter(Boolean).join("\n") || null,
      status: "pendente",
      dataVencimento: handoff.dataVencimento ?? null,
      responsavelId: handoff.responsavelId,
    });

    await tx.insert(activitiesTable).values({
      tenantId: existing.tenantId,
      leadId: existing.leadId,
      dealId: existing.id,
      tipo: "tarefa",
      titulo: "Aquecimento retomado para novo ciclo comercial",
      descricao: "Novo atendimento criado em Novo: " + created.titulo + ".",
      status: "concluida",
      concluidaEm: new Date(),
      responsavelId: req.user?.sub ?? existing.assignedTo ?? null,
    });

    return created;
  });

  res.status(201).json({ deal: createdDeal, resumedDealId: existing.id, alreadyResumed: false });
});

router.post("/deals/:id/ai/evaluate", async (req, res) => {
  const dealId = String(req.params.id);
  const [deal] = await db.select({ id: dealsTable.id, tenantId: dealsTable.tenantId }).from(dealsTable)
    .where(eq(dealsTable.id, dealId)).limit(1);
  if (!deal) return res.status(404).json({ error: "Deal not found" });
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== deal.tenantId) {
    return res.status(403).json({ error: "Access denied to this tenant" });
  }

  const result = await evaluatePipelineAI({
    tenantId: deal.tenantId,
    dealId,
    trigger: "manual",
    log: req.log,
  });
  return res.json(result);
});

const returnBudgetToQualifiedSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo da devolução.").max(1000),
  informacoesFaltantes: z.string().trim().min(3, "Informe quais informações estão faltando.").max(4000),
  responsavelId: z.string().min(1, "Selecione o responsável pela pendência."),
  dataVencimento: z.coerce.date(),
});

router.post("/deals/:id/return-to-qualified", async (req, res) => {
  const parsed = returnBudgetToQualifiedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({
      id: dealsTable.id,
      tenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      titulo: dealsTable.titulo,
      etapa: dealsTable.etapa,
      assignedTo: dealsTable.assignedTo,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && (userFn === "vendedor" || userFn === "entrega") && existing.assignedTo && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  if (existing.etapa !== "proposta") {
    res.status(409).json({
      error: "RETURN_TO_QUALIFIED_ONLY_FROM_BUDGET",
      message: "A devolução por falta de informação só pode ser feita a partir da etapa Orçamento.",
    });
    return;
  }

  if (!existing.leadId) {
    res.status(422).json({ error: "O negócio precisa estar vinculado a um lead." });
    return;
  }

  const [responsavel] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, parsed.data.responsavelId),
      eq(usersTable.tenantId, existing.tenantId),
    ))
    .limit(1);

  if (!responsavel) {
    res.status(422).json({ error: "O responsável selecionado não pertence a este tenant." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const now = new Date();

    const [deal] = await tx
      .update(dealsTable)
      .set({
        etapa: "qualificado",
        probabilidade: 25,
        etapaAlteradaEm: now,
        updatedAt: now,
      })
      .where(eq(dealsTable.id, existing.id))
      .returning();

    if (!deal) throw new Error("Deal update failed");

    const [task] = await tx
      .insert(activitiesTable)
      .values({
        tenantId: existing.tenantId,
        leadId: existing.leadId,
        dealId: existing.id,
        tipo: "tarefa",
        titulo: `Completar informações para orçamento — ${existing.titulo}`,
        descricao: [
          `Motivo da devolução: ${parsed.data.motivo}`,
          `Informações faltantes: ${parsed.data.informacoesFaltantes}`,
        ].join("\n"),
        objetivo: "Coletar e registrar as informações necessárias para concluir o orçamento.",
        resultadoEsperado: "Informações pendentes preenchidas e prontas para o negócio retornar à etapa Orçamento.",
        prioridade: "alta",
        status: "pendente",
        estadoExecucao: "planejada",
        categoriaExecucao: "obrigatoria",
        origem: "budget_return_missing_info",
        origemEtapaKey: "qualificado",
        origemTemplateKey: "budget-return-missing-info",
        bloqueiaAvanco: true,
        responsavelId: parsed.data.responsavelId,
        dataVencimento: parsed.data.dataVencimento,
      })
      .returning();

    await tx.insert(activitiesTable).values({
      tenantId: existing.tenantId,
      leadId: existing.leadId,
      dealId: existing.id,
      tipo: "tarefa",
      titulo: "Orçamento devolvido para Qualificado por falta de informação",
      descricao: [
        "Etapa anterior: Orçamento.",
        "Nova etapa: Qualificado.",
        `Motivo: ${parsed.data.motivo}`,
        `Informações faltantes: ${parsed.data.informacoesFaltantes}`,
        `Tarefa criada: ${task?.titulo ?? "Completar informações para orçamento"}.`,
      ].join(" "),
      status: "concluida",
      concluidaEm: now,
      responsavelId: req.user?.sub ?? null,
    });

    return { deal, task };
  });

  void recordIntelligenceEvent({
    tenantId: existing.tenantId,
    leadId: existing.leadId,
    eventType: "deal_stage_changed",
    title: "Orçamento devolvido para Qualificado",
    summary: `${parsed.data.motivo} — Pendências: ${parsed.data.informacoesFaltantes}`,
    sourceModule: "deals",
    sourceId: existing.id,
    metadata: {
      fromStage: "proposta",
      toStage: "qualificado",
      reason: parsed.data.motivo,
      missingInformation: parsed.data.informacoesFaltantes,
      taskId: result.task?.id ?? null,
      responsavelId: parsed.data.responsavelId,
      dataVencimento: parsed.data.dataVencimento.toISOString(),
    },
    log: req.log,
  });

  res.json(result);
});

router.patch("/deals/:id", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const { handoff: rawHandoff, ...dealBody } = body;
  const parsed = updateDealSchema.safeParse(dealBody);
  const handoffParsed = rawHandoff === undefined ? null : dealHandoffSchema.safeParse(rawHandoff);
  if (!parsed.success || (handoffParsed && !handoffParsed.success)) {
    res.status(422).json({
      error: !parsed.success ? parsed.error.message : handoffParsed && !handoffParsed.success ? handoffParsed.error.message : "Invalid handoff",
    });
    return;
  }
  const handoff = handoffParsed?.success ? handoffParsed.data : null;

  const [existing] = await db
    .select({
      id: dealsTable.id,
      tenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      titulo: dealsTable.titulo,
      valor: dealsTable.valor,
      etapa: dealsTable.etapa,
      etapaSaas: dealsTable.etapaSaas,
      relationshipStage: dealsTable.relationshipStage,
      assignedTo: dealsTable.assignedTo,
      wonAt: dealsTable.wonAt,
      vehicleReservationBlocked: dealsTable.vehicleReservationBlocked,
    })
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin2 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn2 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin2 && (userFn2 === "vendedor" || userFn2 === "entrega") && existing.assignedTo && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  // ── Guardrail: bloquear fechamento direto via PATCH quando valor diverge do
  // catálogo — mesma regra do confirm-closure e proposal-accepted, para que
  // "ganho" não possa ser setado direto sem passar pela aprovação humana.
  if (existing.vehicleReservationBlocked) {
    res.status(409).json({
      error: "O prazo desta negociação de veículo venceu. Registre a justificativa e escolha manter, avançar ou perdido antes de alterar o negócio.",
      code: "VEHICLE_RESERVATION_JUSTIFICATION_REQUIRED",
    });
    return;
  }

  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    const tenantIdForCheck = existing.tenantId ?? (req.user?.tenantId || "");
    const [dealForCheck] = await db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.id, existing.id));

    const [proposta] = await db
      .select()
      .from(propostasTable)
      .where(eq(propostasTable.dealId, existing.id))
      .orderBy(desc(propostasTable.createdAt))
      .limit(1);

    const valorNum = dealForCheck?.valor ? parseFloat(String(dealForCheck.valor)) : 0;
    const itens: CatalogCheckItem[] =
      proposta && proposta.itens && proposta.itens.length > 0
        ? proposta.itens.map((i) => ({
            nome: i.nome,