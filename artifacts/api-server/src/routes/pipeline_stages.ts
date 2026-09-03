import { Router, type IRouter } from "express";
import { and, eq, asc, inArray } from "drizzle-orm";
import {
  db,
  pipelineStagesTable,
  SYSTEM_PIPELINE_STAGES,
  updatePipelineStageSchema,
  tenantUserFunctionsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { logger } from "../lib/logger.js";

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
};

const simpleStage = (key: string, label: string, ordem: number): SystemStage => ({
  key,
  label,
  ordem,
  color: "text-slate-600",
  bg: "bg-slate-100",
});

// Mantém exatamente as keys que cada pipeline já usa hoje. A configuração
// de responsáveis apenas governa acesso/execução; não cria um fluxo paralelo.
export const SYSTEM_STAGES_BY_PIPELINE: Record<PipelineKey, SystemStage[]> = {
  comercial: SYSTEM_PIPELINE_STAGES,
  execucao: [
    simpleStage("aguardando_separacao", "Aguardando separação", 0),
    simpleStage("separacao", "Separação", 1),
    simpleStage("conferencia", "Conferência", 2),
    simpleStage("faturamento", "Faturamento", 3),
    simpleStage("expedicao", "Expedição", 4),
    simpleStage("transporte", "Transporte", 5),
    simpleStage("entregue", "Entregue", 6),
  ],
  suporte: [
    simpleStage("aberto", "Aberto", 0),
    simpleStage("triagem", "Triagem", 1),
    simpleStage("aguardando_cliente", "Aguardando cliente", 2),
    simpleStage("em_atendimento", "Em atendimento", 3),
    simpleStage("resolvido", "Resolvido", 4),
    simpleStage("encerrado", "Encerrado", 5),
  ],
  aquecimento: [
    simpleStage("aquecimento_lead", "Leads em aquecimento", 0),
    simpleStage("aquecimento_cliente", "Clientes em aquecimento", 1),
  ],
  parceiros: [
    simpleStage("prospectando", "Prospectando", 0),
    simpleStage("conectado", "Conectado", 1),
    simpleStage("negociando", "Negociando", 2),
    simpleStage("parceiro", "Parceiro", 3),
  ],
  scout: [
    simpleStage("identificada", "Identificada", 0),
    simpleStage("em_analise", "Em análise", 1),
    simpleStage("encaminhada", "Encaminhada", 2),
    simpleStage("ia_aprovada", "IA aprovada", 3),
    simpleStage("em_contato", "Em contato", 4),
    simpleStage("convertida", "Convertida", 5),
    simpleStage("descartada", "Descartada", 6),
  ],
};

const BUILTIN_FUNCTIONS = new Set([
  "vendedor",
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
  return req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
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

async function ensureSystemStages(tenantId: string, pipeline: PipelineKey) {
  let stages = await listPipelineStages(tenantId, pipeline);
  if (stages.length > 0) return stages;

  try {
    stages = await db
      .insert(pipelineStagesTable)
      .values(
        SYSTEM_STAGES_BY_PIPELINE[pipeline].map((stage) => ({
          ...stage,
          tenantId,
          pipeline,
          isSystem: true,
        })),
      )
      .returning();
    stages.sort((a, b) => a.ordem - b.ordem);
  } catch (err) {
    // Duas abas podem semear ao mesmo tempo. A unicidade
    // (tenant_id, pipeline, key) protege contra duplicidade.
    logger.warn({ err, tenantId, pipeline }, "pipeline-stages: falha ao semear; buscando de novo");
    stages = await listPipelineStages(tenantId, pipeline);
  }
  return stages;
}

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
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const validatedFunctions = await validateResponsibleFunctions(tenantId, parsed.data.responsaveisFuncoes);
  if ("error" in validatedFunctions) {
    return res.status(422).json({ error: validatedFunctions.error });
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

  let responsaveisFuncoes = parsed.data.responsaveisFuncoes;
  if (responsaveisFuncoes !== undefined) {
    const validatedFunctions = await validateResponsibleFunctions(tenantId, responsaveisFuncoes);
    if ("error" in validatedFunctions) {
      return res.status(422).json({ error: validatedFunctions.error });
    }
    responsaveisFuncoes = validatedFunctions.values;
  }

  const [updated] = await db
    .update(pipelineStagesTable)
    .set({ ...parsed.data, responsaveisFuncoes, updatedAt: new Date() })
    .where(and(eq(pipelineStagesTable.id, String(req.params.id)), eq(pipelineStagesTable.tenantId, tenantId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Etapa não encontrada." });
  return res.json(updated);
});

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

  await db.delete(pipelineStagesTable).where(eq(pipelineStagesTable.id, stage.id));
  return res.json({ success: true });
});

export default router;
