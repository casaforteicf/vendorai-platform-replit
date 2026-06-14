import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  segmentTemplatesTable,
  agentConfigsTable,
  funisTable,
  businessProfilesTable,
  AGENT_TYPES,
  type AgentsMap,
} from "@workspace/db";

// ─── Public router ────────────────────────────────────────────────────────────
export const publicSegmentTemplatesRouter: IRouter = Router();

publicSegmentTemplatesRouter.get("/segment-templates", async (_req, res) => {
  const templates = await db
    .select()
    .from(segmentTemplatesTable)
    .where(eq(segmentTemplatesTable.ativo, true))
    .orderBy(segmentTemplatesTable.nome);

  res.json(templates);
});

// ─── Authenticated router ────────────────────────────────────────────────────
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

// POST /tenants/:tenantId/segment-templates/:id/apply
router.post(
  "/tenants/:tenantId/segment-templates/:id/apply",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (!canAccessTenant(req, tenantId)) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    // Fetch template
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

    const promptsSugeridos = template.promptsSugeridos as Record<string, string>;
    const promptsApplied: string[] = [];

    // ── 1. Apply prompts to agent_config (only for agents without custom prompt) ──
    const [existingConfig] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));

    let agentConfigUpdated = false;

    if (existingConfig) {
      const currentAgents: AgentsMap = (existingConfig.agents as AgentsMap) ?? {};
      const updatedAgents: AgentsMap = { ...currentAgents };

      for (const agentKey of AGENT_TYPES) {
        const suggestedPrompt = promptsSugeridos[agentKey];
        const existing = currentAgents[agentKey];

        if (suggestedPrompt && !existing?.prompt) {
          updatedAgents[agentKey] = {
            enabled: existing?.enabled ?? false,
            prompt: suggestedPrompt,
          };
          promptsApplied.push(agentKey);
        }
      }

      if (promptsApplied.length > 0) {
        await db
          .update(agentConfigsTable)
          .set({ agents: updatedAgents, updatedAt: new Date() })
          .where(eq(agentConfigsTable.id, existingConfig.id));
        agentConfigUpdated = true;
      }
    } else {
      // Create agent_config with suggested prompts
      const agents: AgentsMap = {};
      for (const agentKey of AGENT_TYPES) {
        const suggestedPrompt = promptsSugeridos[agentKey];
        if (suggestedPrompt) {
          agents[agentKey] = { enabled: false, prompt: suggestedPrompt };
          promptsApplied.push(agentKey);
        }
      }
      await db
        .insert(agentConfigsTable)
        .values({ tenantId, agents });
      agentConfigUpdated = true;
    }

    // ── 2. Create funil padrão if tenant has no funnels ──────────────────────
    let funilCreated = false;
    const funilPadrao = template.funilPadrao as string[];

    if (funilPadrao.length > 0) {
      const existingFunils = await db
        .select({ id: funisTable.id })
        .from(funisTable)
        .where(eq(funisTable.tenantId, tenantId));

      if (existingFunils.length === 0) {
        await db.insert(funisTable).values({
          tenantId,
          nome: `Funil — ${template.nome}`,
          etapas: funilPadrao,
        });
        funilCreated = true;
      }
    }

    // ── 3. Update business_profile.vertical ──────────────────────────────────
    let businessProfileUpdated = false;

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

    res.json({
      agentConfigUpdated,
      funilCreated,
      businessProfileUpdated,
      promptsApplied,
    });
  }
);

export default router;
