import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  conversationsTable,
  insertConversationSchema,
  updateConversationSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/conversations", async (req, res) => {
  const conversations = await db
    .select()
    .from(conversationsTable)
    .orderBy(conversationsTable.createdAt);
  res.json(conversations);
});

router.post("/conversations", async (req, res) => {
  const parsed = insertConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(conversation);
});

router.get("/tenants/:tenantId/conversations", async (req, res) => {
  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.tenantId, req.params.tenantId))
    .orderBy(conversationsTable.createdAt);
  res.json(conversations);
});

router.post(
  "/tenants/:tenantId/conversations/:conversationId/mark-read",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [conversation] = await db
      .update(conversationsTable)
      .set({ naoLidas: 0, updatedAt: new Date() })
      .where(
        sql`${conversationsTable.id} = ${req.params.conversationId} AND ${conversationsTable.tenantId} = ${tenantId}`
      )
      .returning();

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json(conversation);
  }
);

router.get("/conversations/:id", async (req, res) => {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && conversation.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(conversation);
});

router.patch("/conversations/:id", async (req, res) => {
  const parsed = updateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: conversationsTable.id, tenantId: conversationsTable.tenantId })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [conversation] = await db
    .update(conversationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(conversationsTable.id, existing.id))
    .returning();

  res.json(conversation);
});

router.delete("/conversations/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: conversationsTable.id, tenantId: conversationsTable.tenantId })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(conversationsTable).where(eq(conversationsTable.id, existing.id));

  res.status(204).send();
});

export default router;
