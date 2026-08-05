import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  pacotesTable,
  pacoteItensTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  insertPacoteSchema,
  updatePacoteSchema,
  insertPacoteItemSchema,
  type Pacote,
} from "@workspace/db";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

/**
 * O pacote em si também vira 1 produto no catálogo genérico (visível no
 * Praça.ai, rastreável pelo Scout) — descrição lista os itens inclusos.
 */
async function syncPacoteToProdutoCatalogo(tenantId: string, pacote: Pacote): Promise<void> {
  const itens = await db.select({
    quantidade: pacoteItensTable.quantidade,
    nome: produtosCatalogoTable.nome,
  })
    .from(pacoteItensTable)
    .innerJoin(produtosCatalogoTable, eq(pacoteItensTable.produtoId, produtosCatalogoTable.id))
    .where(eq(pacoteItensTable.pacoteId, pacote.id));

  let [categoria] = await db.select().from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.tenantId, tenantId), eq(categoriasProdutoTable.nome, "Pacotes")));
  if (!categoria) {
    [categoria] = await db.insert(categoriasProdutoTable).values({ tenantId, nome: "Pacotes" }).returning();
  }

  const descricaoItens = itens.map((i) => `${i.quantidade > 1 ? `${i.quantidade}x ` : ""}${i.nome}`).join(" + ");
  const payload = {
    tenantId,
    nome: pacote.nome,
    descricao: [pacote.descricao, descricaoItens ? `Inclui: ${descricaoItens}` : null].filter(Boolean).join("\n\n") || null,
    categoriaId: categoria!.id,
    precoBase: String(pacote.precoPacote),
    ativo: pacote.ativo,
  };

  if (pacote.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set(payload).where(eq(produtosCatalogoTable.id, pacote.produtoCatalogoId));
  } else {
    const [criado] = await db.insert(produtosCatalogoTable).values(payload as any).returning();
    await db.update(pacotesTable).set({ produtoCatalogoId: criado!.id }).where(eq(pacotesTable.id, pacote.id));
  }
}

router.get("/tenants/:tenantId/pacotes", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const pacotes = await db.select().from(pacotesTable).where(eq(pacotesTable.tenantId, tenantId));
  const itensPorPacote = await Promise.all(
    pacotes.map(async (p) => ({
      ...p,
      itens: await db.select({
        id: pacoteItensTable.id,
        produtoId: pacoteItensTable.produtoId,
        quantidade: pacoteItensTable.quantidade,
        produtoNome: produtosCatalogoTable.nome,
      }).from(pacoteItensTable)
        .innerJoin(produtosCatalogoTable, eq(pacoteItensTable.produtoId, produtosCatalogoTable.id))
        .where(eq(pacoteItensTable.pacoteId, p.id)),
    })),
  );
  return res.json(itensPorPacote);
});

// Cria o pacote e já vincula os itens informados (produtoId + quantidade)
router.post("/tenants/:tenantId/pacotes", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, ...body } = req.body as { itens?: Array<{ produtoId: string; quantidade?: number }> };
  const parsed = insertPacoteSchema.safeParse({ ...body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });
  if (!itens || itens.length < 2) return res.status(422).json({ error: "Um pacote precisa de pelo menos 2 itens." });

  const [pacote] = await db.insert(pacotesTable).values(parsed.data).returning();

  for (const item of itens) {
    const parsedItem = insertPacoteItemSchema.safeParse({ pacoteId: pacote.id, produtoId: item.produtoId, quantidade: item.quantidade ?? 1 });
    if (parsedItem.success) await db.insert(pacoteItensTable).values(parsedItem.data);
  }

  await syncPacoteToProdutoCatalogo(tenantId, pacote);
  const [pacoteAtualizado] = await db.select().from(pacotesTable).where(eq(pacotesTable.id, pacote.id));
  return res.status(201).json(pacoteAtualizado);
});

router.patch("/pacotes/:id", async (req, res) => {
  const [existing] = await db.select().from(pacotesTable).where(eq(pacotesTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Pacote not found" });
  if (!canAccess(req, existing.tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, ...body } = req.body as { itens?: Array<{ produtoId: string; quantidade?: number }> };
  const parsed = updatePacoteSchema.safeParse(body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.update(pacotesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(pacotesTable.id, req.params.id as string))
    .returning();

  if (Array.isArray(itens)) {
    await db.delete(pacoteItensTable).where(eq(pacoteItensTable.pacoteId, row.id));
    for (const item of itens) {
      const parsedItem = insertPacoteItemSchema.safeParse({ pacoteId: row.id, produtoId: item.produtoId, quantidade: item.quantidade ?? 1 });
      if (parsedItem.success) await db.insert(pacoteItensTable).values(parsedItem.data);
    }
  }

  await syncPacoteToProdutoCatalogo(existing.tenantId, row);
  return res.json(row);
});

router.delete("/pacotes/:id", async (req, res) => {
  const [existing] = await db.select().from(pacotesTable).where(eq(pacotesTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Pacote not found" });
  if (!canAccess(req, existing.tenantId)) return res.status(403).json({ error: "Forbidden" });

  if (existing.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set({ ativo: false }).where(eq(produtosCatalogoTable.id, existing.produtoCatalogoId));
  }
  await db.delete(pacotesTable).where(eq(pacotesTable.id, req.params.id as string));
  return res.status(204).send();
});

export default router;
