import { Router, type IRouter } from "express";
import { and, eq, desc, ilike } from "drizzle-orm";
import {
  db,
  farmaciaProdutoTable,
  farmaciaPedidoTable,
  farmaciaPedidoItemTable,
  leadsTable,
  receitasMedicasTable,
  insertReceitaMedicaSchema,
  updateReceitaMedicaSchema,
} from "@workspace/db";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Express.Request, tenantId: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || tid(req) === tenantId;
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/produtos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { categoria, destaque, q } = req.query;
  const conditions = [eq(farmaciaProdutoTable.tenantId, tenantId)];

  if (categoria) conditions.push(eq(farmaciaProdutoTable.categoria, categoria as any));
  if (destaque === "true") conditions.push(eq(farmaciaProdutoTable.destaqueWhatsapp, true));
  if (q) conditions.push(ilike(farmaciaProdutoTable.nome, `%${q}%`));

  const rows = await db.select().from(farmaciaProdutoTable)
    .where(and(...conditions))
    .orderBy(farmaciaProdutoTable.nome);
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/produtos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(farmaciaProdutoTable)
    .values({ ...req.body, tenantId })
    .returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.id, produtoId), eq(farmaciaProdutoTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Produto not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(farmaciaProdutoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(farmaciaProdutoTable.id, produtoId), eq(farmaciaProdutoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Produto not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.id, produtoId), eq(farmaciaProdutoTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Pedidos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(farmaciaPedidoTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(farmaciaPedidoTable.status, req.query.status as any));
  if (req.query.origem) conditions.push(eq(farmaciaPedidoTable.origem, req.query.origem as any));

  const rows = await db.select().from(farmaciaPedidoTable)
    .where(and(...conditions))
    .orderBy(desc(farmaciaPedidoTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, receitaUrl, ...pedidoData } = req.body;

  let valorTotal = 0;
  let temItemControlado = false;
  const itensMapped = (itens ?? []).map((item: any) => {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.precoUnitario);
    valorTotal += subtotal;
    if (item.exigeReceita) temItemControlado = true;
    return { ...item, subtotal: String(subtotal.toFixed(2)) };
  });

  // Validação real do setor: se tem item controlado e não veio receita
  // anexada, o pedido nasce preso em 'aguardando_receita' — não confirma
  // sozinho, mesmo que o resto do pedido esteja completo.
  const status = temItemControlado && !receitaUrl ? "aguardando_receita" : "aguardando_confirmacao";

  const [pedido] = await db.insert(farmaciaPedidoTable)
    .values({
      ...pedidoData,
      tenantId,
      valorTotal: String(valorTotal.toFixed(2)),
      temItemControlado,
      receitaUrl: receitaUrl ?? null,
      status,
    })
    .returning();

  if (itensMapped.length > 0) {
    await db.insert(farmaciaPedidoItemTable)
      .values(itensMapped.map((i: any) => ({ ...i, pedidoId: pedido.id })));
  }

  return res.status(201).json(pedido);
});

router.get("/tenants/:tenantId/farmacia/pedidos/:pedidoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [pedido] = await db.select().from(farmaciaPedidoTable)
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  const itens = await db.select().from(farmaciaPedidoItemTable)
    .where(eq(farmaciaPedidoItemTable.pedidoId, pedidoId));

  let leadNome: string | null = null;
  if (pedido.leadId) {
    const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable)
      .where(eq(leadsTable.id, pedido.leadId));
    leadNome = lead?.nome ?? null;
  }

  return res.json({ ...pedido, itens, leadNome });
});

router.put("/tenants/:tenantId/farmacia/pedidos/:pedidoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(farmaciaPedidoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });
  return res.json(row);
});

// Anexar receita — destrava pedido preso em 'aguardando_receita'.
router.post("/tenants/:tenantId/farmacia/pedidos/:pedidoId/anexar-receita", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { receitaUrl } = req.body as { receitaUrl?: string };
  if (!receitaUrl) return res.status(422).json({ error: "receitaUrl é obrigatório" });

  const [pedido] = await db.select().from(farmaciaPedidoTable)
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  const novoStatus = pedido.status === "aguardando_receita" ? "aguardando_confirmacao" : pedido.status;

  const [row] = await db.update(farmaciaPedidoTable)
    .set({ receitaUrl, status: novoStatus, updatedAt: new Date() })
    .where(eq(farmaciaPedidoTable.id, pedidoId))
    .returning();

  return res.json(row);
});

// ─── Receitas médicas ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/receitas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(receitasMedicasTable.tenantId, tenantId)];
  if (req.query.clienteId) conditions.push(eq(receitasMedicasTable.clienteId, String(req.query.clienteId)));
  if (req.query.status) conditions.push(eq(receitasMedicasTable.status, req.query.status as any));

  const rows = await db.select().from(receitasMedicasTable)
    .where(and(...conditions))
    .orderBy(desc(receitasMedicasTable.dataValidade));
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/receitas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertReceitaMedicaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.insert(receitasMedicasTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.patch("/farmacia/receitas/:id", async (req, res) => {
  const [existing] = await db.select({ tenantId: receitasMedicasTable.tenantId }).from(receitasMedicasTable).where(eq(receitasMedicasTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Receita not found" });
  if (!canAccess(req, existing.tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateReceitaMedicaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.update(receitasMedicasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(receitasMedicasTable.id, req.params.id as string))
    .returning();
  return res.json(row);
});

router.delete("/farmacia/receitas/:id", async (req, res) => {
  const [existing] = await db.select({ tenantId: receitasMedicasTable.tenantId }).from(receitasMedicasTable).where(eq(receitasMedicasTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Receita not found" });
  if (!canAccess(req, existing.tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(receitasMedicasTable).where(eq(receitasMedicasTable.id, req.params.id as string));
  return res.status(204).send();
});

export default router;
