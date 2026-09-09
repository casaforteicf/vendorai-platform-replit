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
  AGENT_TYPES,
  type AgentsMap,
} from "@workspace/db";

export const publicSegmentTemplatesRouter: IRouter = Router();

publicSegmentTemplatesRouter.get("/segment-templates", async (_req, res) => {
  const templates = await db
    .select()
    .from(segmentTemplatesTable)
    .where(eq(segmentTemplatesTable.ativo, true))
    .orderBy(segmentTemplatesTable.nome);

  res.json(templates);
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
  const rows = await db.select({ id: segmentTemplatesTable.id, nome: segmentTemplatesTable.nome }).from(segmentTemplatesTable);
  const normalized = nome.trim().toLocaleLowerCase("pt-BR");
  return rows.some((row) => row.id !== ignoreId && row.nome.trim().toLocaleLowerCase("pt-BR") === normalized);
}

// Lista administrativa inclui ativos e arquivados.
router.get("/admin/segment-templates", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Super Admin required" });
    return;
  }
  const templates = await db.select().from(segmentTemplatesTable).orderBy(segmentTemplatesTable.nome);
  res.json(templates);
});

// Cria um novo template oficial de segmento. O ID é a identidade imutável;
// o nome pode evoluir depois, com sincronização dos vínculos existentes.
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
  const [created] = await db.insert(segmentTemplatesTable).values({ ...parsed.data, nome }).returning();
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

  const [current] = await db.select().from(segmentTemplatesTable).where(eq(segmentTemplatesTable.id, req.params.id as string));
  if (!current) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const nextName = parsed.data.nome !== undefined ? parsed.data.nome.trim() : current.nome;
  if (!nextName) {
    res.status(422).json({ error: "Nome do segmento é obrigatório" });
    return;
  }
  if (nextName !== current.nome && await hasNameConflict(nextName, current.id)) {
    res.status(409).json({ error: "Já existe um segmento com este nome" });
    return;
  }

  const allowed = {
    ...(parsed.data.nome !== undefined ? { nome: nextName } : {}),
    ...(parsed.data.descricao !== undefined ? { descricao: parsed.data.descricao } : {}),
    ...(parsed.data.promptsSugeridos !== undefined ? { promptsSugeridos: parsed.data.promptsSugeridos } : {}),
    ...(parsed.data.funilPadrao !== undefined ? { funilPadrao: parsed.data.funilPadrao } : {}),
    ...(parsed.data.categoriasProdutoSugeridas !== undefined
      ? { categoriasProdutoSugeridas: parsed.data.categoriasProdutoSugeridas }
      : {}),
    ...(parsed.data.ativo !== undefined ? { ativo: parsed.data.ativo } : {}),
  };

  if (Object.keys(allowed).length === 0) {
    res.status(422).json({ error: "Nenhum campo editável informado" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    if (nextName !== current.nome) {
      await tx.update(tenantsTable).set({ vertical: nextName, updatedAt: new Date() }).where(eq(tenantsTable.vertical, current.nome));
      await tx.update(businessProfilesTable).set({ vertical: nextName, updatedAt: new Date() }).where(eq(businessProfilesTable.vertical, current.nome));
    }
    const [row] = await tx.update(segmentTemplatesTable).set(allowed).where(eq(segmentTemplatesTable.id, current.id)).returning();
    return row;
  });

  res.json(updated);
});

router.post("/admin/segment-templates/:id/duplicate", async (req, res) => {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ error: "Super Admin required" });
    return;
  }
  const [source] = await db.select().from(segmentTemplatesTable).where(eq(segmentTemplatesTable.id, req.params.id as string));
  if (!source) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  let candidate = `${source.nome} — Cópia`;
  let suffix = 2;
  while (await hasNameConflict(candidate)) candidate = `${source.nome} — Cópia ${suffix++}`;
  const [created] = await db.insert(segmentTemplatesTable).values({
    nome: candidate,
    descricao: source.descricao,
    promptsSugeridos: source.promptsSugeridos,
    funilPadrao: source.funilPadrao,
    categoriasProdutoSugeridas: source.categoriasProdutoSugeridas,
    ativo: false,
  }).returning();
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
      .where(and(eq(segmentTemplatesTable.id, id), eq(segmentTemplatesTable.ativo, true)));

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const promptsSugeridos = template.promptsSugeridos as Record<string, string>;
    const promptsApplied: string[] = [];
    const [existingConfig] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
    let agentConfigUpdated = false;

    if (existingConfig) {
      const currentAgents: AgentsMap = (existingConfig.agents as AgentsMap) ?? {};
      const updatedAgents: AgentsMap = { ...currentAgents };
      for (const agentKey of AGENT_TYPES) {
        const suggestedPrompt = promptsSugeridos[agentKey];
        const existing = currentAgents[agentKey];
        if (suggestedPrompt && !existing?.prompt) {
          updatedAgents[agentKey] = { enabled: existing?.enabled ?? false, prompt: suggestedPrompt };
          promptsApplied.push(agentKey);
        }
      }
      if (promptsApplied.length > 0) {
        await db.update(agentConfigsTable).set({ agents: updatedAgents, updatedAt: new Date() }).where(eq(agentConfigsTable.id, existingConfig.id));
        agentConfigUpdated = true;
      }
    } else {
      const agents: AgentsMap = {};
      for (const agentKey of AGENT_TYPES) {
        const suggestedPrompt = promptsSugeridos[agentKey];
        if (suggestedPrompt) {
          agents[agentKey] = { enabled: false, prompt: suggestedPrompt };
          promptsApplied.push(agentKey);
        }
      }
      await db.insert(agentConfigsTable).values({ tenantId, agents, setupCompletedAt: new Date(), autonomyEnabledAt: new Date() });
      agentConfigUpdated = true;
    }

    let funilCreated = false;
    const funilPadrao = template.funilPadrao as string[];
    if (funilPadrao.length > 0) {
      const existingFunils = await db.select({ id: funisTable.id }).from(funisTable).where(eq(funisTable.tenantId, tenantId));
      if (existingFunils.length === 0) {
        await db.insert(funisTable).values({ tenantId, nome: `Funil — ${template.nome}`, etapas: funilPadrao });
        funilCreated = true;
      }
    }

    let businessProfileUpdated = false;
    const [profile] = await db.select({ id: businessProfilesTable.id }).from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
    if (profile) {
      await db.update(businessProfilesTable).set({ vertical: template.nome, updatedAt: new Date() }).where(eq(businessProfilesTable.id, profile.id));
      businessProfileUpdated = true;
    }

    await db.update(tenantsTable).set({ vertical: template.nome, updatedAt: new Date() }).where(eq(tenantsTable.id, tenantId));

    res.json({ agentConfigUpdated, funilCreated, businessProfileUpdated, promptsApplied });
  }
);

export default router;
