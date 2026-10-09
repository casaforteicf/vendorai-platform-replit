import { Router } from "express";
import { and, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  archMarketplaceItemsTable,
  arqdorMarketDemandasTable,
  arqdorMarketConvitesTable,
  arqdorMarketPropostasTable,
  archProjetosTable,
  obrasTable,
  notificationsTable,
  tenantsTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  obraCotacoesTable,
  obraCotacaoItensTable,
  obraCotacaoPropostasTable,
  obraCotacaoPropostaItensTable,
  obraCotacaoSelecoesTable,
  arqdorMarketProtecoesTenantTable,
  insertArqdorMarketProtecaoTenantSchema,
  insertArqdorMarketDemandaSchema,
  insertArqdorMarketPropostaSchema,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { vendorPool } from "../lib/vendorDb.js";
import {
  evaluateMarketProtection,
  loadTenantMarketProtectionRules,
  normalizeMarketProtectionValue,
} from "../lib/arqdor-market-protection.js";

const router = Router();

function currentTenantId(req: any): string | null {
  return req?.tenant?.id ?? req?.user?.tenantId ?? null;
}

function currentUserId(req: any): string | null {
  return req?.user?.id ?? req?.user?.sub ?? null;
}

function canManageMarketProtection(req: any): boolean {
  const role = String(req?.user?.platformRole ?? "");
  const fn = String(req?.user?.userFunction ?? "");
  return role === "super_admin" || role === "tenant_admin" || fn === "administrador";
}

async function assertSourceOwnership(input: {
  tenantId: string;
  projetoId?: string | null;
  obraId?: string | null;
}) {
  if (input.projetoId) {
    const [project] = await db
      .select({ id: archProjetosTable.id })
      .from(archProjetosTable)
      .where(and(eq(archProjetosTable.id, input.projetoId), eq(archProjetosTable.tenantId, input.tenantId)))
      .limit(1);
    if (!project) return { ok: false as const, error: "Projeto não encontrado neste tenant." };
  }
  if (input.obraId) {
    const [work] = await db
      .select({ id: obrasTable.id })
      .from(obrasTable)
      .where(and(eq(obrasTable.id, input.obraId), eq(obrasTable.tenantId, input.tenantId)))
      .limit(1);
    if (!work) return { ok: false as const, error: "Obra não encontrada neste tenant." };
  }
  return { ok: true as const };
}

async function notifyTenant(tenantId: string, title: string, message: string) {
  await db.insert(notificationsTable).values({
    tenantId,
    title,
    message,
    type: "info",
    category: "general",
  });
}

async function syncSelectedMarketProposalToBudget(input: {
  demanda: typeof arqdorMarketDemandasTable.$inferSelect;
  proposta: typeof arqdorMarketPropostasTable.$inferSelect;
  buyerTenantId: string;
  buyerUserId: string | null;
}) {
  const { demanda, proposta, buyerTenantId, buyerUserId } = input;
  if (!demanda.obraId || !demanda.orcamentoId) {
    return { synced: false, reason: "Demanda sem obra/orçamento vinculado." };
  }

  const [budget] = await db
    .select()
    .from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, demanda.orcamentoId),
      eq(obraOrcamentosTable.obraId, demanda.obraId),
      eq(obraOrcamentosTable.tenantId, buyerTenantId),
    ))
    .limit(1);
  if (!budget) return { synced: false, reason: "Orçamento de origem não encontrado." };

  const marker = `ARQDOR_MARKET_DEMANDA:${demanda.id}`;
  const existingQuotes = await db
    .select()
    .from(obraCotacoesTable)
    .where(and(
      eq(obraCotacoesTable.tenantId, buyerTenantId),
      eq(obraCotacoesTable.orcamentoId, budget.id),
    ));
  let cotacao = existingQuotes.find((row) => String(row.observacoes ?? "").includes(marker)) ?? null;

  if (!cotacao) {
    [cotacao] = await db.insert(obraCotacoesTable).values({
      tenantId: buyerTenantId,
      orcamentoId: budget.id,
      titulo: `Arqdor Market — ${demanda.titulo}`,
      status: "em_analise",
      dataNecessidade: demanda.dataNecessidade ? demanda.dataNecessidade.toISOString().slice(0, 10) : null,
      prazoResposta: demanda.prazoResposta ? demanda.prazoResposta.toISOString().slice(0, 10) : null,
      observacoes: `${marker}\nOrigem automática do Arqdor Market. Valores internos do orçamento não foram publicados.`,
      criadoPorId: buyerUserId,
    }).returning();

    const stages = await db
      .select()
      .from(obraOrcamentoEtapasTable)
      .where(eq(obraOrcamentoEtapasTable.orcamentoId, budget.id));
    const stageIds = stages.map((row) => row.id);
    const budgetItems = stageIds.length
      ? await db.select().from(obraOrcamentoItensTable).where(inArray(obraOrcamentoItensTable.etapaId, stageIds))
      : [];

    const scopedItems = demanda.orcamentoItemId
      ? budgetItems.filter((row) => row.id === demanda.orcamentoItemId)
      : budgetItems;

    if (scopedItems.length > 0) {
      await db.insert(obraCotacaoItensTable).values(scopedItems.map((item) => ({
        cotacaoId: cotacao!.id,
        orcamentoItemId: item.id,
        orcamentoEtapaId: item.etapaId,
        insumoId: item.insumoId ?? null,
        nome: item.nome,
        quantidadeTecnica: String(item.quantidadeTecnica ?? item.quantidade),
        unidadeTecnica: item.unidade,
        quantidadeCompra: item.quantidadeCompra == null ? null : String(item.quantidadeCompra),
        unidadeCompra: item.unidadeCompra ?? item.unidade,
        coberturaStatus: "nao_cotado",
        observacoes: "Gerado a partir da necessidade publicada no Arqdor Market.",
      })));
    }
  }

  const proposals = await db
    .select()
    .from(obraCotacaoPropostasTable)
    .where(eq(obraCotacaoPropostasTable.cotacaoId, cotacao.id));
  let quoteProposal = proposals.find((row) => (row.metadata as any)?.arqdorMarketProposalId === proposta.id) ?? null;

  const [supplier] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, proposta.fornecedorTenantId))
    .limit(1);

  if (!quoteProposal) {
    [quoteProposal] = await db.insert(obraCotacaoPropostasTable).values({
      cotacaoId: cotacao.id,
      fornecedorId: null,
      fornecedorNomeSnapshot: supplier?.name ?? "Fornecedor Arqdor Market",
      validadeAte: proposta.validadeAte ? proposta.validadeAte.toISOString().slice(0, 10) : null,
      prazoEntregaDias: proposta.prazoEntregaDias,
      condicaoPagamento: proposta.condicaoPagamento,
      freteValor: String(proposta.frete ?? 0),
      impostosValor: String(proposta.impostos ?? 0),
      descontoValor: String(proposta.desconto ?? 0),
      valorTotalInformado: proposta.valorTotal == null ? null : String(proposta.valorTotal),
      origemFormato: "api",
      status: "selecionada",
      observacoes: proposta.observacoes,
      metadata: {
        origem: "arqdor_market",
        arqdorMarketDemandaId: demanda.id,
        arqdorMarketProposalId: proposta.id,
        fornecedorTenantId: proposta.fornecedorTenantId,
      },
    }).returning();
  }

  const quoteItems = await db
    .select()
    .from(obraCotacaoItensTable)
    .where(eq(obraCotacaoItensTable.cotacaoId, cotacao.id));

  const proposalItems = Array.isArray(proposta.itens) ? proposta.itens : [];
  const createdProposalItems: Array<{ id: string; cotacaoItemId: string | null; quantidade: number; total: number }> = [];

  for (const marketItem of proposalItems) {
    const direct = demanda.orcamentoItemId
      ? quoteItems.find((row) => row.orcamentoItemId === demanda.orcamentoItemId)
      : quoteItems.length === 1 ? quoteItems[0] : null;

    const quantity = Number(marketItem.quantidade ?? demanda.quantidade ?? 0);
    const unitTotal = Number(marketItem.valorTotal ?? 0);
    const unitPrice = Number(marketItem.valorUnitario ?? (quantity > 0 ? unitTotal / quantity : 0));

    const [created] = await db.insert(obraCotacaoPropostaItensTable).values({
      propostaId: quoteProposal.id,
      cotacaoItemId: direct?.id ?? null,
      descricaoFornecedor: marketItem.descricao,
      marca: marketItem.marca ?? null,
      modelo: marketItem.modelo ?? null,
      especificacao: marketItem.especificacoes ? JSON.stringify(marketItem.especificacoes) : null,
      quantidadeOfertada: String(Math.max(0, quantity)),
      unidadeFornecedor: marketItem.unidade ?? demanda.unidade ?? direct?.unidadeCompra ?? direct?.unidadeTecnica ?? "un",
      precoUnitarioFornecedor: String(Math.max(0, unitPrice)),
      precoUnitarioNormalizado: direct ? String(Math.max(0, unitPrice)) : null,
      quantidadeCompraNormalizada: direct ? String(Math.max(0, quantity)) : null,
      valorTotalLinha: String(Math.max(0, unitTotal)),
      prazoEntregaDias: proposta.prazoEntregaDias,
      coberturaStatus: direct ? "coberto" : "ambigua",
      reconciliacaoConfianca: direct ? "100" : null,
      selecionado: Boolean(direct),
      motivoSelecao: direct ? "Proposta selecionada no Arqdor Market." : null,
      metadata: {
        origem: "arqdor_market",
        marketProposalId: proposta.id,
        requerReconciliacao: !direct,
      },
    }).returning();

    createdProposalItems.push({
      id: created.id,
      cotacaoItemId: created.cotacaoItemId,
      quantidade,
      total: unitTotal,
    });
  }

  for (const item of createdProposalItems) {
    if (!item.cotacaoItemId) continue;
    const quoteItem = quoteItems.find((row) => row.id === item.cotacaoItemId);
    if (!quoteItem) continue;
    const needed = Number(quoteItem.quantidadeCompra ?? quoteItem.quantidadeTecnica ?? 0);
    const selectedQty = Math.min(Math.max(0, item.quantidade || needed), needed || Math.max(0, item.quantidade));
    if (selectedQty <= 0) continue;
    const cost = item.quantidade > 0 ? (item.total / item.quantidade) * selectedQty : item.total;
    await db.insert(obraCotacaoSelecoesTable).values({
      cotacaoItemId: quoteItem.id,
      propostaItemId: item.id,
      quantidadeSelecionada: String(selectedQty),
      custoSelecionado: String(Math.max(0, cost)),
      principal: true,
      criadoPorId: buyerUserId,
    });
    await db.update(obraCotacaoItensTable)
      .set({ coberturaStatus: selectedQty >= needed ? "coberto" : "parcial" })
      .where(eq(obraCotacaoItensTable.id, quoteItem.id));
  }

  await db.update(obraCotacoesTable)
    .set({
      status: createdProposalItems.some((row) => !row.cotacaoItemId) ? "em_analise" : "selecionada",
      updatedAt: new Date(),
    })
    .where(eq(obraCotacoesTable.id, cotacao.id));

  return {
    synced: true,
    cotacaoId: cotacao.id,
    propostaCotacaoId: quoteProposal.id,
    requiresReconciliation: createdProposalItems.some((row) => !row.cotacaoItemId),
  };
}

router.get("/arch/market/contexto", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const busca = typeof req.query.busca === "string" ? req.query.busca.trim() : "";
  const categoria = typeof req.query.categoria === "string" ? req.query.categoria.trim() : "";
  const limit = Math.min(Math.max(Number(req.query.limit ?? 60) || 60, 1), 100);

  const conditions = [eq(archMarketplaceItemsTable.ativo, true)];
  if (busca) {
    conditions.push(or(
      ilike(archMarketplaceItemsTable.nome, `%${busca}%`),
      ilike(archMarketplaceItemsTable.descricao, `%${busca}%`),
      ilike(archMarketplaceItemsTable.categoria, `%${busca}%`),
    )!);
  }
  if (categoria) conditions.push(ilike(archMarketplaceItemsTable.categoria, `%${categoria}%`));

  // Busca uma janela maior antes de aplicar a política comercial do tenant.
  // Isso evita que itens do próprio parceiro (necessários em modo exclusivo/
  // preferencial) sejam eliminados antes do filtro contextual.
  const rawRows = await db
    .select({
      id: archMarketplaceItemsTable.id,
      masterProductId: archMarketplaceItemsTable.masterProductId,
      vendedorTenantId: archMarketplaceItemsTable.vendedorTenantId,
      nome: archMarketplaceItemsTable.nome,
      descricao: archMarketplaceItemsTable.descricao,
      categoria: archMarketplaceItemsTable.categoria,
      preco: archMarketplaceItemsTable.preco,
      imagens: archMarketplaceItemsTable.imagens,
      especificacoes: archMarketplaceItemsTable.especificacoes,
      totalVendas: archMarketplaceItemsTable.totalVendas,
      createdAt: archMarketplaceItemsTable.createdAt,
      empresaNome: tenantsTable.name,
      empresaSlug: tenantsTable.slug,
      empresaVertical: tenantsTable.vertical,
    })
    .from(archMarketplaceItemsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, archMarketplaceItemsTable.vendedorTenantId))
    .where(and(...conditions))
    .orderBy(desc(archMarketplaceItemsTable.totalVendas), desc(archMarketplaceItemsTable.createdAt))
    .limit(Math.min(Math.max(limit * 4, 120), 400));

  const protectionRules = await loadTenantMarketProtectionRules(tenantId);
  const evaluatedRows = rawRows
    .map((row) => ({
      row,
      decision: evaluateMarketProtection({
        vendedorTenantId: row.vendedorTenantId,
        categoria: row.categoria,
        nome: row.nome,
        especificacoes: (row.especificacoes ?? {}) as Record<string, unknown>,
      }, tenantId, protectionRules),
    }))
    .filter(({ decision }) => decision.incluir)
    .sort((a, b) => {
      if (b.decision.boost !== a.decision.boost) return b.decision.boost - a.decision.boost;
      const salesDiff = Number(b.row.totalVendas ?? 0) - Number(a.row.totalVendas ?? 0);
      if (salesDiff !== 0) return salesDiff;
      return new Date(String(b.row.createdAt)).getTime() - new Date(String(a.row.createdAt)).getTime();
    })
    .slice(0, limit);

  const rows = evaluatedRows.map(({ row, decision }) => ({
    ...row,
    protecaoComercial: {
      modo: decision.modo,
      regraId: decision.regraId,
      escopo: decision.escopo,
      valor: decision.valor,
      parceiroOrigem: row.vendedorTenantId === tenantId,
    },
  }));

  const supplierIds = [...new Set(rows.map((row) => row.vendedorTenantId))];

  const ratings = new Map<string, { media: number | null; total: number }>();
  if (supplierIds.length > 0) {
    try {
      const reviewResult = await vendorPool.query(
        `SELECT tenant_id AS "tenantId",
                round(avg(nota)::numeric, 2)::float8 AS media,
                count(*)::int AS total
           FROM praca_produto_avaliacoes
          WHERE tenant_id = ANY($1::text[]) AND status='publicada'
          GROUP BY tenant_id`,
        [supplierIds],
      );
      for (const row of reviewResult.rows) {
        ratings.set(String(row.tenantId), {
          media: row.media == null ? null : Number(row.media),
          total: Number(row.total ?? 0),
        });
      }
    } catch {
      // Marketplace segue funcional mesmo se o legado de avaliações
      // ainda não estiver disponível no ambiente atual.
    }
  }

  const companiesMap = new Map<string, any>();
  for (const row of rows) {
    const current = companiesMap.get(row.vendedorTenantId) ?? {
      id: row.vendedorTenantId,
      nome: row.empresaNome,
      slug: row.empresaSlug,
      vertical: row.empresaVertical,
      avaliacao: ratings.get(row.vendedorTenantId)?.media ?? null,
      totalAvaliacoes: ratings.get(row.vendedorTenantId)?.total ?? 0,
      produtosCompativeis: 0,
      categorias: new Set<string>(),
      fotos: [] as string[],
      totalVendas: 0,
      parceiroOrigem: row.vendedorTenantId === tenantId,
      prioridadeProtecao: 0,
    };
    current.produtosCompativeis += 1;
    current.totalVendas += Number(row.totalVendas ?? 0);
    current.prioridadeProtecao = Math.max(
      current.prioridadeProtecao,
      row.protecaoComercial?.modo === "exclusivo" ? 1000 : row.protecaoComercial?.modo === "preferencial" ? 500 : 0,
    );
    if (row.categoria) current.categorias.add(row.categoria);
    for (const foto of row.imagens ?? []) {
      if (current.fotos.length >= 4) break;
      if (!current.fotos.includes(foto)) current.fotos.push(foto);
    }
    companiesMap.set(row.vendedorTenantId, current);
  }

  const empresas = [...companiesMap.values()]
    .map((company) => ({ ...company, categorias: [...company.categorias] }))
    .sort((a, b) => {
      if (b.prioridadeProtecao !== a.prioridadeProtecao) return b.prioridadeProtecao - a.prioridadeProtecao;
      const reviewDiff = (b.avaliacao ?? -1) - (a.avaliacao ?? -1);
      if (reviewDiff !== 0) return reviewDiff;
      return b.produtosCompativeis - a.produtosCompativeis;
    });

  const produtos = rows.map((row) => ({
    id: row.id,
    masterProductId: row.masterProductId,
    fornecedorTenantId: row.vendedorTenantId,
    fornecedorNome: row.empresaNome,
    nome: row.nome,
    descricao: row.descricao,
    categoria: row.categoria,
    preco: row.preco == null ? null : Number(row.preco),
    imagens: row.imagens ?? [],
    especificacoes: row.especificacoes ?? {},
    totalVendas: Number(row.totalVendas ?? 0),
    avaliacaoFornecedor: ratings.get(row.vendedorTenantId)?.media ?? null,
    totalAvaliacoesFornecedor: ratings.get(row.vendedorTenantId)?.total ?? 0,
    acaoPrincipal: row.preco != null && Number(row.preco) > 0 ? "comprar" : "cotar",
    protecaoComercial: row.protecaoComercial,
  }));

  return res.json({
    contexto: {
      busca: busca || null,
      categoria: categoria || null,
      origem: typeof req.query.origem === "string" ? req.query.origem : null,
      origemId: typeof req.query.origemId === "string" ? req.query.origemId : null,
      quantidade: typeof req.query.quantidade === "string" ? Number(req.query.quantidade) : null,
      unidade: typeof req.query.unidade === "string" ? req.query.unidade : null,
      tenantOrigemId: tenantId,
    },
    protecaoComercial: {
      ativa: protectionRules.length > 0,
      regrasAtivas: protectionRules.length,
    },
    empresas,
    produtos,
  });
});

router.get("/arch/market/protecoes", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const rows = await db
    .select()
    .from(arqdorMarketProtecoesTenantTable)
    .where(eq(arqdorMarketProtecoesTenantTable.tenantId, tenantId))
    .orderBy(arqdorMarketProtecoesTenantTable.prioridade, arqdorMarketProtecoesTenantTable.createdAt);

  return res.json(rows);
});

router.post("/arch/market/protecoes", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });
  if (!canManageMarketProtection(req)) return res.status(403).json({ error: "Somente administradores podem configurar a proteção comercial." });

  const parsed = insertArqdorMarketProtecaoTenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.flatten() });

  const normalized = normalizeMarketProtectionValue(parsed.data.valor);
  if (!normalized) return res.status(422).json({ error: "Valor de proteção inválido." });

  const existing = await db
    .select()
    .from(arqdorMarketProtecoesTenantTable)
    .where(and(
      eq(arqdorMarketProtecoesTenantTable.tenantId, tenantId),
      eq(arqdorMarketProtecoesTenantTable.escopo, parsed.data.escopo),
      eq(arqdorMarketProtecoesTenantTable.valorNormalizado, normalized),
    ))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(arqdorMarketProtecoesTenantTable)
      .set({
        valor: parsed.data.valor,
        modo: parsed.data.modo,
        prioridade: parsed.data.prioridade ?? existing[0].prioridade,
        ativo: parsed.data.ativo ?? true,
        observacoes: parsed.data.observacoes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(arqdorMarketProtecoesTenantTable.id, existing[0].id))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(arqdorMarketProtecoesTenantTable)
    .values({
      ...parsed.data,
      tenantId,
      valorNormalizado: normalized,
    })
    .returning();

  return res.status(201).json(created);
});

router.put("/arch/market/protecoes/:id", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });
  if (!canManageMarketProtection(req)) return res.status(403).json({ error: "Somente administradores podem configurar a proteção comercial." });

  const parsed = insertArqdorMarketProtecaoTenantSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.flatten() });

  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.valor !== undefined) {
    patch.valorNormalizado = normalizeMarketProtectionValue(parsed.data.valor);
  }

  const [updated] = await db
    .update(arqdorMarketProtecoesTenantTable)
    .set(patch as any)
    .where(and(
      eq(arqdorMarketProtecoesTenantTable.id, String(req.params.id)),
      eq(arqdorMarketProtecoesTenantTable.tenantId, tenantId),
    ))
    .returning();

  if (!updated) return res.status(404).json({ error: "Regra de proteção não encontrada." });
  return res.json(updated);
});

router.delete("/arch/market/protecoes/:id", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });
  if (!canManageMarketProtection(req)) return res.status(403).json({ error: "Somente administradores podem configurar a proteção comercial." });

  const [deleted] = await db
    .delete(arqdorMarketProtecoesTenantTable)
    .where(and(
      eq(arqdorMarketProtecoesTenantTable.id, String(req.params.id)),
      eq(arqdorMarketProtecoesTenantTable.tenantId, tenantId),
    ))
    .returning({ id: arqdorMarketProtecoesTenantTable.id });

  if (!deleted) return res.status(404).json({ error: "Regra de proteção não encontrada." });
  return res.status(204).end();
});

router.post("/arch/market/demandas", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const supplierIds = z.array(z.string().min(1)).max(100).optional().safeParse(req.body?.fornecedorTenantIds);
  if (!supplierIds.success) return res.status(422).json({ error: supplierIds.error.flatten() });

  const parsed = insertArqdorMarketDemandaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.flatten() });

  const ownership = await assertSourceOwnership({
    tenantId,
    projetoId: parsed.data.projetoId,
    obraId: parsed.data.obraId,
  });
  if (!ownership.ok) return res.status(404).json({ error: ownership.error });

  const publishNow = req.body?.publicar === true;
  const status = publishNow ? "publicada" : (parsed.data.status ?? "rascunho");

  const [demanda] = await db
    .insert(arqdorMarketDemandasTable)
    .values({
      ...parsed.data,
      tenantId,
      criadaPorUserId: currentUserId(req),
      status,
      publicadaEm: status === "publicada" ? new Date() : null,
    } as any)
    .returning();

  const uniqueSuppliers = [...new Set(supplierIds.data ?? [])].filter((id) => id !== tenantId);
  if (uniqueSuppliers.length > 0) {
    const validSuppliers = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(inArray(tenantsTable.id, uniqueSuppliers));
    const validIds = validSuppliers.map((row) => row.id);

    if (validIds.length > 0) {
      await db.insert(arqdorMarketConvitesTable).values(
        validIds.map((fornecedorTenantId) => ({
          demandaId: demanda.id,
          fornecedorTenantId,
        })),
      ).onConflictDoNothing();

      await Promise.all(validIds.map((supplierTenantId) =>
        notifyTenant(
          supplierTenantId,
          "Nova cotação no Arqdor Market",
          `${demanda.titulo} — uma empresa convidou você para enviar proposta.`,
        ),
      ));
    }
  }

  return res.status(201).json(demanda);
});

router.post("/arch/market/demandas/:demandaId/publicar", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const [updated] = await db
    .update(arqdorMarketDemandasTable)
    .set({ status: "publicada", publicadaEm: new Date(), updatedAt: new Date() })
    .where(and(
      eq(arqdorMarketDemandasTable.id, String(req.params.demandaId)),
      eq(arqdorMarketDemandasTable.tenantId, tenantId),
    ))
    .returning();

  if (!updated) return res.status(404).json({ error: "Demanda não encontrada." });
  return res.json(updated);
});

router.post("/arch/market/demandas/:demandaId/convidar", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const body = z.object({
    fornecedorTenantIds: z.array(z.string().min(1)).min(1).max(100),
  }).safeParse(req.body);
  if (!body.success) return res.status(422).json({ error: body.error.flatten() });

  const [demanda] = await db
    .select()
    .from(arqdorMarketDemandasTable)
    .where(and(
      eq(arqdorMarketDemandasTable.id, String(req.params.demandaId)),
      eq(arqdorMarketDemandasTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!demanda) return res.status(404).json({ error: "Demanda não encontrada." });

  const ids = [...new Set(body.data.fornecedorTenantIds)].filter((id) => id !== tenantId);
  const valid = ids.length === 0 ? [] : await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(inArray(tenantsTable.id, ids));

  if (valid.length > 0) {
    await db.insert(arqdorMarketConvitesTable)
      .values(valid.map((row) => ({ demandaId: demanda.id, fornecedorTenantId: row.id })))
      .onConflictDoNothing();

    await Promise.all(valid.map((row) =>
      notifyTenant(row.id, "Convite para cotação", `${demanda.titulo} — abra o Arqdor Market para responder.`),
    ));
  }

  return res.json({ ok: true, convidados: valid.length });
});

router.get("/arch/market/demandas/minhas", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const rows = await db
    .select()
    .from(arqdorMarketDemandasTable)
    .where(eq(arqdorMarketDemandasTable.tenantId, tenantId))
    .orderBy(desc(arqdorMarketDemandasTable.createdAt));
  return res.json(rows);
});

router.get("/arch/market/demandas/recebidas", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const rows = await db
    .select({
      demanda: arqdorMarketDemandasTable,
      conviteStatus: arqdorMarketConvitesTable.status,
      compradorNome: tenantsTable.name,
    })
    .from(arqdorMarketConvitesTable)
    .innerJoin(arqdorMarketDemandasTable, eq(arqdorMarketDemandasTable.id, arqdorMarketConvitesTable.demandaId))
    .innerJoin(tenantsTable, eq(tenantsTable.id, arqdorMarketDemandasTable.tenantId))
    .where(and(
      eq(arqdorMarketConvitesTable.fornecedorTenantId, tenantId),
      eq(arqdorMarketDemandasTable.status, "publicada"),
    ))
    .orderBy(desc(arqdorMarketDemandasTable.createdAt));

  const openRows = await db
    .select({
      demanda: arqdorMarketDemandasTable,
      compradorNome: tenantsTable.name,
    })
    .from(arqdorMarketDemandasTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, arqdorMarketDemandasTable.tenantId))
    .where(and(
      eq(arqdorMarketDemandasTable.status, "publicada"),
      ne(arqdorMarketDemandasTable.tenantId, tenantId),
      or(
        eq(arqdorMarketDemandasTable.visibilidade, "aberta"),
        eq(arqdorMarketDemandasTable.visibilidade, "regional"),
      )!,
    ))
    .orderBy(desc(arqdorMarketDemandasTable.createdAt))
    .limit(100);

  const byId = new Map<string, any>();
  for (const row of openRows) {
    byId.set(row.demanda.id, {
      ...row.demanda,
      compradorNome: row.demanda.ocultarComprador ? null : row.compradorNome,
      conviteStatus: null,
      origemAcesso: "market",
    });
  }
  for (const row of rows) {
    byId.set(row.demanda.id, {
      ...row.demanda,
      compradorNome: row.demanda.ocultarComprador ? null : row.compradorNome,
      conviteStatus: row.conviteStatus,
      origemAcesso: "convite",
    });
  }

  return res.json([...byId.values()]);
});

router.post("/arch/market/demandas/:demandaId/propostas", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const parsed = insertArqdorMarketPropostaSchema.safeParse({
    ...req.body,
    demandaId: String(req.params.demandaId),
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.flatten() });

  const [demanda] = await db
    .select()
    .from(arqdorMarketDemandasTable)
    .where(and(
      eq(arqdorMarketDemandasTable.id, String(req.params.demandaId)),
      eq(arqdorMarketDemandasTable.status, "publicada"),
    ))
    .limit(1);
  if (!demanda) return res.status(404).json({ error: "Demanda não encontrada ou não publicada." });
  if (demanda.tenantId === tenantId) {
    return res.status(400).json({ error: "O comprador não pode responder à própria demanda." });
  }

  const [invite] = await db
    .select({ id: arqdorMarketConvitesTable.id })
    .from(arqdorMarketConvitesTable)
    .where(and(
      eq(arqdorMarketConvitesTable.demandaId, demanda.id),
      eq(arqdorMarketConvitesTable.fornecedorTenantId, tenantId),
    ))
    .limit(1);

  const canRespond = Boolean(invite) || demanda.visibilidade === "aberta" || demanda.visibilidade === "regional";
  if (!canRespond) return res.status(403).json({ error: "Esta demanda não está disponível para este fornecedor." });

  const [proposta] = await db
    .insert(arqdorMarketPropostasTable)
    .values({
      ...parsed.data,
      fornecedorTenantId: tenantId,
      status: "enviada",
      enviadaEm: new Date(),
    } as any)
    .returning();

  if (invite) {
    await db.update(arqdorMarketConvitesTable)
      .set({ status: "respondido", respondidoEm: new Date() })
      .where(eq(arqdorMarketConvitesTable.id, invite.id));
  }

  await notifyTenant(
    demanda.tenantId,
    "Nova proposta no Arqdor Market",
    `${demanda.titulo} recebeu uma nova proposta.`,
  );

  return res.status(201).json(proposta);
});

router.get("/arch/market/demandas/:demandaId/propostas", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const [demanda] = await db
    .select()
    .from(arqdorMarketDemandasTable)
    .where(eq(arqdorMarketDemandasTable.id, String(req.params.demandaId)))
    .limit(1);
  if (!demanda) return res.status(404).json({ error: "Demanda não encontrada." });

  const owner = demanda.tenantId === tenantId;
  const conditions = [eq(arqdorMarketPropostasTable.demandaId, demanda.id)];
  if (!owner) conditions.push(eq(arqdorMarketPropostasTable.fornecedorTenantId, tenantId));

  const propostas = await db
    .select({
      proposta: arqdorMarketPropostasTable,
      fornecedorNome: tenantsTable.name,
    })
    .from(arqdorMarketPropostasTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, arqdorMarketPropostasTable.fornecedorTenantId))
    .where(and(...conditions))
    .orderBy(desc(arqdorMarketPropostasTable.createdAt));

  return res.json(propostas);
});

router.post("/arch/market/demandas/:demandaId/propostas/:propostaId/selecionar", authenticate, async (req, res) => {
  const tenantId = currentTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Tenant não identificado." });

  const [demanda] = await db
    .select()
    .from(arqdorMarketDemandasTable)
    .where(and(
      eq(arqdorMarketDemandasTable.id, String(req.params.demandaId)),
      eq(arqdorMarketDemandasTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!demanda) return res.status(404).json({ error: "Demanda não encontrada." });

  const [selected] = await db
    .update(arqdorMarketPropostasTable)
    .set({ status: "selecionada", selecionadaEm: new Date(), updatedAt: new Date() })
    .where(and(
      eq(arqdorMarketPropostasTable.id, String(req.params.propostaId)),
      eq(arqdorMarketPropostasTable.demandaId, demanda.id),
    ))
    .returning();
  if (!selected) return res.status(404).json({ error: "Proposta não encontrada." });

  await db.update(arqdorMarketPropostasTable)
    .set({ status: "recusada", updatedAt: new Date() })
    .where(and(
      eq(arqdorMarketPropostasTable.demandaId, demanda.id),
      ne(arqdorMarketPropostasTable.id, selected.id),
      inArray(arqdorMarketPropostasTable.status, ["enviada", "em_analise"]),
    ));

  await db.update(arqdorMarketDemandasTable)
    .set({ status: "adjudicada", encerradaEm: new Date(), updatedAt: new Date() })
    .where(eq(arqdorMarketDemandasTable.id, demanda.id));

  const procurementSync = await syncSelectedMarketProposalToBudget({
    demanda,
    proposta: selected,
    buyerTenantId: tenantId,
    buyerUserId: currentUserId(req),
  });

  await notifyTenant(
    selected.fornecedorTenantId,
    "Proposta selecionada",
    `Sua proposta para "${demanda.titulo}" foi selecionada.`,
  );

  return res.json({ proposta: selected, procurementSync });
});

export default router;
