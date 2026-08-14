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
  produtosCatalogoTable,
  categoriasProdutoTable,
  knowledgeBaseTable,
  tenantAgentConfigsTable,
  type FarmaciaProduto,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { searchBulaAnvisa, downloadBulaPdf } from "../lib/anvisaBulario.js";
import { extractTextFromBuffer } from "../lib/document-extraction.js";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Express.Request, tenantId: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || tid(req) === tenantId;
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

  const { itens, receitaUrl, receitaMedicaId, ...pedidoData } = req.body;

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

  const [pedido] = await db.insert(farmaciaPedidoTable)
    .values({
      ...pedidoData,
      tenantId,
      valorTotal: String(valorTotal.toFixed(2)),
      temItemControlado,
      receitaUrl: receitaUrl ?? null,
      receitaMedicaId: receitaValida ? receitaMedicaId : null,
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

// ─── Sincronização de bula (ANVISA Bulário) ───────────────────────────────────
//
// Busca a bula do produto no Bulário Eletrônico da ANVISA, extrai o texto do
// PDF e salva como item da Base de Conhecimento — vinculado automaticamente
// ao agente de farmácia (tenant_agent_configs.knowledgeBaseIds), pra ele
// passar a citar informação real da bula ao responder.
//
// Usa um endpoint não-documentado da ANVISA (ver lib/anvisaBulario.ts) — não
// rodar em lote sem antes confirmar que funciona pra 1-2 produtos reais.
router.post("/tenants/:tenantId/farmacia/produtos/:id/sincronizar-bula", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [produto] = await db.select().from(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.id, req.params.id as string), eq(farmaciaProdutoTable.tenantId, tenantId)));
  if (!produto) return res.status(404).json({ error: "Produto not found" });

  const resultados = await searchBulaAnvisa(produto.nome, logger);
  if (resultados === null) {
    return res.status(502).json({
      error: "Falha ao consultar o Bulário da ANVISA — ver logs do servidor para detalhes (endpoint não-oficial, formato pode ter mudado)",
    });
  }
  if (resultados.length === 0) {
    return res.status(404).json({ error: `Nenhuma bula encontrada na ANVISA para "${produto.nome}"` });
  }

  const bula = resultados[0]!;
  const pdfBuffer = await downloadBulaPdf(bula.id, logger);
  if (!pdfBuffer) {
    return res.status(502).json({ error: "Bula encontrada, mas o download do PDF falhou — ver logs do servidor" });
  }

  let texto: string;
  try {
    texto = await extractTextFromBuffer(pdfBuffer, "application/pdf", `bula-${produto.nome}.pdf`, tenantId);
  } catch (err) {
    logger.error({ err, produtoId: produto.id }, "farmacia: falha ao extrair texto da bula");
    return res.status(500).json({ error: "Falha ao extrair texto do PDF da bula" });
  }

  if (!texto?.trim()) {
    return res.status(502).json({ error: "PDF da bula baixado, mas sem texto extraível (pode ser um PDF escaneado/imagem)" });
  }

  const titulo = `Bula — ${bula.nomeProduto}`;

  // Upsert: se já existe um item de Base de Conhecimento pra esse produto
  // (mesmo título, mesmo tenant), atualiza em vez de duplicar.
  const [existingItem] = await db.select({ id: knowledgeBaseTable.id }).from(knowledgeBaseTable)
    .where(and(eq(knowledgeBaseTable.tenantId, tenantId), eq(knowledgeBaseTable.titulo, titulo)));

  let knowledgeItemId: string;
  if (existingItem) {
    await db.update(knowledgeBaseTable)
      .set({ conteudo: texto, ativo: true, updatedAt: new Date() })
      .where(eq(knowledgeBaseTable.id, existingItem.id));
    knowledgeItemId = existingItem.id;
  } else {
    const [criado] = await db.insert(knowledgeBaseTable).values({
      tenantId,
      titulo,
      conteudo: texto,
      categoria: "Bulário ANVISA",
      tags: ["bulario", "anvisa", "farmacia"],
      ativo: true,
    }).returning({ id: knowledgeBaseTable.id });
    knowledgeItemId = criado!.id;
  }

  // Vincula automaticamente ao agente de farmácia (append, sem duplicar).
  const [farmaciaCfg] = await db.select().from(tenantAgentConfigsTable)
    .where(and(eq(tenantAgentConfigsTable.tenantId, tenantId), eq(tenantAgentConfigsTable.agentKey, "farmacia")));

  const currentIds = ((farmaciaCfg?.knowledgeBaseIds ?? []) as string[]);
  if (!currentIds.includes(knowledgeItemId)) {
    const newIds = [...currentIds, knowledgeItemId];
    if (farmaciaCfg) {
      await db.update(tenantAgentConfigsTable)
        .set({ knowledgeBaseIds: newIds, updatedAt: new Date() })
        .where(eq(tenantAgentConfigsTable.id, farmaciaCfg.id));
    } else {
      await db.insert(tenantAgentConfigsTable).values({
        tenantId,
        agentKey: "farmacia",
        ativo: true,
        knowledgeBaseIds: newIds,
      });
    }
  }

  logger.info({ tenantId, produtoId: produto.id, knowledgeItemId }, "farmacia: bula sincronizada com sucesso");
  return res.json({ ok: true, knowledgeItemId, bulaEncontrada: bula.nomeProduto, tamanhoTexto: texto.length });
});

export default router;
