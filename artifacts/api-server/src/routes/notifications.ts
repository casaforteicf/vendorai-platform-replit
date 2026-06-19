import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

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

  const [updated] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.tenantId, tenantId)))
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

  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.tenantId, tenantId), isNull(notificationsTable.readAt)));

  res.status(204).send();
});

export default router;
