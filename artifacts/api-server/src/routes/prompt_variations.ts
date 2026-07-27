import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  archPromptVariationsTable as promptVariationsTable,
  insertArchPromptVariationSchema as insertPromptVariationSchema,
  updateArchPromptVariationSchema as updatePromptVariationSchema,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

function getTenantId(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

// JWT payload stores the user PK under `sub`
function getUserId(req: Express.Request): string {
  return (req as any).user?.sub as string;
}

// GET /arch/prompt-variations — list all for this user
router.get("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = getTenantId(req);
  const uid = getUserId(req);
  try {
    const rows = await db
      .select()
      .from(promptVariationsTable)
      .where(
        and(
          eq(promptVariationsTable.tenantId, tid!),
          eq(promptVariationsTable.userId, uid),
        ),
      )
      .orderBy(desc(promptVariationsTable.savedAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list prompt variations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /arch/prompt-variations — create one
router.post("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = getTenantId(req);
  const uid = getUserId(req);
  const parsed = insertPromptVariationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }
  try {
    const [row] = await db
      .insert(promptVariationsTable)
      .values({ ...parsed.data, tenantId: tid, userId: uid })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create prompt variation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /arch/prompt-variations/:id — update name, notes, etc.
router.patch("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = getTenantId(req);
  const uid = getUserId(req);
  const id = req.params.id as string;
  const parsed = updatePromptVariationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }
  try {
    // Update only if id + tenant + user all match (least-privilege)
    const [row] = await (db as any)
      .update(promptVariationsTable)
      .set({ ...parsed.data, updatedAt: new Date() } as any)
      .where(
        and(
          eq(promptVariationsTable.id, id),
          eq(promptVariationsTable.tenantId, tid!),
          eq(promptVariationsTable.userId, uid),
        )!,
      )
      .returning();
    if (!row) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update prompt variation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /arch/prompt-variations/:id — delete one
router.delete("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = getTenantId(req);
  const uid = getUserId(req);
  const id = req.params.id as string;
  try {
    // Delete only if id + tenant + user all match (least-privilege)
    const [deleted] = await (db as any)
      .delete(promptVariationsTable)
      .where(
        and(
          eq(promptVariationsTable.id, id),
          eq(promptVariationsTable.tenantId, tid!),
          eq(promptVariationsTable.userId, uid),
        )!,
      )
      .returning({ id: promptVariationsTable.id });
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete prompt variation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /arch/prompt-variations/bulk — import multiple (used for localStorage migration)
router.post("/arch/prompt-variations/bulk", authenticate, async (req, res) => {
  const tid = getTenantId(req);
  const uid = getUserId(req);
  const { items } = req.body as { items: unknown[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  try {
    const rows = items
      .map(item => insertPromptVariationSchema.safeParse(item))
      .filter(r => r.success)
      .map(r => ({ ...(r as any).data, tenantId: tid, userId: uid }));

    if (rows.length === 0) {
      return res.status(400).json({ error: "No valid items to import" });
    }
    const inserted = await db
      .insert(promptVariationsTable)
      .values(rows)
      .onConflictDoNothing()
      .returning();
    return res.status(201).json({ imported: inserted.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk import prompt variations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
