import { Router, type IRouter } from "express";
import { eq, and, isNull, or } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  canViewAllScopedData,
  leadOwnedByUserCondition,
} from "../lib/lead-scope-access.js";

const router: IRouter = Router();

// GET /tenants/:tenantId/notifications — listar não lidas
router.get("/tenants/:tenantId/notifications", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const { unread } = req.query as { unread?: string };

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const conditions = [eq(notificationsTable.tenantId, tenantId)];
  if (!(await canViewAllScopedData(req, "notifications:view_all"))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.json([]);
      return;
    }
    conditions.push(
      or(
        eq(notificationsTable.recipientUserId, userId),
        leadOwnedByUserCondition(userId, notificationsTable.leadId),
      )!,
    );
  }

  if (unread === "true") {
    conditions.push(isNull(notificationsTable.readAt));
  }

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(notificationsTable.createdAt);

  res.json(notifications);
});

// POST /tenants/:tenantId/notifications/:id/read — marcar como lida
router.post("/tenants/:tenantId/notifications/:id/read", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const notificationId = String(req.params["id"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const conditions = [
    eq(notificationsTable.id, notificationId),
    eq(notificationsTable.tenantId, tenantId),
  ];

  if (!(await canViewAllScopedData(req, "notifications:view_all"))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    conditions.push(
      or(
        eq(notificationsTable.recipientUserId, userId),
        leadOwnedByUserCondition(userId, notificationsTable.leadId),
      )!,
    );
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(...conditions))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(updated);
});

// POST /tenants/:tenantId/notifications/read-all — marcar todas como lidas
router.post("/tenants/:tenantId/notifications/read-all", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const conditions = [
    eq(notificationsTable.tenantId, tenantId),
    isNull(notificationsTable.readAt),
  ];

  if (!(await canViewAllScopedData(req, "notifications:view_all"))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(204).send();
      return;
    }
    conditions.push(
      or(
        eq(notificationsTable.recipientUserId, userId),
        leadOwnedByUserCondition(userId, notificationsTable.leadId),
      )!,
    );
  }

  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(...conditions));

  res.status(204).send();
});

export default router;