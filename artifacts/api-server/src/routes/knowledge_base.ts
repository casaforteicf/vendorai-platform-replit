import { Router, IRouter } from "express";
import multer from "multer";
import {
  db,
  knowledgeBaseTable,
  insertKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
} from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { extractTextFromBuffer } from "../lib/document-extraction.js";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Texto muito grande além disso vira problema de token/custo no prompt do
// agente depois — corta com aviso em vez de deixar crescer sem limite.
const MAX_CONTEUDO_CHARS = 60_000;

// POST /tenants/:tenantId/knowledge-base/upload
// Recebe um arquivo (PDF, DOCX, TXT, MD ou imagem), extrai o texto e já cria
// a entrada na base de conhecimento — upload único, sem precisar digitar
// o conteúdo na mão.
router.post(
  "/tenants/:tenantId/knowledge-base/upload",
  upload.single("file"),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(422).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    let text: string;
    try {
      text = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname, tenantId);
    } catch (err) {
      req.log.error({ err, fileName: file.originalname }, "knowledge-base/upload: falha ao extrair texto");
      res.status(422).json({ error: "Não foi possível extrair texto desse arquivo" });
      return;
    }

    text = text.trim();
    if (!text) {
      res.status(422).json({ error: "Não encontramos texto legível nesse arquivo" });
      return;
    }
    if (text.length > MAX_CONTEUDO_CHARS) {
      text = text.slice(0, MAX_CONTEUDO_CHARS) + "\n[conteúdo truncado — arquivo muito grande]";
    }

    const tituloFallback = file.originalname.replace(/\.[^.]+$/, "");
    const parsed = insertKnowledgeBaseSchema.safeParse({
      tenantId,
      titulo: (req.body.titulo as string | undefined)?.trim() || tituloFallback,
      conteudo: text,
      categoria: (req.body.categoria as string | undefined)?.trim() || "Geral",
      tags: req.body.tags ? String(req.body.tags).split(",").map((t) => t.trim()).filter(Boolean) : [],
    });
    if (!parsed.success) {
      res.status(422).json({ error: "Validation error", details: parsed.error.issues });
      return;
    }

    const [row] = await db.insert(knowledgeBaseTable).values(parsed.data).returning();
    req.log.info({ tenantId, id: row.id, fileName: file.originalname, chars: text.length }, "knowledge-base: documento processado e salvo");
    res.status(201).json(row);
  }
);

// POST /knowledge-base
router.post("/knowledge-base", async (req, res) => {
  const parsed = insertKnowledgeBaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
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

  const [existing] = await db
    .select({ id: knowledgeBaseTable.id, tenantId: knowledgeBaseTable.tenantId })
    .from(knowledgeBaseTable)
    .where(eq(knowledgeBaseTable.id, id));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [row] = await db
    .update(knowledgeBaseTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(knowledgeBaseTable.id, existing.id))
    .returning();
  res.json(row);
});

// DELETE /knowledge-base/:id
router.delete("/knowledge-base/:id", async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ id: knowledgeBaseTable.id, tenantId: knowledgeBaseTable.tenantId })
    .from(knowledgeBaseTable)
    .where(eq(knowledgeBaseTable.id, id));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(knowledgeBaseTable).where(eq(knowledgeBaseTable.id, existing.id));
  res.status(204).send();
});

export default router;
