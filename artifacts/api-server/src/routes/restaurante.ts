import { Router, type IRouter } from "express";
import { and, eq, desc, ilike } from "drizzle-orm";
import {
  db,
  restauranteCardapioTable,
  restaurantePedidoTable,
  restaurantePedidoItemTable,
  leadsTable,
} from "@workspace/db";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Express.Request, tenantId: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || tid(req) === tenantId;
}

// ─── Cardápio ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/restaurante/cardapio", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { categoria, destaque, q } = req.query;
  const conditions = [eq(restauranteCardapioTable.tenantId, tenantId)];

  if (categoria) conditions.push(eq(restauranteCardapioTable.categoria, categoria as any));
  if (destaque === "true") conditions.push(eq(restauranteCardapioTable.destaqueWhatsapp, true));
  if (q) conditions.push(ilike(restauranteCardapioTable.nome, `%${q}%`));

  const rows = await db.select().from(restauranteCardapioTable)
    .where(and(...conditions))
    .orderBy(restauranteCardapioTable.nome);
  return res.json(rows);
});

router.post("/tenants/:tenantId/restaurante/cardapio", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(restauranteCardapioTable)
    .values({ ...req.body, tenantId })
    .returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/restaurante/cardapio/:itemId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const itemId = req.params.itemId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(restauranteCardapioTable)
    .where(and(eq(restauranteCardapioTable.id, itemId), eq(restauranteCardapioTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Item do cardápio not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/restaurante/cardapio/:itemId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const itemId = req.params.itemId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(restauranteCardapioTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(restauranteCardapioTable.id, itemId), eq(restauranteCardapioTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Item do cardápio not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/restaurante/cardapio/:itemId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const itemId = req.params.itemId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(restauranteCardapioTable)
    .where(and(eq(restauranteCardapioTable.id, itemId), eq(restauranteCardapioTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Pedidos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/restaurante/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(restaurantePedidoTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(restaurantePedidoTable.status, req.query.status as any));
  if (req.query.origem) conditions.push(eq(restaurantePedidoTable.origem, req.query.origem as any));

  const rows = await db.select().from(restaurantePedidoTable)
    .where(and(...conditions))
    .orderBy(desc(restaurantePedidoTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/restaurante/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, origem, numeroMesa, ...pedidoData } = req.body;

  // Pedido de mesa exige número da mesa — os outros (whatsapp/app/balcao)
  // não fazem sentido sem endereço de entrega ou retirada no balcão.
  if (origem === "mesa" && !numeroMesa) {
    return res.status(422).json({ error: "numeroMesa é obrigatório pra pedido de mesa" });
  }

  let valorTotal = 0;
  let tempoEstimadoMinutos = 0;
  const itensMapped = (itens ?? []).map((item: any) => {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.precoUnitario);
    valorTotal += subtotal;
    tempoEstimadoMinutos = Math.max(tempoEstimadoMinutos, item.tempoPreparoMinutos ?? 20);
    return { ...item, subtotal: String(subtotal.toFixed(2)) };
  });

  const [pedido] = await db.insert(restaurantePedidoTable)
    .values({
      ...pedidoData,
      tenantId,
      origem: origem ?? "whatsapp",
      numeroMesa: numeroMesa ?? null,
      valorTotal: String(valorTotal.toFixed(2)),
      tempoEstimadoMinutos: tempoEstimadoMinutos || null,
    })
    .returning();

  if (itensMapped.length > 0) {
    await db.insert(restaurantePedidoItemTable)
      .values(itensMapped.map((i: any) => ({ ...i, pedidoId: pedido.id })));
  }

  return res.status(201).json(pedido);
});

router.get("/tenants/:tenantId/restaurante/pedidos/:pedidoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [pedido] = await db.select().from(restaurantePedidoTable)
    .where(and(eq(restaurantePedidoTable.id, pedidoId), eq(restaurantePedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  const itens = await db.select().from(restaurantePedidoItemTable)
    .where(eq(restaurantePedidoItemTable.pedidoId, pedidoId));

  let leadNome: string | null = null;
  if (pedido.leadId) {
    const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable)
      .where(eq(leadsTable.id, pedido.leadId));
    leadNome = lead?.nome ?? null;
  }

  return res.json({ ...pedido, itens, leadNome });
});

router.put("/tenants/:tenantId/restaurante/pedidos/:pedidoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(restaurantePedidoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(restaurantePedidoTable.id, pedidoId), eq(restaurantePedidoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });
  return res.json(row);
});

export default router;
