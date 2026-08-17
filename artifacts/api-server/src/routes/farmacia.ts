import { Router, type IRouter } from "express";
import { and, eq, desc, ilike, notInArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  farmaciaProdutoTable,
  farmaciaPedidoTable,
  farmaciaPedidoItemTable,
  leadsTable,
  dealsTable,
  scoutOportunidadesTable,
  receitasMedicasTable,
  insertReceitaMedicaSchema,
  updateReceitaMedicaSchema,
  produtosCatalogoTable,
  categoriasProdutoTable,
  type FarmaciaProduto,
} from "@workspace/db";
import { reconcileScoutOnDealWon } from "../services/revenueScout.js";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Express.Request, tenantId: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || tid(req) === tenantId;
}

type PharmacyOrderStatus = typeof farmaciaPedidoTable.$inferSelect.status;

function dealStageForPharmacyStatus(status: PharmacyOrderStatus) {
  switch (status) {
    case "aguardando_confirmacao":
    case "aguardando_receita":
      return "qualificado" as const;
    case "confirmado":
      return "ganho" as const;
    case "em_separacao":
    case "saiu_para_entrega":
      return "em_execucao" as const;
    case "entregue":
      return "entregue" as const;
    case "cancelado":
      return "perdido" as const;
  }
}

async function syncPharmacyOrderRelations(
  order: typeof farmaciaPedidoTable.$inferSelect,
  previousStatus: PharmacyOrderStatus | null,
  log: Logger,
) {
  if (!order.dealId) return;

  const etapa = dealStageForPharmacyStatus(order.status);
  const now = new Date();
  await db.update(dealsTable).set({
    etapa,
    valor: order.valorTotal,
    ...(etapa === "ganho" ? { wonAt: now, dataFechamento: now, tipoFechamento: "pedido" as const } : {}),
    ...(etapa === "perdido" ? { lostAt: now, lostReason: "pedido_farmacia_cancelado" } : {}),
    updatedAt: now,
  }).where(and(eq(dealsTable.id, order.dealId), eq(dealsTable.tenantId, order.tenantId)));

  if (order.scoutOportunidadeId) {
    await db.update(scoutOportunidadesTable).set({
      dealId: order.dealId,
      ...(order.status === "confirmado" || order.status === "entregue"
        ? { status: "converteu", converteu: true }
        : {}),
    }).where(and(
      eq(scoutOportunidadesTable.id, order.scoutOportunidadeId),
      eq(scoutOportunidadesTable.tenantId, order.tenantId),
    ));
  } else if (order.leadId && order.status === "confirmado" && previousStatus !== "confirmado") {
    await reconcileScoutOnDealWon({
      tenantId: order.tenantId,
      leadId: order.leadId,
      dealId: order.dealId,
      log,
    });
  }
}

/** Sincroniza produto de farmácia com o catálogo genérico (Praça.ai/Scout). */
async function syncFarmaciaProdutoToProdutoCatalogo(tenantId: string, produto: FarmaciaProduto): Promise<void> {
  let [categoria] = await db.select().from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.tenantId, tenantId), eq(categoriasProdutoTable.nome, "Farmácia")));
  if (!categoria) {
    [categoria] = await db.insert(categoriasProdutoTable).values({ tenantId, nome: "Farmácia" }).returning();
  }

  const payload = {
    tenantId,
    nome: produto.nome,
    descricao: produto.descricao,
    categoriaId: categoria!.id,
    sku: produto.erpId ?? undefined,
    precoBase: String(produto.precoPromocional ?? produto.precoVenda),
    imagemUrl: produto.imagemUrl,
    estoqueQuantidade: produto.estoque,
    ativo: produto.ativo && produto.estoque > 0,
  };

  if (produto.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set(payload as any).where(eq(produtosCatalogoTable.id, produto.produtoCatalogoId));
  } else {
    const [criado] = await db.insert(produtosCatalogoTable).values(payload as any).returning();
    await db.update(farmaciaProdutoTable).set({ produtoCatalogoId: criado!.id }).where(eq(farmaciaProdutoTable.id, produto.id));
  }
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
  await syncFarmaciaProdutoToProdutoCatalogo(tenantId, row);
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
  await syncFarmaciaProdutoToProdutoCatalogo(tenantId, row);
  return res.json(row);
});

router.delete("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select({ produtoCatalogoId: farmaciaProdutoTable.produtoCatalogoId })
    .from(farmaciaProdutoTable).where(eq(farmaciaProdutoTable.id, produtoId));
  if (existing?.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set({ ativo: false }).where(eq(produtosCatalogoTable.id, existing.produtoCatalogoId));
  }

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

  const {
    itens,
    receitaUrl,
    receitaMedicaId,
    dealId: requestedDealId,
    scoutOportunidadeId: requestedScoutId,
    ...pedidoData
  } = req.body;

  let valorTotal = 0;
  let temItemControlado = false;
  const itensMapped = (itens ?? []).map((item: any) => {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.precoUnitario);
    valorTotal += subtotal;
    if (item.exigeReceita) temItemControlado = true;
    return { ...item, subtotal: String(subtotal.toFixed(2)) };
  });

  // Receita estruturada (validade/tipo/médico) também satisfaz a
  // exigência — precisa estar ativa, não vencida, e ser do mesmo cliente.
  let receitaValida = false;
  if (receitaMedicaId) {
    const [receita] = await db.select().from(receitasMedicasTable)
      .where(and(eq(receitasMedicasTable.id, receitaMedicaId), eq(receitasMedicasTable.tenantId, tenantId)));
    receitaValida = !!receita
      && receita.status === "ativa"
      && receita.clienteId === pedidoData.leadId
      && receita.dataValidade.getTime() >= Date.now();
  }

  // Validação real do setor: se tem item controlado e não veio nem foto
  // anexada nem receita estruturada válida, o pedido nasce preso em
  // 'aguardando_receita' — não confirma sozinho, mesmo que o resto do
  // pedido esteja completo.
  const status = temItemControlado && !receitaUrl && !receitaValida ? "aguardando_receita" : "aguardando_confirmacao";

  let linkedDealId: string | null = null;
  let linkedScoutId: string | null = null;
  let leadNome = "Cliente";

  if (pedidoData.leadId) {
    const [lead] = await db.select({ id: leadsTable.id, nome: leadsTable.nome })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, pedidoData.leadId), eq(leadsTable.tenantId, tenantId)));
    if (!lead) return res.status(422).json({ error: "Lead não pertence a este tenant." });
    leadNome = lead.nome;

    if (requestedDealId) {
      const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
        .where(and(
          eq(dealsTable.id, requestedDealId),
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.leadId, pedidoData.leadId),
        ));
      if (!deal) return res.status(422).json({ error: "Negócio inválido ou vinculado a outro cliente." });
      linkedDealId = deal.id;
    } else {
      const [activeDeal] = await db.select({ id: dealsTable.id }).from(dealsTable)
        .where(and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.leadId, pedidoData.leadId),
          ilike(dealsTable.titulo, "Pedido Farmácia%"),
          notInArray(dealsTable.etapa, ["ganho", "entregue", "perdido"]),
        ))
        .orderBy(desc(dealsTable.createdAt))
        .limit(1);

      if (activeDeal) {
        linkedDealId = activeDeal.id;
      } else {
        const [createdDeal] = await db.insert(dealsTable).values({
          tenantId,
          leadId: pedidoData.leadId,
          titulo: `Pedido Farmácia — ${leadNome}`,
          valor: String(valorTotal.toFixed(2)),
          etapa: "qualificado",
          probabilidade: 60,
          tipoFechamento: "pedido",
        }).returning({ id: dealsTable.id });
        linkedDealId = createdDeal!.id;
      }
    }

    if (requestedScoutId) {
      const [scout] = await db.select({ id: scoutOportunidadesTable.id }).from(scoutOportunidadesTable)
        .where(and(
          eq(scoutOportunidadesTable.id, requestedScoutId),
          eq(scoutOportunidadesTable.tenantId, tenantId),
          eq(scoutOportunidadesTable.clienteId, pedidoData.leadId),
        ));
      if (!scout) return res.status(422).json({ error: "Oportunidade do Revenue Scout inválida ou de outro cliente." });
      linkedScoutId = scout.id;
    }
  } else if (requestedDealId || requestedScoutId) {
    return res.status(422).json({ error: "leadId é obrigatório para vincular Negócios ou Revenue Scout." });
  }

  const [pedido] = await db.insert(farmaciaPedidoTable)
    .values({
      ...pedidoData,
      tenantId,
      valorTotal: String(valorTotal.toFixed(2)),
      temItemControlado,
      receitaUrl: receitaUrl ?? null,
      receitaMedicaId: receitaValida ? receitaMedicaId : null,
      dealId: linkedDealId,
      scoutOportunidadeId: linkedScoutId,
      status,
    })
    .returning();

  if (itensMapped.length > 0) {
    await db.insert(farmaciaPedidoItemTable)
      .values(itensMapped.map((i: any) => ({ ...i, pedidoId: pedido.id })));
  }

  // Receita usada num pedido confirmado passa pra "utilizada" — mesma
  // ideia de "Marcar utilizada" que já existia na tela, só que automático.
  if (receitaValida) {
    await db.update(receitasMedicasTable).set({ status: "utilizada", updatedAt: new Date() }).where(eq(receitasMedicasTable.id, receitaMedicaId));
  }

  await syncPharmacyOrderRelations(pedido, null, req.log);

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

  const [existing] = await db.select().from(farmaciaPedidoTable)
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)));
  if (!existing) return res.status(404).json({ error: "Pedido not found" });

  // A validação clínica nunca pode ser contornada por uma mudança manual de
  // status ou pela pipeline comercial.
  if (existing.temItemControlado && !existing.receitaUrl && !existing.receitaMedicaId && req.body.status !== "aguardando_receita" && req.body.status !== "cancelado") {
    return res.status(422).json({ error: "Pedido controlado permanece bloqueado até receber receita válida." });
  }

  const [row] = await db.update(farmaciaPedidoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });
  await syncPharmacyOrderRelations(row, existing.status, req.log);
  return res.json(row);
});

// Anexar receita — destrava pedido preso em 'aguardando_receita'.
router.post("/tenants/:tenantId/farmacia/pedidos/:pedidoId/anexar-receita", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { receitaUrl, receitaMedicaId } = req.body as { receitaUrl?: string; receitaMedicaId?: string };
  if (!receitaUrl && !receitaMedicaId) return res.status(422).json({ error: "receitaUrl ou receitaMedicaId é obrigatório" });

  const [pedido] = await db.select().from(farmaciaPedidoTable)
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  let receitaValida = false;
  if (receitaMedicaId) {
    const [receita] = await db.select().from(receitasMedicasTable)
      .where(and(eq(receitasMedicasTable.id, receitaMedicaId), eq(receitasMedicasTable.tenantId, tenantId)));
    receitaValida = !!receita
      && receita.status === "ativa"
      && receita.clienteId === pedido.leadId
      && receita.dataValidade.getTime() >= Date.now();
    if (!receitaValida) return res.status(422).json({ error: "Receita inválida, vencida ou de outro cliente." });
  }

  const novoStatus = pedido.status === "aguardando_receita" ? "aguardando_confirmacao" : pedido.status;

  const [row] = await db.update(farmaciaPedidoTable)
    .set({
      ...(receitaUrl ? { receitaUrl } : {}),
      ...(receitaValida ? { receitaMedicaId } : {}),
      status: novoStatus,
      updatedAt: new Date(),
    })
    .where(eq(farmaciaPedidoTable.id, pedidoId))
    .returning();

  if (receitaValida) {
    await db.update(receitasMedicasTable).set({ status: "utilizada", updatedAt: new Date() }).where(eq(receitasMedicasTable.id, receitaMedicaId!));
  }

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
