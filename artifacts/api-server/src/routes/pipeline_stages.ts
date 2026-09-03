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

// Cria a chave (slug) de uma etapa nova a partir do label — determinístico,
// sem espaço/acento, pra não colidir com as keys do sistema.
function slugifyStageKey(label: string): string {
  return label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "etapa";
}

// GET — lista as etapas do tenant, ordenadas. Semeia as 11 etapas do
// sistema automaticamente na primeira chamada de um tenant que ainda
// não tem nenhuma configurada (em vez de tocar nos 8 fluxos diferentes
// que criam tenant — mais seguro, cobre todos, inclusive tenants
// antigos criados antes dessa feature existir).
router.get("/tenants/:tenantId/pipeline-stages", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  let stages = await db
    .select()
    .from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.tenantId, tenantId))
    .orderBy(asc(pipelineStagesTable.ordem));

  if (stages.length === 0) {
    try {
      stages = await db
        .insert(pipelineStagesTable)
        .values(SYSTEM_PIPELINE_STAGES.map((s) => ({ ...s, tenantId, isSystem: true })))
        .returning();
      stages.sort((a, b) => a.ordem - b.ordem);
    } catch (err) {
      // Corrida rara (duas abas carregando ao mesmo tempo no primeiro
      // acesso) — UNIQUE(tenant_id, key) rejeita a 2ª inserção. Busca
      // de novo em vez de falhar a requisição.
      logger.warn({ err, tenantId }, "pipeline-stages: falha ao semear (provável corrida), buscando de novo");
      stages = await db
        .select()
        .from(pipelineStagesTable)
        .where(eq(pipelineStagesTable.tenantId, tenantId))
        .orderBy(asc(pipelineStagesTable.ordem));
    }
  }

  return res.json(stages);
});

router.post("/tenants/:tenantId/pipeline-stages", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Apenas administradores podem criar etapas." });

  const bodySchema = z.object({
    label: z.string().min(1),
    color: z.string().optional(),
    bg: z.string().optional(),
    slaMinutos: z.number().int().positive().nullable().optional(),
    responsaveisFuncoes: z.array(z.string()).optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const validatedFunctions = await validateResponsibleFunctions(
    tenantId,
    parsed.data.responsaveisFuncoes,
  );
  if ("error" in validatedFunctions) {
    return res.status(422).json({ error: validatedFunctions.error });
  }

  const existing = await db
    .select()
    .from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.tenantId, tenantId));

  let key = slugifyStageKey(parsed.data.label);
  // Evita colidir com uma key já existente (do sistema ou custom) —
  // acrescenta sufixo numérico até achar uma livre.
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
    return res.status(403).json({ error: "Etapas do sistema não podem ser excluídas — a automação de contrato/cobrança depende delas. Você pode ocultar ou renomear o rótulo." });
  }

  await db.delete(pipelineStagesTable).where(eq(pipelineStagesTable.id, stage.id));
  return res.json({ success: true });
});

export default router;
