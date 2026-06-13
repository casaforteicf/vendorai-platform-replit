import { Router, IRouter } from "express";
import {
  db,
  knowledgeBaseTable,
  insertKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
} from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";

const router: IRouter = Router();

// POST /knowledge-base
router.post("/knowledge-base", async (req, res) => {
  const parsed = insertKnowledgeBaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }
  const [row] = await db.insert(knowledgeBaseTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// GET /tenants/:tenantId/knowledge-base  ?q=  ?categoria=  ?tags=
router.get("/tenants/:tenantId/knowledge-base", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { q, categoria, tags } = req.query as Record<string, string | undefined>;

  const conditions = [eq(knowledgeBaseTable.tenantId, tenantId)];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(ilike(knowledgeBaseTable.titulo, pattern), ilike(knowledgeBaseTable.conteudo, pattern))!);
  }

  if (categoria) {
    conditions.push(eq(knowledgeBaseTable.categoria, categoria));
  }

  if (tags) {
    // tags param: comma-separated list; match articles containing ALL specified tags
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      conditions.push(
        sql`${knowledgeBaseTable.tags}::jsonb @> ${JSON.stringify(tagList)}::jsonb`,
      );
    }
  }

  const rows = await db
    .select()
    .from(knowledgeBaseTable)
    .where(and(...conditions))
    .orderBy(knowledgeBaseTable.createdAt);

  res.json(rows);
});

// GET /knowledge-base/:id
router.get("/knowledge-base/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db
    .select()
    .from(knowledgeBaseTable)
    .where(eq(knowledgeBaseTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// PATCH /knowledge-base/:id
router.patch("/knowledge-base/:id", async (req, res) => {
  const id = String(req.params.id);
  const parsed = updateKnowledgeBaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .update(knowledgeBaseTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(knowledgeBaseTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /knowledge-base/:id
router.delete("/knowledge-base/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db
    .delete(knowledgeBaseTable)
    .where(eq(knowledgeBaseTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

export default router;
