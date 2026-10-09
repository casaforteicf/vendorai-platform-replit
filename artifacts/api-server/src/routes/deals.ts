import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
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
import { COMMERCIAL_STAGE_ORDER, SAAS_STAGE_ORDER, TERMINAL_DEAL_STAGES, TERMINAL_WORK_STAGES, isBackwardMove } from "../lib/pipeline-progress.js";
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

function userMatchesStageResponsibleFunctions(
  user: { active: boolean | null; userFunction: string | null; customFunctionId: string | null },
  responsibleFunctions: string[] | null | undefined,
): boolean {
  if (user.active !== true) return false;
  const configured = responsibleFunctions ?? [];
  if (configured.length === 0) return false;

  const refs = new Set<string>();
  if (user.userFunction) refs.add(`builtin:${user.userFunction}`);
  if (user.customFunctionId) refs.add(`custom:${user.customFunctionId}`);
  return configured.some((responsible) => refs.has(responsible));
}

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


async function ensureRelationshipStageTasks(
  deal: typeof dealsTable.$inferSelect,
  pipeline: "aquecimento" | "parceiros",
  stageKey: string,
) {
  if (!deal.leadId || !stageKey) return;

  const [stageConfig] = await db
    .select({
      id: pipelineStagesTable.id,
      label: pipelineStagesTable.label,
      responsavelAgenteKey: pipelineStagesTable.responsavelAgenteKey,
      atividadesPadrao: pipelineStagesTable.atividadesPadrao,
      atividadePadraoTitulo: pipelineStagesTable.atividadePadraoTitulo,
      atividadePadraoDescricao: pipelineStagesTable.atividadePadraoDescricao,
      atividadePadraoPrazoMinutos: pipelineStagesTable.atividadePadraoPrazoMinutos,
    })
    .from(pipelineStagesTable)
    .where(and(
      eq(pipelineStagesTable.tenantId, deal.tenantId),
      eq(pipelineStagesTable.pipeline, pipeline),
      eq(pipelineStagesTable.key, stageKey),
    ))
    .limit(1);

  if (!stageConfig) return;

  const configured = stageConfig.atividadesPadrao ?? [];
  const fallbackTitle = stageConfig.atividadePadraoTitulo?.trim();
  const templates = configured.length > 0 ? configured : (fallbackTitle ? [{
    id: "legacy-default",
    titulo: fallbackTitle,
    descricao: stageConfig.atividadePadraoDescricao ?? null,
    categoria: "sugerida" as const,
    prazoMinutos: stageConfig.atividadePadraoPrazoMinutos ?? 24 * 60,
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
      eq(activitiesTable.origemEtapaKey, stageKey),
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
    const dueMinutes = template.prazoMinutos ?? 24 * 60;
    await db.insert(activitiesTable).values({
      tenantId: deal.tenantId,
      leadId: deal.leadId,
      dealId: deal.id,
      tipo: template.tipo ?? "tarefa",
      titulo: `${template.titulo} — ${deal.titulo}`,
      descricao: template.descricao?.trim()
        || `Atividade criada automaticamente ao entrar em ${stageConfig.label} (${pipeline}).`,
      objetivo: template.objetivo ?? null,
      resultadoEsperado: template.resultadoEsperado ?? null,
      prioridade: template.prioridade ?? "normal",
      estadoExecucao: automatic ? "planejada_ia" : "planejada",
      categoriaExecucao: template.categoria,
      origem: "pipeline_stage",
      origemEtapaId: stageConfig.id,
      origemEtapaKey: stageKey,
      origemTemplateKey: templateKey,
      bloqueiaAvanco: Boolean(template.bloqueiaAvanco || template.categoria === "obrigatoria"),
      agenteResponsavelKey: template.responsavel === "stage_agent" ? stageConfig.responsavelAgenteKey ?? null : null,
      status: "planejado",
      responsavelId: template.responsavel === "stage_agent" ? null : deal.assignedTo ?? null,
      dataVencimento: new Date(Date.now() + dueMinutes * 60 * 1000),
    });
  }
}

async function configuredRelationshipStageMove(
  tenantId: string,
  pipeline: "aquecimento" | "parceiros",
  currentStage: string,
  targetStage: string,
) {
  const stages = await db
    .select({
      key: pipelineStagesTable.key,
      label: pipelineStagesTable.label,
      ordem: pipelineStagesTable.ordem,
      responsaveisFuncoes: pipelineStagesTable.responsaveisFuncoes,
    })
    .from(pipelineStagesTable)
    .where(and(
      eq(pipelineStagesTable.tenantId, tenantId),
      eq(pipelineStagesTable.pipeline, pipeline),
    ));

  const ordered = [...stages].sort((a, b) => a.ordem - b.ordem);
  const currentIndex = ordered.findIndex((stage) => stage.key === currentStage);
  const targetIndex = ordered.findIndex((stage) => stage.key === targetStage);
  return {
    currentIndex,
    targetIndex,
    target: targetIndex >= 0 ? ordered[targetIndex] : null,
  };
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
  // Verificação no servidor: o importId aprovado deve pertencer ao mesmo tenant
  // e corresponder exatamente ao arquivo enviado ao criar o negócio.
  const rawImportId = (req.body as Record<string, unknown>).budgetImportId;
  // If a file originated from the audited extractor, every creation path must
  // provide its approved importId; legacy/manual attachments remain supported.
  if (parsed.data.quoteFileUrl && rawImportId === undefined) {
    const knownImports = await db.execute(sql`
      SELECT id FROM public.budget_imports
      WHERE tenant_id = ${parsed.data.tenantId}
        AND file_url = ${parsed.data.quoteFileUrl}
      LIMIT 1
    `);
    if (knownImports.rows.length) {
      res.status(409).json({
        error: "Este arquivo foi importado automaticamente. Revise e aprove a importação antes de criar o negócio.",
        code: "BUDGET_IMPORT_REVIEW_REQUIRED",
      });
      return;
    }
  }
  if (rawImportId !== undefined) {
    if (typeof rawImportId !== "string" || !/^[0-9a-f-]{36}$/i.test(rawImportId)) {
      res.status(422).json({ error: "Identificador de importação inválido." });
      return;
    }
    const approved = await db.execute(sql`
      SELECT id FROM public.budget_imports
      WHERE id = ${rawImportId} AND tenant_id = ${parsed.data.tenantId}
        AND review_status = 'approved'
        AND file_url IS NOT DISTINCT FROM ${parsed.data.quoteFileUrl ?? null}
      LIMIT 1
    `);
    if (!approved.rows.length) {
      res.status(409).json({ error: "O orçamento anexado não corresponde a uma importação aprovada neste tenant." });
      return;
    }
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
    responsaveisFuncoes: pipelineStagesTable.responsaveisFuncoes,
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
    const [responsavel] = await db.select({
      id: usersTable.id,
      active: usersTable.active,
      userFunction: usersTable.userFunction,
      customFunctionId: usersTable.customFunctionId,
    }).from(usersTable).where(and(
      eq(usersTable.id, responsavelId),
      eq(usersTable.tenantId, deal.tenantId),
    )).limit(1);
    if (!responsavel || !userMatchesStageResponsibleFunctions(responsavel, targetStageConfig.responsaveisFuncoes)) {
      res.status(422).json({
        error: "STAGE_RESPONSIBLE_REQUIRED",
        message: "O responsável precisa estar ativo e ter uma função configurada como responsável pela etapa de destino.",
      });
      return;
    }
  }

  const movedAt = new Date();
  let source = currentDealPipeline(deal);
  let sourceOperationalCard: typeof workCardsTable.$inferSelect | null = null;
  let destinationCard: typeof workCardsTable.$inferSelect | null = null;


  if ((source.pipeline === "aquecimento" || source.pipeline === "parceiros") && source.pipeline !== parsed.data.targetPipeline) {
    const blocking = await db
      .select({ id: activitiesTable.id, titulo: activitiesTable.titulo })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.tenantId, deal.tenantId),
        eq(activitiesTable.dealId, deal.id),
        eq(activitiesTable.origemEtapaKey, source.stage),
        eq(activitiesTable.bloqueiaAvanco, true),
        inArray(activitiesTable.status, ["planejado", "pendente"]),
      ))
      .limit(20);
    if (blocking.length > 0) {
      res.status(409).json({
        error: "ACTIVITIES_REQUIRED_BEFORE_PIPELINE_TRANSFER",
        message: "Existem atividades obrigatórias pendentes antes de mover este processo para outra pipeline.",
        activities: blocking,
      });
      return;
    }
  }

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


  if (parsed.data.targetPipeline === "aquecimento" || parsed.data.targetPipeline === "parceiros") {
    const [movedDeal] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id)).limit(1);
    if (movedDeal) {
      await ensureRelationshipStageTasks(movedDeal, parsed.data.targetPipeline, parsed.data.targetStage);
    }
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

  // Lead excluído permanece com os negócios preservados para histórico e
  // restauração, mas nenhum desses negócios pode continuar aparecendo nas
  // pipelines ativas enquanto o lead estiver em "Excluídos".
  conditions.push(notExists(
    db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.id, dealsTable.leadId),
        isNotNull(leadsTable.excluidoEm),
      )),
  ));

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
      eq(usersTable.active, true),
    ))
    .limit(1);

  if (!responsavel) {
    res.status(422).json({
      error: "INVALID_NEXT_OWNER",
      message: "O próximo responsável precisa pertencer à empresa e estar ativo.",
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

  const [qualifiedStage] = await db.select({
    responsaveisFuncoes: pipelineStagesTable.responsaveisFuncoes,
  }).from(pipelineStagesTable).where(and(
    eq(pipelineStagesTable.tenantId, existing.tenantId),
    eq(pipelineStagesTable.pipeline, "comercial"),
    eq(pipelineStagesTable.key, "qualificado"),
  )).limit(1);

  const [responsavel] = await db
    .select({
      id: usersTable.id,
      active: usersTable.active,
      userFunction: usersTable.userFunction,
      customFunctionId: usersTable.customFunctionId,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, parsed.data.responsavelId),
      eq(usersTable.tenantId, existing.tenantId),
    ))
    .limit(1);

  if (!qualifiedStage || !responsavel || !userMatchesStageResponsibleFunctions(responsavel, qualifiedStage.responsaveisFuncoes)) {
    res.status(422).json({
      error: "STAGE_RESPONSIBLE_REQUIRED",
      message: "Selecione um usuário ativo cuja função esteja configurada como responsável pela etapa Qualificado.",
    });
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
            sku: i.sku ?? null,
            quantidade: i.quantidade,
            valorUnitario: i.valorUnitario,
          }))
        : [{ nome: dealForCheck?.planoContratado ?? dealForCheck?.titulo ?? "deal", quantidade: 1, valorUnitario: valorNum }];

    const valorTotalOverride =
      proposta?.valorTotal !== null && proposta?.valorTotal !== undefined
        ? Number(proposta.valorTotal)
        : valorNum;

    const catalogCheck = await checkCatalogMatch(tenantIdForCheck, itens, valorTotalOverride);

    if (catalogCheck.hasCatalogBasis && !catalogCheck.matches) {
      if (!dealForCheck?.leadId) {
        req.log.error(
          { dealId: existing.id },
          "deals-patch: catalog divergence but deal has no leadId — cannot create agent_task, blocking closure"
        );
        res.status(422).json({
          error: "Valor diverge do catálogo e não há lead vinculado para aprovação",
        });
        return;
      }

      const [task] = await db
        .insert(agentTasksTable)
        .values({
          tenantId: tenantIdForCheck,
          leadId: dealForCheck.leadId,
          agentName: "closer",
          actionType: "aprovacao_fechamento",
          payload: {
            origin: "deals_patch",
            dealId: existing.id,
            body: parsed.data,
            vendedorNome: (req.user as { name?: string } | undefined)?.name ?? null,
            valorProposta: catalogCheck.propostaTotal,
            valorCatalogo: catalogCheck.catalogTotal,
            diferenca: catalogCheck.diferenca,
            itens: catalogCheck.itemDetails,
          },
        })
        .returning();

      const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await db.insert(notificationsTable).values({
        tenantId: tenantIdForCheck,
        title: "Fechamento pendente de aprovação — valor diverge do catálogo",
        message: `Fechamento do negócio "${dealForCheck.titulo}" (lead ${dealForCheck.leadId}) tem valor de ${fmt(catalogCheck.propostaTotal)}, mas o catálogo indica ${fmt(catalogCheck.catalogTotal)} (diferença: ${fmt(catalogCheck.diferenca)}). Aprovação manual necessária para fechar este negócio.`,
        type: "warning",
        category: "deal_closure_approval",
      });

      try {
        if (dealForCheck.assignedTo) {
          const [owner] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, dealForCheck.assignedTo));
          if (owner?.telefone) {
            const msg = `⚠️ Fechamento pendente de aprovação\n\nNegócio "${dealForCheck.titulo}" tem valor de ${fmt(catalogCheck.propostaTotal)}, diferente do catálogo (${fmt(catalogCheck.catalogTotal)}). Diferença: ${fmt(catalogCheck.diferenca)}.\n\nAprove ou rejeite no painel para concluir o fechamento.`;
            await sendDirectWhatsAppMessage(tenantIdForCheck, owner.telefone, msg, req.log);
          }
        }
      } catch (wErr) {
        req.log.warn({ err: wErr, dealId: existing.id }, "deals-patch: WhatsApp approval alert failed (non-fatal)");
      }

      req.log.warn(
        { dealId: existing.id, taskId: task.id, ...catalogCheck },
        "deals-patch: valor diverge do catálogo, fechamento bloqueado até aprovação (PATCH direto)"
      );

      res.status(202).json({
        pendingApproval: true,
        agentTaskId: task.id,
        divergence: {
          valorProposta: catalogCheck.propostaTotal,
          valorCatalogo: catalogCheck.catalogTotal,
          diferenca: catalogCheck.diferenca,
        },
      });
      return;
    }
  }

  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa) {
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
  const relationshipPipeline =
    existing.etapa === "parceiro"
      ? "parceiros"
      : existing.etapa === "em_aquecimento"
        ? "aquecimento"
        : null;
  const currentRelationshipStage = relationshipPipeline
    ? (existing.relationshipStage
      || (relationshipPipeline === "parceiros" ? "parceiro_identificado" : "aquecimento_lead"))
    : null;
  const relationshipStageChanged = Boolean(
    relationshipPipeline
    && parsed.data.relationshipStage
    && parsed.data.relationshipStage !== currentRelationshipStage
  );

  let targetRelationshipStageLabel: string | null = null;
  if (relationshipStageChanged && relationshipPipeline && parsed.data.relationshipStage && currentRelationshipStage) {
    const move = await configuredRelationshipStageMove(
      existing.tenantId,
      relationshipPipeline,
      currentRelationshipStage,
      parsed.data.relationshipStage,
    );
    if (!move.target) {
      res.status(422).json({
        error: "INVALID_TENANT_STAGE",
        message: "A etapa escolhida não pertence à pipeline configurada deste tenant.",
      });
      return;
    }
    targetRelationshipStageLabel = move.target.label;

    if ((move.target.responsaveisFuncoes ?? []).length > 0) {
      if (!existing.assignedTo) {
        res.status(422).json({
          error: "STAGE_RESPONSIBLE_REQUIRED",
          message: "Defina um responsável antes de mover o processo para esta etapa.",
        });
        return;
      }
      const [owner] = await db.select({
        id: usersTable.id,
        active: usersTable.active,
        userFunction: usersTable.userFunction,
        customFunctionId: usersTable.customFunctionId,
      }).from(usersTable).where(and(
        eq(usersTable.id, existing.assignedTo),
        eq(usersTable.tenantId, existing.tenantId),
      )).limit(1);
      if (!owner || !userMatchesStageResponsibleFunctions(owner, move.target.responsaveisFuncoes)) {
        res.status(422).json({
          error: "STAGE_RESPONSIBLE_REQUIRED",
          message: "O responsável atual não possui uma função autorizada para a etapa de destino.",
        });
        return;
      }
    }

    if (relationshipPipeline === "parceiros" && move.currentIndex >= 0 && move.targetIndex < move.currentIndex) {
      res.status(409).json({
        error: "CARD_BACKWARD_FORBIDDEN",
        message: "O processo de parceiro só pode avançar. Etapas anteriores permanecem no histórico.",
      });
      return;
    }

    const blocking = await db
      .select({ id: activitiesTable.id, titulo: activitiesTable.titulo })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.tenantId, existing.tenantId),
        eq(activitiesTable.dealId, existing.id),
        eq(activitiesTable.origemEtapaKey, currentRelationshipStage),
        eq(activitiesTable.bloqueiaAvanco, true),
        inArray(activitiesTable.status, ["planejado", "pendente"]),
      ))
      .limit(20);
    if (blocking.length > 0) {
      res.status(409).json({
        error: "ACTIVITIES_REQUIRED_BEFORE_STAGE_CHANGE",
        message: "Existem atividades obrigatórias pendentes antes de avançar esta etapa.",
        activities: blocking,
      });
      return;
    }
  }
  if (parsed.data.etapaSaas && existing.etapaSaas && isBackwardMove(SAAS_STAGE_ORDER, existing.etapaSaas, parsed.data.etapaSaas)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card SaaS só pode avançar." });
    return;
  }

  if (handoff && (!parsed.data.etapa || parsed.data.etapa === existing.etapa)) {
    res.status(422).json({ error: "A passagem de responsabilidade exige uma nova etapa" });
    return;
  }
  if (handoff) {
    const [responsavel] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.id, handoff.responsavelId), eq(usersTable.tenantId, existing.tenantId))).limit(1);
    if (!responsavel) {
      res.status(422).json({ error: "O próximo responsável não pertence a este tenant" });
      return;
    }
  }

  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa) {
    const blocking = await db
      .select({ id: activitiesTable.id, titulo: activitiesTable.titulo })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.tenantId, existing.tenantId),
        eq(activitiesTable.dealId, existing.id),
        eq(activitiesTable.origemEtapaKey, existing.etapa),
        eq(activitiesTable.bloqueiaAvanco, true),
        inArray(activitiesTable.status, ["planejado", "pendente"]),
      ))
      .limit(20);
    if (blocking.length > 0) {
      res.status(409).json({
        error: "ACTIVITIES_REQUIRED_BEFORE_STAGE_CHANGE",
        message: "Existem atividades obrigatórias pendentes antes de avançar esta etapa.",
        activities: blocking,
      });
      return;
    }
  }

  const nextAssignedTo = handoff?.responsavelId ?? ("assignedTo" in parsed.data ? parsed.data.assignedTo : (existing.assignedTo ?? req.user?.sub ?? null));
  const assignedToChanged = nextAssignedTo !== existing.assignedTo;
  const etapaChanged = Boolean(parsed.data.etapa && parsed.data.etapa !== existing.etapa);

  const [targetStageConfig] = etapaChanged && parsed.data.etapa
    ? await db.select({
        id: pipelineStagesTable.id,
        key: pipelineStagesTable.key,
        label: pipelineStagesTable.label,
        responsaveisFuncoes: pipelineStagesTable.responsaveisFuncoes,
        responsavelAgenteKey: pipelineStagesTable.responsavelAgenteKey,
        aiConfig: pipelineStagesTable.aiConfig,
      }).from(pipelineStagesTable).where(and(
        eq(pipelineStagesTable.tenantId, existing.tenantId),
        eq(pipelineStagesTable.pipeline, "comercial"),
        eq(pipelineStagesTable.key, parsed.data.etapa),
      )).limit(1)
    : [];

  if (etapaChanged && nextAssignedTo) {
    const [nextOwner] = await db.select({
      id: usersTable.id,
      active: usersTable.active,
      userFunction: usersTable.userFunction,
      customFunctionId: usersTable.customFunctionId,
    }).from(usersTable).where(and(
      eq(usersTable.id, nextAssignedTo),
      eq(usersTable.tenantId, existing.tenantId),
    )).limit(1);

    if (!targetStageConfig || !userMatchesStageResponsibleFunctions(nextOwner ?? { active: false, userFunction: null, customFunctionId: null }, targetStageConfig.responsaveisFuncoes)) {
      res.status(422).json({
        error: "STAGE_RESPONSIBLE_REQUIRED",
        message: "O responsável precisa estar ativo e ter uma função configurada como responsável pela etapa de destino.",
      });
      return;
    }
  }

  const targetAIConfig = targetStageConfig?.aiConfig;
  const targetAgentCanOperate = Boolean(
    handoff
    && targetStageConfig?.responsavelAgenteKey
    && targetAIConfig?.mode === "autonoma"
    && (
      (targetAIConfig.allowedActions ?? []).includes("create_activity")
      || (targetAIConfig.allowedActions ?? []).includes("send_message")
    )
  );

  const deal = await db.transaction(async (tx) => {
    const [updatedDeal] = await tx.update(dealsTable).set({
      ...parsed.data,
      assignedTo: nextAssignedTo,
      ...((etapaChanged || relationshipStageChanged || assignedToChanged) ? { etapaAlteradaEm: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(dealsTable.id, existing.id)).returning();
    if (!updatedDeal) throw new Error("Deal update failed");

    if (handoff && updatedDeal.leadId) {
      await tx.insert(activitiesTable).values({
        tenantId: existing.tenantId,
        leadId: updatedDeal.leadId,
        dealId: updatedDeal.id,
        tipo: "tarefa",
        titulo: handoff.atividadeTitulo,
        descricao: [handoff.atividadeDescricao, handoff.observacaoPassagem ? "Passagem: " + handoff.observacaoPassagem : null].filter(Boolean).join("\n") || null,
        objetivo: handoff.atividadeTitulo,
        resultadoEsperado: "Executar a próxima melhor ação e registrar o resultado no histórico do lead.",
        status: targetAgentCanOperate ? "planejado" : "pendente",
        estadoExecucao: targetAgentCanOperate ? "planejada_ia" : "planejada",
        categoriaExecucao: targetAgentCanOperate ? "automatica" : "sugerida",
        origem: "journey_next_best_action",
        origemEtapaId: targetStageConfig?.id ?? null,
        origemEtapaKey: updatedDeal.etapa,
        origemTemplateKey: targetAgentCanOperate ? "journey-agent-next-best-action" : "journey-human-next-best-action",
        agenteResponsavelKey: targetAgentCanOperate ? targetStageConfig?.responsavelAgenteKey ?? null : null,
        dataVencimento: handoff.dataVencimento ?? null,
        responsavelId: targetAgentCanOperate ? null : handoff.responsavelId,
      });
      await tx.insert(activitiesTable).values({
        tenantId: existing.tenantId, leadId: updatedDeal.leadId, dealId: updatedDeal.id,
        tipo: "tarefa",
        titulo: "Atendimento transferido para " + (DEAL_STAGE_LABELS[updatedDeal.etapa] ?? updatedDeal.etapa),
        descricao: [
          "Etapa anterior: " + (DEAL_STAGE_LABELS[existing.etapa] ?? existing.etapa) + ".",
          "Nova etapa: " + (DEAL_STAGE_LABELS[updatedDeal.etapa] ?? updatedDeal.etapa) + ".",
          handoff.observacaoPassagem ? "Observação: " + handoff.observacaoPassagem : null,
        ].filter(Boolean).join(" "),
        status: "concluida", concluidaEm: new Date(), responsavelId: req.user?.sub ?? null,
      });
    }

    // Entrar na etapa Orçamento precisa gerar um orçamento persistido.
    // Sem isso a pipeline pode mostrar "Orçamento" e valor comercial, enquanto
    // a Central do Lead diz que não existe orçamento.
    if (updatedDeal.etapa === "proposta" && updatedDeal.leadId) {
      const [existingBudget] = await tx
        .select({ id: propostasTable.id })
        .from(propostasTable)
        .where(and(
          eq(propostasTable.tenantId, updatedDeal.tenantId),
          eq(propostasTable.dealId, updatedDeal.id),
        ))
        .limit(1);

      if (!existingBudget) {
        await tx.insert(propostasTable).values({
          tenantId: updatedDeal.tenantId,
          leadId: updatedDeal.leadId,
          dealId: updatedDeal.id,
          titulo: `Orçamento — ${updatedDeal.titulo}`,
          itens: [],
          valorTotal: updatedDeal.valor ? String(updatedDeal.valor) : null,
          status: "rascunho",
          autoGenerated: true,
          observacoes: "Orçamento criado automaticamente ao entrar na etapa Orçamento.",
        });
      }
    }
    return updatedDeal;
  });

  if (deal.leadId && parsed.data.respostasEtapas) {
    for (const [stageKey, answers] of Object.entries(parsed.data.respostasEtapas)) {
      if (!answers || typeof answers !== "object") continue;
      void recordStageAnswers({
        tenantId: existing.tenantId,
        leadId: deal.leadId,
        dealId: deal.id,
        stageKey,
        answers: answers as Record<string, string>,
        log: req.log,
      });
    }
  }

  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa) {
    await recordDealJourney({
      tenantId: existing.tenantId, leadId: deal.leadId, dealId: deal.id,
      title: "Negócio avançou para " + (DEAL_STAGE_LABELS[parsed.data.etapa] ?? parsed.data.etapa),
      description: [
        "Etapa anterior: " + (DEAL_STAGE_LABELS[existing.etapa] ?? existing.etapa) + ".",
        "Nova etapa: " + (DEAL_STAGE_LABELS[parsed.data.etapa] ?? parsed.data.etapa) + ".",
        targetAgentCanOperate && targetStageConfig?.responsavelAgenteKey
          ? "Agente da etapa assumiu automaticamente a próxima melhor ação: " + targetStageConfig.responsavelAgenteKey + "."
          : null,
      ].filter(Boolean).join(" "),
      responsavelId: req.user?.sub,
    });
    await ensureCommercialStageTasks(deal);

    void recordIntelligenceEvent({
      tenantId: existing.tenantId,
      leadId: deal.leadId,
      eventType: "deal_stage_changed",
      title: `Negócio avançou para ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}`,
      summary: `Etapa anterior: ${DEAL_STAGE_LABELS[existing.etapa] ?? existing.etapa}. Nova etapa: ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}.`,
      sourceModule: "deals",
      sourceId: deal.id,
      metadata: { previousStage: existing.etapa, stage: deal.etapa, assignedTo: deal.assignedTo ?? null },
      log: req.log,    });

    void evaluatePipelineAI({
      tenantId: existing.tenantId,
      dealId: deal.id,
      trigger: "stage_changed",
      log: req.log,
    }).catch((err) => {
      req.log.warn({ err, tenantId: existing.tenantId, dealId: deal.id }, "deals: pipeline AI evaluation failed after stage change");
    });

    if (deal.leadId) {
      void suggestDynamicStageQuestions({
        tenantId: existing.tenantId,
        leadId: deal.leadId,
        dealId: deal.id,
        log: req.log,
      }).then((questions) => {
        if (questions.length > 0) {
          req.log.info({ dealId: deal.id, count: questions.length }, "customer-intelligence: dynamic stage questions suggested");
        }
      }).catch((err) => {
        req.log.warn({ err, dealId: deal.id }, "customer-intelligence: dynamic stage question suggestion failed (non-fatal)");
      });
    }
  }


  if (relationshipStageChanged && relationshipPipeline && parsed.data.relationshipStage) {
    await ensureRelationshipStageTasks(deal, relationshipPipeline, parsed.data.relationshipStage);
    await recordDealJourney({
      tenantId: existing.tenantId,
      leadId: deal.leadId,
      dealId: deal.id,
      title: `Processo avançou para ${targetRelationshipStageLabel ?? parsed.data.relationshipStage}`,
      description: [
        `Pipeline: ${relationshipPipeline}.`,
        `Etapa anterior: ${currentRelationshipStage ?? "não informada"}.`,
        `Nova etapa: ${targetRelationshipStageLabel ?? parsed.data.relationshipStage}.`,
      ].join(" "),
      responsavelId: req.user?.sub,
    });
  }

  // Notifica quando o negócio é repassado pra OUTRA pessoa (não pra si
  // mesmo) -- quem recebeu precisa saber que esse card entrou na conta
  // dele. Notificação é de tenant inteiro (não existe alvo por usuário
  // ainda), mas já deixa claro pra quem foi.
  if (assignedToChanged && deal.assignedTo && deal.assignedTo !== req.user?.sub) {
    const [novoResponsavel] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, deal.assignedTo));
    await db.insert(notificationsTable).values({
      tenantId: existing.tenantId,
      title: "Negócio repassado pra você",
      message: `"${deal.titulo}" foi enviado pra ${novoResponsavel?.name ?? "você"}${etapaChanged ? ` na etapa ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}` : ""}.`,
      type: "info",
      category: "deal_reassigned",
    });
  }

  // Negocios e Central da Farmacia sao pipelines distintas, mas compartilham
  // o mesmo pedido. A confirmacao comercial libera apenas pedidos que nao
  // dependem de receita; o cancelamento encerra o fluxo operacional.
  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    await db.update(farmaciaPedidoTable)
      .set({ status: "confirmado", updatedAt: new Date() })
      .where(and(
        eq(farmaciaPedidoTable.dealId, deal.id),
        eq(farmaciaPedidoTable.tenantId, existing.tenantId),
        eq(farmaciaPedidoTable.status, "aguardando_confirmacao"),
      ));
  } else if (parsed.data.etapa === "perdido" && existing.etapa !== "perdido") {
    await db.update(farmaciaPedidoTable)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(and(
        eq(farmaciaPedidoTable.dealId, deal.id),
        eq(farmaciaPedidoTable.tenantId, existing.tenantId),
        sql`${farmaciaPedidoTable.status} NOT IN ('entregue', 'cancelado')`,
      ));
  }

  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    await finalizeVehicleReservation(deal.id, "ganho");
    await finalizeItemReservation(deal.id, "ganho");
  } else if (parsed.data.etapa === "perdido" && existing.etapa !== "perdido") {
    await finalizeVehicleReservation(deal.id, "perdido", parsed.data.motivoPerda ?? parsed.data.lostReasonDetail);
    await finalizeItemReservation(deal.id, "perdido", parsed.data.motivoPerda ?? parsed.data.lostReasonDetail);
  }

  // Feature store — captura a mudança de etapa e, quando o negócio resolve
  // (ganho ou perdido), retroage o rótulo em todos os snapshots pendentes
  // desse lead. Melhor esforço, nunca bloqueia o fechamento do negócio.
  if (parsed.data.etapa && deal.leadId) {
    captureLeadFeatureSnapshot(existing.tenantId, deal.leadId, "deal_etapa_change", { dealEtapa: parsed.data.etapa }, req.log).catch(() => {});
    if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
      backfillResultadoSnapshots(existing.tenantId, deal.leadId, "ganho", req.log).catch(() => {});
    } else if (parsed.data.etapa === "perdido" && existing.etapa !== "perdido") {
      backfillResultadoSnapshots(existing.tenantId, deal.leadId, "perdido", req.log).catch(() => {});
    }
  }

  // helper: log a step to automation_logs without throwing
  const logAutomation = async (step: string, status: string, errorMessage?: string) => {
    try {
      await db.insert(automationLogsTable).values({ flow: "deal_won", dealId: deal.id, step, status, errorMessage: errorMessage?.slice(0, 1000) });
    } catch { /* ignore */ }
  };

  // ── Update lead status when deal is won (sync — fast DB update)
  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho" && deal.leadId) {
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, deal.leadId));
    req.log.info({ dealId: deal.id, leadId: deal.leadId }, "deal-ganho: lead status updated to convertido");
  }

  // tracking vars used inside the ganho block (kept for internal flow control)
  let inviteSent = false;
  let inviteEmail: string | undefined;
  let inviteSkipReason: string | undefined;
  let whatsappSent = false;
  let whatsappSkipReason: string | undefined;
  let chargeId: string | null = null;
  let chargeLink: string | null = null;
  let chargeSkipReason: string | undefined;
  let contractSent = false;
  let contractSkipReason: string | undefined;
  let onboardingSent = false;
  let onboardingSkipReason: string | undefined;

  // ── Trigger ganho: idempotent via won_at (contract-only retry for failed/skipped) ─────
  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    // ── Validação: plano obrigatório antes de fechar ────────────────────────
    if (!deal.planoContratado) {
      res.status(400).json({
        error: "PLANO_OBRIGATORIO",
        message: "É necessário definir o plano comercial (planoContratado) antes de fechar este deal.",
      });
      return;
    }

    // Inicializar rastreamento de fechamento
    const tenantId = deal.tenantId ?? (req.user?.tenantId || "");
    const [closingStatus] = await db
      .select({ id: dealClosingStatusTable.id })
      .from(dealClosingStatusTable)
      .where(eq(dealClosingStatusTable.dealId, deal.id))
      .limit(1);
    if (!closingStatus) {
      await db.insert(dealClosingStatusTable).values({
        dealId: deal.id,
        tenantId,
        etapaAtual: "plano_atribuido",
      });
    } else {
      await db
        .update(dealClosingStatusTable)
        .set({ etapaAtual: "plano_atribuido", updatedAt: new Date(), tentativas: sql`${dealClosingStatusTable.tentativas} + 1` })
        .where(eq(dealClosingStatusTable.id, closingStatus.id));
    }

    const plano = await db
      .select({ id: plansTable.id, implantationPriceCents: plansTable.implantationPriceCents })
      .from(plansTable)
      .where(eq(plansTable.slug, deal.planoContratado))
      .limit(1)
      .then((rows) => rows[0]);
    if (!plano) {
      res.status(400).json({
        error: "PLANO_INVALIDO",
        message: `Plano "${deal.planoContratado}" não encontrado.`,
      });
      return;
    }

    const isContractRetry = deal.closureTriggeredAt && (deal.contractStatus === "failed" || deal.contractStatus === "skipped");
    if (deal.closureTriggeredAt && !isContractRetry) {
      req.log.info({ dealId: deal.id }, "deal-ganho: already triggered and succeeded, skipping");
    } else {
      // ── Responder imediatamente — I/O pesado roda async (fire-and-forget) ────
      const [earlyDeal] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));
      res.json(earlyDeal);
      const bgLog = req.log;

      void (async () => {
      try {
        // Marcar início do fechamento (ou manter data no retry)
        // Setar won_at como idempotência — só na primeira vez
        if (!existing.wonAt) {
          await db
            .update(dealsTable)
            .set({ wonAt: new Date() })
            .where(eq(dealsTable.id, deal.id));
        }

        await db
          .update(dealsTable)
          .set({
            closureTriggeredAt: isContractRetry ? deal.closureTriggeredAt : new Date(),
            contractStatus: isContractRetry ? deal.contractStatus : "pending",
            onboardingStatus: isContractRetry ? deal.onboardingStatus : "pending",
          })
          .where(eq(dealsTable.id, deal.id));

        // ── Tenant + plano + comissão de vendedor (função compartilhada com
        // confirm_closure.ts — extraída numa auditoria pra eliminar a
        // duplicação e garantir que os dois caminhos de fechamento
        // ('Vendido' e arrastar no Kanban) façam a mesma coisa) ────────────
        const tpcResult = await ensureTenantPlanAndCommission(deal.id, bgLog);
        const tenantId = tpcResult.tenantId ?? existing.tenantId ?? (req.user?.tenantId || "");
        const tenant = tenantId
          ? await db
              .select({
                name: tenantsTable.name,
                webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
                partnerId: tenantsTable.partnerId,
                tipoFechamentoDefault: tenantsTable.tipoFechamentoDefault,
                integrationType: tenantsTable.integrationType,
              })
              .from(tenantsTable)
              .where(eq(tenantsTable.id, tenantId))
              .then((rows) => rows[0])
          : undefined;

        // Atualizar deal_closing_status: plano_atribuido → concluido (ou travado em erro)
        await db
          .update(dealClosingStatusTable)
          .set({ etapaAtual: "concluido", updatedAt: new Date() })
          .where(eq(dealClosingStatusTable.dealId, deal.id));

        const lead = deal.leadId
          ? await db
              .select({ email: leadsTable.email, nome: leadsTable.nome, telefone: leadsTable.telefone, documento: leadsTable.documento, empresa: leadsTable.empresa })
              .from(leadsTable)
              .where(eq(leadsTable.id, deal.leadId))
              .then((rows) => rows[0])
          : undefined;

        // ── Notificações de dados faltantes ─────────────────────────────────
        const missingData: string[] = [];
        if (!lead?.email) missingData.push("email");
        if (!lead?.telefone) missingData.push("telefone");
        if (!lead?.documento) missingData.push("documento (CPF/CNPJ)");
        if (missingData.length > 0) {
          await db.insert(notificationsTable).values({
            tenantId,
            title: "Dados faltantes para fechamento",
            message: `Deal "${deal.titulo}" está faltando: ${missingData.join(", ")}. Complete o lead para enviar contrato e onboarding.`,
            type: "warning",
            category: "deal_closure",
          });
          req.log.warn({ dealId: deal.id, missing: missingData }, "deal-ganho: missing data notification created");
        }

        // ── Onboarding: email + WhatsApp (skip on contract retry) ──────────
        let inviteUrl: string | undefined;
        if (isContractRetry) {
          // Preservar estado anterior do onboarding no retry
          inviteSent = deal.onboardingStatus === "sent";
          onboardingSent = deal.onboardingStatus === "sent";
          whatsappSent = deal.onboardingStatus === "sent";
          req.log.info({ dealId: deal.id }, "deal-ganho: onboarding skipped on contract retry");
        } else {
          if (!lead?.email) {
            inviteSkipReason = "no_email";
            req.log.info({ dealId: deal.id }, "auto-invite skipped: lead has no email");
          } else {
            const email = lead.email;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const [existing_invite] = await db
              .select({ id: tenantInvitesTable.id, token: tenantInvitesTable.token })
              .from(tenantInvitesTable)
              .where(
                and(
                  eq(tenantInvitesTable.email, email),
                  eq(tenantInvitesTable.tenantId, tenantId),
                  eq(tenantInvitesTable.role, "tenant_admin"),
                  isNull(tenantInvitesTable.usedAt),
                ),
              );

            let invite: { id: string; token: string };
            if (existing_invite) {
              [invite] = await db
                .update(tenantInvitesTable)
                .set({ expiresAt })
                .where(eq(tenantInvitesTable.id, existing_invite.id))
                .returning({ id: tenantInvitesTable.id, token: tenantInvitesTable.token });
            } else {
              [invite] = await db
                .insert(tenantInvitesTable)
                .values({
                  tenantId,
                  email,
                  role: "tenant_admin",
                  expiresAt,
                  createdBy: req.user!.sub,
                })
                .returning({ id: tenantInvitesTable.id, token: tenantInvitesTable.token });
            }

            inviteUrl = buildInviteUrl(req, invite.token);
            inviteSent = await sendInviteEmail(email, inviteUrl, tenant?.name ?? "");
            inviteEmail = email;
            req.log.info({ dealId: deal.id, inviteId: invite.id, inviteSent }, "auto-invite processed");
          }

          // WhatsApp invite
          if (!lead?.telefone) {
            whatsappSkipReason = "no_phone";
            req.log.info({ dealId: deal.id }, "whatsapp invite skipped: lead has no phone");
          } else {
            try {
              const nome = lead.nome ?? "";
              const plataforma = tenant?.name ?? "VendorAI";
              const whatsappMessage = inviteUrl
                ? `Olá, ${nome}! 🎉\n\nSeu acesso à plataforma ${plataforma} foi liberado.\n\nClique no link abaixo para criar sua senha e acessar:\n${inviteUrl}`
                : `Olá ${nome}! Seja bem-vindo à Vendor.ai! Seu contrato foi enviado para assinatura. — Equipe Vendor.ai`;
              await sendDirectWhatsAppMessage(tenantId, lead.telefone, whatsappMessage, req.log);
              whatsappSent = true;
              await logAutomation("whatsapp_welcome", "success");
              req.log.info({ dealId: deal.id }, "whatsapp invite sent");
            } catch (err) {
              whatsappSkipReason =
                err instanceof WhatsAppNotConnectedError ? "zapi_not_configured" : "send_error";
              await logAutomation("whatsapp_welcome", "error", err instanceof Error ? err.message : String(err));
              req.log.warn({ dealId: deal.id, err }, "whatsapp invite failed");
            }
          }

          // Atualizar onboarding status
          const onboardingError = inviteSkipReason || whatsappSkipReason || undefined;
          onboardingSent = inviteSent || whatsappSent;
          onboardingSkipReason = onboardingError;
          await db
            .update(dealsTable)
            .set({
              onboardingStatus: onboardingSent ? "sent" : "failed",
              onboardingError: onboardingError ?? null,
              updatedAt: new Date(),
            })
            .where(eq(dealsTable.id, deal.id));
        }

        // ── Copiar valor → mensalidadeValor do tenant ─────────────────────────
        if (deal.valor) {
          await db
            .update(tenantsTable)
            .set({ mensalidadeValor: deal.valor, updatedAt: new Date() })
            .where(eq(tenantsTable.id, tenantId));
          req.log.info({ dealId: deal.id, valor: deal.valor }, "deal-ganho: mensalidadeValor updated");
        }

        // ── Criar billing_event initial (idempotente: verifica se já existe) ──────
        if (deal.valor && !isContractRetry) {
          const [existingBilling] = await db
            .select({ id: billingEventsTable.id })
            .from(billingEventsTable)
            .where(
              and(
                eq(billingEventsTable.tenantId, tenantId),
                eq(billingEventsTable.tipo, "initial"),
                eq(billingEventsTable.valor, deal.valor),
              ),
            )
            .limit(1);

          if (!existingBilling) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            await db.insert(billingEventsTable).values({
              tenantId,
              tipo: "initial",
              valor: deal.valor,
              status: "pending",
              dueDate,
            });
          } else {
            req.log.info({ dealId: deal.id }, "deal-ganho: billing_event already exists, skipping");
          }
        }

        // ── ZapSign: contrato 2 ou 3 partes com PDF ───────────────────────────
        const tipoFechamento = deal.tipoFechamento ?? tenant?.tipoFechamentoDefault ?? "pedido";
        req.log.info({ dealId: deal.id, tipoFechamento, dealTipoFechamento: deal.tipoFechamento, tenantDefault: tenant?.tipoFechamentoDefault }, "deal-ganho: resolved tipoFechamento");
        if (tipoFechamento === "contrato" || tipoFechamento === "pedido_e_contrato") {
          if (!isZapSignConfigured()) {
            contractSent = false;
            contractSkipReason = "zapsign_not_configured";
            await db
              .update(dealsTable)
              .set({ contractStatus: "skipped", contractError: "zapsign_not_configured", updatedAt: new Date() })
              .where(eq(dealsTable.id, deal.id));
            req.log.warn({ dealId: deal.id }, "deal-ganho: ZapSign não configurado (ZAPSIGN_API_KEY ausente)");
          } else {
            try {
              // Pré-requisito: lead precisa ter email para assinar contrato
              if (!lead?.email) {
                contractSent = false;
                contractSkipReason = "no_lead_email";
                await db
                  .update(dealsTable)
                  .set({ contractStatus: "failed", contractError: "no_lead_email", updatedAt: new Date() })
                  .where(eq(dealsTable.id, deal.id));
                req.log.warn({ dealId: deal.id }, "deal-ganho: contract skipped — lead has no email");
              } else {
                const signers: { name: string; email: string }[] = [];

                // 1. Cliente (obrigatório)
                signers.push({ name: lead.nome ?? "Cliente", email: lead.email });

                // 2. Parceiro (se tenant tem partner)
                let partnerName: string | undefined;
                let partnerEmail: string | undefined;
                if (tenant?.partnerId) {
                  const [partner] = await db
                    .select({ name: partnersTable.name, email: partnersTable.email })
                    .from(partnersTable)
                    .where(eq(partnersTable.id, tenant.partnerId));
                  if (partner) {
                    signers.push({ name: partner.name ?? "Parceiro", email: partner.email ?? "" });
                    partnerName = partner.name ?? undefined;
                    partnerEmail = partner.email ?? undefined;
                  }
                }

                // 3. Vendor.ai (sempre — CONTRATADA)
                const vendoraiEmail = process.env["VENDORAI_SIGNING_EMAIL"];
                if (vendoraiEmail) {
                  signers.push({ name: "Vendor.ai", email: vendoraiEmail });
                }
                const partes = tenant?.partnerId ? "3 partes" : "2 partes";

                // Gerar PDF do contrato
                let contentBase64: string | undefined;
                try {
                  const pdfBuffer = await generateContractPDF({
                    dealTitulo: deal.titulo,
                    dealValor: deal.valor ? `R$ ${Number(deal.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Valor não especificado",
                    clienteNome: lead?.nome ?? "Cliente",
                    clienteEmail: lead?.email ?? "",
                    clienteTelefone: lead?.telefone ?? "",
                    clienteDocumento: lead?.documento ?? undefined,
                    clienteEmpresa: lead?.empresa ?? undefined,
                    tenantNome: tenant?.name ?? "Vendor.ai",
                    dataHoje: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
                    produtosServicos: deal.titulo,
                    partnerName,
                    partnerEmail,
                  }, !!tenant?.partnerId);
                  contentBase64 = pdfBuffer.toString("base64");
                } catch (pdfErr) {
                  req.log.warn({ dealId: deal.id, err: pdfErr }, "deal-ganho: PDF generation failed, sending empty document");
                }

                const doc = await createDocument({
                  name: `Contrato ${deal.titulo} — ${partes}`,
                  lang: "pt-BR",
                  signers,
                  content_base64: contentBase64,
                });
                contractSent = true;

                await db
                  .update(dealsTable)
                  .set({
                    zapsignDocId: doc.token,
                    contractStatus: "sent",
                    contractError: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(dealsTable.id, deal.id));

                // Salvar contrato na tabela contracts
                const signUrl = doc.signers?.[0]?.sign_url ?? null;
                await db.insert(contractsTable).values({
                  tenantId,
                  dealId: deal.id,
                  contractType: partes,
                  status: "sent_for_signature",
                  zapsignDocId: doc.token,
                  zapsignSignUrl: signUrl,
                  sentAt: new Date(),
                }).catch((e) => req.log.warn({ err: e }, "deal-ganho: contracts insert failed"));

                await logAutomation("zapsign_contract", "success");
                req.log.info(
                  { dealId: deal.id, docToken: doc.token, signers: signers.length, partes },
                  "deal-ganho: contrato ZapSign criado",
                );
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              contractSent = false;
              contractSkipReason = "send_error";
              await db
                .update(dealsTable)
                .set({ contractStatus: "failed", contractError: errMsg.slice(0, 500), updatedAt: new Date() })
                .where(eq(dealsTable.id, deal.id));
              await logAutomation("zapsign_contract", "error", errMsg);
              req.log.warn({ err, dealId: deal.id }, "deal-ganho: ZapSign falhou (non-fatal)");
            }
          }
        } else {
          contractSent = false;
          contractSkipReason = "tipo_pedido";
          await db
            .update(dealsTable)
            .set({ contractStatus: "na", updatedAt: new Date() })
            .where(eq(dealsTable.id, deal.id));
          req.log.info({ dealId: deal.id }, "deal-ganho: tipo=pedido — confirmação simples");
        }

        // ── Cobrança Asaas (idempotente: verifica se já existe) ────────────
        if (deal.skipAsaasBilling === "true") {
          chargeSkipReason = "manual_payment";
          req.log.info({ dealId: deal.id }, "Asaas charge skipped: skipAsaasBilling=true (manual payment)");
          // Marcar como pago manualmente
          await db
            .update(dealsTable)
            .set({ chargeStatus: "manual_paid", updatedAt: new Date() })
            .where(eq(dealsTable.id, deal.id));
        } else if (!(await isAsaasConfigured(tenantId))) {
          // Tenant ainda não tem conta Asaas própria configurada — isso é um
          // estado normal e esperado, não um erro. Cai no fallback de cobrança
          // manual: cria um agent_task visível ao financeiro com os dados
          // necessários para cobrar o cliente fora do fluxo automático.
          chargeSkipReason = "asaas_not_configured";
          req.log.info(
            { dealId: deal.id, tenantId },
            "Asaas não configurado para este tenant — cobrança manual (fallback esperado)"
          );

          if (deal.cobrancaTipo !== "manual") {
            await db
              .update(dealsTable)
              .set({ cobrancaTipo: "manual", chargeStatus: "aguardando_cobranca_manual", updatedAt: new Date() })
              .where(eq(dealsTable.id, deal.id));

            if (deal.leadId) {
              const [propostaManual] = await db
                .select({ itens: propostasTable.itens })
                .from(propostasTable)
                .where(eq(propostasTable.dealId, deal.id))
                .orderBy(sql`${propostasTable.createdAt} desc`)
                .limit(1);

              await db
                .insert(agentTasksTable)
                .values({
                  tenantId,
                  leadId: deal.leadId,
                  agentName: "closer",
                  actionType: "cobranca_manual",
                  payload: {
                    dealId: deal.id,
                    leadNome: lead?.nome ?? null,
                    telefone: lead?.telefone ?? null,
                    valor: deal.valor ?? null,
                    itens: propostaManual?.itens ?? [],
                  },
                })
                .catch((e) =>
                  req.log.warn({ err: e, dealId: deal.id }, "deal-ganho: falha ao criar agent_task cobranca_manual")
                );
            }

            await db
              .insert(notificationsTable)
              .values({
                tenantId,
                title: "Cobrança manual necessária",
                message: `O negócio "${deal.titulo}" foi fechado, mas este tenant ainda não tem uma conta Asaas configurada. Realize a cobrança manualmente com o cliente.`,
                type: "info",
                category: "billing",
              })
              .catch((e) =>
                req.log.warn({ err: e, dealId: deal.id }, "deal-ganho: falha ao criar notificação cobranca_manual")
              );

            await logAutomation("asaas_charge", "skipped", "asaas_not_configured_manual_fallback");
          }
        } else if (!deal.valor) {
          chargeSkipReason = "no_valor";
          req.log.info({ dealId: deal.id }, "Asaas charge skipped: deal has no valor");
        } else if (deal.asaasChargeId) {
          chargeSkipReason = undefined;
          req.log.info({ dealId: deal.id, chargeId: deal.asaasChargeId }, "Asaas charge already exists, skipping");
        } else {
          try {
            // Cada tenant tem sua própria conta Asaas — usa a chave do tenant
            // (já validada por isAsaasConfigured(tenantId) acima), nunca a global.
            const tenantAsaasKey = await getTenantAsaasApiKey(tenantId);

            // Descobrir walletId do parceiro (se tenant tiver parceiro com subconta)
            let partnerWalletId: string | null = null;
            if (tenant?.partnerId) {
              const [partner] = await db
                .select({ asaasWalletId: partnersTable.asaasWalletId })
                .from(partnersTable)
                .where(eq(partnersTable.id, tenant.partnerId));
              partnerWalletId = partner?.asaasWalletId ?? null;
            }

            // Criar ou recuperar cliente Asaas
            const customer = await createOrGetCustomer({
              name: lead?.nome ?? tenant?.name ?? "Cliente",
              email: lead?.email ?? undefined,
              phone: lead?.telefone ?? undefined,
            }, tenantAsaasKey);

            // Vencimento: 3 dias úteis a partir de hoje
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            const dueDateStr = dueDate.toISOString().split("T")[0]!;

            // ── Resolve billingType + parcelamento a partir da proposta vinculada ─
            let billingType: AsaasBillingType = "PIX";
            let installmentCount: number | undefined;
            let installmentValue: number | undefined;
            const [proposta] = await db
              .select({ id: propostasTable.id, formaPagamento: propostasTable.formaPagamento, numParcelas: propostasTable.numParcelas, itens: propostasTable.itens })
              .from(propostasTable)
              .where(eq(propostasTable.dealId, deal.id))
              .orderBy(sql`${propostasTable.createdAt} desc`)
              .limit(1);
            if (proposta?.formaPagamento) {
              billingType = formaPagamentoToBillingType(proposta.formaPagamento);
            }
            if (proposta?.numParcelas && proposta.numParcelas > 1) {
              installmentCount = proposta.numParcelas;
              installmentValue = Math.round((Number(deal.valor) / proposta.numParcelas) * 100) / 100;
            }

            // Detect SKU-based items (PLAN-* or SETUP-*) to enable auto-delivery
            const propostaItens = (proposta?.itens ?? []) as Array<{ sku?: string }>;
            const hasDeliverySku = propostaItens.some(
              (i) => i.sku && (i.sku.startsWith("PLAN-") || i.sku.startsWith("SETUP-"))
            );
            const skuExternalRef = hasDeliverySku && proposta?.id
              ? `sku_delivery:${proposta.id}`
              : undefined;

            const charge = await createCharge({
              customer: customer.id,
              billingType,
              value: Number(deal.valor),
              dueDate: dueDateStr,
              description: `Proposta: ${deal.titulo}`,
              externalReference: skuExternalRef,
              split: partnerWalletId
                ? [{ walletId: partnerWalletId, percentualValue: 50 }]
                : undefined,
              ...(installmentCount ? { installmentCount, installmentValue } : {}),
            }, tenantAsaasKey);

            chargeId = charge.id;
            chargeLink = charge.invoiceUrl ?? charge.bankSlipUrl ?? null;

            // Persistir dados de cobrança no deal
            await db
              .update(dealsTable)
              .set({
                asaasChargeId: charge.id,
                chargeLink: charge.invoiceUrl,
                chargeStatus: charge.status,
                cobrancaTipo: "automatico",
                updatedAt: new Date(),
              })
              .where(eq(dealsTable.id, deal.id));

            req.log.info(
              { dealId: deal.id, chargeId: charge.id, split: !!partnerWalletId, partnerWalletId },
              "Asaas charge created",
            );

            // BUG CORRIGIDO: splitPercent registrado aqui dizia "40", mas o
            // split de verdade enviado pra Asaas (linha acima, percentualValue)
            // é 50 — mesmo valor usado em billing.ts pra split de parceiro.
            // Reconciliação de comissão de parceiro lia o número errado.
            await db.insert(billingRecordsTable).values({
              tenantId,
              dealId: deal.id,
              asaasPaymentId: charge.id,
              invoiceUrl: charge.invoiceUrl ?? charge.bankSlipUrl ?? null,
              valor: deal.valor ?? null,
              status: charge.status ?? "pending",
              partnerWalletId: partnerWalletId ?? null,
              splitPercent: partnerWalletId ? "50" : null,
            }).catch((e) => req.log.warn({ err: e }, "deal-ganho: billing_records insert failed"));

            await logAutomation("asaas_charge", "success");
          } catch (err) {
            chargeSkipReason = "asaas_error";
            await logAutomation("asaas_charge", "error", err instanceof Error ? err.message : String(err));
            req.log.warn({ err, dealId: deal.id }, "Asaas charge creation failed");
          }
        }

        // ── Webhook ERP: venda realizada (idempotente via closureTriggeredAt) ──────
        if (tenant?.webhookEstoqueUrl && !isContractRetry) {
          void dispatchVendaWebhook(
            tenant.webhookEstoqueUrl,
            {
              event: "venda_realizada",
              tenantId,
              vendaId: deal.id,
              tipo: "deal",
              produtos: [],
              valorTotal: deal.valor ? Number(deal.valor) : null,
              realizadaEm: new Date().toISOString(),
              integrationType: (tenant.integrationType as "n8n" | "api" | undefined) ?? undefined,
            },
            req.log,
          );
        }

        // ── Criar activity "deal_won" no deal ────────────────────────────────
        if (deal.leadId) {
          try {
            await db.insert(activitiesTable).values({
              tenantId,
              leadId: deal.leadId,
              dealId: deal.id,
              tipo: "tarefa",
              titulo: "Deal ganho",
              descricao: "Contrato enviado, cobrança criada.",
              status: "concluida",
              concluidaEm: new Date(),
            });
            await logAutomation("activity_created", "success");
          } catch (err) {
            await logAutomation("activity_created", "error", err instanceof Error ? err.message : String(err));
            req.log.warn({ err, dealId: deal.id }, "deal-ganho: activity insert failed (non-fatal)");
          }
        }
      } catch (err) {
        const errStr = err instanceof Error ? err.stack || err.message : String(err);
        console.error("=== deal-ganho: CRITICAL ERROR ===", errStr);
        await logAutomation("deal_won_flow", "error", errStr.slice(0, 500));
        req.log.warn({ err }, "deal-ganho: trigger processing failed");
        // Marcar deal_closing_status como travado para permitir retry manual
        await db
          .update(dealClosingStatusTable)
          .set({
            etapaAtual: "travado_erro",
            ultimoErro: errStr.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(eq(dealClosingStatusTable.dealId, deal.id))
          .catch(() => { /* ignore */ });
      }
      })().catch((asyncErr) => {
        bgLog.warn({ err: asyncErr, dealId: deal.id }, "deal-ganho: async flow uncaught error");
      });
      return; // response already sent above — skip perdido and default response
    }
  }

  // ── Trigger perda: capturar motivo, data, activity e fila de reativação ───
  if (parsed.data.etapa === "perdido" && existing.etapa !== "perdido") {
    const primaryReason = parsed.data.lostReason ?? parsed.data.categoriaPerda ?? null;
    const primaryDetail = parsed.data.lostReasonDetail ?? parsed.data.motivoPerda ?? null;

    // 1. Setar campos de perda
    try {
      await db
        .update(dealsTable)
        .set({
          lostAt: new Date(),
          lostReason: primaryReason,
          lostReasonDetail: primaryDetail,
          updatedAt: new Date(),
        })
        .where(eq(dealsTable.id, deal.id));
      req.log.info({ dealId: deal.id }, "deal marked as lost");
    } catch (err) {
      req.log.warn({ err, dealId: deal.id }, "deal-perdido: failed to update lost fields");
    }

    // 2. Criar activity deal_lost (requer leadId)
    if (deal.leadId) {
      try {
        await db.insert(activitiesTable).values({
          tenantId: deal.tenantId,
          leadId: deal.leadId,
          dealId: deal.id,
          tipo: "tarefa",
          titulo: "Deal perdido",
          descricao: `Perdido. Motivo: ${primaryReason ?? "não informado"}`,
          status: "concluida",
        });
      } catch (err) {
        req.log.warn({ err, dealId: deal.id }, "deal-perdido: failed to create activity");
      }
    }

    // 3. Enfileirar para reativação em 30 dias
    try {
      const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(reactivationQueueTable).values({
        dealId: deal.id,
        scheduledFor,
        status: "pending",
        lossReason: primaryReason,
      });
      req.log.info({ dealId: deal.id, scheduledFor }, "deal-perdido: enqueued for reactivation");
    } catch (err) {
      req.log.warn({ err, dealId: deal.id }, "deal-perdido: failed to enqueue reactivation");
    }
  }

  // Re-fetch deal atualizado para retornar estado fresco
  const [finalDeal] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));

  res.json(finalDeal);
});

// ─── Quote extraction ─────────────────────────────────────────────────────────
router.post(
  "/tenants/:tenantId/deals/extract-quote",
  (req, res, next) => {
    uploadQuote.single("file")(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Arquivo muito grande. O limite para importar orçamento é 10 MB." });
        return;
      }
      req.log.warn({ err: error }, "extract-quote: upload failed");
      res.status(400).json({ error: "Não foi possível receber o arquivo do orçamento." });
    });
  },
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    try {
      const [result, quoteFileUrl] = await Promise.all([
        extractQuoteData([
          {
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            originalName: req.file.originalname,
          },
        ], tenantId),
        objectStorageService.savePrivateBuffer(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname
        ).catch((err) => {
          req.log.warn({ err }, "extract-quote: failed to save file to storage, continuing without it");
          return null;
        }),
      ]);
      const importId = randomUUID();
      await db.execute(sql`INSERT INTO public.budget_imports
        (id, tenant_id, source_type, original_name, mime_type, file_url, extraction_json, confidence, review_status, created_by)
        VALUES (
          ${importId},
          ${tenantId},
          'pdf',
          ${req.file.originalname},
          ${req.file.mimetype},
          ${quoteFileUrl},
          ${JSON.stringify(result)}::jsonb,
          ${typeof result?.confianca === "number" ? result.confianca : null},
          'pending_review',
          ${req.user?.sub ?? null}
        )`);
      res.json({
        ...result,
        quoteFileUrl,
        originalName: req.file.originalname,
        importId,
        reviewStatus: "pending_review",
        reviewRequired: true,
        extractedItemCount: Array.isArray(result?.itens) ? result.itens.length : 0,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to extract quote data");
      res.status(500).json({ error: "Erro ao processar o arquivo" });
    }
  }
);


const budgetImportReviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    reviewedData: z.object({
      itens: z.array(z.object({
        descricao: z.string().trim().min(1).max(1000),
        quantidade: z.number().finite().positive(),
        valorUnitario: z.number().finite().nonnegative(),
        valorTotal: z.number().finite().nonnegative(),
      }).passthrough()).min(1).max(500),
    }).passthrough(),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    note: z.string().trim().min(3).max(2000),
  }),
]);

// A extração original permanece imutável: nenhum item vira orçamento sem revisão.
router.get("/tenants/:tenantId/deals/budget-imports/:importId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const result = await db.execute(sql`
      SELECT id, tenant_id, source_type, original_name, mime_type, file_url,
             extraction_json, confidence, review_status, review_json, review_note,
             created_by, created_at, reviewed_by, reviewed_at
      FROM public.budget_imports
      WHERE id = ${String(req.params.importId)} AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const record = result.rows[0];
    if (!record) { res.status(404).json({ error: "Importação não encontrada" }); return; }
    res.json(record);
  } catch (err) {
    req.log.error({ err }, "budget-import: failed to fetch review");
    res.status(500).json({ error: "Não foi possível consultar a importação" });
  }
});

router.post("/tenants/:tenantId/deals/budget-imports/:importId/review", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const parsed = budgetImportReviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message }); return; }
  const payload = parsed.data;
  if (payload.action === "approve") {
    const invalidTotal = payload.reviewedData.itens.some(item =>
      Math.abs(item.valorTotal - item.quantidade * item.valorUnitario) > 0.011
    );
    if (invalidTotal) {
      res.status(422).json({ error: "Totais inconsistentes: confira quantidade e valor unitário." });
      return;
    }
  }
  try {
    const updated = await db.execute(sql`
      UPDATE public.budget_imports
      SET review_status = ${payload.action === "approve" ? "approved" : "rejected"},
          review_json = ${payload.action === "approve" ? JSON.stringify(payload.reviewedData) : null}::jsonb,
          review_note = ${payload.note ?? null},
          reviewed_at = NOW(),
          reviewed_by = ${req.user?.sub ?? null}
      WHERE id = ${String(req.params.importId)} AND tenant_id = ${tenantId}
        AND review_status = 'pending_review'
      RETURNING id, review_status, reviewed_at, reviewed_by
    `);
    if (!updated.rows.length) {
      const found = await db.execute(sql`
        SELECT review_status FROM public.budget_imports
        WHERE id = ${String(req.params.importId)} AND tenant_id = ${tenantId}
      `);
      res.status(found.rows.length ? 409 : 404).json({
        error: found.rows.length ? "Importação já revisada; uma segunda aprovação exige nova importação." : "Importação não encontrada",
      });
      return;
    }
    res.json({ ...updated.rows[0], requiresManualSave: true });
  } catch (err) {
    req.log.error({ err }, "budget-import: failed to review");
    res.status(500).json({ error: "Não foi possível revisar a importação" });
  }
});

router.delete("/deals/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, assignedTo: dealsTable.assignedTo })
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

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  await db.delete(dealsTable).where(eq(dealsTable.id, existing.id));

  res.status(204).send();
});

// ── GET /admin/deals/travados ───────────────────────────────────────────────
router.get("/admin/deals/travados", requireRole("super_admin"), async (req, res) => {
  const travados = await db
    .select({
      id: dealClosingStatusTable.id,
      dealId: dealClosingStatusTable.dealId,
      tenantId: dealClosingStatusTable.tenantId,
      etapaAtual: dealClosingStatusTable.etapaAtual,
      ultimoErro: dealClosingStatusTable.ultimoErro,
      tentativas: dealClosingStatusTable.tentativas,
      updatedAt: dealClosingStatusTable.updatedAt,
      titulo: dealsTable.titulo,
      valor: dealsTable.valor,
      nomeEmpresa: leadsTable.empresa,
    })
    .from(dealClosingStatusTable)
    .innerJoin(dealsTable, eq(dealClosingStatusTable.dealId, dealsTable.id))
    .leftJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
    .where(eq(dealClosingStatusTable.etapaAtual, "travado_erro"))
    .orderBy(dealClosingStatusTable.updatedAt);

  res.json(travados);
});

// ── POST /admin/deals/:id/retry ──────────────────────────────────────────────
router.post("/admin/deals/:id/retry", requireRole("super_admin"), async (req, res) => {
  const dealId = String(req.params.id);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (deal.etapa !== "ganho") {
    res.status(400).json({ error: "Deal não está na etapa ganho" });
    return;
  }

  // Resetar deal_closing_status para permitir reprocessamento
  await db
    .update(dealClosingStatusTable)
    .set({
      etapaAtual: "plano_atribuido",
      ultimoErro: null,
      updatedAt: new Date(),
    })
    .where(eq(dealClosingStatusTable.dealId, dealId));

  res.json({ success: true, message: "Deal marcado para reprocessamento. Refaça o PATCH /deals/:id com etapa=ganho." });
});

router.get("/tenants/:tenantId/payment-methods", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const methods = [
    { code: "pix", label: "PIX", enabled: true },
    { code: "boleto", label: "Boleto Bancário", enabled: true },
    { code: "cartao_credito", label: "Cartão de Crédito", enabled: true },
    { code: "cartao_debito", label: "Cartão de Débito", enabled: true },
    { code: "transferencia", label: "Transferência Bancária", enabled: true },
    { code: "dinheiro", label: "Dinheiro", enabled: true },
    { code: "a_combinar", label: "A Combinar", enabled: true },
  ];

  res.json({ gateway: "asaas", methods });
});

export default router;