import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  produtosCatalogoTable,
  insertProdutoCatalogoSchema,
  updateProdutoCatalogoSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/produtos-catalogo", async (req, res) => {
  const parsed = insertProdutoCatalogoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .insert(produtosCatalogoTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(product);
});

router.get("/tenants/:tenantId/produtos-catalogo", async (req, res) => {
  const products = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.tenantId, String(req.params.tenantId)))
    .orderBy(produtosCatalogoTable.nome);
  res.json(products);
});

router.get("/produtos-catalogo/:id", async (req, res) => {
  const [product] = await db
    .select()
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(product);
});

router.patch("/produtos-catalogo/:id", async (req, res) => {
  const parsed = updateProdutoCatalogoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .update(produtosCatalogoTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(produtosCatalogoTable.id, String(req.params.id)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(product);
});

router.delete("/produtos-catalogo/:id", async (req, res) => {
  const [deleted] = await db
    .delete(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)))
    .returning({ id: produtosCatalogoTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.status(204).send();
});

export default router;
