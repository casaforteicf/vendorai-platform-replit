import { Router, type IRouter } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { resolveAIKey } from "../lib/ai-gateway.js";
import { and, or, eq, desc, asc, ilike, max, inArray, gte, lte } from "drizzle-orm";
import { searchSinapi } from "../data/sinapi";
import { ensureStandardConstructionCatalog } from "../lib/ensure-standard-construction-catalog";
import { gerarRelatorioDiarioPdf } from "../lib/pdf-diario";
import { gerarOrcamentoPdf } from "../lib/pdf-orcamento";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { calcularQuantidadeCompra } from "../lib/construction-unit-conversion.js";
import {
  db,
  obrasTable,
  tenantsTable,
  obraEtapasTable,
  obraEtapaMedicoesTable,
  obraEtapaFasesTable,
  obraEtapaFaseMedicoesTable,
  obraDiarioTable,
  insumosTable,
  estoqueCentralObrasTable,
  estoqueObrasTable,
  movimentacoesEstoqueObrasTable,
  composicoesTable,
  composicaoInsumosTable,
  comprasObrasTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  obraOrcamentoItemQuantitativosHistoricoTable,
  insertObraSchema,
  updateObraSchema,
  insertObraEtapaSchema,
  updateObraEtapaSchema,
  insertObraEtapaMedicaoSchema,
  insertObraDiarioSchema,
  updateObraDiarioSchema,
  insertObraOrcamentoSchema,
  updateObraOrcamentoSchema,
  insertObraOrcamentoEtapaSchema,
  updateObraOrcamentoEtapaSchema,
  insertObraOrcamentoItemSchema,
  insertCompraObraSchema,
  insertInsumoSchema,
  updateInsumoSchema,
  insertComposicaoSchema,
  updateComposicaoSchema,
  insertComposicaoInsumoSchema,
  tabelasPrecosObrasTable,
  tabelaPrecosObrasItensTable,
  insumoPrecoHistoricoTable,
  insertTabelaPrecosObrasSchema,
  insertTabelaPrecosObrasItemSchema,
  updateObraOrcamentoItemSchema,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

const uploadFotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Apenas imagens são permitidas."));
  },
});

function tenantId(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccessTenant(req: Express.Request, tid: string) {
  return isSuperAdmin(req) || tenantId(req) === tid;
}

// ─── Gate de vertical e escopo: todas as rotas com :tenantId exigem
// vertical de construção e respeitam o tenant autenticado no JWT.
// O tenant-path-guard já rejeita qualquer tenant diferente do token antes
// de chegar aqui. Não validamos users.tenantId porque a troca oficial de
// tenant em /auth/switch-tenant emite um novo JWT sem regravar o tenant-base
// do usuário; exigir igualdade com users.tenantId quebrava todo tenant alternado.
router.param("tenantId", async (req: any, res: any, next: any, tid: string) => {
  if (isSuperAdmin(req)) return next();

  if (!canAccessTenant(req, tid)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const [scope] = await db
    .select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tid));

  if (!scope?.vertical || !scope.vertical.toLowerCase().includes("constru")) {
    return res.status(403).json({ error: "Acesso restrito à vertical de construção civil." });
  }

  return next();
});

// ─── Gate de posse: toda rota com :obraId precisa confirmar que a obra é
// desse tenant ────────────────────────────────────────────────────────────────
// ACHADO REAL DE AUDITORIA (17/09): quase toda rota abaixo checava só
// "o chamador pertence a ALGUM tenant" (canAccessTenant) e depois buscava
// etapas/diário/orçamento por obraId sozinho, sem nunca confirmar que essa
// obra é do tenant da URL. Um usuário de um tenant conseguia ler/editar/
// apagar dado de obra de OUTRO tenant só sabendo o obraId (UUID). Esse
// param handler fecha isso de uma vez pra todas as rotas com :obraId, em
// vez de precisar corrigir dezenas de handlers um por um. Confirmado no
// banco: nenhum tenant real tinha obra cadastrada ainda, então não houve
// exposição de dado de verdade — mas o buraco era real.
router.param("obraId", async (req: any, res: any, next: any, obraId: string) => {
  if (isSuperAdmin(req)) return next();
  const tid = req.params.tenantId; // tenant-audit: reviewed — é exatamente essa comparação (obra.tenantId === tid) que fecha o buraco de isolamento corrigido aqui
  const [obra] = await db
    .select({ id: obrasTable.id })
    .from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra not found" });
  return next();
});

// ─── SINAPI search (public lookup, auth-only) ──────────────────────────────────

router.get("/obras/sinapi/search", (req, res) => {
  const q = String(req.query.q ?? "");
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const results = searchSinapi(q, limit);
  return res.json(results);
});

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
  const { tenantId: tid, obraId, etapaId } = req.params; // tenant-audit: reviewed — checado por canAccessTenant() logo abaixo e consultas filtradas por obra/etapa.
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

  // obra_etapas não tem tenant_id próprio, só obra_id -- SEM esse join,
  // qualquer tenant autenticado conseguia editar a etapa de OUTRO tenant só
  // sabendo o id (achado real de auditoria, corrigido aqui).
  const [owned] = await db.select({ id: obraEtapasTable.id })
    .from(obraEtapasTable)
    .innerJoin(obrasTable, eq(obrasTable.id, obraEtapasTable.obraId))
    .where(and(eq(obraEtapasTable.id, etapaId), eq(obrasTable.tenantId, tid)));
  if (!owned) return res.status(404).json({ error: "Etapa not found" });

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

  // Mesma correção do PUT acima -- confirmar posse antes de apagar.
  const [owned] = await db.select({ id: obraEtapasTable.id })
    .from(obraEtapasTable)
    .innerJoin(obrasTable, eq(obrasTable.id, obraEtapasTable.obraId))
    .where(and(eq(obraEtapasTable.id, etapaId), eq(obrasTable.tenantId, tid)));
  if (!owned) return res.status(404).json({ error: "Etapa not found" });

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
    responsavelId: (req as any).user?.sub,
  }).returning();

  await db.update(obraEtapasTable)
    .set({ percentualExecutado: percentualNovo, updatedAt: new Date() })
    .where(eq(obraEtapasTable.id, etapaId));

  return res.status(201).json(medicao);
});

// ─── Fases e medições financeiras ─────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/etapas/:etapaId/fases", async (req, res) => {
  const { tenantId: tid, obraId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [etapa] = await db.select({ id: obraEtapasTable.id })
    .from(obraEtapasTable)
    .where(and(eq(obraEtapasTable.id, etapaId), eq(obraEtapasTable.obraId, obraId)));
  if (!etapa) return res.status(404).json({ error: "Etapa not found" });

  const fases = await db.select().from(obraEtapaFasesTable)
    .where(and(eq(obraEtapaFasesTable.obraId, obraId), eq(obraEtapaFasesTable.etapaId, etapaId)))
    .orderBy(asc(obraEtapaFasesTable.ordem));
  return res.json(fases);
});

router.get("/tenants/:tenantId/obras/:obraId/fases/:faseId/medicoes", async (req, res) => {
  const { tenantId: tid, obraId, faseId } = req.params; // tenant-audit: reviewed — checado por canAccessTenant() logo abaixo e consultas filtradas por obra/fase.
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [fase] = await db.select({ id: obraEtapaFasesTable.id })
    .from(obraEtapaFasesTable)
    .where(and(eq(obraEtapaFasesTable.id, faseId), eq(obraEtapaFasesTable.obraId, obraId)));
  if (!fase) return res.status(404).json({ error: "Fase not found" });

  const rows = await db.select().from(obraEtapaFaseMedicoesTable)
    .where(eq(obraEtapaFaseMedicoesTable.faseId, faseId))
    .orderBy(desc(obraEtapaFaseMedicoesTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/fases/:faseId/medicoes", async (req, res) => {
  const { tenantId: tid, obraId, faseId } = req.params; // tenant-audit: reviewed — checado por canAccessTenant() logo abaixo e a obra é filtrada também por tenantId.
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select().from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra not found" });

  const [fase] = await db.select().from(obraEtapaFasesTable)
    .where(and(eq(obraEtapaFasesTable.id, faseId), eq(obraEtapaFasesTable.obraId, obraId)));
  if (!fase) return res.status(404).json({ error: "Fase not found" });

  const anterior = Math.max(0, Math.min(100, Number(fase.percentualExecutado ?? 0)));
  const novo = Math.max(0, Math.min(100, Number(req.body.percentualNovo ?? anterior)));
  if (novo < anterior) {
    return res.status(422).json({ error: "A nova medição não pode ser menor que o percentual já medido." });
  }
  const delta = novo - anterior;
  if (delta <= 0) {
    return res.status(422).json({ error: "Informe avanço superior ao percentual já medido." });
  }

  const valorFase = Math.max(0, Number(fase.custoPrevisto ?? 0));
  const valorBruto = valorFase * delta / 100;

  const [baseline] = await db.select().from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.obraId, obraId),
      eq(obraOrcamentosTable.tenantId, tid),
      eq(obraOrcamentosTable.status, "aprovado"),
    ))
    .orderBy(desc(obraOrcamentosTable.versao))
    .limit(1);

  const snapshot = (baseline?.linhaBaseSnapshot ?? {}) as any;
  const presentation = snapshot?.apresentacao ?? {};
  const entradaPercentual = Math.max(0, Math.min(100, Number(presentation.entradaPercentual ?? 0)));
  const amortizacaoPercentual = Math.max(0, Math.min(100, Number(
    presentation.amortizacaoEntradaPercentual ?? entradaPercentual,
  )));
  const entradaTotal = Math.max(0, Number(snapshot?.valorTotal ?? obra.orcamentoTotal ?? 0)) * entradaPercentual / 100;

  const fasesObra = await db.select({ id: obraEtapaFasesTable.id }).from(obraEtapaFasesTable)
    .where(eq(obraEtapaFasesTable.obraId, obraId));
  const faseIds = fasesObra.map((item) => item.id);
  const medicoesAnteriores = faseIds.length
    ? await db.select({ amortizacaoEntrada: obraEtapaFaseMedicoesTable.amortizacaoEntrada })
        .from(obraEtapaFaseMedicoesTable)
        .where(inArray(obraEtapaFaseMedicoesTable.faseId, faseIds))
    : [];
  const amortizadoAteAgora = medicoesAnteriores.reduce(
    (sum, item) => sum + Number(item.amortizacaoEntrada ?? 0),
    0,
  );
  const saldoEntradaAntes = Math.max(0, entradaTotal - amortizadoAteAgora);
  const amortizacaoEntrada = presentation.mostrarAmortizacaoEntrada === false
    ? 0
    : Math.min(saldoEntradaAntes, valorBruto * amortizacaoPercentual / 100);
  const valorLiquido = Math.max(0, valorBruto - amortizacaoEntrada);
  const saldoEntradaApos = Math.max(0, saldoEntradaAntes - amortizacaoEntrada);

  const [medicao] = await db.insert(obraEtapaFaseMedicoesTable).values({
    faseId,
    data: req.body.data,
    percentualAnterior: anterior.toFixed(2),
    percentualNovo: novo.toFixed(2),
    valorBruto: valorBruto.toFixed(2),
    amortizacaoEntrada: amortizacaoEntrada.toFixed(2),
    valorLiquido: valorLiquido.toFixed(2),
    saldoEntradaApos: saldoEntradaApos.toFixed(2),
    observacao: req.body.observacao,
    responsavelId: (req as any).user?.sub,
  }).returning();

  await db.update(obraEtapaFasesTable)
    .set({
      percentualExecutado: novo.toFixed(2),
      status: novo >= 100 ? "concluida" : "em_andamento",
      updatedAt: new Date(),
    })
    .where(eq(obraEtapaFasesTable.id, faseId));

  const fasesEtapa = await db.select().from(obraEtapaFasesTable)
    .where(eq(obraEtapaFasesTable.etapaId, fase.etapaId));
  const totalPeso = fasesEtapa.reduce((sum, item) => sum + Number(item.percentualEtapa ?? 0), 0);
  const percentualEtapa = totalPeso > 0
    ? fasesEtapa.reduce(
        (sum, item) => sum + Number(item.percentualExecutado ?? 0) * Number(item.percentualEtapa ?? 0),
        0,
      ) / totalPeso
    : fasesEtapa.length
      ? fasesEtapa.reduce((sum, item) => sum + Number(item.percentualExecutado ?? 0), 0) / fasesEtapa.length
      : 0;

  await db.update(obraEtapasTable)
    .set({
      percentualExecutado: Math.min(100, percentualEtapa).toFixed(2),
      status: percentualEtapa >= 100 ? "concluida" : percentualEtapa > 0 ? "em_andamento" : "pendente",
      updatedAt: new Date(),
    })
    .where(eq(obraEtapasTable.id, fase.etapaId));

  return res.status(201).json({
    ...medicao,
    resumo: {
      percentualFaseAnterior: anterior,
      percentualFaseNovo: novo,
      valorBruto,
      amortizacaoEntrada,
      valorLiquido,
      saldoEntradaApos,
    },
  });
});

// ─── Diário de Obra ───────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/diario", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraDiarioTable).where(eq(obraDiarioTable.obraId, obraId)).orderBy(desc(obraDiarioTable.data));
  return res.json(rows);
});

// POST /tenants/:tenantId/obras/:obraId/diario/relatorio-pdf
router.post("/tenants/:tenantId/obras/:obraId/diario/relatorio-pdf", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const { dataInicio, dataFim } = req.body as { dataInicio?: string; dataFim?: string };
  if (!dataInicio || !dataFim) return res.status(422).json({ error: "dataInicio e dataFim são obrigatórios." });

  const [obra] = await db.select().from(obrasTable).where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada." });

  const [tenant] = await db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tid));

  const entradas = await db
    .select()
    .from(obraDiarioTable)
    .where(
      and(
        eq(obraDiarioTable.obraId, obraId),
        gte(obraDiarioTable.data, dataInicio),
        lte(obraDiarioTable.data, dataFim),
      ),
    )
    .orderBy(asc(obraDiarioTable.data));

  const pdf = await gerarRelatorioDiarioPdf({
    tenantName: tenant?.name ?? "Construtora",
    obraNome: obra.nome,
    obraEndereco: obra.endereco,
    dataInicio,
    dataFim,
    entradas,
  });

  const periodo = `${dataInicio}_${dataFim}`.replace(/-/g, "");
  const filename = `diario-obra-${encodeURIComponent(obra.nome.replace(/\s+/g, "-").toLowerCase())}-${periodo}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdf.length);
  return res.send(pdf);
});

// POST /tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/pdf
router.post("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/pdf", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params as Record<string, string>;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db
    .select({ nome: obrasTable.nome, endereco: obrasTable.endereco })
    .from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada." });

  const [orcamento] = await db
    .select()
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tid));

  const etapasRows = await db
    .select()
    .from(obraOrcamentoEtapasTable)
    .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId))
    .orderBy(asc(obraOrcamentoEtapasTable.ordem));

  const itensRows = await db
    .select()
    .from(obraOrcamentoItensTable)
    .where(
      inArray(
        obraOrcamentoItensTable.etapaId,
        etapasRows.length > 0 ? etapasRows.map((e) => e.id) : ["__none__"],
      ),
    )
    .orderBy(asc(obraOrcamentoItensTable.ordem));

  const etapas = etapasRows.map((e) => ({
    nome: e.nome,
    ordem: e.ordem,
    itens: itensRows
      .filter((i) => i.etapaId === e.id)
      .map((i) => ({
        nome: i.nome,
        unidade: i.unidade,
        quantidade: i.quantidade,
        custoUnitario: i.custoUnitario,
        bdi: i.bdi,
      })),
  }));

  const pdf = await gerarOrcamentoPdf({
    tenantName: tenant?.name ?? "Construtora",
    obraNome: obra.nome,
    obraEndereco: obra.endereco,
    orcamentoVersao: orcamento.versao,
    orcamentoTitulo: orcamento.titulo,
    orcamentoStatus: orcamento.status,
    bdiGlobal: orcamento.bdiGlobal,
    etapas,
  });

  const slug = obra.nome.replace(/\s+/g, "-").toLowerCase();
  const filename = `orcamento-v${orcamento.versao}-${encodeURIComponent(slug)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdf.length);
  return res.send(pdf);
});

router.post("/tenants/:tenantId/obras/:obraId/diario", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraDiarioSchema.safeParse({
    ...req.body,
    obraId,
    responsavelId: (req as any).user?.sub,
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [entry] = await db.insert(obraDiarioTable).values(parsed.data).returning();
  return res.status(201).json(entry);
});

// Buscar entrada do diário por ID direto
router.get("/tenants/:tenantId/obras/diario/:diarioId", async (req, res) => {
  const { tenantId: tid, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  // obra_diario não tem tenant_id próprio, só obra_id -- mesma correção de
  // isolamento já aplicada nas rotas de etapas acima.
  const [entry] = await db.select({ diario: obraDiarioTable })
    .from(obraDiarioTable)
    .innerJoin(obrasTable, eq(obrasTable.id, obraDiarioTable.obraId))
    .where(and(eq(obraDiarioTable.id, diarioId), eq(obrasTable.tenantId, tid)))
    .then((rows) => rows.map((r) => r.diario));
  if (!entry) return res.status(404).json({ error: "Diário not found" });
  return res.json(entry);
});

// Conveniência: atualizar entrada do diário por ID direto (sem obraId no path)
router.put("/tenants/:tenantId/obras/diario/:diarioId", async (req, res) => {
  const { tenantId: tid, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraDiarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [owned] = await db.select({ id: obraDiarioTable.id })
    .from(obraDiarioTable)
    .innerJoin(obrasTable, eq(obrasTable.id, obraDiarioTable.obraId))
    .where(and(eq(obraDiarioTable.id, diarioId), eq(obrasTable.tenantId, tid)));
  if (!owned) return res.status(404).json({ error: "Diário not found" });

  const extra: Record<string, unknown> = {};
  if (req.body.status === "aprovado") {
    extra.aprovadoPorId = (req as any).user?.sub;
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
    extra.aprovadoPorId = (req as any).user?.sub;
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

// POST /tenants/:tenantId/obras/:obraId/diario/:diarioId/fotos
// Upload de fotos para uma entrada do diário de obra (multipart/form-data; field "fotos", max 10 arquivos)
router.post(
  "/tenants/:tenantId/obras/:obraId/diario/:diarioId/fotos",
  uploadFotos.array("fotos", 10),
  async (req, res) => {
    const { tenantId: tid, obraId, diarioId } = req.params as Record<string, string>;
    if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(422).json({ error: "Nenhuma imagem enviada. Use o campo 'fotos' com arquivos de imagem." });
    }

    // Verify the diario entry exists and belongs to this obra/tenant
    const [entry] = await db
      .select({ id: obraDiarioTable.id, fotos: obraDiarioTable.fotos })
      .from(obraDiarioTable)
      .where(and(eq(obraDiarioTable.id, diarioId), eq(obraDiarioTable.obraId, obraId)));
    if (!entry) return res.status(404).json({ error: "Entrada de diário não encontrada." });

    const storage = new ObjectStorageService();
    const caption = (req.body as { caption?: string }).caption;
    const uploadedAt = new Date().toISOString();

    const novasFotos: Array<{ url: string; caption?: string; uploadedAt: string }> = [];
    for (const file of files) {
      const url = await storage.savePrivateBuffer(file.buffer, file.mimetype, file.originalname);
      novasFotos.push({ url, ...(caption ? { caption } : {}), uploadedAt });
    }

    const fotosExistentes: Array<{ url: string; caption?: string; uploadedAt: string }> =
      Array.isArray(entry.fotos) ? (entry.fotos as Array<{ url: string; caption?: string; uploadedAt: string }>) : [];

    const [updated] = await db
      .update(obraDiarioTable)
      .set({ fotos: [...fotosExistentes, ...novasFotos] })
      .where(eq(obraDiarioTable.id, diarioId))
      .returning();

    return res.status(201).json({
      uploaded: novasFotos.length,
      fotos: (updated as typeof entry).fotos,
    });
  },
);

// POST /tenants/:tenantId/obras/:obraId/diario/:diarioId/resumo-ia
// Gera um resumo textual do dia com IA (Anthropic Claude) e salva no registro
router.post("/tenants/:tenantId/obras/:obraId/diario/:diarioId/resumo-ia", async (req, res) => {
  const { tenantId: tid, obraId, diarioId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [entry] = await db
    .select()
    .from(obraDiarioTable)
    .where(and(eq(obraDiarioTable.id, diarioId), eq(obraDiarioTable.obraId, obraId)));
  if (!entry) return res.status(404).json({ error: "Entrada de diário não encontrada." });

  let apiKey: string;
  try {
    const resolved = await resolveAIKey(tid, "anthropic");
    apiKey = resolved.apiKey;
  } catch {
    return res.status(422).json({ error: "Chave Anthropic não configurada para este tenant." });
  }

  const partes: string[] = [];
  if (entry.climaTempo) partes.push(`Clima: ${entry.climaTempo}`);
  if (entry.maoDeObra != null) partes.push(`Mão de obra: ${entry.maoDeObra} trabalhadores`);
  partes.push(`\nAtividades realizadas:\n${entry.conteudo}`);
  if (entry.observacoes) partes.push(`\nObservações / ocorrências:\n${entry.observacoes}`);
  if (Array.isArray(entry.fotos) && entry.fotos.length > 0) {
    partes.push(`\nFotos registradas: ${entry.fotos.length} imagem(ns)`);
  }

  const prompt = `Você é assistente de engenharia civil. Gere um resumo executivo curto (máx 4 linhas) do registro diário de obra abaixo, destacando: principais atividades, condições do canteiro e ocorrências relevantes. Seja objetivo e use linguagem técnica clara.\n\n${partes.join("\n")}`;

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const resumo = (message.content[0] as { type: string; text: string }).text ?? "";

  const [updated] = await db
    .update(obraDiarioTable)
    .set({ resumoIA: resumo })
    .where(eq(obraDiarioTable.id, diarioId))
    .returning();

  return res.json(updated);
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

  const parsed = insertCompraObraSchema.safeParse({ ...req.body, tenantId: tid, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [compra] = await db.insert(comprasObrasTable).values(parsed.data).returning();
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

// ─── Base Mestre de Preços: propagação segura ─────────────────────────────────

function numberOrZero(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function recalcularCustoComposicao(composicaoId: string): Promise<number> {
  const itens = await db
    .select({
      quantidade: composicaoInsumosTable.quantidade,
      precoMestre: insumosTable.precoUnitario,
    })
    .from(composicaoInsumosTable)
    .leftJoin(insumosTable, eq(composicaoInsumosTable.insumoId, insumosTable.id))
    .where(eq(composicaoInsumosTable.composicaoId, composicaoId));

  const total = itens.reduce((sum, item) => {
    const quantidade = numberOrZero(item.quantidade);
    const preco = numberOrZero(item.precoMestre);
    return sum + quantidade * preco;
  }, 0);

  await db
    .update(composicoesTable)
    .set({ custoTotal: total.toFixed(4), updatedAt: new Date() })
    .where(eq(composicoesTable.id, composicaoId));

  return total;
}

async function propagarPrecoParaOrcamentos(params: {
  tenantId: string;
  insumoId: string;
  precoInsumo: number;
  composicoesAtualizadas: Map<string, number>;
}) {
  const { tenantId: tid, insumoId, precoInsumo, composicoesAtualizadas } = params;
  const composicaoIds = [...composicoesAtualizadas.keys()];
  const sourceFilters = [eq(obraOrcamentoItensTable.insumoId, insumoId)];
  if (composicaoIds.length > 0) {
    sourceFilters.push(inArray(obraOrcamentoItensTable.composicaoId, composicaoIds));
  }

  const itens = await db
    .select({
      itemId: obraOrcamentoItensTable.id,
      insumoId: obraOrcamentoItensTable.insumoId,
      composicaoId: obraOrcamentoItensTable.composicaoId,
      orcamentoId: obraOrcamentosTable.id,
      status: obraOrcamentosTable.status,
    })
    .from(obraOrcamentoItensTable)
    .innerJoin(obraOrcamentoEtapasTable, eq(obraOrcamentoItensTable.etapaId, obraOrcamentoEtapasTable.id))
    .innerJoin(obraOrcamentosTable, eq(obraOrcamentoEtapasTable.orcamentoId, obraOrcamentosTable.id))
    .where(and(
      eq(obraOrcamentosTable.tenantId, tid),
      or(...sourceFilters),
    ));

  const rascunhos = new Set<string>();
  const enviados = new Set<string>();

  for (const item of itens) {
    if (item.status === "rascunho") {
      const custo = item.composicaoId
        ? composicoesAtualizadas.get(item.composicaoId)
        : precoInsumo;
      if (custo == null) continue;

      await db
        .update(obraOrcamentoItensTable)
        .set({
          custoUnitario: custo.toFixed(4),
          precoAtualizadoEm: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(obraOrcamentoItensTable.id, item.itemId));
      rascunhos.add(item.orcamentoId);
    } else if (item.status === "enviado") {
      enviados.add(item.orcamentoId);
    }
    // aprovado/contratado e demais estados ficam congelados por desenho.
  }

  if (rascunhos.size > 0) {
    await db
      .update(obraOrcamentosTable)
      .set({
        precosDesatualizados: false,
        precosAtualizadosEm: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(obraOrcamentosTable.id, [...rascunhos]));
  }

  if (enviados.size > 0) {
    await db
      .update(obraOrcamentosTable)
      .set({ precosDesatualizados: true, updatedAt: new Date() })
      .where(inArray(obraOrcamentosTable.id, [...enviados]));
  }

  return {
    orcamentosRecalculados: rascunhos.size,
    orcamentosComAviso: enviados.size,
  };
}

async function aplicarPrecoMestre(params: {
  tenantId: string;
  insumoId: string;
  precoNovo: number;
  tabelaPrecoId?: string | null;
  fornecedor?: string | null;
  regiao?: string | null;
  origem?: string;
  alteradoPorId?: string | null;
}) {
  const {
    tenantId: tid,
    insumoId,
    precoNovo,
    tabelaPrecoId = null,
    fornecedor = null,
    regiao = null,
    origem = "tabela_precos",
    alteradoPorId = null,
  } = params;

  const [insumo] = await db
    .select()
    .from(insumosTable)
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));

  if (!insumo) return null;

  const precoAnterior = insumo.precoUnitario == null ? null : numberOrZero(insumo.precoUnitario);

  await db
    .update(insumosTable)
    .set({ precoUnitario: precoNovo.toFixed(4), updatedAt: new Date() })
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));

  if (precoAnterior == null || Math.abs(precoAnterior - precoNovo) > 0.00005) {
    await db.insert(insumoPrecoHistoricoTable).values({
      tenantId: tid,
      insumoId,
      tabelaPrecoId,
      precoAnterior: precoAnterior == null ? null : precoAnterior.toFixed(4),
      precoNovo: precoNovo.toFixed(4),
      origem,
      fornecedor,
      regiao,
      alteradoPorId,
    });
  }

  const composicoes = await db
    .select({ id: composicoesTable.id })
    .from(composicaoInsumosTable)
    .innerJoin(composicoesTable, eq(composicaoInsumosTable.composicaoId, composicoesTable.id))
    .where(and(
      eq(composicaoInsumosTable.insumoId, insumoId),
      eq(composicoesTable.tenantId, tid),
    ));

  const custosComposicoes = new Map<string, number>();
  for (const composicao of composicoes) {
    const custo = await recalcularCustoComposicao(composicao.id);
    custosComposicoes.set(composicao.id, custo);
  }

  const impacto = await propagarPrecoParaOrcamentos({
    tenantId: tid,
    insumoId,
    precoInsumo: precoNovo,
    composicoesAtualizadas: custosComposicoes,
  });

  return {
    insumoId,
    precoAnterior,
    precoNovo,
    composicoesRecalculadas: custosComposicoes.size,
    ...impacto,
  };
}

async function recalcularOrcamentoComTabelaAtual(tenantId: string, orcamentoId: string) {
  const [orcamento] = await db
    .select({ id: obraOrcamentosTable.id, status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tenantId),
    ));

  if (!orcamento) return { ok: false as const, motivo: "not_found" as const };
  if (orcamento.status === "aprovado" || orcamento.status === "contratado") {
    return { ok: false as const, motivo: "locked" as const };
  }

  const itens = await db
    .select({
      id: obraOrcamentoItensTable.id,
      insumoId: obraOrcamentoItensTable.insumoId,
      composicaoId: obraOrcamentoItensTable.composicaoId,
    })
    .from(obraOrcamentoItensTable)
    .innerJoin(obraOrcamentoEtapasTable, eq(obraOrcamentoItensTable.etapaId, obraOrcamentoEtapasTable.id))
    .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId));

  let atualizados = 0;
  for (const item of itens) {
    let custo: number | null = null;

    if (item.composicaoId) {
      const [comp] = await db
        .select({ custoTotal: composicoesTable.custoTotal })
        .from(composicoesTable)
        .where(and(
          eq(composicoesTable.id, item.composicaoId),
          eq(composicoesTable.tenantId, tenantId),
        ));
      if (comp?.custoTotal != null) custo = numberOrZero(comp.custoTotal);
    } else if (item.insumoId) {
      const [insumo] = await db
        .select({ precoUnitario: insumosTable.precoUnitario })
        .from(insumosTable)
        .where(and(
          eq(insumosTable.id, item.insumoId),
          eq(insumosTable.tenantId, tenantId),
        ));
      if (insumo?.precoUnitario != null) custo = numberOrZero(insumo.precoUnitario);
    }

    if (custo == null) continue;

    await db
      .update(obraOrcamentoItensTable)
      .set({
        custoUnitario: custo.toFixed(4),
        precoAtualizadoEm: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(obraOrcamentoItensTable.id, item.id));
    atualizados += 1;
  }

  const [tabelaPadrao] = await db
    .select({ id: tabelasPrecosObrasTable.id })
    .from(tabelasPrecosObrasTable)
    .where(and(
      eq(tabelasPrecosObrasTable.tenantId, tenantId),
      eq(tabelasPrecosObrasTable.isPadrao, true),
      eq(tabelasPrecosObrasTable.ativo, true),
    ));

  await db
    .update(obraOrcamentosTable)
    .set({
      tabelaPrecoId: tabelaPadrao?.id ?? null,
      precosDesatualizados: false,
      precosAtualizadosEm: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(obraOrcamentosTable.id, orcamentoId));

  return { ok: true as const, itensAtualizados: atualizados, tabelaPrecoId: tabelaPadrao?.id ?? null };
}

// ─── Insumos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/insumos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(insumosTable.tenantId, tid)];
  if (req.query.q) filters.push(ilike(insumosTable.nome, `%${req.query.q}%`));
  if (req.query.categoria) filters.push(eq(insumosTable.categoria, req.query.categoria as string));
  if (req.query.tipo) filters.push(eq(insumosTable.tipo, req.query.tipo as string));

  const rows = await db.select().from(insumosTable).where(and(...filters)).orderBy(asc(insumosTable.nome));
  return res.json(rows);
});

const importInsumosEmLoteSchema = z.object({
  rows: z.array(z.object({
    codigo: z.string().trim().max(100).optional().nullable(),
    nome: z.string().trim().min(1).max(500),
    descricao: z.string().trim().max(2000).optional().nullable(),
    unidade: z.string().trim().min(1).max(50),
    unidadeCompra: z.string().trim().max(50).optional().nullable(),
    fatorCompraParaConsumo: z.union([z.string(), z.number()]).optional().nullable(),
    embalagemQuantidade: z.union([z.string(), z.number()]).optional().nullable(),
    quantidadeMinimaCompra: z.union([z.string(), z.number()]).optional().nullable(),
    multiploCompra: z.union([z.string(), z.number()]).optional().nullable(),
    permiteFracionarCompra: z.boolean().optional().nullable(),
    perdaPadraoPercentual: z.union([z.string(), z.number()]).optional().nullable(),
    tipo: z.enum(["material", "mao_de_obra", "equipamento", "servico"]).optional().nullable(),
    precoUnitario: z.union([z.string(), z.number()]).optional().nullable(),
    categoria: z.string().trim().max(255).optional().nullable(),
  })).min(1).max(5000),
});

router.post("/tenants/:tenantId/insumos/importar", async (req, res) => {
  // router.param("tenantId") confirma vertical e escopo do tenant autenticado.
  // tenant-audit: reviewed — o tenant da rota já foi validado contra o JWT antes deste handler
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsedBody = importInsumosEmLoteSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(422).json({ error: parsedBody.error.message });
  }

  const validRows: Array<{
    tenantId: string;
    codigo?: string;
    nome: string;
    descricao?: string;
    unidade: string;
    tipo?: "material" | "mao_de_obra" | "equipamento" | "servico";
    precoUnitario?: string;
    categoria?: string;
  }> = [];
  let invalidas = 0;

  // Deduplica o próprio arquivo. Código é a chave principal; sem código,
  // nome normalizado vira a chave. A última ocorrência vence.
  const dedup = new Map<string, (typeof parsedBody.data.rows)[number]>();
  for (const raw of parsedBody.data.rows) {
    const codigo = raw.codigo?.trim() || "";
    const nome = raw.nome.trim();
    const key = codigo ? `codigo:${codigo.toLowerCase()}` : `nome:${nome.toLowerCase()}`;
    dedup.set(key, raw);
  }

  for (const raw of dedup.values()) {
    const payload = {
      tenantId: tid,
      nome: raw.nome.trim(),
      unidade: raw.unidade.trim(),
      ...(raw.unidadeCompra?.trim() ? { unidadeCompra: raw.unidadeCompra.trim() } : {}),
      ...(raw.fatorCompraParaConsumo != null && String(raw.fatorCompraParaConsumo).trim() !== "" ? { fatorCompraParaConsumo: String(raw.fatorCompraParaConsumo).trim() } : {}),
      ...(raw.embalagemQuantidade != null && String(raw.embalagemQuantidade).trim() !== "" ? { embalagemQuantidade: String(raw.embalagemQuantidade).trim() } : {}),
      ...(raw.quantidadeMinimaCompra != null && String(raw.quantidadeMinimaCompra).trim() !== "" ? { quantidadeMinimaCompra: String(raw.quantidadeMinimaCompra).trim() } : {}),
      ...(raw.multiploCompra != null && String(raw.multiploCompra).trim() !== "" ? { multiploCompra: String(raw.multiploCompra).trim() } : {}),
      ...(raw.permiteFracionarCompra != null ? { permiteFracionarCompra: raw.permiteFracionarCompra } : {}),
      ...(raw.perdaPadraoPercentual != null && String(raw.perdaPadraoPercentual).trim() !== "" ? { perdaPadraoPercentual: String(raw.perdaPadraoPercentual).trim() } : {}),
      ...(raw.tipo ? { tipo: raw.tipo } : {}),
      ...(raw.codigo?.trim() ? { codigo: raw.codigo.trim() } : {}),
      ...(raw.descricao?.trim() ? { descricao: raw.descricao.trim() } : {}),
      ...(raw.categoria?.trim() ? { categoria: raw.categoria.trim() } : {}),
      ...(raw.precoUnitario !== undefined && raw.precoUnitario !== null && String(raw.precoUnitario).trim() !== ""
        ? { precoUnitario: String(raw.precoUnitario).trim() }
        : {}),
    };

    const parsed = insertInsumoSchema.safeParse(payload);
    if (!parsed.success) {
      invalidas += 1;
      continue;
    }
    validRows.push(parsed.data);
  }

  if (validRows.length === 0) {
    return res.status(422).json({ error: "Nenhuma linha válida encontrada no arquivo." });
  }

  const existing = await db
    .select()
    .from(insumosTable)
    .where(eq(insumosTable.tenantId, tid));

  const byCodigo = new Map(
    existing
      .filter((item) => item.codigo?.trim())
      .map((item) => [item.codigo!.trim().toLowerCase(), item] as const),
  );
  const byNome = new Map(existing.map((item) => [item.nome.trim().toLowerCase(), item] as const));

  const novos: typeof validRows = [];
  const atualizacoes: Array<{
    id: string;
    data: Partial<(typeof validRows)[number]>;
    precoNovo?: number;
    precoAnterior?: number | null;
  }> = [];

  for (const row of validRows) {
    const found =
      (row.codigo ? byCodigo.get(row.codigo.trim().toLowerCase()) : undefined)
      ?? byNome.get(row.nome.trim().toLowerCase());

    if (!found) {
      novos.push(row);
      continue;
    }

    const data: Partial<(typeof validRows)[number]> = {
      nome: row.nome,
      unidade: row.unidade,
      ...(row.tipo ? { tipo: row.tipo } : {}),
      ...(row.codigo ? { codigo: row.codigo } : {}),
      ...(row.descricao !== undefined ? { descricao: row.descricao } : {}),
      ...(row.categoria !== undefined ? { categoria: row.categoria } : {}),
    };

    let precoNovo: number | undefined;
    const precoAnterior = found.precoUnitario == null ? null : numberOrZero(found.precoUnitario);
    if (row.precoUnitario !== undefined) {
      const candidate = numberOrZero(row.precoUnitario);
      if (precoAnterior == null || Math.abs(candidate - precoAnterior) > 0.00005) {
        precoNovo = candidate;
      }
    }

    atualizacoes.push({ id: found.id, data, precoNovo, precoAnterior });
  }

  await db.transaction(async (tx) => {
    if (novos.length > 0) {
      await tx.insert(insumosTable).values(novos);
    }

    for (const update of atualizacoes) {
      await tx
        .update(insumosTable)
        .set({ ...update.data, updatedAt: new Date() })
        .where(and(eq(insumosTable.id, update.id), eq(insumosTable.tenantId, tid)));
    }
  });

  let precosAtualizados = 0;
  let composicoesRecalculadas = 0;
  let orcamentosRecalculados = 0;
  let orcamentosComAviso = 0;

  // Preço usa o motor central fora da transação acima para registrar histórico
  // e propagar apenas aos orçamentos que podem acompanhar a tabela mestre.
  for (const update of atualizacoes) {
    if (update.precoNovo === undefined) continue;
    const impacto = await aplicarPrecoMestre({
      tenantId: tid,
      insumoId: update.id,
      precoNovo: update.precoNovo,
      origem: "importacao_csv",
      alteradoPorId: (req as any).user?.sub ?? null,
    });
    if (!impacto) continue;
    precosAtualizados += 1;
    composicoesRecalculadas += impacto.composicoesRecalculadas;
    orcamentosRecalculados += impacto.orcamentosRecalculados;
    orcamentosComAviso += impacto.orcamentosComAviso;
  }

  return res.json({
    totalRecebido: parsedBody.data.rows.length,
    validos: validRows.length,
    novos: novos.length,
    existentesAtualizados: atualizacoes.length,
    precosAtualizados,
    invalidas,
    duplicadasNoArquivo: parsedBody.data.rows.length - dedup.size,
    composicoesRecalculadas,
    orcamentosRecalculados,
    orcamentosComAviso,
  });
});

router.post("/tenants/:tenantId/insumos/:insumoId/calcular-compra", async (req, res) => {
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const bodySchema = z.object({
    quantidadeTecnica: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().nonnegative()),
    perdaPercentualOverride: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().nonnegative()).optional().nullable(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [insumo] = await db
    .select()
    .from(insumosTable)
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));
  if (!insumo) return res.status(404).json({ error: "Insumo não encontrado" });

  const calculo = calcularQuantidadeCompra({
    quantidadeTecnica: parsed.data.quantidadeTecnica,
    fatorCompraParaConsumo: numberOrZero(insumo.fatorCompraParaConsumo) || 1,
    perdaPadraoPercentual: numberOrZero(insumo.perdaPadraoPercentual),
    perdaPercentualOverride: parsed.data.perdaPercentualOverride ?? null,
    quantidadeMinimaCompra: numberOrZero(insumo.quantidadeMinimaCompra),
    multiploCompra: numberOrZero(insumo.multiploCompra),
    permiteFracionarCompra: insumo.permiteFracionarCompra,
  });

  return res.json({
    insumoId: insumo.id,
    unidadeConsumo: insumo.unidade,
    unidadeCompra: insumo.unidadeCompra ?? insumo.unidade,
    fatorCompraParaConsumo: numberOrZero(insumo.fatorCompraParaConsumo) || 1,
    embalagemQuantidade: numberOrZero(insumo.embalagemQuantidade),
    ...calculo,
  });
});

router.post("/tenants/:tenantId/insumos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertInsumoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [insumo] = await db.insert(insumosTable).values(parsed.data).returning();
  return res.status(201).json(insumo);
});

router.put("/tenants/:tenantId/insumos/:insumoId", async (req, res) => {
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateInsumoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  let impactoPreco: Awaited<ReturnType<typeof aplicarPrecoMestre>> | null = null;
  if (parsed.data.precoUnitario !== undefined) {
    impactoPreco = await aplicarPrecoMestre({
      tenantId: tid,
      insumoId,
      precoNovo: numberOrZero(parsed.data.precoUnitario),
      origem: "cadastro_insumo",
      alteradoPorId: (req as any).user?.sub ?? null,
    });
  }

  const [insumo] = await db.update(insumosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)))
    .returning();
  if (!insumo) return res.status(404).json({ error: "Not found" });
  return res.json({ ...insumo, impactoPreco });
});

router.delete("/tenants/:tenantId/insumos/:insumoId", async (req, res) => {
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(insumosTable).where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));
  return res.status(204).end();
});

// ─── Tabelas de Preços de Obras ───────────────────────────────────────────────

router.get("/tenants/:tenantId/tabelas-precos-obras", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated immediately by canAccessTenant before any tenant-scoped data access
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(tabelasPrecosObrasTable)
    .where(eq(tabelasPrecosObrasTable.tenantId, tid))
    .orderBy(desc(tabelasPrecosObrasTable.isPadrao), desc(tabelasPrecosObrasTable.updatedAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/tabelas-precos-obras", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated immediately by canAccessTenant before any tenant-scoped data access
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertTabelaPrecosObrasSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.isPadrao) {
    await db
      .update(tabelasPrecosObrasTable)
      .set({ isPadrao: false, updatedAt: new Date() })
      .where(eq(tabelasPrecosObrasTable.tenantId, tid));
  }

  const [row] = await db.insert(tabelasPrecosObrasTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/tabelas-precos-obras/:tabelaId/itens", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated immediately by canAccessTenant before any tenant-scoped data access
  const { tenantId: tid, tabelaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [tabela] = await db
    .select()
    .from(tabelasPrecosObrasTable)
    .where(and(eq(tabelasPrecosObrasTable.id, tabelaId), eq(tabelasPrecosObrasTable.tenantId, tid)));
  if (!tabela) return res.status(404).json({ error: "Tabela de preços não encontrada" });

  const itens = await db
    .select({
      id: tabelaPrecosObrasItensTable.id,
      tabelaPrecoId: tabelaPrecosObrasItensTable.tabelaPrecoId,
      insumoId: tabelaPrecosObrasItensTable.insumoId,
      precoBase: tabelaPrecosObrasItensTable.precoBase,
      freteUnitario: tabelaPrecosObrasItensTable.freteUnitario,
      impostosPercentual: tabelaPrecosObrasItensTable.impostosPercentual,
      descontoPercentual: tabelaPrecosObrasItensTable.descontoPercentual,
      precoFinal: tabelaPrecosObrasItensTable.precoFinal,
      fornecedor: tabelaPrecosObrasItensTable.fornecedor,
      marca: tabelaPrecosObrasItensTable.marca,
      regiao: tabelaPrecosObrasItensTable.regiao,
      dataCotacao: tabelaPrecosObrasItensTable.dataCotacao,
      validade: tabelaPrecosObrasItensTable.validade,
      observacoes: tabelaPrecosObrasItensTable.observacoes,
      updatedAt: tabelaPrecosObrasItensTable.updatedAt,
      insumo: insumosTable,
    })
    .from(tabelaPrecosObrasItensTable)
    .innerJoin(insumosTable, eq(tabelaPrecosObrasItensTable.insumoId, insumosTable.id))
    .where(and(
      eq(tabelaPrecosObrasItensTable.tabelaPrecoId, tabelaId),
      eq(insumosTable.tenantId, tid),
    ))
    .orderBy(asc(insumosTable.nome));

  return res.json({ tabela, itens });
});

router.put("/tenants/:tenantId/tabelas-precos-obras/:tabelaId/itens/:insumoId", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated immediately by canAccessTenant before any tenant-scoped data access
  const { tenantId: tid, tabelaId, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [tabela] = await db
    .select()
    .from(tabelasPrecosObrasTable)
    .where(and(eq(tabelasPrecosObrasTable.id, tabelaId), eq(tabelasPrecosObrasTable.tenantId, tid)));
  if (!tabela) return res.status(404).json({ error: "Tabela de preços não encontrada" });

  const [insumo] = await db
    .select({ id: insumosTable.id })
    .from(insumosTable)
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));
  if (!insumo) return res.status(404).json({ error: "Insumo não encontrado" });

  const precoBaseRaw = Number(req.body.precoBase);
  if (!Number.isFinite(precoBaseRaw) || precoBaseRaw < 0) {
    return res.status(422).json({ error: "precoBase inválido" });
  }

  const frete = Math.max(0, numberOrZero(req.body.freteUnitario));
  const impostos = Math.max(0, numberOrZero(req.body.impostosPercentual));
  const desconto = Math.max(0, Math.min(100, numberOrZero(req.body.descontoPercentual)));
  const precoFinal = (precoBaseRaw + frete) * (1 + impostos / 100) * (1 - desconto / 100);

  const payload = {
    tabelaPrecoId: tabelaId,
    insumoId,
    precoBase: precoBaseRaw.toFixed(4),
    freteUnitario: frete.toFixed(4),
    impostosPercentual: impostos.toFixed(4),
    descontoPercentual: desconto.toFixed(4),
    precoFinal: precoFinal.toFixed(4),
    fornecedor: req.body.fornecedor ?? tabela.fornecedor ?? null,
    marca: req.body.marca ?? null,
    regiao: req.body.regiao ?? tabela.regiao ?? null,
    dataCotacao: req.body.dataCotacao ?? null,
    validade: req.body.validade ?? null,
    observacoes: req.body.observacoes ?? null,
  };

  const parsed = insertTabelaPrecosObrasItemSchema.safeParse(payload);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [existing] = await db
    .select({ id: tabelaPrecosObrasItensTable.id })
    .from(tabelaPrecosObrasItensTable)
    .where(and(
      eq(tabelaPrecosObrasItensTable.tabelaPrecoId, tabelaId),
      eq(tabelaPrecosObrasItensTable.insumoId, insumoId),
    ));

  const [row] = existing
    ? await db
        .update(tabelaPrecosObrasItensTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(tabelaPrecosObrasItensTable.id, existing.id))
        .returning()
    : await db.insert(tabelaPrecosObrasItensTable).values(parsed.data).returning();

  let impacto = null;
  if (tabela.isPadrao && tabela.ativo) {
    impacto = await aplicarPrecoMestre({
      tenantId: tid,
      insumoId,
      precoNovo: precoFinal,
      tabelaPrecoId: tabelaId,
      fornecedor: payload.fornecedor,
      regiao: payload.regiao,
      origem: "tabela_precos",
      alteradoPorId: (req as any).user?.sub ?? null,
    });
  }

  return res.json({ ...row, impacto });
});

router.post("/tenants/:tenantId/tabelas-precos-obras/:tabelaId/ativar", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated immediately by canAccessTenant before any tenant-scoped data access
  const { tenantId: tid, tabelaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [tabela] = await db
    .select()
    .from(tabelasPrecosObrasTable)
    .where(and(eq(tabelasPrecosObrasTable.id, tabelaId), eq(tabelasPrecosObrasTable.tenantId, tid)));
  if (!tabela) return res.status(404).json({ error: "Tabela de preços não encontrada" });

  await db
    .update(tabelasPrecosObrasTable)
    .set({ isPadrao: false, updatedAt: new Date() })
    .where(eq(tabelasPrecosObrasTable.tenantId, tid));

  await db
    .update(tabelasPrecosObrasTable)
    .set({ isPadrao: true, ativo: true, updatedAt: new Date() })
    .where(eq(tabelasPrecosObrasTable.id, tabelaId));

  const itens = await db
    .select()
    .from(tabelaPrecosObrasItensTable)
    .where(eq(tabelaPrecosObrasItensTable.tabelaPrecoId, tabelaId));

  let composicoesRecalculadas = 0;
  const rascunhos = new Set<string>();
  const enviados = new Set<string>();

  for (const item of itens) {
    const impacto = await aplicarPrecoMestre({
      tenantId: tid,
      insumoId: item.insumoId,
      precoNovo: numberOrZero(item.precoFinal),
      tabelaPrecoId: tabelaId,
      fornecedor: item.fornecedor ?? tabela.fornecedor,
      regiao: item.regiao ?? tabela.regiao,
      origem: "ativacao_tabela_precos",
      alteradoPorId: (req as any).user?.sub ?? null,
    });
    if (impacto) {
      composicoesRecalculadas += impacto.composicoesRecalculadas;
      if (impacto.orcamentosRecalculados > 0) rascunhos.add(item.insumoId);
      if (impacto.orcamentosComAviso > 0) enviados.add(item.insumoId);
    }
  }

  return res.json({
    tabelaId,
    itensAplicados: itens.length,
    composicoesRecalculadas,
    insumosComImpactoEmRascunhos: rascunhos.size,
    insumosComImpactoEmEnviados: enviados.size,
  });
});

router.get("/tenants/:tenantId/insumos/:insumoId/precos-historico", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated immediately by canAccessTenant before any tenant-scoped data access
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(insumoPrecoHistoricoTable)
    .where(and(
      eq(insumoPrecoHistoricoTable.tenantId, tid),
      eq(insumoPrecoHistoricoTable.insumoId, insumoId),
    ))
    .orderBy(desc(insumoPrecoHistoricoTable.createdAt));

  return res.json(rows);
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

  // estoque_obras não tem tenant_id próprio, só obra_id -- e origemObraId/
  // destinoObraId vêm do CORPO da requisição, não da URL, então
  // canAccessTenant(tid) sozinho não impede mandar o obraId de outro
  // tenant aqui (achado real de auditoria). Confirma posse de qualquer
  // obraId envolvido antes de mexer em qualquer estoque.
  const obraIdsEnvolvidos = [origemTipo === "obra" ? origemObraId : null, destinoTipo === "obra" ? destinoObraId : null]
    .filter((v): v is string => !!v);
  if (obraIdsEnvolvidos.length > 0) {
    const obrasDoTenant = await db.select({ id: obrasTable.id }).from(obrasTable)
      .where(and(inArray(obrasTable.id, obraIdsEnvolvidos), eq(obrasTable.tenantId, tid)));
    if (obrasDoTenant.length !== new Set(obraIdsEnvolvidos).size) {
      return res.status(404).json({ error: "Obra not found" });
    }
  }

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
    responsavelId: (req as any).user?.sub,
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

  const rows = await db
    .select()
    .from(composicoesTable)
    .where(and(...filters))
    .orderBy(
      asc(composicoesTable.etapaKey),
      asc(composicoesTable.ordem),
      asc(composicoesTable.nome),
    );
  if (rows.length === 0) return res.json(rows);

  // O custo da composição é sempre calculado pela Tabela Mestre de Insumos.
  // Não existe preço paralelo na composição: alterar o insumo atualiza todas
  // as composições dependentes e os orçamentos que ainda podem ser recalculados.
  const itens = await db
    .select({
      composicaoId: composicaoInsumosTable.composicaoId,
      quantidade: composicaoInsumosTable.quantidade,
      precoInsumo: insumosTable.precoUnitario,
    })
    .from(composicaoInsumosTable)
    .leftJoin(insumosTable, eq(composicaoInsumosTable.insumoId, insumosTable.id))
    .where(inArray(composicaoInsumosTable.composicaoId, rows.map((row) => row.id)));

  const totais = new Map<string, number>();
  for (const item of itens) {
    const quantidade = Number(item.quantidade ?? 0);
    const preco = Number(item.precoInsumo ?? 0);
    totais.set(item.composicaoId, (totais.get(item.composicaoId) ?? 0) + quantidade * preco);
  }

  return res.json(rows.map((row) => ({
    ...row,
    custoTotal: (totais.get(row.id) ?? 0).toFixed(4),
  })));
});

router.post("/tenants/:tenantId/composicoes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const { itens: rawItens, ...rest } = req.body as { itens?: unknown; [key: string]: unknown };
  if (rawItens !== undefined && !Array.isArray(rawItens)) {
    return res.status(422).json({ error: "itens deve ser uma lista." });
  }
  const itens = rawItens as unknown[] | undefined;

  const parsedComposicao = insertComposicaoSchema.safeParse({ ...rest, tenantId: tid });
  if (!parsedComposicao.success) return res.status(422).json({ error: parsedComposicao.error.message });

  const parsedItens = z.array(insertComposicaoInsumoSchema).safeParse(
    (itens ?? []).map((item) => ({ ...(item as object), composicaoId: "__pending__" }))
  );
  if (!parsedItens.success) return res.status(422).json({ error: parsedItens.error.message });

  const insumoIds = [...new Set(parsedItens.data.map((item) => item.insumoId))];
  const insumos = insumoIds.length
    ? await db
        .select({ id: insumosTable.id, precoUnitario: insumosTable.precoUnitario })
        .from(insumosTable)
        .where(and(eq(insumosTable.tenantId, tid), inArray(insumosTable.id, insumoIds)))
    : [];

  if (insumos.length !== insumoIds.length) {
    return res.status(422).json({ error: "Um ou mais insumos não pertencem a este tenant." });
  }

  const precoPorInsumo = new Map(insumos.map((item) => [item.id, Number(item.precoUnitario ?? 0)]));
  const custoTotal = parsedItens.data.reduce((sum, item) => {
    const preco = Number(precoPorInsumo.get(item.insumoId) ?? 0);
    return sum + Number(item.quantidade ?? 0) * preco;
  }, 0);

  const composicao = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(composicoesTable)
      .values({ ...parsedComposicao.data, custoTotal: custoTotal.toFixed(4) })
      .returning();

    if (parsedItens.data.length > 0) {
      await tx.insert(composicaoInsumosTable).values(
        parsedItens.data.map((item) => ({
          composicaoId: created.id,
          insumoId: item.insumoId,
          quantidade: item.quantidade,
        }))
      );
    }

    return created;
  });

  return res.status(201).json(composicao);
});


router.post("/tenants/:tenantId/composicoes/catalogo-padrao/aplicar", async (req, res) => { // tenant-audit: reviewed router.param tenantId + canAccessTenant enforce tenant isolation
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  try {
    const result = await ensureStandardConstructionCatalog(tid);
    return res.json(result);
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Falha ao aplicar catálogo padrão Arqdor.",
    });
  }
});

router.get("/tenants/:tenantId/composicoes/:composicaoId", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [composicao] = await db
    .select()
    .from(composicoesTable)
    .where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
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

  const custoTotal = itens.reduce((sum, item) => {
    const quantidade = Number(item.quantidade ?? 0);
    const preco = Number(item.insumo?.precoUnitario ?? 0);
    return sum + quantidade * preco;
  }, 0);

  return res.json({ ...composicao, custoTotal: custoTotal.toFixed(4), itens });
});

router.put("/tenants/:tenantId/composicoes/:composicaoId", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [owned] = await db
    .select({ id: composicoesTable.id })
    .from(composicoesTable)
    .where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
  if (!owned) return res.status(404).json({ error: "Not found" });

  const { itens: rawItens, ...rest } = req.body as { itens?: unknown; [key: string]: unknown };
  if (rawItens !== undefined && !Array.isArray(rawItens)) {
    return res.status(422).json({ error: "itens deve ser uma lista." });
  }
  const itens = rawItens as unknown[] | undefined;
  const parsedComposicao = updateComposicaoSchema.safeParse(rest);
  if (!parsedComposicao.success) return res.status(422).json({ error: parsedComposicao.error.message });

  let parsedItens: z.infer<typeof insertComposicaoInsumoSchema>[] | undefined;
  let custoTotal: number | undefined;

  if (itens !== undefined) {
    const result = z.array(insertComposicaoInsumoSchema).safeParse(
      itens.map((item) => ({ ...(item as object), composicaoId }))
    );
    if (!result.success) return res.status(422).json({ error: result.error.message });
    parsedItens = result.data;

    const insumoIds = [...new Set(parsedItens.map((item) => item.insumoId))];
    const insumos = insumoIds.length
      ? await db
          .select({ id: insumosTable.id, precoUnitario: insumosTable.precoUnitario })
          .from(insumosTable)
          .where(and(eq(insumosTable.tenantId, tid), inArray(insumosTable.id, insumoIds)))
      : [];

    if (insumos.length !== insumoIds.length) {
      return res.status(422).json({ error: "Um ou mais insumos não pertencem a este tenant." });
    }

    const precoPorInsumo = new Map(insumos.map((item) => [item.id, Number(item.precoUnitario ?? 0)]));
    custoTotal = parsedItens.reduce((sum, item) => {
      const preco = Number(precoPorInsumo.get(item.insumoId) ?? 0);
      return sum + Number(item.quantidade ?? 0) * preco;
    }, 0);
  }

  const composicao = await db.transaction(async (tx) => {
    const updateData = {
      ...parsedComposicao.data,
      ...(custoTotal !== undefined ? { custoTotal: custoTotal.toFixed(4) } : {}),
      updatedAt: new Date(),
    };

    const [updated] = await tx
      .update(composicoesTable)
      .set(updateData)
      .where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)))
      .returning();

    if (parsedItens !== undefined) {
      await tx.delete(composicaoInsumosTable).where(eq(composicaoInsumosTable.composicaoId, composicaoId));
      if (parsedItens.length > 0) {
        await tx.insert(composicaoInsumosTable).values(
          parsedItens.map((item) => ({
            composicaoId: item.composicaoId,
            insumoId: item.insumoId,
            quantidade: item.quantidade,
          }))
        );
      }
    }

    return updated;
  });

  return res.json(composicao);
});

router.delete("/tenants/:tenantId/composicoes/:composicaoId", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(composicoesTable).where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
  return res.status(204).end();
});

// ─── Orçamentos de Obra ───────────────────────────────────────────────────────

async function getEtapasWithItens(orcamentoId: string) {
  const etapas = await db
    .select()
    .from(obraOrcamentoEtapasTable)
    .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId))
    .orderBy(asc(obraOrcamentoEtapasTable.ordem));

  if (etapas.length === 0) return [];

  const etapaIds = etapas.map((e) => e.id);
  const allItens = await db
    .select()
    .from(obraOrcamentoItensTable)
    .where(inArray(obraOrcamentoItensTable.etapaId, etapaIds))
    .orderBy(asc(obraOrcamentoItensTable.ordem));

  const byEtapa: Record<string, typeof allItens> = {};
  for (const item of allItens) {
    if (!byEtapa[item.etapaId]) byEtapa[item.etapaId] = [];
    byEtapa[item.etapaId].push(item);
  }

  return etapas.map((e) => ({ ...e, itens: byEtapa[e.id] ?? [] }));
}

router.get("/tenants/:tenantId/obras/:obraId/orcamentos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)))
    .orderBy(asc(obraOrcamentosTable.versao));
  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/orcamentos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  // auto-increment versao
  const [maxRow] = await db
    .select({ v: max(obraOrcamentosTable.versao) })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  const nextVersao = (maxRow?.v ?? 0) + 1;

  const [tabelaPadrao] = await db
    .select({ id: tabelasPrecosObrasTable.id })
    .from(tabelasPrecosObrasTable)
    .where(and(
      eq(tabelasPrecosObrasTable.tenantId, tid),
      eq(tabelasPrecosObrasTable.isPadrao, true),
      eq(tabelasPrecosObrasTable.ativo, true),
    ));

  const parsed = insertObraOrcamentoSchema.safeParse({
    ...req.body,
    tenantId: tid,
    obraId,
    versao: nextVersao,
    tabelaPrecoId: tabelaPadrao?.id ?? null,
    precosDesatualizados: false,
    precosAtualizadosEm: new Date(),
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraOrcamentosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orcamento] = await db
    .select()
    .from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tid),
      eq(obraOrcamentosTable.obraId, obraId),
    ));
  if (!orcamento) return res.status(404).json({ error: "Not found" });

  const etapas = await getEtapasWithItens(orcamentoId);
  return res.json({ ...orcamento, etapas });
});

router.post("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/recalcular-precos", async (req, res) => {
  // tenant-audit: reviewed route tenant is validated by canAccessTenant and obra ownership before recalculation
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [owned] = await db
    .select({ id: obraOrcamentosTable.id })
    .from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tid),
      eq(obraOrcamentosTable.obraId, obraId),
    ));
  if (!owned) return res.status(404).json({ error: "Orçamento não encontrado" });

  const result = await recalcularOrcamentoComTabelaAtual(tid, orcamentoId);
  if (!result.ok && result.motivo === "locked") {
    return res.status(409).json({ error: "Orçamento aprovado/contratado mantém o snapshot de preços e não pode ser recalculado." });
  }
  if (!result.ok) return res.status(404).json({ error: "Orçamento não encontrado" });

  return res.json(result);
});

// GET /tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/curva-abc
router.get("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/curva-abc", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orcamento] = await db
    .select({ id: obraOrcamentosTable.id, bdiGlobal: obraOrcamentosTable.bdiGlobal })
    .from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tid),
      eq(obraOrcamentosTable.obraId, obraId),
    ));
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });

  const etapas = await db
    .select({ id: obraOrcamentoEtapasTable.id, nome: obraOrcamentoEtapasTable.nome })
    .from(obraOrcamentoEtapasTable)
    .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId));

  if (etapas.length === 0) return res.json([]);

  const etapaMap = new Map(etapas.map((e) => [e.id, e.nome]));
  const etapaIds = etapas.map((e) => e.id);

  const itens = await db
    .select()
    .from(obraOrcamentoItensTable)
    .where(inArray(obraOrcamentoItensTable.etapaId, etapaIds));

  const bdiGlobal = parseFloat(orcamento.bdiGlobal ?? "0");

  const comValor = itens.map((item) => {
    const qtd = parseFloat(item.quantidade ?? "1");
    const custo = parseFloat(item.custoUnitario ?? "0");
    const bdi = item.bdi != null ? parseFloat(item.bdi) : bdiGlobal;
    const valorTotal = qtd * custo * (1 + bdi / 100);
    return { itemId: item.id, nome: item.nome, etapaNome: etapaMap.get(item.etapaId) ?? "", unidade: item.unidade, quantidade: qtd, custoUnitario: custo, bdi, valorTotal };
  });

  comValor.sort((a, b) => b.valorTotal - a.valorTotal);

  const totalGeral = comValor.reduce((s, i) => s + i.valorTotal, 0);
  let acumulado = 0;

  const result = comValor.map((item) => {
    const pctIndividual = totalGeral > 0 ? (item.valorTotal / totalGeral) * 100 : 0;
    acumulado += pctIndividual;
    const classe = acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C";
    return { ...item, pctIndividual: Math.round(pctIndividual * 100) / 100, pctAcumulado: Math.round(acumulado * 100) / 100, classe };
  });

  return res.json(result);
});

router.put("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraOrcamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db
    .update(obraOrcamentosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tid),
      eq(obraOrcamentosTable.obraId, obraId),
    ))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  await db
    .delete(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tid),
      eq(obraOrcamentosTable.obraId, obraId),
    ));
  return res.status(204).end();
});

router.post("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/duplicate", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [original] = await db
    .select()
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid)));
  if (!original) return res.status(404).json({ error: "Not found" });

  const [maxRow] = await db
    .select({ v: max(obraOrcamentosTable.versao) })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  const nextVersao = (maxRow?.v ?? 0) + 1;

  const [novo] = await db
    .insert(obraOrcamentosTable)
    .values({
      tenantId: tid,
      obraId,
      versao: nextVersao,
      titulo: original.titulo ? `${original.titulo} (cópia)` : null,
      descricao: original.descricao,
      status: "rascunho",
      bdiGlobal: original.bdiGlobal,
    })
    .returning();

  // duplicate etapas and itens
  const etapasOriginais = await db
    .select()
    .from(obraOrcamentoEtapasTable)
    .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId))
    .orderBy(asc(obraOrcamentoEtapasTable.ordem));

  for (const etapa of etapasOriginais) {
    const [novaEtapa] = await db
      .insert(obraOrcamentoEtapasTable)
      .values({ orcamentoId: novo.id, nome: etapa.nome, ordem: etapa.ordem })
      .returning();

    const itensOriginais = await db
      .select()
      .from(obraOrcamentoItensTable)
      .where(eq(obraOrcamentoItensTable.etapaId, etapa.id))
      .orderBy(asc(obraOrcamentoItensTable.ordem));

    if (itensOriginais.length > 0) {
      await db.insert(obraOrcamentoItensTable).values(
        itensOriginais.map((i) => ({
          etapaId: novaEtapa.id,
          nome: i.nome,
          unidade: i.unidade,
          quantidade: i.quantidade,
          custoUnitario: i.custoUnitario,
          insumoId: i.insumoId,
          composicaoId: i.composicaoId,
          origemPreco: i.origemPreco,
          precoAtualizadoEm: i.precoAtualizadoEm,
          bdi: i.bdi,
          ordem: i.ordem,
        }))
      );
    }
  }

  await recalcularOrcamentoComTabelaAtual(tid, novo.id);
  return res.status(201).json(novo);
});

// ─── Etapas do orçamento ──────────────────────────────────────────────────────

router.post("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  // verify orcamento belongs to this tenant/obra
  const [orc] = await db
    .select({ id: obraOrcamentosTable.id, status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado" || orc.status === "contratado") return res.status(409).json({ error: "Orçamento aprovado/contratado não pode ser editado" });

  const parsed = insertObraOrcamentoEtapaSchema.safeParse({ ...req.body, orcamentoId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraOrcamentoEtapasTable).values(parsed.data).returning();
  return res.status(201).json({ ...row, itens: [] });
});

router.put("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orc] = await db
    .select({ status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado" || orc.status === "contratado") return res.status(409).json({ error: "Orçamento aprovado/contratado não pode ser editado" });

  const parsed = updateObraOrcamentoEtapaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db
    .update(obraOrcamentoEtapasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(obraOrcamentoEtapasTable.id, etapaId), eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Etapa not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orc] = await db
    .select({ status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado" || orc.status === "contratado") return res.status(409).json({ error: "Orçamento aprovado/contratado não pode ser editado" });

  await db
    .delete(obraOrcamentoEtapasTable)
    .where(and(eq(obraOrcamentoEtapasTable.id, etapaId), eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId)));
  return res.status(204).end();
});

// ─── Itens do orçamento ───────────────────────────────────────────────────────

router.post("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId/itens", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orc] = await db
    .select({ status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado" || orc.status === "contratado") {
    return res.status(409).json({ error: "Orçamento aprovado/contratado não pode ser editado" });
  }

  const source = req.body as Record<string, unknown>;
  if (source.insumoId && source.composicaoId) {
    return res.status(422).json({ error: "O item pode estar ligado a um insumo OU a uma composição, não aos dois." });
  }

  const data: Record<string, unknown> = { ...source, etapaId };

  // Quantitativos sempre nascem rastreáveis. Quando o importador (PDF, Arqdor,
  // IFC/BIM etc.) enviar metadados, eles são preservados; no cadastro manual,
  // quantidadeOriginal/quantidadeTecnica partem da quantidade informada.
  const quantidadeBase = source.quantidade ?? "1";
  if (data.quantidadeOriginal == null) data.quantidadeOriginal = quantidadeBase;
  if (data.quantidadeTecnica == null) data.quantidadeTecnica = quantidadeBase;
  if (data.origemQuantidade == null) data.origemQuantidade = "manual";
  if (data.nivelPrecisaoQuantidade == null) data.nivelPrecisaoQuantidade = "estimativo";
  data.quantidadeAtualizadaEm = new Date();

  if (typeof source.insumoId === "string" && source.insumoId) {
    const [insumo] = await db
      .select({
        id: insumosTable.id,
        nome: insumosTable.nome,
        unidade: insumosTable.unidade,
        precoUnitario: insumosTable.precoUnitario,
      })
      .from(insumosTable)
      .where(and(eq(insumosTable.id, source.insumoId), eq(insumosTable.tenantId, tid)));
    if (!insumo) return res.status(404).json({ error: "Insumo não encontrado" });

    data.nome = source.nome || insumo.nome;
    data.unidade = source.unidade || insumo.unidade;
    data.custoUnitario = insumo.precoUnitario ?? "0";
    data.origemPreco = "insumo";
    data.precoAtualizadoEm = new Date();
  } else if (typeof source.composicaoId === "string" && source.composicaoId) {
    const [composicao] = await db
      .select({
        id: composicoesTable.id,
        nome: composicoesTable.nome,
        unidade: composicoesTable.unidade,
        custoTotal: composicoesTable.custoTotal,
      })
      .from(composicoesTable)
      .where(and(eq(composicoesTable.id, source.composicaoId), eq(composicoesTable.tenantId, tid)));
    if (!composicao) return res.status(404).json({ error: "Composição não encontrada" });

    data.nome = source.nome || composicao.nome;
    data.unidade = source.unidade || composicao.unidade;
    data.custoUnitario = composicao.custoTotal ?? "0";
    data.origemPreco = "composicao";
    data.precoAtualizadoEm = new Date();
  } else {
    data.origemPreco = "manual";
  }

  const parsed = insertObraOrcamentoItemSchema.safeParse(data);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraOrcamentoItensTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.put("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId/itens/:itemId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId, itemId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orc] = await db
    .select({ status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado" || orc.status === "contratado") return res.status(409).json({ error: "Orçamento aprovado/contratado não pode ser editado" });

  const parsed = updateObraOrcamentoItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [anterior] = await db
    .select()
    .from(obraOrcamentoItensTable)
    .where(and(eq(obraOrcamentoItensTable.id, itemId), eq(obraOrcamentoItensTable.etapaId, etapaId)));
  if (!anterior) return res.status(404).json({ error: "Item not found" });

  const camposQuantitativo = [
    "quantidade",
    "unidade",
    "quantidadeOriginal",
    "quantidadeTecnica",
    "quantidadeComPerda",
    "quantidadeCompra",
    "unidadeCompra",
    "origemQuantidade",
    "nivelPrecisaoQuantidade",
    "memoriaCalculo",
    "projetoReferencia",
    "projetoVersao",
    "confiancaExtracao",
    "revisadoManual",
    "motivoAjusteQuantidade",
  ] as const;

  const mudouQuantitativo = camposQuantitativo.some((campo) =>
    Object.prototype.hasOwnProperty.call(parsed.data, campo) &&
    JSON.stringify((parsed.data as any)[campo]) !== JSON.stringify((anterior as any)[campo])
  );

  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (mudouQuantitativo) updateData.quantidadeAtualizadaEm = new Date();

  const row = await db.transaction(async (tx) => {
    if (mudouQuantitativo) {
      await tx.insert(obraOrcamentoItemQuantitativosHistoricoTable).values({
        itemId,
        quantidadeAnterior: anterior.quantidade,
        quantidadeNova: (parsed.data as any).quantidade ?? anterior.quantidade,
        unidade: (parsed.data as any).unidade ?? anterior.unidade,
        origemQuantidade: (parsed.data as any).origemQuantidade ?? anterior.origemQuantidade,
        nivelPrecisaoQuantidade: (parsed.data as any).nivelPrecisaoQuantidade ?? anterior.nivelPrecisaoQuantidade,
        memoriaCalculo: (parsed.data as any).memoriaCalculo ?? anterior.memoriaCalculo,
        projetoReferencia: (parsed.data as any).projetoReferencia ?? anterior.projetoReferencia,
        projetoVersao: (parsed.data as any).projetoVersao ?? anterior.projetoVersao,
        confiancaExtracao: (parsed.data as any).confiancaExtracao ?? anterior.confiancaExtracao,
        motivo: (parsed.data as any).motivoAjusteQuantidade ?? anterior.motivoAjusteQuantidade,
        responsavelId: (req as any).user?.id ?? null,
      });
    }

    const [updated] = await tx
      .update(obraOrcamentoItensTable)
      .set(updateData as any)
      .where(and(eq(obraOrcamentoItensTable.id, itemId), eq(obraOrcamentoItensTable.etapaId, etapaId)))
      .returning();

    return updated;
  });

  return res.json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId/itens/:itemId/quantitativos-historico", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId, itemId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [owned] = await db
    .select({ id: obraOrcamentoItensTable.id })
    .from(obraOrcamentoItensTable)
    .innerJoin(obraOrcamentoEtapasTable, eq(obraOrcamentoEtapasTable.id, obraOrcamentoItensTable.etapaId))
    .innerJoin(obraOrcamentosTable, eq(obraOrcamentosTable.id, obraOrcamentoEtapasTable.orcamentoId))
    .where(and(
      eq(obraOrcamentoItensTable.id, itemId),
      eq(obraOrcamentoItensTable.etapaId, etapaId),
      eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoId),
      eq(obraOrcamentosTable.obraId, obraId),
      eq(obraOrcamentosTable.tenantId, tid),
    ));
  if (!owned) return res.status(404).json({ error: "Item not found" });

  const rows = await db
    .select()
    .from(obraOrcamentoItemQuantitativosHistoricoTable)
    .where(eq(obraOrcamentoItemQuantitativosHistoricoTable.itemId, itemId))
    .orderBy(desc(obraOrcamentoItemQuantitativosHistoricoTable.createdAt));

  return res.json(rows);
});

router.delete("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId/itens/:itemId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId, itemId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orc] = await db
    .select({ status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado" || orc.status === "contratado") return res.status(409).json({ error: "Orçamento aprovado/contratado não pode ser editado" });

  await db
    .delete(obraOrcamentoItensTable)
    .where(and(eq(obraOrcamentoItensTable.id, itemId), eq(obraOrcamentoItensTable.etapaId, etapaId)));
  return res.status(204).end();
});

export default router;
