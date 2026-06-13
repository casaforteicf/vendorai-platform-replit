import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import {
  db,
  messagesTable,
  insertMessageSchema,
  updateMessageSchema,
} from "@workspace/db";
import { maybeReanalyze } from "../lib/analyze-intelligence.js";

const router: IRouter = Router();

router.post("/messages", async (req, res): Promise<void> => {
  const parsed = insertMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(message);

  // Fire-and-forget: check whether this lead's intelligence is stale or has
  // accumulated enough new messages to warrant automatic re-analysis.
  maybeReanalyze({
    tenantId: parsed.data.tenantId,
    leadId:   parsed.data.leadId,
    log:      req.log,
  });
});

router.get(
  "/tenants/:tenantId/conversations/:conversationId/messages",
  async (req, res) => {
    const messages = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.tenantId, String(req.params.tenantId)),
          eq(messagesTable.conversationId, String(req.params.conversationId))
        )
      )
      .orderBy(asc(messagesTable.createdAt));

    res.json(messages);
  }
);

router.get("/tenants/:tenantId/messages", async (req, res) => {
  const { conversationId, leadId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(messagesTable.tenantId, String(req.params.tenantId))];
  if (conversationId) conditions.push(eq(messagesTable.conversationId, conversationId));
  if (leadId) conditions.push(eq(messagesTable.leadId, leadId));

  const messages = await db
    .select()
    .from(messagesTable)
    .where(and(...conditions))
    .orderBy(asc(messagesTable.createdAt));

  res.json(messages);
});

router.get("/messages/:id", async (req, res) => {
  const [message] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, String(req.params.id)));

  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  res.json(message);
});

router.patch("/messages/:id", async (req, res) => {
  const parsed = updateMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: messagesTable.id, tenantId: messagesTable.tenantId })
    .from(messagesTable)
    .where(eq(messagesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [message] = await db
    .update(messagesTable)
    .set(parsed.data)
    .where(eq(messagesTable.id, existing.id))
    .returning();

  res.json(message);
});

router.delete("/messages/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: messagesTable.id, tenantId: messagesTable.tenantId })
    .from(messagesTable)
    .where(eq(messagesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(messagesTable).where(eq(messagesTable.id, existing.id));

  res.status(204).send();
});

export default router;
