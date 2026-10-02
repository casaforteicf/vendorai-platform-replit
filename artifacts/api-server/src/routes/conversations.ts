import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  conversationsTable,
  leadsTable,
  insertConversationSchema,
  updateConversationSchema,
} from "@workspace/db";
import {
  canAccessConversation,
  canViewAllConversations,
  conversationOwnedByUserCondition,
} from "../lib/conversation-access.js";

const router: IRouter = Router();

router.get("/conversations", async (req, res) => {
  const tenantId = req.user?.tenantId;

  if (req.user?.platformRole !== "super_admin" && !tenantId) {
    res.status(403).json({ error: "Conversation access requires tenant context" });
    return;
  }

  const conditions = [];
  if (req.user?.platformRole !== "super_admin" && tenantId) {
    conditions.push(eq(conversationsTable.tenantId, tenantId));
  }

  if (!(await canViewAllConversations(req))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.json([]);
      return;
    }
    conditions.push(conversationOwnedByUserCondition(userId));
  }

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
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
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(conversationsTable.tenantId, tenantId)];

  if (!(await canViewAllConversations(req))) {
    const userId = req.user?.sub;
    if (!userId) {
      res.json([]);
      return;
    }
    conditions.push(conversationOwnedByUserCondition(userId));
  }

  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(and(...conditions))
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

    if (!(await canAccessConversation(req, tenantId, String(req.params.conversationId)))) {
      res.status(403).json({ error: "Access denied to this conversation" });
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

  if (!(await canAccessConversation(req, conversation.tenantId, conversation.id))) {
    res.status(403).json({ error: "Access denied to this conversation" });
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
    .select({ id: conversationsTable.id, tenantId: conversationsTable.tenantId, assignedTo: conversationsTable.assignedTo })
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

  if (!(await canAccessConversation(req, existing.tenantId, existing.id))) {
    res.status(403).json({ error: "Access denied to this conversation" });
    return;
  }

  const [conversation] = await db
    .update(conversationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(conversationsTable.id, existing.id))
    .returning();

  res.json(conversation);
});

router.patch("/conversations/:id/release-lock", async (req, res) => {
  const [existing] = await db
    .select({
      id: conversationsTable.id,
      tenantId: conversationsTable.tenantId,
      leadId: conversationsTable.leadId,
      assignedTo: conversationsTable.assignedTo,
    })
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

  if (!(await canAccessConversation(req, existing.tenantId, existing.id))) {
    res.status(403).json({ error: "Access denied — conversation not assigned to you" });
    return;
  }

  const [conversation] = await db
    .update(conversationsTable)
    .set({ currentAgent: null, updatedAt: new Date() })
    .where(eq(conversationsTable.id, existing.id))
    .returning();

  if (existing.leadId) {
    await db
      .update(leadsTable)
      .set({ activeAgentLock: null, updatedAt: new Date() })
      .where(eq(leadsTable.id, existing.leadId));
  }

  req.log.info(
    { conversationId: existing.id, leadId: existing.leadId },
    "conversations: human lock released — AI dispatch re-enabled"
  );

  res.json(conversation);
});

router.delete("/conversations/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: conversationsTable.id, tenantId: conversationsTable.tenantId, assignedTo: conversationsTable.assignedTo })
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

  if (!(await canAccessConversation(req, existing.tenantId, existing.id))) {
    res.status(403).json({ error: "Access denied to this conversation" });
    return;
  }

  await db.delete(conversationsTable).where(eq(conversationsTable.id, existing.id));

  res.status(204).send();
});

export default router;