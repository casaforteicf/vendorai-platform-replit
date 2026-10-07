import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  obrasTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  orcamentoFormacaoVendaTable,
  orcamentoFormacaoSnapshotsTable,
  obraCotacoesTable,
  obraCotacaoItensTable,
  obraCotacaoPropostasTable,
  obraPedidosCompraTable,
  obraPedidoCompraItensTable,
  obraExecucaoAtividadesTable,
  obraExecucaoSnapshotsTable,
  obraFinanceiroTitulosTable,
  obraFinanceiroMovimentosTable,
  obraFinanceiroFluxoSnapshotsTable,
  obraRelatoriosSalvosTable,
  obraAuditoriaEventosTable,
  obraPermissoesOperacionaisTable,
  insertObraRelatorioSalvoSchema,
  insertObraPermissaoOperacionalSchema,
} from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const u = (req as any).user;
  return u?.tenantId === tenantId || u?.platformRole === "super_admin";
}

function isTenantAdmin(req: Express.Request) {
  const u = (req as any).user;
  return u?.platformRole === "super_admin" || u?.platformRole === "tenant_admin" || u?.role === "admin";
}

function userId(req: Express.Request): string | null {
  return (req as any).user?.sub ?? (req as any).user?.id ?? null;
}

async function audit(req: Express.Request, input: {
  tenantId: string;
  obraId?: string | null;
  modulo: string;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  resumo?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(obraAuditoriaEventosTable).values({
    tenantId: input.tenantId,
    obraId: input.obraId ?? null,
    usuarioId: userId(req),
    modulo: input.modulo,
    acao: input.acao,
    entidade: input.entidade,
    entidadeId: input.entidadeId ?? null,
    resumo: input.resumo ?? null,
    antes: input.antes ?? null,
    depois: input.depois ?? null,
    metadata: input.metadata ?? null,
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
}

router.get("/tenants/:tenantId/obras/:obraId/governanca/relatorio-consolidado", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select().from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tenantId)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada." });

  const orcamentos = await db.select().from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.tenantId, tenantId), eq(obraOrcamentosTable.obraId, obraId)))
    .orderBy(desc(obraOrcamentosTable.versao));

  const orcamentoAtual =
    orcamentos.find((o) => o.status === "contratado") ??
    orcamentos.find((o) => o.status === "aprovado") ??
    orcamentos.find((o) => o.status !== "rejeitado") ??
    null;

  let etapasOrcamento: typeof obraOrcamentoEtapasTable.$inferSelect[] = [];
  let itensOrcamento: typeof obraOrcamentoItensTable.$inferSelect[] = [];
  let formacao: typeof orcamentoFormacaoVendaTable.$inferSelect | null = null;
  let formacaoSnapshot: typeof orcamentoFormacaoSnapshotsTable.$inferSelect | null = null;
  let cotacoes: typeof obraCotacoesTable.$inferSelect[] = [];

  if (orcamentoAtual) {
    etapasOrcamento = await db.select().from(obraOrcamentoEtapasTable)
      .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoAtual.id));
    const etapaIds = etapasOrcamento.map((e) => e.id);
    itensOrcamento = etapaIds.length
      ? await db.select().from(obraOrcamentoItensTable).where(inArray(obraOrcamentoItensTable.etapaId, etapaIds))
      : [];

    const formacoes = await db.select().from(orcamentoFormacaoVendaTable)
      .where(and(eq(orcamentoFormacaoVendaTable.tenantId, tenantId), eq(orcamentoFormacaoVendaTable.orcamentoId, orcamentoAtual.id)))
      .orderBy(desc(orcamentoFormacaoVendaTable.createdAt));
    formacao = formacoes.find((f) => f.ativo) ?? formacoes[0] ?? null;

    if (formacao) {
      [formacaoSnapshot] = await db.select().from(orcamentoFormacaoSnapshotsTable)
        .where(eq(orcamentoFormacaoSnapshotsTable.formacaoId, formacao.id))
        .orderBy(desc(orcamentoFormacaoSnapshotsTable.createdAt))
        .limit(1);
    }

    cotacoes = await db.select().from(obraCotacoesTable)
      .where(and(eq(obraCotacoesTable.tenantId, tenantId), eq(obraCotacoesTable.orcamentoId, orcamentoAtual.id)))
      .orderBy(desc(obraCotacoesTable.createdAt));
  }

  const cotacaoIds = cotacoes.map((c) => c.id);
  let cotacaoItens: typeof obraCotacaoItensTable.$inferSelect[] = [];
  let propostas: typeof obraCotacaoPropostasTable.$inferSelect[] = [];
  if (cotacaoIds.length) {
    [cotacaoItens, propostas] = await Promise.all([
      db.select().from(obraCotacaoItensTable).where(inArray(obraCotacaoItensTable.cotacaoId, cotacaoIds)),
      db.select().from(obraCotacaoPropostasTable).where(inArray(obraCotacaoPropostasTable.cotacaoId, cotacaoIds)),
    ]);
  }

  const [pedidos, atividades, titulos, fluxoSnapshots] = await Promise.all([
    db.select().from(obraPedidosCompraTable)
      .where(and(eq(obraPedidosCompraTable.tenantId, tenantId), eq(obraPedidosCompraTable.obraId, obraId)))
      .orderBy(desc(obraPedidosCompraTable.createdAt)),
    db.select().from(obraExecucaoAtividadesTable)
      .where(and(eq(obraExecucaoAtividadesTable.tenantId, tenantId), eq(obraExecucaoAtividadesTable.obraId, obraId), eq(obraExecucaoAtividadesTable.ativo, true))),
    db.select().from(obraFinanceiroTitulosTable)
      .where(and(eq(obraFinanceiroTitulosTable.tenantId, tenantId), eq(obraFinanceiroTitulosTable.obraId, obraId))),
    db.select().from(obraFinanceiroFluxoSnapshotsTable)
      .where(eq(obraFinanceiroFluxoSnapshotsTable.obraId, obraId))
      .orderBy(desc(obraFinanceiroFluxoSnapshotsTable.createdAt)),
  ]);

  const pedidoIds = pedidos.map((p) => p.id);
  const pedidoItens = pedidoIds.length
    ? await db.select().from(obraPedidoCompraItensTable).where(inArray(obraPedidoCompraItensTable.pedidoId, pedidoIds))
    : [];

  const atividadeIds = atividades.map((a) => a.id);
  const execSnapshots = atividadeIds.length
    ? await db.select().from(obraExecucaoSnapshotsTable).where(inArray(obraExecucaoSnapshotsTable.atividadeId, atividadeIds))
    : [];

  const tituloIds = titulos.map((t) => t.id);
  const movimentos = tituloIds.length
    ? await db.select().from(obraFinanceiroMovimentosTable).where(inArray(obraFinanceiroMovimentosTable.tituloId, tituloIds))
    : [];

  const num = (v: unknown) => Number(v ?? 0) || 0;
  const custoOrcado = itensOrcamento.reduce((s, i) => s + num(i.quantidade) * num(i.custoUnitario), 0);
  const custoReal = atividades.reduce((s, a) => s + num(a.custoRealizado), 0);
  const compraTotal = pedidos.filter((p) => p.status !== "cancelado").reduce((s, p) => s + num(p.valorTotal), 0);
  const contasPagar = titulos.filter((t) => t.tipo === "pagar" && !["pago","cancelado"].includes(t.status)).reduce((s, t) => s + num(t.valorAberto), 0);
  const contasReceber = titulos.filter((t) => t.tipo === "receber" && !["recebido","cancelado"].includes(t.status)).reduce((s, t) => s + num(t.valorAberto), 0);
  const pago = movimentos.filter((m) => m.tipo === "pagamento").reduce((s, m) => s + num(m.valor), 0);
  const recebido = movimentos.filter((m) => m.tipo === "recebimento").reduce((s, m) => s + num(m.valor), 0);
  const precoVenda = num(formacaoSnapshot?.precoVenda);

  const statusFiltro = typeof req.query.status === "string" ? req.query.status : null;
  const moduloFiltro = typeof req.query.modulo === "string" ? req.query.modulo : null;

  return res.json({
    obra: { id: obra.id, nome: obra.nome },
    filtrosAplicados: { status: statusFiltro, modulo: moduloFiltro },
    resumo: {
      orcamentoId: orcamentoAtual?.id ?? null,
      orcamentoVersao: orcamentoAtual?.versao ?? null,
      custoOrcado,
      precoVenda,
      custoReal,
      desvioCusto: custoOrcado - custoReal,
      compraTotal,
      contasPagar,
      contasReceber,
      pago,
      recebido,
      saldoCaixa: recebido - pago,
      margemRealizadaCaixa: recebido - custoReal,
      progressoMedioPercentual: atividades.length
        ? atividades.reduce((s, a) => s + num(a.percentualExecutado), 0) / atividades.length
        : 0,
    },
    orcamento: {
      atual: orcamentoAtual,
      etapas: etapasOrcamento,
      itens: itensOrcamento,
      formacao,
      formacaoSnapshot,
    },
    cotacoes: {
      registros: statusFiltro ? cotacoes.filter((x) => x.status === statusFiltro) : cotacoes,
      itens: cotacaoItens,
      propostas,
    },
    compras: {
      pedidos: statusFiltro ? pedidos.filter((x) => x.status === statusFiltro) : pedidos,
      itens: pedidoItens,
    },
    execucao: {
      atividades: statusFiltro ? atividades.filter((x) => x.status === statusFiltro) : atividades,
      snapshots: execSnapshots,
    },
    financeiro: {
      titulos: statusFiltro ? titulos.filter((x) => x.status === statusFiltro) : titulos,
      movimentos,
      ultimoFluxoSnapshot: fluxoSnapshots[0] ?? null,
    },
  });
});

router.get("/tenants/:tenantId/obras/:obraId/governanca/auditoria", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraAuditoriaEventosTable)
    .where(and(eq(obraAuditoriaEventosTable.tenantId, tenantId), eq(obraAuditoriaEventosTable.obraId, obraId)))
    .orderBy(desc(obraAuditoriaEventosTable.createdAt))
    .limit(500);

  const modulo = typeof req.query.modulo === "string" ? req.query.modulo : null;
  const entidade = typeof req.query.entidade === "string" ? req.query.entidade : null;
  const acao = typeof req.query.acao === "string" ? req.query.acao : null;

  return res.json(rows.filter((x) =>
    (!modulo || x.modulo === modulo) &&
    (!entidade || x.entidade === entidade) &&
    (!acao || x.acao === acao)
  ));
});

router.get("/tenants/:tenantId/obras/:obraId/governanca/relatorios-salvos", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const uid = userId(req);
  const rows = await db.select().from(obraRelatoriosSalvosTable)
    .where(and(eq(obraRelatoriosSalvosTable.tenantId, tenantId), eq(obraRelatoriosSalvosTable.obraId, obraId)))
    .orderBy(desc(obraRelatoriosSalvosTable.updatedAt));

  return res.json(rows.filter((x) => x.compartilhado || !uid || x.criadoPorId === uid || isTenantAdmin(req)));
});

router.post("/tenants/:tenantId/obras/:obraId/governanca/relatorios-salvos", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraRelatorioSalvoSchema.safeParse({
    ...req.body,
    tenantId,
    obraId,
    criadoPorId: userId(req),
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraRelatoriosSalvosTable).values(parsed.data).returning();
  await audit(req, {
    tenantId,
    obraId,
    modulo: "relatorios",
    acao: "criar",
    entidade: "relatorio_salvo",
    entidadeId: row.id,
    resumo: `Relatório salvo: ${row.nome}`,
    depois: row as unknown as Record<string, unknown>,
  });

  return res.status(201).json(row);
});

router.delete("/tenants/:tenantId/obras/:obraId/governanca/relatorios-salvos/:id", async (req, res) => {
  const { tenantId, obraId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(obraRelatoriosSalvosTable)
    .where(and(
      eq(obraRelatoriosSalvosTable.id, id),
      eq(obraRelatoriosSalvosTable.tenantId, tenantId),
      eq(obraRelatoriosSalvosTable.obraId, obraId),
    ));
  if (!row) return res.status(404).json({ error: "Relatório salvo não encontrado." });
  if (!isTenantAdmin(req) && row.criadoPorId !== userId(req)) return res.status(403).json({ error: "Sem permissão." });

  await db.delete(obraRelatoriosSalvosTable).where(eq(obraRelatoriosSalvosTable.id, id));
  await audit(req, {
    tenantId,
    obraId,
    modulo: "relatorios",
    acao: "excluir",
    entidade: "relatorio_salvo",
    entidadeId: id,
    resumo: `Relatório removido: ${row.nome}`,
    antes: row as unknown as Record<string, unknown>,
  });

  return res.status(204).send();
});

router.get("/tenants/:tenantId/governanca/permissoes-operacionais", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraPermissoesOperacionaisTable)
    .where(eq(obraPermissoesOperacionaisTable.tenantId, tenantId))
    .orderBy(obraPermissoesOperacionaisTable.chave);

  return res.json(rows);
});

router.put("/tenants/:tenantId/governanca/permissoes-operacionais/:chave", async (req, res) => {
  const { tenantId, chave } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!isTenantAdmin(req)) return res.status(403).json({ error: "Somente admin pode alterar permissões operacionais." });

  const payload = {
    ...req.body,
    tenantId,
    chave,
    nome: req.body?.nome ?? chave,
  };
  const parsed = insertObraPermissaoOperacionalSchema.safeParse(payload);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [antes] = await db.select().from(obraPermissoesOperacionaisTable)
    .where(and(eq(obraPermissoesOperacionaisTable.tenantId, tenantId), eq(obraPermissoesOperacionaisTable.chave, chave)));

  let row;
  if (antes) {
    [row] = await db.update(obraPermissoesOperacionaisTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(obraPermissoesOperacionaisTable.id, antes.id))
      .returning();
  } else {
    [row] = await db.insert(obraPermissoesOperacionaisTable).values(parsed.data).returning();
  }

  await audit(req, {
    tenantId,
    modulo: "permissoes",
    acao: antes ? "atualizar" : "criar",
    entidade: "permissao_operacional",
    entidadeId: row.id,
    resumo: `Permissão operacional: ${chave}`,
    antes: (antes ?? null) as unknown as Record<string, unknown> | null,
    depois: row as unknown as Record<string, unknown>,
  });

  return res.json(row);
});

export default router;
