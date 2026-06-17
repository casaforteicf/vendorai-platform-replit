import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  produtosCatalogoTable,
  insertProdutoCatalogoSchema,
  updateProdutoCatalogoSchema,
  inventoryItemsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/produtos-catalogo", async (req, res) => {
  const parsed = insertProdutoCatalogoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
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

  const [existing] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [product] = await db
    .update(produtosCatalogoTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(produtosCatalogoTable.id, existing.id))
    .returning();

  res.json(product);
});

router.delete("/produtos-catalogo/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: produtosCatalogoTable.id, tenantId: produtosCatalogoTable.tenantId })
    .from(produtosCatalogoTable)
    .where(eq(produtosCatalogoTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Delete inventory items first (FK restrict → cascade in DB not yet applied)
  await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.produtoId, existing.id));
  await db.delete(produtosCatalogoTable).where(eq(produtosCatalogoTable.id, existing.id));

  res.status(204).send();
});

export default router;
