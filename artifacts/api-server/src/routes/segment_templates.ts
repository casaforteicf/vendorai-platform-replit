import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  segmentTemplatesTable,
  insertSegmentTemplateSchema,
  updateSegmentTemplateSchema,
  agentConfigsTable,
  funisTable,
  businessProfilesTable,
  tenantsTable,
  categoriasProdutoTable,
  AGENT_TYPES,
  type AgentsMap,
} from "@workspace/db";

export const publicSegmentTemplatesRouter: IRouter = Router();

const VERTICAL_MODULE_NAMES = new Set([
  "Construção & Reforma",
  "Varejo de Roupas & Acessórios",
  "Supermercado",
]);

function templateCounts(template: {
  promptsSugeridos?: unknown;
  funilPadrao?: unknown;
  categoriasProdutoSugeridas?: unknown;
}) {
  const prompts = (template.promptsSugeridos ?? {}) as Record<string, unknown>;
  const funil = Array.isArray(template.funilPadrao) ? template.funilPadrao : [];
  const categorias = Array.isArray(template.categoriasProdutoSugeridas)
    ? template.categoriasProdutoSugeridas
    : [];

  return {
    prompts: Object.values(prompts).filter(
      (value) => typeof value === "string" && value.trim()
    ).length,
    funil: funil.filter((value) => typeof value === "string" && value.trim())
      .length,
    categorias: categorias.filter(
      (value) => typeof value === "string" && value.trim()
    ).length,
  };
}

function isTemplateReady(template: {
  promptsSugeridos?: unknown;
  funilPadrao?: unknown;
  categoriasProdutoSugeridas?: unknown;
}) {
  const counts = templateCounts(template);
  return counts.prompts > 0 && counts.funil > 0 && counts.categorias > 0;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function readCustomizedAgents(value: unknown): Record<string, { enabled: boolean; prompt: string }> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const result: Record<string, { enabled: boolean; prompt: string }> = {};
  for (const agentKey of AGENT_TYPES) {
    const raw = (value as Record<string, unknown>)[agentKey];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const enabled = (raw as Record<string, unknown>).enabled !== false;
    const promptRaw = (raw as Record<string, unknown>).prompt;
    const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
    if (enabled && prompt) result[agentKey] = { enabled: true, prompt };
  }
  return result;
}

publicSegmentTemplatesRouter.get("/segment-templates", async (_req, res) => {
  const templates = await db
    .select()
    .from(segmentTemplatesTable)
    .where(eq(segmentTemplatesTable.ativo, true))
    .orderBy(segmentTemplatesTable.nome);

  res.json(templates.filter(isTemplateReady));
});

const router: IRouter = Router();

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function userTenantId(req: Express.Request): string | undefined {
  return (req as any).user?.tenantId;
}
function canAccessTenant(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || userTenantId(req) === tenantId;
}
async function hasNameConflict(nome: string, ignoreId?: string) {
  const rows = await db
    .select({ id: segmentTemplatesTable.id, nome: segmentTemplatesTable.nome })
    .from(segmentTemplatesTable);
  const normalized = nome.trim().toLocaleLowerCase("pt-BR");
  return rows.some(
    (row) =>
      row.id !== ignoreId &&
      row.nome.trim().toLocaleLowerCase("pt-BR") === normalized
  );
}

router.get("/admin/segment-templates", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Super Admin required" });
    return;
  }
  const templates = await db
    .select()
    .from(segmentTemplatesTable)
    .orderBy(segmentTemplatesTable.nome);
  res.json(templates);
});

router.post("/admin/segment-templates", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Super Admin required" });
    return;
  }
  const parsed = insertSegmentTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const nome = parsed.data.nome.trim();
  if (!nome) {
    res.status(422).json({ error: "Nome do segmento é obrigatório" });
    return;
  }
  if (await hasNameConflict(nome)) {
    res.status(409).json({ error: "Já existe um segmento com este nome" });
    return;
  }

  if (parsed.data.ativo && !isTemplateReady(parsed.data)) {
    res.status(422).json({
      error:
        "Para publicar no Marketplace, o template precisa ter ao menos 1 agente, 1 etapa de funil e 1 categoria de produto.",
      counts: templateCounts(parsed.data),
    });
    return;
  }

  const [created] = await db
    .insert(segmentTemplatesTable)
    .values({ ...parsed.data, nome })
    .returning();
  res.status(201).json(created);
});

router.patch("/admin/segment-templates/:id", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Super Admin required" });
    return;
  }

  const parsed = updateSegmentTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }

  const [current] = await db
    .select()
    .from(segmentTemplatesTable)
    .where(eq(segmentTemplatesTable.id, req.params.id as string));
  if (!current) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const nextName =
    parsed.data.nome !== undefined ? parsed.data.nome.trim() : current.nome;
  if (!nextName) {
    res.status(422).json({ error: "Nome do segmento é obrigatório" });
    return;
  }
  if (
    nextName !== current.nome &&
    (await hasNameConflict(nextName, current.id))
  ) {
    res.status(409).json({ error: "Já existe um segmento com este nome" });
    return;
  }

  const allowed = {
    ...(parsed.data.nome !== undefined ? { nome: nextName } : {}),
    ...(parsed.data.descricao !== undefined
      ? { descricao: parsed.data.descricao }
      : {}),
    ...(parsed.data.promptsSugeridos !== undefined
      ? { promptsSugeridos: parsed.data.promptsSugeridos }
      : {}),
    ...(parsed.data.funilPadrao !== undefined
      ? { funilPadrao: parsed.data.funilPadrao }
      : {}),
    ...(parsed.data.categoriasProdutoSugeridas !== undefined
      ? { categoriasProdutoSugeridas: parsed.data.categoriasProdutoSugeridas }
      : {}),
    ...(parsed.data.ativo !== undefined ? { ativo: parsed.data.ativo } : {}),
  };

  if (Object.keys(allowed).length === 0) {
    res.status(422).json({ error: "Nenhum campo editável informado" });
    return;
  }

  const candidate = { ...current, ...allowed, nome: nextName };
  if (candidate.ativo && !isTemplateReady(candidate)) {
    res.status(422).json({
      error:
        "Não é possível publicar um template incompleto. Preencha agentes, funil e categorias antes de ativar.",
      counts: templateCounts(candidate),
    });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    if (nextName !== current.nome) {
      await tx
        .update(tenantsTable)
        .set({ vertical: nextName, updatedAt: new Date() })
        .where(eq(tenantsTable.vertical, current.nome));
      await tx
        .update(businessProfilesTable)
        .set({ vertical: nextName, updatedAt: new Date() })
        .where(eq(businessProfilesTable.vertical, current.nome));
    }
    const [row] = await tx
      .update(segmentTemplatesTable)
      .set(allowed)
      .where(eq(segmentTemplatesTable.id, current.id))
      .returning();
    return row;
  });

  res.json(updated);
});

router.post("/admin/segment-templates/:id/duplicate", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Super Admin required" });
    return;
  }
  const [source] = await db
    .select()
    .from(segmentTemplatesTable)
    .where(eq(segmentTemplatesTable.id, req.params.id as string));
  if (!source) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  let candidate = `${source.nome} — Cópia`;
  let suffix = 2;
  while (await hasNameConflict(candidate)) {
    candidate = `${source.nome} — Cópia ${suffix++}`;
  }
  const [created] = await db
    .insert(segmentTemplatesTable)
    .values({
      nome: candidate,
      descricao: source.descricao,
      promptsSugeridos: source.promptsSugeridos,
      funilPadrao: source.funilPadrao,
      categoriasProdutoSugeridas: source.categoriasProdutoSugeridas,
      ativo: false,
    })
    .returning();
  res.status(201).json(created);
});

router.post(
  "/tenants/:tenantId/segment-templates/:id/apply",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (!canAccessTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [template] = await db
      .select()
      .from(segmentTemplatesTable)
      .where(
        and(
          eq(segmentTemplatesTable.id, id),
          eq(segmentTemplatesTable.ativo, true)
        )
      );

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    if (!isTemplateReady(template)) {
      res.status(409).json({
        error: "Este template ainda está em preparação e não pode ser aplicado.",
        counts: templateCounts(template),
      });
      return;
    }

    const customization =
      req.body?.customization && typeof req.body.customization === "object"
        ? req.body.customization
        : {};

    const customizedAgents = readCustomizedAgents(customization.agents);
    const templatePrompts = (template.promptsSugeridos ?? {}) as Record<
      string,
      string
    >;
    const promptsSugeridos: Record<string, string> = customizedAgents
      ? Object.fromEntries(
          Object.entries(customizedAgents).map(([key, value]) => [key, value.prompt])
        )
      : templatePrompts;

    const customizedFunil = cleanStringArray(customization.funilPadrao);
    const funilPadrao =
      customizedFunil !== undefined
        ? customizedFunil
        : ((template.funilPadrao ?? []) as string[]);

    const customizedCategories = cleanStringArray(customization.categoriasProduto);
    const suggestedCategories = (
      customizedCategories !== undefined
        ? customizedCategories
        : ((template.categoriasProdutoSugeridas ?? []) as string[])
    )
      .map((name) => name.trim())
      .filter(Boolean);

    const promptsApplied: string[] = [];
    const promptsPreserved: string[] = [];
    const [existingConfig] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));
    let agentConfigUpdated = false;

    if (existingConfig) {
      const currentAgents: AgentsMap =
        (existingConfig.agents as AgentsMap) ?? {};
      const updatedAgents: AgentsMap = { ...currentAgents };
      for (const agentKey of AGENT_TYPES) {
        const suggestedPrompt = promptsSugeridos[agentKey];
        const existing = currentAgents[agentKey];
        if (!suggestedPrompt?.trim()) continue;

        if (!existing?.prompt?.trim()) {
          updatedAgents[agentKey] = {
            enabled: existing?.enabled ?? false,
            prompt: suggestedPrompt,
          };
          promptsApplied.push(agentKey);
        } else {
          promptsPreserved.push(agentKey);
        }
      }
      if (promptsApplied.length > 0) {
        await db
          .update(agentConfigsTable)
          .set({ agents: updatedAgents, updatedAt: new Date() })
          .where(eq(agentConfigsTable.id, existingConfig.id));
        agentConfigUpdated = true;
      }
    } else if (Object.keys(promptsSugeridos).length > 0) {
      const agents: AgentsMap = {};
      for (const agentKey of AGENT_TYPES) {
        const suggestedPrompt = promptsSugeridos[agentKey];
        if (suggestedPrompt?.trim()) {
          agents[agentKey] = { enabled: false, prompt: suggestedPrompt };
          promptsApplied.push(agentKey);
        }
      }
      if (promptsApplied.length > 0) {
        await db.insert(agentConfigsTable).values({
          tenantId,
          agents,
          setupCompletedAt: new Date(),
          autonomyEnabledAt: new Date(),
        });
        agentConfigUpdated = true;
      }
    }

    const funilNome = `Funil — ${template.nome}`;
    let funilCreated = false;
    let funilSkipped = false;

    if (funilPadrao.length > 0) {
      const [existingSameFunil] = await db
        .select({ id: funisTable.id })
        .from(funisTable)
        .where(
          and(
            eq(funisTable.tenantId, tenantId),
            eq(funisTable.nome, funilNome)
          )
        );

      if (!existingSameFunil) {
        await db.insert(funisTable).values({
          tenantId,
          nome: funilNome,
          etapas: funilPadrao,
        });
        funilCreated = true;
      } else {
        funilSkipped = true;
      }
    }

    const existingCategories = await db
      .select({ nome: categoriasProdutoTable.nome })
      .from(categoriasProdutoTable)
      .where(eq(categoriasProdutoTable.tenantId, tenantId));

    const existingCategoryNames = new Set(
      existingCategories.map((row) => row.nome.trim().toLocaleLowerCase("pt-BR"))
    );

    const categoriesCreated: string[] = [];
    const categoriesSkipped: string[] = [];
    for (const categoryName of suggestedCategories) {
      const key = categoryName.toLocaleLowerCase("pt-BR");
      if (existingCategoryNames.has(key)) {
        categoriesSkipped.push(categoryName);
        continue;
      }

      await db.insert(categoriasProdutoTable).values({
        tenantId,
        nome: categoryName,
        slug: slugify(categoryName),
        nivel: "categoria",
        oficial: false,
        ativo: true,
      });
      existingCategoryNames.add(key);
      categoriesCreated.push(categoryName);
    }

    const isVerticalModule = VERTICAL_MODULE_NAMES.has(template.nome);
    let businessProfileUpdated = false;
    let tenantVerticalUpdated = false;

    if (isVerticalModule) {
      const [profile] = await db
        .select({ id: businessProfilesTable.id })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.tenantId, tenantId));
      if (profile) {
        await db
          .update(businessProfilesTable)
          .set({ vertical: template.nome, updatedAt: new Date() })
          .where(eq(businessProfilesTable.id, profile.id));
        businessProfileUpdated = true;
      }

      await db
        .update(tenantsTable)
        .set({ vertical: template.nome, updatedAt: new Date() })
        .where(eq(tenantsTable.id, tenantId));
      tenantVerticalUpdated = true;
    }

    res.json({
      agentConfigUpdated,
      promptsApplied,
      promptsPreserved,
      funilCreated,
      funilSkipped,
      categoriesCreated,
      categoriesSkipped,
      businessProfileUpdated,
      tenantVerticalUpdated,
      customizationApplied: {
        agents: customizedAgents !== undefined,
        funil: customizedFunil !== undefined,
        categorias: customizedCategories !== undefined,
      },
    });
  }
);

export default router;
