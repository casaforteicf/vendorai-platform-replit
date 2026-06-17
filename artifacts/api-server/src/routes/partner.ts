import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
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

export default router;
