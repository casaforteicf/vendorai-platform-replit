import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sum, count, desc, sql } from "drizzle-orm";
import { db, tenantsTable, partnerCommissionsTable, plansTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/partner/tenants", requireRole("partner"), async (req, res) => {
  const partnerId = req.user!.partnerId;
  if (!partnerId) {
    res.status(403).json({ error: "No partner record associated with this account" });
    return;
  }

  const tenants = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
      status: tenantsTable.status,
      vertical: tenantsTable.vertical,
      setupCompletedAt: tenantsTable.setupCompletedAt,
      monthlyTokenLimit: tenantsTable.monthlyTokenLimit,
      tokensUsedCurrentMonth: tenantsTable.tokensUsedCurrentMonth,
      dailyMessageLimit: tenantsTable.dailyMessageLimit,
      messagesSentToday: tenantsTable.messagesSentToday,
      createdAt: tenantsTable.createdAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.partnerId, partnerId));

  res.json(tenants);
});

router.get("/partner/tenants/:id/usage", requireRole("partner"), async (req, res) => {
  const partnerId = req.user!.partnerId;
  if (!partnerId) {
    res.status(403).json({ error: "No partner record associated with this account" });
    return;
  }

  const tenantId = String(req.params["id"]);

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
      status: tenantsTable.status,
      vertical: tenantsTable.vertical,
      setupCompletedAt: tenantsTable.setupCompletedAt,
      monthlyTokenLimit: tenantsTable.monthlyTokenLimit,
      tokensUsedCurrentMonth: tenantsTable.tokensUsedCurrentMonth,
      dailyMessageLimit: tenantsTable.dailyMessageLimit,
      messagesSentToday: tenantsTable.messagesSentToday,
      createdAt: tenantsTable.createdAt,
    })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.partnerId, partnerId)));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found or not associated with this partner" });
    return;
  }

  res.json({
    tenant,
    usage: {
      tokensUsedCurrentMonth: tenant.tokensUsedCurrentMonth,
      monthlyTokenLimit: tenant.monthlyTokenLimit,
      messagesSentToday: tenant.messagesSentToday,
      dailyMessageLimit: tenant.dailyMessageLimit,
    },
  });
});

// ── GET /partner/dashboard — summary + tenants (with plan + monthly commission) + commissions ──
router.get("/partner/dashboard", requireRole("partner"), async (req, res) => {
  const partnerId = req.user!.partnerId;
  if (!partnerId) {
    res.status(403).json({ error: "No partner record associated with this account" });
    return;
  }

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextPayment = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  const [tenants, commissionsThisMonth, commissionsThisYear, allCommissions, tenantMonthlyCommissions] = await Promise.all([
    db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        slug: tenantsTable.slug,
        status: tenantsTable.status,
        vertical: tenantsTable.vertical,
        setupCompletedAt: tenantsTable.setupCompletedAt,
        createdAt: tenantsTable.createdAt,
        planName: plansTable.name,
        planSlug: plansTable.slug,
      })
      .from(tenantsTable)
      .leftJoin(plansTable, eq(tenantsTable.planId, plansTable.id))
      .where(eq(tenantsTable.partnerId, partnerId)),

    db
      .select({ total: sum(partnerCommissionsTable.valor) })
      .from(partnerCommissionsTable)
      .where(
        and(
          eq(partnerCommissionsTable.partnerId, partnerId),
          gte(partnerCommissionsTable.dataReferencia, monthStartStr),
          lt(partnerCommissionsTable.dataReferencia, monthEndStr)
        )
      ),

    db
      .select({ total: sum(partnerCommissionsTable.valor) })
      .from(partnerCommissionsTable)
      .where(
        and(
          eq(partnerCommissionsTable.partnerId, partnerId),
          gte(partnerCommissionsTable.dataReferencia, yearStart.toISOString().slice(0, 10))
        )
      ),

    db
      .select()
      .from(partnerCommissionsTable)
      .where(eq(partnerCommissionsTable.partnerId, partnerId))
      .orderBy(desc(partnerCommissionsTable.dataReferencia))
      .limit(24),

    db
      .select({
        tenantId: partnerCommissionsTable.tenantId,
        monthlyCommission: sum(partnerCommissionsTable.valor),
      })
      .from(partnerCommissionsTable)
      .where(
        and(
          eq(partnerCommissionsTable.partnerId, partnerId),
          gte(partnerCommissionsTable.dataReferencia, monthStartStr),
          lt(partnerCommissionsTable.dataReferencia, monthEndStr)
        )
      )
      .groupBy(partnerCommissionsTable.tenantId),
  ]);

  const monthlyByTenant = new Map(
    tenantMonthlyCommissions.map((r) => [r.tenantId, parseFloat(r.monthlyCommission ?? "0") || 0])
  );

  const activeTenants = tenants.filter((t) => t.status === "active").length;

  res.json({
    summary: {
      activeTenants,
      commissionThisMonth: parseFloat(commissionsThisMonth[0]?.total ?? "0") || 0,
      commissionThisYear: parseFloat(commissionsThisYear[0]?.total ?? "0") || 0,
      nextPaymentDate: nextPayment.toISOString().slice(0, 10),
    },
    tenants: tenants.map((t) => ({
      ...t,
      monthlyCommission: monthlyByTenant.get(t.id) ?? 0,
    })),
    commissions: allCommissions,
  });
});

export default router;
