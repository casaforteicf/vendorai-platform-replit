import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  produtosInternosTable,
  insertProdutoInternoSchema,
  updateProdutoInternoSchema,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/admin/produtos-internos", requireRole("super_admin"), async (_req, res) => {
  const produtos = await db
    .select()
    .from(produtosInternosTable)
    .orderBy(asc(produtosInternosTable.categoria), asc(produtosInternosTable.ordem));
  res.json(produtos);
});

// Compatibilidade com consumidores internos antigos: o catálogo comercial
// continua acessível por esta rota, mas exclusivamente para super_admin.
// Tenants não devem consultar nem receber os produtos comerciais internos.
router.get("/produtos-internos", requireRole("super_admin"), async (_req, res) => {
  const produtos = await db
    .select()
    .from(produtosInternosTable)
    .where(eq(produtosInternosTable.ativo, true))
    .orderBy(asc(produtosInternosTable.categoria), asc(produtosInternosTable.ordem));
  res.json(produtos);
});

router.post("/admin/produtos-internos", requireRole("super_admin"), async (req, res) => {
  const parsed = insertProdutoInternoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [produto] = await db.insert(produtosInternosTable).values(parsed.data).returning();
  res.status(201).json(produto);
});

router.patch("/admin/produtos-internos/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = updateProdutoInternoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [produto] = await db
    .update(produtosInternosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(produtosInternosTable.id, String(req.params.id)))
    .returning();
  if (!produto) {
    res.status(404).json({ error: "Produto not found" });
    return;
  }
  res.json(produto);
});

router.delete("/admin/produtos-internos/:id", requireRole("super_admin"), async (req, res) => {
  await db.delete(produtosInternosTable).where(eq(produtosInternosTable.id, String(req.params.id)));
  res.status(204).send();
});

export default router;
