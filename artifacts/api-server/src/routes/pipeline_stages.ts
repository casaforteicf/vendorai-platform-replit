import { Router, type IRouter } from "express";
import { and, eq, asc, inArray } from "drizzle-orm";
import {
  db,
  pipelineStagesTable,
  SYSTEM_PIPELINE_STAGES,
  updatePipelineStageSchema,
  tenantUserFunctionsTable,
  tenantAgentConfigsTable,
  agentDefaultsTable,
  tenantsTable,
  dealsTable,
  workCardsTable,
  scoutOportunidadesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { logger } from "../lib/logger.js";
import { planejarAcompanhamento } from "../services/orquestradorAcompanhamento.js";

const router: IRouter = Router();

export const PIPELINE_KEYS = [
  "comercial",
  "execucao",
  "suporte",
  "aquecimento",
  "parceiros",
  "scout",
] as const;
export type PipelineKey = (typeof PIPELINE_KEYS)[number];

type SystemStage = {
  key: string;
  label: string;
  color: string;
  bg: string;
  ordem: number;
  perguntas?: { id: string; texto: string }[];
  atividadePadraoTitulo?: string;
  atividadePadraoDescricao?: string;
  atividadePadraoPrazoMinutos?: number;
};

const simpleStage = (key: string, label: string, ordem: number): SystemStage => ({
  key,
  label,
  ordem,
  color: "text-slate-600",
  bg: "bg-slate-100",
});

// Mantém exatamente as keys que cada pipeline real já usa hoje. A configuração
// de responsáveis governa o fluxo existente; não cria uma segunda pipeline.
export const SYSTEM_STAGES_BY_PIPELINE: Record<PipelineKey, SystemStage[]> = {
  comercial: SYSTEM_PIPELINE_STAGES,
  execucao: [
    simpleStage("pedido_confirmado", "Pedido confirmado", 0),
    simpleStage("liberacao_financeira", "Liberação financeira", 1),
    simpleStage("liberacao_medidas", "Liberação de medidas", 2),
    simpleStage("projeto", "Projeto", 3),
    simpleStage("producao_a_iniciar", "Produção — a iniciar", 4),
    simpleStage("producao_em_andamento", "Produção — em andamento", 5),
    simpleStage("producao_finalizada", "Produção — finalizada", 6),
    simpleStage("aguardando_liberacao", "Aguardando liberação", 7),
    simpleStage("liberado", "Liberado", 8),
    simpleStage("agenda_entrega", "Agenda de entrega", 9),
    simpleStage("em_transporte", "Em transporte", 10),
    simpleStage("instalacao_a_iniciar", "Instalação — a iniciar", 11),
    simpleStage("instalacao_em_andamento", "Instalação — em andamento", 12),
    simpleStage("instalacao_finalizada", "Instalação — finalizada", 13),
    simpleStage("entrega_obra", "Entrega da obra", 14),
    simpleStage("pos_venda", "Pós-venda", 15),
    simpleStage("concluido", "Concluído", 16),
    simpleStage("cancelado", "Cancelado", 17),
  ],
  suporte: [
    simpleStage("chamado_cliente", "Chamado cliente", 0),
    simpleStage("agendamento_assistencia", "Agendamento assistência", 1),
    simpleStage("execucao_assistencia", "Execução da assistência", 2),
    simpleStage("relatorio_assistencia", "Relatório da assistência", 3),
    simpleStage("feedback_cliente", "Feedback cliente", 4),
    simpleStage("fechamento_assistencia", "Fechamento assistência", 5),
    simpleStage("cancelado", "Cancelado", 6),
  ],
  aquecimento: [
    simpleStage("aquecimento_lead", "Leads em aquecimento", 0),
    simpleStage("aquecimento_cliente", "Clientes em aquecimento", 1),
    simpleStage("aquecimento_nao_lead", "Não Leads", 2),
  ],
  parceiros: [
    simpleStage("parceiro_identificado", "Parceiro identificado", 0),
    simpleStage("contato", "Contato", 1),
    simpleStage("qualificacao", "Qualificação", 2),
    simpleStage("proposta_parceria", "Proposta de parceria", 3),
    simpleStage("negociacao", "Negociação", 4),
    simpleStage("parceiro_ativo", "Parceiro ativo", 5),
    simpleStage("inativo", "Inativo", 6),
  ],
  scout: [
    simpleStage("identificada", "Identificadas", 0),
    simpleStage("em_analise", "Em análise", 1),
    simpleStage("encaminhada", "Encaminhadas", 2),
    simpleStage("ia_aprovada", "IA aprovada", 3),
    simpleStage("em_contato", "Em contato", 4),
    simpleStage("convertida", "Convertidas", 5),
    simpleStage("descartada", "Descartadas", 6),
  ],
};

const activityQuestionSchema = z.object({
  id: z.string().min(1).max(120),
  texto: z.string().trim().min(1).max(1000),
  tipo: z.enum(["texto", "texto_longo", "sim_nao", "numero", "data", "opcoes"]).default("texto"),
  opcoes: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  quemResponde: z.enum(["cliente", "usuario", "ambos", "automatico"]).default("usuario"),
  obrigatoria: z.boolean().default(false),
  visivelCliente: z.boolean().default(false),
  entraRelatorio: z.boolean().default(true),
  editavelDepois: z.boolean().default(true),
  evidenciaExigida: z.enum(["nenhuma", "foto", "video", "audio", "documento", "midia"]).default("nenhuma"),
});

const activityTemplateSchema = z.object({
  id: z.string().min(1).max(120),
  titulo: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(2000).nullable().optional(),
  objetivo: z.string().trim().max(1000).nullable().optional(),
  resultadoEsperado: z.string().trim().max(1000).nullable().optional(),
  perguntas: z.array(activityQuestionSchema).max(50).default([]),
  tipo: z.enum(["ligacao", "whatsapp", "email", "visita", "tarefa", "reuniao"]).default("tarefa"),
  categoria: z.enum(["obrigatoria", "sugerida", "automatica"]),
  prazoMinutos: z.number().int().positive().max(525600).nullable().optional(),
  responsavel: z.enum(["deal_owner", "stage_agent", "unassigned"]).default("deal_owner"),
  prioridade: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  bloqueiaAvanco: z.boolean().default(false),
  condicao: z.enum(["sempre", "sem_resposta_cliente", "sem_atividade_aberta"]).default("sempre"),
});


const pipelineStageAIActionSchema = z.enum([
  "create_activity",
  "send_message",
  "advance_stage",
  "change_owner",
  "generate_proposal",
  "schedule_meeting",
  "create_checkout",
  "handoff_agent",
  "move_to_warming",
]);

const pipelineStageAICriterionSchema = z.object({
  field: z.string().trim().min(1).max(120),
  operator: z.enum(["exists", "eq", "neq", "gt", "gte", "lt", "lte", "contains"]).default("exists"),
  value: z.unknown().optional(),
  required: z.boolean().default(true),
});

const pipelineStageAIConfigSchema = z.object({
  mode: z.enum(["desativada", "assistida", "autonoma"]).default("desativada"),
  allowedActions: z.array(pipelineStageAIActionSchema).max(20).default([]),
  approvalRequiredActions: z.array(pipelineStageAIActionSchema).max(20).default([]),
  entryCriteria: z.array(pipelineStageAICriterionSchema).max(30).default([]),
  exitCriteria: z.array(pipelineStageAICriterionSchema).max(30).default([]),
  nextBestActionEnabled: z.boolean().default(true),
  instructions: z.string().trim().max(4000).nullable().optional(),
}).superRefine((value, ctx) => {
  for (const action of value.approvalRequiredActions) {
    if (!value.allowedActions.includes(action)) {
      ctx.addIssue({ code: "custom", message: `A ação ${action} exige aprovação, mas não está permitida na etapa.` });
    }
  }
});

const BUILTIN_FUNCTIONS = new Set([
  "vendedor",
  "representante_comercial",
  "financeiro",
  "suporte",
  "entrega",
  "administrador",
  "outro",
]);

function hasAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function isAdmin(req: any): boolean {
  return req.user?.platformRole === "super_admin"
    || req.user?.platformRole === "tenant_admin"
    || req.user?.userFunction === "administrador";
}

function parsePipeline(value: unknown): PipelineKey {
  return typeof value === "string" && PIPELINE_KEYS.includes(value as PipelineKey)
    ? (value as PipelineKey)
    : "comercial";
}

async function validateResponsibleFunctions(
  tenantId: string,
  values: string[] | undefined,
): Promise<{ values: string[] } | { error: string }> {
  if (!values) return { values: [] };

  const unique = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (unique.length > 50) {
    return { error: "Uma etapa pode ter no máximo 50 funções responsáveis." };
  }

  const customIds: string[] = [];
  for (const value of unique) {
    if (value.startsWith("builtin:")) {
      const builtin = value.slice("builtin:".length);
      if (!BUILTIN_FUNCTIONS.has(builtin)) {
        return { error: `Função padrão inválida: ${builtin}` };
      }
      continue;
    }

    if (value.startsWith("custom:")) {
      const id = value.slice("custom:".length);
      if (!id) return { error: "Referência de função personalizada inválida." };
      customIds.push(id);
      continue;
    }

    return { error: "Função responsável inválida. Use uma função cadastrada no tenant." };
  }

  if (customIds.length > 0) {
    const found = await db
      .select({ id: tenantUserFunctionsTable.id })
      .from(tenantUserFunctionsTable)
      .where(
        and(
          eq(tenantUserFunctionsTable.tenantId, tenantId),
          inArray(tenantUserFunctionsTable.id, customIds),
        ),
      );
    const foundIds = new Set(found.map((row) => row.id));
    const invalidId = customIds.find((id) => !foundIds.has(id));
    if (invalidId) {
      return { error: "Uma das funções selecionadas não pertence a esta empresa." };
    }
  }

  return { values: unique };
}

async function validateResponsibleAgent(
  tenantId: string,
  agentKey: string | null | undefined,
): Promise<{ value: string | null } | { error: string }> {
  if (agentKey === undefined || agentKey === null || String(agentKey).trim() === "") {
    return { value: null };
  }

  const key = String(agentKey).trim();
  const [agent] = await db
    .select({
      agentKey: agentDefaultsTable.agentKey,
      tenantActive: tenantAgentConfigsTable.ativo,
    })
    .from(agentDefaultsTable)
    .leftJoin(
      tenantAgentConfigsTable,
      and(
        eq(tenantAgentConfigsTable.agentKey, agentDefaultsTable.agentKey),
        eq(tenantAgentConfigsTable.tenantId, tenantId),
      ),
    )
    .where(eq(agentDefaultsTable.agentKey, key));

  if (!agent) return { error: "Agente IA não encontrado." };
  if (agent.tenantActive !== true) {
    return { error: "O Agente IA precisa estar ativo nesta empresa antes de assumir uma etapa." };
  }

  return { value: key };
}

function slugifyStageKey(label: string): string {
  return label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "etapa";
}

async function listPipelineStages(tenantId: string, pipeline: PipelineKey) {
  return db
    .select()
    .from(pipelineStagesTable)
    .where(
      and(
        eq(pipelineStagesTable.tenantId, tenantId),
        eq(pipelineStagesTable.pipeline, pipeline),
      ),
    )
    .orderBy(asc(pipelineStagesTable.ordem));
}

async function systemStagesForTenant(tenantId: string, pipeline: PipelineKey): Promise<SystemStage[]> {
  const defaults = SYSTEM_STAGES_BY_PIPELINE[pipeline];
  if (pipeline !== "comercial") return defaults;

  const [tenant] = await db
    .select({ confirmarEstoqueAntesFinanceiro: tenantsTable.confirmarEstoqueAntesFinanceiro })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  // Conferência de estoque é uma etapa opcional. Quando o tenant não usa
  // essa trava, ela não deve aparecer no funil nem na gestão de etapas.
  if (!tenant?.confirmarEstoqueAntesFinanceiro) {
    return defaults.filter((stage) => stage.key !== "conferencia_estoque");
  }

  return defaults;
}

async function ensureSystemStages(tenantId: string, pipeline: PipelineKey) {
  let stages = await listPipelineStages(tenantId, pipeline);
  const desiredSystemStages = await systemStagesForTenant(tenantId, pipeline);
  const desiredKeys = new Set(desiredSystemStages.map((stage) => stage.key));

  // Linhas antigas continuam preservadas no banco para não perder histórico,
  // mas etapas opcionais desativadas não são expostas ao tenant.
  const visibleStages = () =>
    stages.filter((stage) => !stage.isSystem || desiredKeys.has(stage.key));

  const existingKeys = new Set(stages.map((stage) => stage.key));
  const missing = desiredSystemStages.filter((stage) => !existingKeys.has(stage.key));
  if (missing.length === 0) return visibleStages();

  try {
    await db
      .insert(pipelineStagesTable)
      .values(
        missing.map((stage) => ({
          ...stage,
          tenantId,
          pipeline,
          isSystem: true,
        })),
      );
  } catch (err) {
    // Duas abas podem semear ao mesmo tempo. A unicidade
    // (tenant_id, pipeline, key) protege contra duplicidade.
    logger.warn({ err, tenantId, pipeline }, "pipeline-stages: falha ao semear; buscando de novo");
  }

  stages = await listPipelineStages(tenantId, pipeline);
  return visibleStages();
}

router.post("/tenants/:tenantId/leads/:leadId/acompanhamento/planejar", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by hasAccess before any tenant-scoped operation
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const bodySchema = z.object({
    dealId: z.string().min(1).nullable().optional(),
    motivoDisparo: z.string().max(2000).optional(),
  });
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: "Parâmetros inválidos." });

  try {
    const plano = await planejarAcompanhamento({
      tenantId,
      leadId,
      dealId: parsed.data.dealId ?? null,
      motivoDisparo: parsed.data.motivoDisparo ?? "prévia manual da próxima ação",
      modoPadrao: "somente_sugestao",
      log: req.log ?? logger,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ plano, executado: false });
  } catch (error) {
    req.log?.error({ error, tenantId, leadId }, "acompanhamento: falha ao planejar");
    return res.status(500).json({ error: "Não foi possível planejar o acompanhamento agora." });
  }
});

// GET — lista/configura apenas a pipeline solicitada. Sem query mantém
// `comercial`, preservando todos os consumidores antigos da API.
router.get("/tenants/:tenantId/pipeline-stages", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const pipeline = parsePipeline(req.query.pipeline);
  const stages = await ensureSystemStages(tenantId, pipeline);
  return res.json(stages);
});

router.post("/tenants/:tenantId/pipeline-stages", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Apenas administradores podem criar etapas." });

  const pipeline = parsePipeline(req.query.pipeline);
  const bodySchema = z.object({
    label: z.string().min(1),
    color: z.string().optional(),
    bg: z.string().optional(),
    slaMinutos: z.number().int().positive().nullable().optional(),
    responsaveisFuncoes: z.array(z.string()).optional(),
    responsavelAgenteKey: z.string().min(1).nullable().optional(),
    atividadePadraoTitulo: z.string().trim().max(200).nullable().optional(),
    atividadePadraoDescricao: z.string().trim().max(2000).nullable().optional(),
    atividadePadraoPrazoMinutos: z.number().int().positive().nullable().optional(),
    atividadesPadrao: z.array(activityTemplateSchema).max(30).optional(),
    aiConfig: pipelineStageAIConfigSchema.optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const validatedFunctions = await validateResponsibleFunctions(tenantId, parsed.data.responsaveisFuncoes);
  if ("error" in validatedFunctions) {
    return res.status(422).json({ error: validatedFunctions.error });
  }

  const validatedAgent = await validateResponsibleAgent(tenantId, parsed.data.responsavelAgenteKey);
  if ("error" in validatedAgent) {
    return res.status(422).json({ error: validatedAgent.error });
  }

  const existing = await ensureSystemStages(tenantId, pipeline);
  let key = slugifyStageKey(parsed.data.label);
  const usedKeys = new Set(existing.map((s) => s.key));
  if (usedKeys.has(key)) {
    let n = 2;
    while (usedKeys.has(`${key}_${n}`)) n++;
    key = `${key}_${n}`;
  }

  const maxOrdem = existing.reduce((max, s) => Math.max(max, s.ordem), -1);
  const [created] = await db
    .insert(pipelineStagesTable)
    .values({
      tenantId,
      pipeline,
      key,
      label: parsed.data.label,
      color: parsed.data.color ?? "text-gray-600",
      bg: parsed.data.bg ?? "bg-gray-100",
      ordem: maxOrdem + 1,
      isSystem: false,
      slaMinutos: parsed.data.slaMinutos ?? null,
      responsaveisFuncoes: validatedFunctions.values,
      responsavelAgenteKey: validatedAgent.value,
      atividadePadraoTitulo: parsed.data.atividadePadraoTitulo ?? null,
      atividadePadraoDescricao: parsed.data.atividadePadraoDescricao ?? null,
      atividadePadraoPrazoMinutos: parsed.data.atividadePadraoPrazoMinutos ?? null,
      atividadesPadrao: parsed.data.atividadesPadrao ?? [],
      aiConfig: parsed.data.aiConfig ?? undefined,
    })
    .returning();

  return res.status(201).json(created);
});

router.patch("/tenants/:tenantId/pipeline-stages/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Apenas administradores podem editar etapas." });

  const parsed = updatePipelineStageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.atividadesPadrao !== undefined) {
    const templates = z.array(activityTemplateSchema).max(30).safeParse(parsed.data.atividadesPadrao);
    if (!templates.success) return res.status(422).json({ error: templates.error.message });
    parsed.data.atividadesPadrao = templates.data;
  }
  // atividadesPadrao validated templates

  if (parsed.data.aiConfig !== undefined) {
    const aiConfig = pipelineStageAIConfigSchema.safeParse(parsed.data.aiConfig);
    if (!aiConfig.success) return res.status(422).json({ error: aiConfig.error.message });
    parsed.data.aiConfig = aiConfig.data;
  }
  // aiConfig validated config

  let responsaveisFuncoes = parsed.data.responsaveisFuncoes;
  if (responsaveisFuncoes !== undefined) {
    const validatedFunctions = await validateResponsibleFunctions(tenantId, responsaveisFuncoes);
    if ("error" in validatedFunctions) {
      return res.status(422).json({ error: validatedFunctions.error });
    }
    responsaveisFuncoes = validatedFunctions.values;
  }

  let responsavelAgenteKey = parsed.data.responsavelAgenteKey;
  if (responsavelAgenteKey !== undefined) {
    const validatedAgent = await validateResponsibleAgent(tenantId, responsavelAgenteKey);
    if ("error" in validatedAgent) {
      return res.status(422).json({ error: validatedAgent.error });
    }
    responsavelAgenteKey = validatedAgent.value;
  }

  const [updated] = await db
    .update(pipelineStagesTable)
    .set({ ...parsed.data, responsaveisFuncoes, responsavelAgenteKey, updatedAt: new Date() })
    .where(and(eq(pipelineStagesTable.id, String(req.params.id)), eq(pipelineStagesTable.tenantId, tenantId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Etapa não encontrada." });
  return res.json(updated);
});


async function stageUsageCount(tenantId: string, pipeline: PipelineKey, stageKey: string): Promise<number> {
  if (pipeline === "execucao" || pipeline === "suporte") {
    const rows = await db.select({ id: workCardsTable.id }).from(workCardsTable).where(and(
      eq(workCardsTable.tenantId, tenantId),
      eq(workCardsTable.pipeline, pipeline),
      eq(workCardsTable.etapa, stageKey),
    )).limit(1);
    return rows.length;
  }

  if (pipeline === "aquecimento" || pipeline === "parceiros") {
    const rows = await db.select({ id: dealsTable.id }).from(dealsTable).where(and(
      eq(dealsTable.tenantId, tenantId),
      eq(dealsTable.relationshipStage, stageKey),
    )).limit(1);
    return rows.length;
  }

  if (pipeline === "scout") {
    const rows = await db.select({ id: scoutOportunidadesTable.id }).from(scoutOportunidadesTable).where(and(
      eq(scoutOportunidadesTable.tenantId, tenantId),
      eq(scoutOportunidadesTable.pipelineStage, stageKey),
    )).limit(1);
    return rows.length;
  }

  const rows = await db.select({ id: dealsTable.id }).from(dealsTable).where(and(
    eq(dealsTable.tenantId, tenantId),
    eq(dealsTable.etapa, stageKey as typeof dealsTable.etapa._.data),
  )).limit(1);
  return rows.length;
}

router.delete("/tenants/:tenantId/pipeline-stages/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Apenas administradores podem excluir etapas." });

  const [stage] = await db
    .select()
    .from(pipelineStagesTable)
    .where(and(eq(pipelineStagesTable.id, String(req.params.id)), eq(pipelineStagesTable.tenantId, tenantId)));

  if (!stage) return res.status(404).json({ error: "Etapa não encontrada." });
  if (stage.isSystem) {
    return res.status(403).json({ error: "Etapas do sistema não podem ser excluídas. Você pode editar o rótulo, SLA e funções responsáveis." });
  }

  const usageCount = await stageUsageCount(tenantId, stage.pipeline as PipelineKey, stage.key);
  if (usageCount > 0) {
    return res.status(409).json({
      error: "PIPELINE_STAGE_IN_USE",
      message: "Esta etapa possui registros vinculados. Mova ou arquive os registros antes de excluir a etapa.",
      pipeline: stage.pipeline,
      stageKey: stage.key,
    });
  }

  await db.delete(pipelineStagesTable).where(eq(pipelineStagesTable.id, stage.id));
  return res.json({ success: true });
});

export default router;
