import { Router, type IRouter } from "express";
import { and, eq, desc, asc, ilike } from "drizzle-orm";
import {
  db,
  obrasTable,
  obraEtapasTable,
  obraEtapaMedicoesTable,
  obraDiarioTable,
  insumosTable,
  estoqueCentralObrasTable,
  estoqueObrasTable,
  movimentacoesEstoqueObrasTable,
  composicoesTable,
  composicaoInsumosTable,
  comprasObrasTable,
  insertObraSchema,
  updateObraSchema,
  insertObraEtapaSchema,
  updateObraEtapaSchema,
  insertObraEtapaMedicaoSchema,
  insertObraDiarioSchema,
  updateObraDiarioSchema,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function tenantId(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccessTenant(req: Express.Request, tid: string) {
  return isSuperAdmin(req) || tenantId(req) === tid;
}

// ─── Obras ────────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(obrasTable.tenantId, tid)];
  if (req.query.status) filters.push(eq(obrasTable.status, req.query.status as string));

  const rows = await db.select().from(obrasTable).where(and(...filters)).orderBy(desc(obrasTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [obra] = await db.insert(obrasTable).values(parsed.data).returning();
  return res.status(201).json(obra);
});

router.get("/tenants/:tenantId/obras/:obraId", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select().from(obrasTable).where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra not found" });

  const etapas = await db.select().from(obraEtapasTable).where(eq(obraEtapasTable.obraId, obraId)).orderBy(asc(obraEtapasTable.ordem));

  const totalEtapas = etapas.length;
  const percentualGeral = totalEtapas > 0
    ? etapas.reduce((sum, e) => sum + parseFloat(e.percentualExecutado ?? "0"), 0) / totalEtapas
    : 0;

  return res.json({ ...obra, etapas, percentualGeral: Math.round(percentualGeral * 10) / 10 });
});

router.put("/tenants/:tenantId/obras/:obraId", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [obra] = await db.update(obrasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)))
    .returning();
  if (!obra) return res.status(404).json({ error: "Obra not found" });
  return res.json(obra);
});

// Arquivar obra (soft delete — status → arquivada)
router.delete("/tenants/:tenantId/obras/:obraId", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.update(obrasTable)
    .set({ status: "arquivada", updatedAt: new Date() })
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)))
    .returning();
  if (!obra) return res.status(404).json({ error: "Obra not found" });
  return res.json(obra);
});

// ─── Etapas ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/etapas", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraEtapasTable).where(eq(obraEtapasTable.obraId, obraId)).orderBy(asc(obraEtapasTable.ordem));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/etapas", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraEtapaSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [etapa] = await db.insert(obraEtapasTable).values(parsed.data).returning();
  return res.status(201).json(etapa);
});

router.put("/tenants/:tenantId/obras/:obraId/etapas/:etapaId", async (req, res) => {
  const { tenantId: tid, obraId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraEtapaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [etapa] = await db.update(obraEtapasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(obraEtapasTable.id, etapaId), eq(obraEtapasTable.obraId, obraId)))
    .returning();
  if (!etapa) return res.status(404).json({ error: "Etapa not found" });
  return res.json(etapa);
});

router.delete("/tenants/:tenantId/obras/:obraId/etapas/:etapaId", async (req, res) => {
  const { tenantId: tid, obraId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(obraEtapasTable).where(and(eq(obraEtapasTable.id, etapaId), eq(obraEtapasTable.obraId, obraId)));
  return res.status(204).end();
});

// Conveniência: editar/deletar etapa por ID direto (sem obraId no path)
router.put("/tenants/:tenantId/obras/etapas/:etapaId", async (req, res) => {
  const { tenantId: tid, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraEtapaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [etapa] = await db.update(obraEtapasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(obraEtapasTable.id, etapaId))
    .returning();
  if (!etapa) return res.status(404).json({ error: "Etapa not found" });
  return res.json(etapa);
});

router.delete("/tenants/:tenantId/obras/etapas/:etapaId", async (req, res) => {
  const { tenantId: tid, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(obraEtapasTable).where(eq(obraEtapasTable.id, etapaId));
  return res.status(204).end();
});

// ─── Medições ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/etapas/:etapaId/medicoes", async (req, res) => {
  const { tenantId: tid, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraEtapaMedicoesTable).where(eq(obraEtapaMedicoesTable.etapaId, etapaId)).orderBy(desc(obraEtapaMedicoesTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/etapas/:etapaId/medicoes", async (req, res) => {
  const { tenantId: tid, obraId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [etapa] = await db.select().from(obraEtapasTable).where(and(eq(obraEtapasTable.id, etapaId), eq(obraEtapasTable.obraId, obraId)));
  if (!etapa) return res.status(404).json({ error: "Etapa not found" });

  const percentualNovo = String(req.body.percentualNovo ?? "0");
  const [medicao] = await db.insert(obraEtapaMedicoesTable).values({
    etapaId,
    data: req.body.data,
    percentualAnterior: etapa.percentualExecutado,
    percentualNovo,
    observacao: req.body.observacao,
    responsavelId: (req as any).user?.id,
  }).returning();

  await db.update(obraEtapasTable)
    .set({ percentualExecutado: percentualNovo, updatedAt: new Date() })
    .where(eq(obraEtapasTable.id, etapaId));

  return res.status(201).json(medicao);
});

// ─── Diário de Obra ───────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/diario", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraDiarioTable).where(eq(obraDiarioTable.obraId, obraId)).orderBy(desc(obraDiarioTable.data));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/diario", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraDiarioSchema.safeParse({
    ...req.body,
    obraId,
    responsavelId: (req as any).user?.id,
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [entry] = await db.insert(obraDiarioTable).values(parsed.data).returning();
  return res.status(201).json(entry);
});

// Buscar entrada do diário por ID direto
router.get("/tenants/:tenantId/obras/diario/:diarioId", async (req, res) => {
  const { tenantId: tid, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [entry] = await db.select().from(obraDiarioTable).where(eq(obraDiarioTable.id, diarioId));
  if (!entry) return res.status(404).json({ error: "Diário not found" });
  return res.json(entry);
});

// Conveniência: atualizar entrada do diário por ID direto (sem obraId no path)
router.put("/tenants/:tenantId/obras/diario/:diarioId", async (req, res) => {
  const { tenantId: tid, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraDiarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const extra: Record<string, unknown> = {};
  if (req.body.status === "aprovado") {
    extra.aprovadoPorId = (req as any).user?.id;
    extra.aprovadoEm = new Date();
  }

  const [entry] = await db.update(obraDiarioTable)
    .set({ ...parsed.data, ...extra, updatedAt: new Date() })
    .where(eq(obraDiarioTable.id, diarioId))
    .returning();
  if (!entry) return res.status(404).json({ error: "Diário not found" });
  return res.json(entry);
});

router.put("/tenants/:tenantId/obras/:obraId/diario/:diarioId", async (req, res) => {
  const { tenantId: tid, obraId, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraDiarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const extra: Record<string, unknown> = {};
  if (req.body.status === "aprovado") {
    extra.aprovadoPorId = (req as any).user?.id;
    extra.aprovadoEm = new Date();
  }

  const [entry] = await db.update(obraDiarioTable)
    .set({ ...parsed.data, ...extra, updatedAt: new Date() })
    .where(and(eq(obraDiarioTable.id, diarioId), eq(obraDiarioTable.obraId, obraId)))
    .returning();
  if (!entry) return res.status(404).json({ error: "Not found" });
  return res.json(entry);
});

router.delete("/tenants/:tenantId/obras/:obraId/diario/:diarioId", async (req, res) => {
  const { tenantId: tid, obraId, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(obraDiarioTable).where(and(eq(obraDiarioTable.id, diarioId), eq(obraDiarioTable.obraId, obraId)));
  return res.status(204).end();
});

// ─── Estoque da Obra ──────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/estoque", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select({
      id: estoqueObrasTable.id,
      obraId: estoqueObrasTable.obraId,
      insumoId: estoqueObrasTable.insumoId,
      quantidadeAtual: estoqueObrasTable.quantidadeAtual,
      quantidadeMinima: estoqueObrasTable.quantidadeMinima,
      updatedAt: estoqueObrasTable.updatedAt,
      insumo: insumosTable,
    })
    .from(estoqueObrasTable)
    .leftJoin(insumosTable, eq(estoqueObrasTable.insumoId, insumosTable.id))
    .where(eq(estoqueObrasTable.obraId, obraId));
  return res.json(rows);
});

// ─── Compras da Obra ──────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/compras", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select({
      id: comprasObrasTable.id,
      tenantId: comprasObrasTable.tenantId,
      obraId: comprasObrasTable.obraId,
      insumoId: comprasObrasTable.insumoId,
      descricao: comprasObrasTable.descricao,
      fornecedor: comprasObrasTable.fornecedor,
      quantidade: comprasObrasTable.quantidade,
      valorUnitario: comprasObrasTable.valorUnitario,
      valorTotal: comprasObrasTable.valorTotal,
      status: comprasObrasTable.status,
      dataPrevista: comprasObrasTable.dataPrevista,
      dataEfetuada: comprasObrasTable.dataEfetuada,
      observacoes: comprasObrasTable.observacoes,
      createdAt: comprasObrasTable.createdAt,
      updatedAt: comprasObrasTable.updatedAt,
      insumo: insumosTable,
    })
    .from(comprasObrasTable)
    .leftJoin(insumosTable, eq(comprasObrasTable.insumoId, insumosTable.id))
    .where(and(eq(comprasObrasTable.tenantId, tid), eq(comprasObrasTable.obraId, obraId)))
    .orderBy(desc(comprasObrasTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/compras", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [compra] = await db.insert(comprasObrasTable).values({ ...req.body, tenantId: tid, obraId } as any).returning();
  return res.status(201).json(compra);
});

router.put("/tenants/:tenantId/compras-obras/:compraId", async (req, res) => {
  const { tenantId: tid, compraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [compra] = await db.update(comprasObrasTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(comprasObrasTable.id, compraId), eq(comprasObrasTable.tenantId, tid)))
    .returning();
  if (!compra) return res.status(404).json({ error: "Not found" });
  return res.json(compra);
});

// ─── Insumos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/insumos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(insumosTable.tenantId, tid)];
  if (req.query.q) filters.push(ilike(insumosTable.nome, `%${req.query.q}%`));
  if (req.query.categoria) filters.push(eq(insumosTable.categoria, req.query.categoria as string));

  const rows = await db.select().from(insumosTable).where(and(...filters)).orderBy(asc(insumosTable.nome));
  return res.json(rows);
});

router.post("/tenants/:tenantId/insumos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [insumo] = await db.insert(insumosTable).values({ ...req.body, tenantId: tid } as any).returning();
  return res.status(201).json(insumo);
});

router.put("/tenants/:tenantId/insumos/:insumoId", async (req, res) => {
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [insumo] = await db.update(insumosTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)))
    .returning();
  if (!insumo) return res.status(404).json({ error: "Not found" });
  return res.json(insumo);
});

router.delete("/tenants/:tenantId/insumos/:insumoId", async (req, res) => {
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(insumosTable).where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));
  return res.status(204).end();
});

// ─── Estoque Central ──────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/estoque-central-obras", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select({
      id: estoqueCentralObrasTable.id,
      tenantId: estoqueCentralObrasTable.tenantId,
      insumoId: estoqueCentralObrasTable.insumoId,
      quantidadeAtual: estoqueCentralObrasTable.quantidadeAtual,
      quantidadeMinima: estoqueCentralObrasTable.quantidadeMinima,
      localizacao: estoqueCentralObrasTable.localizacao,
      updatedAt: estoqueCentralObrasTable.updatedAt,
      insumo: insumosTable,
    })
    .from(estoqueCentralObrasTable)
    .leftJoin(insumosTable, eq(estoqueCentralObrasTable.insumoId, insumosTable.id))
    .where(eq(estoqueCentralObrasTable.tenantId, tid));
  return res.json(rows);
});

// ─── Movimentações de Estoque ─────────────────────────────────────────────────

const movimentacaoSchema = z.object({
  insumoId: z.string().min(1),
  tipo: z.enum(["entrada", "saida", "alocacao", "devolucao", "transferencia"]),
  quantia: z.string(),
  origemTipo: z.enum(["central", "obra"]).optional(),
  origemObraId: z.string().optional(),
  destinoTipo: z.enum(["central", "obra"]).optional(),
  destinoObraId: z.string().optional(),
  observacao: z.string().optional(),
});

router.post("/tenants/:tenantId/estoque-obras/movimentacoes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = movimentacaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error });

  const { insumoId, tipo, quantia, origemTipo, origemObraId, destinoTipo, destinoObraId, observacao } = parsed.data;
  const qty = parseFloat(quantia);

  // Atualiza estoques envolvidos
  if (origemTipo === "central") {
    const [row] = await db.select().from(estoqueCentralObrasTable).where(and(eq(estoqueCentralObrasTable.tenantId, tid), eq(estoqueCentralObrasTable.insumoId, insumoId)));
    if (row) {
      await db.update(estoqueCentralObrasTable).set({ quantidadeAtual: String(parseFloat(row.quantidadeAtual) - qty), updatedAt: new Date() }).where(eq(estoqueCentralObrasTable.id, row.id));
    }
  } else if (origemTipo === "obra" && origemObraId) {
    const [row] = await db.select().from(estoqueObrasTable).where(and(eq(estoqueObrasTable.obraId, origemObraId), eq(estoqueObrasTable.insumoId, insumoId)));
    if (row) {
      await db.update(estoqueObrasTable).set({ quantidadeAtual: String(parseFloat(row.quantidadeAtual) - qty), updatedAt: new Date() }).where(eq(estoqueObrasTable.id, row.id));
    }
  }

  if (destinoTipo === "central") {
    const [row] = await db.select().from(estoqueCentralObrasTable).where(and(eq(estoqueCentralObrasTable.tenantId, tid), eq(estoqueCentralObrasTable.insumoId, insumoId)));
    if (row) {
      await db.update(estoqueCentralObrasTable).set({ quantidadeAtual: String(parseFloat(row.quantidadeAtual) + qty), updatedAt: new Date() }).where(eq(estoqueCentralObrasTable.id, row.id));
    } else {
      await db.insert(estoqueCentralObrasTable).values({ tenantId: tid, insumoId, quantidadeAtual: String(qty) });
    }
  } else if (destinoTipo === "obra" && destinoObraId) {
    const [row] = await db.select().from(estoqueObrasTable).where(and(eq(estoqueObrasTable.obraId, destinoObraId), eq(estoqueObrasTable.insumoId, insumoId)));
    if (row) {
      await db.update(estoqueObrasTable).set({ quantidadeAtual: String(parseFloat(row.quantidadeAtual) + qty), updatedAt: new Date() }).where(eq(estoqueObrasTable.id, row.id));
    } else {
      await db.insert(estoqueObrasTable).values({ obraId: destinoObraId, insumoId, quantidadeAtual: String(qty) });
    }
  } else if (tipo === "entrada") {
    const [row] = await db.select().from(estoqueCentralObrasTable).where(and(eq(estoqueCentralObrasTable.tenantId, tid), eq(estoqueCentralObrasTable.insumoId, insumoId)));
    if (row) {
      await db.update(estoqueCentralObrasTable).set({ quantidadeAtual: String(parseFloat(row.quantidadeAtual) + qty), updatedAt: new Date() }).where(eq(estoqueCentralObrasTable.id, row.id));
    } else {
      await db.insert(estoqueCentralObrasTable).values({ tenantId: tid, insumoId, quantidadeAtual: String(qty) });
    }
  }

  const [mov] = await db.insert(movimentacoesEstoqueObrasTable).values({
    tenantId: tid,
    insumoId,
    tipo,
    quantia,
    origemTipo,
    origemObraId,
    destinoTipo,
    destinoObraId,
    responsavelId: (req as any).user?.id,
    observacao,
  }).returning();

  return res.status(201).json(mov);
});

// ─── Composições ──────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/composicoes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(composicoesTable.tenantId, tid)];
  if (req.query.q) filters.push(ilike(composicoesTable.nome, `%${req.query.q}%`));

  const rows = await db.select().from(composicoesTable).where(and(...filters)).orderBy(asc(composicoesTable.nome));
  return res.json(rows);
});

router.post("/tenants/:tenantId/composicoes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const { itens, ...rest } = req.body as { itens?: Array<{ insumoId: string; quantidade: string; precoUnitario?: string }>; [key: string]: unknown };
  const [composicao] = await db.insert(composicoesTable).values({ ...rest, tenantId: tid } as any).returning();

  if (itens && itens.length > 0) {
    await db.insert(composicaoInsumosTable).values(itens.map((i) => ({ composicaoId: composicao.id, ...i })) as any);
  }

  return res.status(201).json(composicao);
});

router.get("/tenants/:tenantId/composicoes/:composicaoId", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [composicao] = await db.select().from(composicoesTable).where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
  if (!composicao) return res.status(404).json({ error: "Not found" });

  const itens = await db
    .select({
      id: composicaoInsumosTable.id,
      insumoId: composicaoInsumosTable.insumoId,
      quantidade: composicaoInsumosTable.quantidade,
      precoUnitario: composicaoInsumosTable.precoUnitario,
      insumo: insumosTable,
    })
    .from(composicaoInsumosTable)
    .leftJoin(insumosTable, eq(composicaoInsumosTable.insumoId, insumosTable.id))
    .where(eq(composicaoInsumosTable.composicaoId, composicaoId));

  return res.json({ ...composicao, itens });
});

router.put("/tenants/:tenantId/composicoes/:composicaoId", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [composicao] = await db.update(composicoesTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)))
    .returning();
  if (!composicao) return res.status(404).json({ error: "Not found" });
  return res.json(composicao);
});

router.delete("/tenants/:tenantId/composicoes/:composicaoId", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(composicoesTable).where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
  return res.status(204).end();
});

export default router;
