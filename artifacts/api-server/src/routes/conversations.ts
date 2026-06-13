import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

router.get("/conversations/:id", async (req, res) => {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
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

  const [conversation] = await db
    .update(conversationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(conversationsTable.id, req.params.id))
    .returning();

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json(conversation);
});

router.delete("/conversations/:id", async (req, res) => {
  const [deleted] = await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id))
    .returning({ id: conversationsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.status(204).send();
});

export default router;
