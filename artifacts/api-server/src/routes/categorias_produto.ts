import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  categoriasProdutoTable,
  produtosCatalogoTable,
  insertCategoriaProdutoSchema,
  updateCategoriaProdutoSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/tenants/:tenantId/categorias-produto", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const categorias = await db
    .select()
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.tenantId, String(tenantId)))
    .orderBy(categoriasProdutoTable.nome);
  res.json(categorias);
});

router.post("/tenants/:tenantId/categorias-produto", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = insertCategoriaProdutoSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [categoria] = await db.insert(categoriasProdutoTable).values(parsed.data).returning();
  res.status(201).json(categoria);
});

router.patch("/categorias-produto/:id", async (req, res) => {
  const parsed = updateCategoriaProdutoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: categoriasProdutoTable.id, tenantId: categoriasProdutoTable.tenantId })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [categoria] = await db
    .update(categoriasProdutoTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(categoriasProdutoTable.id, existing.id))
    .returning();

  res.json(categoria);
});

router.delete("/categorias-produto/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: categoriasProdutoTable.id, tenantId: categoriasProdutoTable.tenantId })
    .from(categoriasProdutoTable)
    .where(eq(categoriasProdutoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Products referencing this category fall back to categoriaId = null (0% ceiling unless product override).
  await db
    .update(produtosCatalogoTable)
    .set({ categoriaId: null })
    .where(eq(produtosCatalogoTable.categoriaId, existing.id));
  await db.delete(categoriasProdutoTable).where(eq(categoriasProdutoTable.id, existing.id));

  res.status(204).send();
});

export default router;
