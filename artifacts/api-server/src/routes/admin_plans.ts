import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  plansTable,
  planModulesTable,
  tenantsTable,
  agentActionsLogTable,
  planAssignmentLogTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── GET /admin/plans ───────────────────────────────────────────────────────────
router.get("/admin/plans", requireRole("super_admin"), async (req, res) => {
  const plans = await db.select().from(plansTable).where(eq(plansTable.isActive, true));

  const modules = await db.select().from(planModulesTable);
  const byPlan = new Map<string, string[]>();
  for (const m of modules) {
    const list = byPlan.get(m.planId) ?? [];
    list.push(m.moduleKey);
    byPlan.set(m.planId, list);
  }

  res.json(
    plans.map((p) => ({
      ...p,
      modules: byPlan.get(p.id) ?? [],
    })),
  );
});

// ── GET /admin/tenants/:id/plan ──────────────────────────────────────────────
router.get("/admin/tenants/:id/plan", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      planId: tenantsTable.planId,
      billingCycle: tenantsTable.billingCycle,
      planStartedAt: tenantsTable.planStartedAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  let plan: { id: string; slug: string; name: string; modules: string[] } | null = null;
  if (tenant.planId) {
    const [p] = await db
      .select({ id: plansTable.id, slug: plansTable.slug, name: plansTable.name })
      .from(plansTable)
      .where(eq(plansTable.id, tenant.planId))
      .limit(1);
    if (p) {
      const mods = await db
        .select({ moduleKey: planModulesTable.moduleKey })
        .from(planModulesTable)
        .where(eq(planModulesTable.planId, p.id));
      plan = { ...p, modules: mods.map((m) => m.moduleKey) };
    }
  }

  // Count blocked_by_plan logs for this tenant
  const [blockedCount] = await db
    .select({ count: agentActionsLogTable.id })
    .from(agentActionsLogTable)
    .where(
      and(
        eq(agentActionsLogTable.tenantId, tenantId),
        eq(agentActionsLogTable.status, "blocked_by_plan"),
      ),
    );

  res.json({
    tenant,
    plan,
    blockedActionsCount: blockedCount ? 1 : 0,
  });
});

// ── PATCH /admin/tenants/:id/plan ─────────────────────────────────────────────
const updatePlanSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(["monthly", "annual"]).optional(),
});

router.patch("/admin/tenants/:id/plan", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { planId, billingCycle } = parsed.data;

  // Verify plan exists
  const [plan] = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.id, planId)).limit(1);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const [updated] = await db
    .update(tenantsTable)
    .set({
      planId,
      billingCycle: billingCycle ?? "monthly",
      planStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, tenantId))
    .returning({
      id: tenantsTable.id,
      planId: tenantsTable.planId,
      billingCycle: tenantsTable.billingCycle,
      planStartedAt: tenantsTable.planStartedAt,
    });

  // Log de auditoria
  const adminEmail = req.user?.email ?? "admin";
  await db.insert(planAssignmentLogTable).values({
    tenantId,
    planId,
    assignedBy: `admin_manual:${adminEmail}`,
  });

  res.json({
    message: "Plano atualizado com sucesso",
    tenant: updated,
  });
});

export default router;
