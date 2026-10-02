import { Router, type IRouter } from "express";
import { and, desc, eq, isNotNull, isNull, notExists, sql } from "drizzle-orm";
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
import { COMMERCIAL_STAGE_ORDER, PARTNER_STAGE_ORDER, SAAS_STAGE_ORDER, TERMINAL_DEAL_STAGES, isBackwardMove } from "../lib/pipeline-progress.js";

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

async function ensureCommercialStageTask(deal: typeof dealsTable.$inferSelect) {
  if (!deal.leadId || !deal.assignedTo) return;

  const [stageConfig] = await db
    .select({
      atividadePadraoTitulo: pipelineStagesTable.atividadePadraoTitulo,
      atividadePadraoDescricao: pipelineStagesTable.atividadePadraoDescricao,
      atividadePadraoPrazoMinutos: pipelineStagesTable.atividadePadraoPrazoMinutos,
    })
    .from(pipelineStagesTable)
    .where(and(
      eq(pipelineStagesTable.tenantId, deal.tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, deal.etapa),
    ))
    .limit(1);

  const configuredTitle = stageConfig?.atividadePadraoTitulo?.trim();
  const fallbackTitle = COMMERCIAL_STAGE_TASKS[deal.etapa];
  const taskTitle = configuredTitle || fallbackTitle;
  if (!taskTitle) return;

  const title = `${taskTitle} — ${deal.titulo}`;
  const [existingTask] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
    eq(activitiesTable.tenantId, deal.tenantId),
    eq(activitiesTable.leadId, deal.leadId),
    eq(activitiesTable.dealId, deal.id),
    eq(activitiesTable.titulo, title),
    eq(activitiesTable.status, "planejado"),
  )).limit(1);
  if (existingTask) return;

  const prazoMinutos = stageConfig?.atividadePadraoPrazoMinutos ?? 24 * 60;
  await db.insert(activitiesTable).values({
    tenantId: deal.tenantId,
    leadId: deal.leadId,
    dealId: deal.id,
    tipo: "tarefa",
    titulo: title,
    descricao: stageConfig?.atividadePadraoDescricao?.trim()
      || `Tarefa criada automaticamente ao entrar na etapa ${DEAL_STAGE_LABELS[deal.etapa] ?? deal.etapa}.`,
    status: "planejado",
    responsavelId: deal.assignedTo,
    dataVencimento: new Date(Date.now() + prazoMinutos * 60 * 1000),
  });
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

const transferDealPipelineSchema = z.object({
  targetPipeline: z.literal("suporte"),
  responsavelId: z.string().min(1),
  observacao: z.string().trim().max(2000).optional(),
});

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
    res.status(422).json({ error: "O negócio precisa estar vinculado a um lead para ser transferido." });
    return;
  }

  const [responsavel] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
    eq(usersTable.id, parsed.data.responsavelId),
    eq(usersTable.tenantId, deal.tenantId),
  )).limit(1);
  if (!responsavel) {
    res.status(422).json({ error: "Responsável do suporte inválido para este tenant." });
    return;
  }

  const [existingSupport] = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, deal.tenantId),
    eq(workCardsTable.pipeline, "suporte"),
    eq(workCardsTable.leadId, deal.leadId),
    eq(workCardsTable.dealId, deal.id),
  )).limit(1);

  const supportCard = existingSupport ?? (await db.insert(workCardsTable).values({
    tenantId: deal.tenantId,
    pipeline: "suporte",
    tipo: "assistencia",
    etapa: "chamado_cliente",
    titulo: `Suporte • ${deal.titulo}`,
    descricao: parsed.data.observacao || "Transferido da pipeline Comercial para Suporte.",
    prioridade: "normal",
    leadId: deal.leadId,
    dealId: deal.id,
    responsavelId: parsed.data.responsavelId,
    metadata: {
      origemPipeline: "comercial",
      origemDealEtapa: deal.etapa,
      transferidoEm: new Date().toISOString(),
      transferidoPor: req.user?.sub ?? null,
    },
  }).returning())[0];

  await db.update(dealsTable).set({
    relationshipStage: "transferido_suporte",
    updatedAt: new Date(),
  }).where(eq(dealsTable.id, deal.id));

  await recordDealJourney({
    tenantId: deal.tenantId,
    leadId: deal.leadId,
    dealId: deal.id,
    title: "Transferido de Comercial para Suporte",
    description: parsed.data.observacao
      ? `Novo chamado: ${supportCard.codigo}. Observação: ${parsed.data.observacao}`
      : `Novo chamado: ${supportCard.codigo}. O histórico comercial foi preservado.`,
    responsavelId: parsed.data.responsavelId,
  });

  res.json({ ok: true, dealId: deal.id, supportCard });
});

router.get("/tenants/:tenantId/deals", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const { etapa, funilId, leadId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(dealsTable.tenantId, tenantId)];
  if (etapa) conditions.push(eq(dealsTable.etapa, etapa as typeof dealsTable.etapa._.data));
  if (funilId) conditions.push(eq(dealsTable.funilId, funilId));
  if (leadId) conditions.push(eq(dealsTable.leadId, leadId));

  conditions.push(...buildUserFunctionFilter(req, dealsTable));

  // Negócios antigos continuam armazenados para auditoria, porém somem da
  // pipeline assim que o contato é classificado como "Não lead". O NOT EXISTS
  // preserva negócios sem lead vinculado e evita alterar o formato da resposta.
  conditions.push(notExists(
    db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.id, dealsTable.leadId),
        isNotNull(leadsTable.naoLeadTipo),
      )),
  ));

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
  if (existing.etapa === "parceiro" && parsed.data.relationshipStage && isBackwardMove(PARTNER_STAGE_ORDER, existing.relationshipStage || "parceiro_identificado", parsed.data.relationshipStage)) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O processo de parceiro só pode avançar." });
    return;
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

  const nextAssignedTo = handoff?.responsavelId ?? ("assignedTo" in parsed.data ? parsed.data.assignedTo : (existing.assignedTo ?? req.user?.sub ?? null));
  const assignedToChanged = nextAssignedTo !== existing.assignedTo;
  const etapaChanged = Boolean(parsed.data.etapa && parsed.data.etapa !== existing.etapa);

  const deal = await db.transaction(async (tx) => {
    const [updatedDeal] = await tx.update(dealsTable).set({
      ...parsed.data,
      assignedTo: nextAssignedTo,
      ...((etapaChanged || assignedToChanged) ? { etapaAlteradaEm: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(dealsTable.id, existing.id)).returning();
    if (!updatedDeal) throw new Error("Deal update failed");

    if (handoff && updatedDeal.leadId) {
      await tx.insert(activitiesTable).values({
        tenantId: existing.tenantId, leadId: updatedDeal.leadId, dealId: updatedDeal.id,
        tipo: "tarefa", titulo: handoff.atividadeTitulo,
        descricao: [handoff.atividadeDescricao, handoff.observacaoPassagem ? "Passagem: " + handoff.observacaoPassagem : null].filter(Boolean).join("\n") || null,
        status: "pendente", dataVencimento: handoff.dataVencimento ?? null, responsavelId: handoff.responsavelId,
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

  if (parsed.data.etapa && parsed.data.etapa !== existing.etapa && !handoff) {
    await recordDealJourney({
      tenantId: existing.tenantId, leadId: deal.leadId, dealId: deal.id,
      title: "Negócio avançou para " + (DEAL_STAGE_LABELS[parsed.data.etapa] ?? parsed.data.etapa),
      description: "Etapa anterior: " + (DEAL_STAGE_LABELS[existing.etapa] ?? existing.etapa) + ". Nova etapa: " + (DEAL_STAGE_LABELS[parsed.data.etapa] ?? parsed.data.etapa) + ".",
      responsavelId: req.user?.sub,
    });
      await ensureCommercialStageTask(deal);
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