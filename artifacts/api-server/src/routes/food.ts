import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  foodCardapioItensTable,
  foodPedidosTable,
  foodPedidoItensTable,
  leadsTable,
  FOOD_PEDIDO_STATUS,
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

// ─── Cardápio ───────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/food/cardapio", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(foodCardapioItensTable.tenantId, tenantId)];
  if (req.query.disponivel === "true") filters.push(eq(foodCardapioItensTable.disponivel, true));
  if (req.query.categoria) filters.push(eq(foodCardapioItensTable.categoria, req.query.categoria as string));

  const rows = await db
    .select()
    .from(foodCardapioItensTable)
    .where(and(...filters))
    .orderBy(foodCardapioItensTable.categoria, foodCardapioItensTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/food/cardapio", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(foodCardapioItensTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/food/cardapio/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(foodCardapioItensTable)
    .set(req.body as any)
    .where(and(eq(foodCardapioItensTable.id, id), eq(foodCardapioItensTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Item de cardápio not found" });
  return res.json(row);
});

// Soft delete — disponivel = false (mantém histórico dos pedidos antigos
// que referenciam esse item)
router.delete("/tenants/:tenantId/food/cardapio/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(foodCardapioItensTable)
    .set({ disponivel: false })
    .where(and(eq(foodCardapioItensTable.id, id), eq(foodCardapioItensTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Item de cardápio not found" });
  return res.json(row);
});

// ─── Pedidos ────────────────────────────────────────────────────────────────
// Fluxo: recebido → preparando → pronto → (delivery: em_entrega →) entregue
//        | cancelado a qualquer momento

router.get("/tenants/:tenantId/food/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(foodPedidosTable.tenantId, tenantId)];
  if (req.query.status) filters.push(eq(foodPedidosTable.status, req.query.status as string));
  if (req.query.tipo) filters.push(eq(foodPedidosTable.tipo, req.query.tipo as string));

  const pedidos = await db
    .select()
    .from(foodPedidosTable)
    .where(and(...filters))
    .orderBy(foodPedidosTable.createdAt);

  if (!pedidos.length) return res.json([]);

  const pedidoIds = pedidos.map((p) => p.id);
  const todosItens = await db
    .select()
    .from(foodPedidoItensTable)
    .where(inArray(foodPedidoItensTable.pedidoId, pedidoIds));
  const itensPorPedido = new Map<string, typeof todosItens>();
  for (const item of todosItens) {
    const lista = itensPorPedido.get(item.pedidoId) ?? [];
    lista.push(item);
    itensPorPedido.set(item.pedidoId, lista);
  }

  const clienteIds = [...new Set(pedidos.map((p) => p.clienteId).filter(Boolean) as string[])];
  const clientes = clienteIds.length
    ? await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone })
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId))
    : [];
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  const result = pedidos.map((p) => ({
    ...p,
    itens: itensPorPedido.get(p.id) ?? [],
    cliente: p.clienteId ? clienteMap[p.clienteId] ?? null : null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/food/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, ...pedidoBody } = req.body as {
    itens?: { cardapioItemId?: string; nomeItem: string; precoUnitario: number; quantidade?: number; observacoes?: string }[];
    [key: string]: unknown;
  };

  if (!itens || !itens.length) {
    return res.status(422).json({ error: "O pedido precisa de pelo menos 1 item" });
  }

  const valorTotal = itens.reduce((sum, item) => sum + Number(item.precoUnitario) * (item.quantidade ?? 1), 0);

  const [pedido] = await db
    .insert(foodPedidosTable)
    .values({ ...pedidoBody, tenantId, valorTotal: valorTotal.toFixed(2) } as any)
    .returning();

  await db.insert(foodPedidoItensTable).values(
    itens.map((item) => ({
      pedidoId: pedido!.id,
      cardapioItemId: item.cardapioItemId ?? null,
      nomeItem: item.nomeItem,
      precoUnitario: String(item.precoUnitario),
      quantidade: item.quantidade ?? 1,
      observacoes: item.observacoes ?? null,
    })) as any
  );

  return res.status(201).json(pedido);
});

router.patch("/tenants/:tenantId/food/pedidos/:id/status", async (req, res) => {
  const tenantId = req.params.tenantId as string; // tenant-audit: reviewed — checado por canAccess() logo abaixo, mesmo padrão de servicos.ts/varejo.ts/etc.
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body as { status: string };
  if (!FOOD_PEDIDO_STATUS.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${FOOD_PEDIDO_STATUS.join(", ")}` });
  }

  const [row] = await db
    .update(foodPedidosTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(foodPedidosTable.id, id), eq(foodPedidosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });
  return res.json(row);
});

export default router;
