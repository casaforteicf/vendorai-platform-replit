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
  maoObraRecursosTable,
  maoObraEquipesTable,
  maoObraEquipeMembrosTable,
  maoObraCoberturasTable,
  insertMaoObraRecursoSchema,
  updateMaoObraRecursoSchema,
  insertMaoObraEquipeSchema,
  insertMaoObraEquipeMembroSchema,
  insertMaoObraCoberturaSchema,
  equipamentosRecursosTable,
  equipamentosCoberturasTable,
  insertEquipamentoRecursoSchema,
  updateEquipamentoRecursoSchema,
  insertEquipamentoCoberturaSchema,
  servicosFornecedoresTable,
  servicosContratosTable,
  servicosCoberturasTable,
  servicosMedicoesTable,
  servicosAditivosTable,
  insertServicoFornecedorSchema,
  updateServicoFornecedorSchema,
  insertServicoContratoSchema,
  updateServicoContratoSchema,
  insertServicoCoberturaSchema,
  insertServicoMedicaoSchema,
  insertServicoAditivoSchema,
  sistemasConstrutivosTable,
  sistemaVariantesTable,
  sistemaComposicaoRegrasTable,
  sistemaInterfacesTable,
  insertSistemaConstrutivoSchema,
  updateSistemaConstrutivoSchema,
  insertSistemaVarianteSchema,
  insertSistemaComposicaoRegraSchema,
  insertSistemaInterfaceSchema,
  obraPavimentosTable,
  obraAmbientesTable,
  obraElementosTable,
  obraSuperficiesTable,
  obraSuperficieZonasTable,
  obraAcabamentoPadroesTable,
  insertObraPavimentoSchema,
  insertObraAmbienteSchema,
  insertObraElementoSchema,
  insertObraSuperficieSchema,
  insertObraSuperficieZonaSchema,
  insertObraAcabamentoPadraoSchema,
  obraEletricaPontosTable,
  obraEletricaCircuitosTable,
  obraEletricaQuadrosTable,
  obraEletricaRedesEspeciaisTable,
  insertObraEletricaPontoSchema,
  insertObraEletricaCircuitoSchema,
  insertObraEletricaQuadroSchema,
  insertObraEletricaRedeEspecialSchema,
  obraEnergiaSistemasTable,
  obraEnergiaComponentesTable,
  insertObraEnergiaSistemaSchema,
  insertObraEnergiaComponenteSchema,
  obraHidraulicaRedesTable,
  obraHidraulicaPontosTable,
  obraHidraulicaSegmentosTable,
  obraHidraulicaEquipamentosTable,
  insertObraHidraulicaRedeSchema,
  insertObraHidraulicaPontoSchema,
  insertObraHidraulicaSegmentoSchema,
  insertObraHidraulicaEquipamentoSchema,
  obraHidraulicaAreasTecnicasTable,
  obraHidraulicaManifoldsTable,
  obraHidraulicaAquecimentoTable,
  obraHidraulicaPressurizacaoTable,
  obraHidraulicaReservatoriosTable,
  insertObraHidraulicaAreaTecnicaSchema,
  insertObraHidraulicaManifoldSchema,
  insertObraHidraulicaAquecimentoSchema,
  insertObraHidraulicaPressurizacaoSchema,
  insertObraHidraulicaReservatorioSchema,
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

// ─── Mão de obra do orçamento ─────────────────────────────────────────────────

function custoHoraRecurso(recurso: typeof maoObraRecursosTable.$inferSelect): number {
  const custoHoraInformado = numberOrZero(recurso.custoHoraCalculado);
  if (custoHoraInformado > 0) return custoHoraInformado;

  if (recurso.modalidade === "funcionario_hora" || recurso.modalidade === "funcionario_producao" || recurso.modalidade === "equipe_propria") {
    const salario = numberOrZero(recurso.salarioMensal);
    const encargos = numberOrZero(recurso.encargosPercentual);
    const beneficios = numberOrZero(recurso.beneficiosMensais);
    const outros = numberOrZero(recurso.outrosCustosMensais);
    const horas = numberOrZero(recurso.horasMensais);
    if (horas > 0) {
      return (salario * (1 + encargos / 100) + beneficios + outros) / horas;
    }
  }

  return numberOrZero(recurso.custoBase);
}

async function custoUnitarioEquipe(tenantId: string, equipeId: string, unidade: string): Promise<number> {
  const [equipe] = await db
    .select()
    .from(maoObraEquipesTable)
    .where(and(eq(maoObraEquipesTable.id, equipeId), eq(maoObraEquipesTable.tenantId, tenantId)));
  if (!equipe) throw new Error("Equipe não encontrada");

  const membros = await db
    .select({
      quantidade: maoObraEquipeMembrosTable.quantidade,
      recurso: maoObraRecursosTable,
    })
    .from(maoObraEquipeMembrosTable)
    .innerJoin(maoObraRecursosTable, eq(maoObraEquipeMembrosTable.recursoId, maoObraRecursosTable.id))
    .where(and(
      eq(maoObraEquipeMembrosTable.equipeId, equipeId),
      eq(maoObraRecursosTable.tenantId, tenantId),
      eq(maoObraRecursosTable.ativo, true),
    ));

  const custoHoraEquipe = membros.reduce((sum, membro) =>
    sum + custoHoraRecurso(membro.recurso) * numberOrZero(membro.quantidade), 0);

  if (unidade === "dia") return custoHoraEquipe * numberOrZero(equipe.horasDia || "8");
  return custoHoraEquipe;
}

router.get("/tenants/:tenantId/mao-obra/recursos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(maoObraRecursosTable)
    .where(eq(maoObraRecursosTable.tenantId, tid))
    .orderBy(asc(maoObraRecursosTable.nome));

  return res.json(rows.map((row) => ({
    ...row,
    custoHoraEfetivo: custoHoraRecurso(row).toFixed(4),
  })));
});

router.post("/tenants/:tenantId/mao-obra/recursos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertMaoObraRecursoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [created] = await db.insert(maoObraRecursosTable).values(parsed.data).returning();
  return res.status(201).json({ ...created, custoHoraEfetivo: custoHoraRecurso(created).toFixed(4) });
});

router.put("/tenants/:tenantId/mao-obra/recursos/:recursoId", async (req, res) => {
  const { tenantId: tid, recursoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateMaoObraRecursoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [updated] = await db.update(maoObraRecursosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(maoObraRecursosTable.id, recursoId), eq(maoObraRecursosTable.tenantId, tid)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Recurso não encontrado" });

  return res.json({ ...updated, custoHoraEfetivo: custoHoraRecurso(updated).toFixed(4) });
});

router.get("/tenants/:tenantId/mao-obra/equipes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const equipes = await db.select().from(maoObraEquipesTable)
    .where(eq(maoObraEquipesTable.tenantId, tid))
    .orderBy(asc(maoObraEquipesTable.nome));

  const result = [];
  for (const equipe of equipes) {
    const membros = await db.select({
      id: maoObraEquipeMembrosTable.id,
      quantidade: maoObraEquipeMembrosTable.quantidade,
      recurso: maoObraRecursosTable,
    })
      .from(maoObraEquipeMembrosTable)
      .innerJoin(maoObraRecursosTable, eq(maoObraEquipeMembrosTable.recursoId, maoObraRecursosTable.id))
      .where(eq(maoObraEquipeMembrosTable.equipeId, equipe.id));

    const custoHora = membros.reduce((sum, membro) =>
      sum + custoHoraRecurso(membro.recurso) * numberOrZero(membro.quantidade), 0);

    result.push({
      ...equipe,
      membros,
      custoHora: custoHora.toFixed(4),
      custoDia: (custoHora * numberOrZero(equipe.horasDia || "8")).toFixed(4),
    });
  }

  return res.json(result);
});

router.post("/tenants/:tenantId/mao-obra/equipes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const { membros: rawMembros, ...rest } = req.body as { membros?: unknown; [key: string]: unknown };
  const parsedEquipe = insertMaoObraEquipeSchema.safeParse({ ...rest, tenantId: tid });
  if (!parsedEquipe.success) return res.status(422).json({ error: parsedEquipe.error.message });

  const parsedMembros = z.array(insertMaoObraEquipeMembroSchema.omit({ equipeId: true })).safeParse(rawMembros ?? []);
  if (!parsedMembros.success) return res.status(422).json({ error: parsedMembros.error.message });

  const recursoIds = [...new Set(parsedMembros.data.map((m) => m.recursoId))];
  if (recursoIds.length) {
    const recursos = await db.select({ id: maoObraRecursosTable.id })
      .from(maoObraRecursosTable)
      .where(and(eq(maoObraRecursosTable.tenantId, tid), inArray(maoObraRecursosTable.id, recursoIds)));
    if (recursos.length !== recursoIds.length) {
      return res.status(422).json({ error: "Um ou mais recursos de mão de obra não pertencem ao tenant." });
    }
  }

  const equipe = await db.transaction(async (tx) => {
    const [created] = await tx.insert(maoObraEquipesTable).values(parsedEquipe.data).returning();
    if (parsedMembros.data.length) {
      await tx.insert(maoObraEquipeMembrosTable).values(parsedMembros.data.map((m) => ({
        ...m,
        equipeId: created.id,
      })));
    }
    return created;
  });

  return res.status(201).json(equipe);
});

router.post("/tenants/:tenantId/mao-obra/coberturas", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const raw = { ...req.body, tenantId: tid, criadoPorId: (req as any).user?.sub ?? null };
  const parsed = insertMaoObraCoberturaSchema.safeParse(raw);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const data = parsed.data;
  const idsPresentes = [
    data.composicaoId ? "composicao" : null,
    data.orcamentoEtapaId ? "etapa_orcamento" : null,
    data.orcamentoItemId ? "item_orcamento" : null,
  ].filter(Boolean);

  if (idsPresentes.length !== 1 || idsPresentes[0] !== data.escopoTipo) {
    return res.status(422).json({
      error: "A cobertura deve possuir exatamente um alvo e ele deve corresponder ao escopoTipo.",
    });
  }

  let custoUnitario = numberOrZero(data.custoUnitario);
  if (data.equipeId) {
    custoUnitario = await custoUnitarioEquipe(tid, data.equipeId, data.unidade);
  } else if (data.recursoId) {
    const [recurso] = await db.select().from(maoObraRecursosTable)
      .where(and(eq(maoObraRecursosTable.id, data.recursoId), eq(maoObraRecursosTable.tenantId, tid)));
    if (!recurso) return res.status(422).json({ error: "Recurso de mão de obra inválido." });
    const hora = custoHoraRecurso(recurso);
    custoUnitario = data.unidade === "dia" ? hora * 8 : (numberOrZero(recurso.custoBase) || hora);
  }

  const custoTotal = numberOrZero(data.quantidade) * custoUnitario;

  const targetCondition =
    data.escopoTipo === "composicao"
      ? eq(maoObraCoberturasTable.composicaoId, data.composicaoId!)
      : data.escopoTipo === "etapa_orcamento"
        ? eq(maoObraCoberturasTable.orcamentoEtapaId, data.orcamentoEtapaId!)
        : eq(maoObraCoberturasTable.orcamentoItemId, data.orcamentoItemId!);

  const created = await db.transaction(async (tx) => {
    // Uma única fonte ativa por escopo/alvo. A anterior permanece para auditoria,
    // porém fica inativa e deixa de entrar no custo.
    await tx.update(maoObraCoberturasTable)
      .set({ ativo: false, updatedAt: new Date() })
      .where(and(
        eq(maoObraCoberturasTable.tenantId, tid),
        eq(maoObraCoberturasTable.escopoTipo, data.escopoTipo),
        eq(maoObraCoberturasTable.ativo, true),
        targetCondition,
      ));

    const [row] = await tx.insert(maoObraCoberturasTable).values({
      ...data,
      custoUnitario: custoUnitario.toFixed(4),
      custoTotal: custoTotal.toFixed(4),
      ativo: true,
    }).returning();
    return row;
  });

  return res.status(201).json(created);
});

router.get("/tenants/:tenantId/mao-obra/resolver", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const composicaoId = typeof req.query.composicaoId === "string" ? req.query.composicaoId : null;
  const orcamentoEtapaId = typeof req.query.orcamentoEtapaId === "string" ? req.query.orcamentoEtapaId : null;
  const orcamentoItemId = typeof req.query.orcamentoItemId === "string" ? req.query.orcamentoItemId : null;

  const filtros = [eq(maoObraCoberturasTable.tenantId, tid), eq(maoObraCoberturasTable.ativo, true)];
  const alvos = [];
  if (composicaoId) alvos.push(eq(maoObraCoberturasTable.composicaoId, composicaoId));
  if (orcamentoEtapaId) alvos.push(eq(maoObraCoberturasTable.orcamentoEtapaId, orcamentoEtapaId));
  if (orcamentoItemId) alvos.push(eq(maoObraCoberturasTable.orcamentoItemId, orcamentoItemId));

  if (!alvos.length) return res.status(422).json({ error: "Informe composicaoId, orcamentoEtapaId ou orcamentoItemId." });

  const rows = await db.select().from(maoObraCoberturasTable)
    .where(and(...filtros, or(...alvos)));

  const prioridade = { item_orcamento: 3, etapa_orcamento: 2, composicao: 1 } as const;
  const ordered = rows.sort((a, b) =>
    (prioridade[b.escopoTipo as keyof typeof prioridade] ?? 0) -
    (prioridade[a.escopoTipo as keyof typeof prioridade] ?? 0));

  const efetiva = ordered[0] ?? null;
  const suprimidas = efetiva
    ? ordered.slice(1).map((row) => ({
        ...row,
        motivoSupressao: efetiva.escopoTipo === "etapa_orcamento" && efetiva.incluiMaoObraComposicoesFilhas
          ? "incluida_na_mao_de_obra_da_etapa"
          : "fonte_de_mao_de_obra_de_maior_prioridade_ativa",
      }))
    : [];

  return res.json({
    efetiva,
    custoConsiderado: efetiva ? efetiva.custoTotal : "0",
    suprimidas,
    conflito: rows.length > 1,
    regra: "item_orcamento > etapa_orcamento > composicao; somente a fonte efetiva soma no custo",
  });
});

// ─── Equipamentos do orçamento ───────────────────────────────────────────────

function custoUnitarioEquipamento(recurso: typeof equipamentosRecursosTable.$inferSelect): number {
  if (recurso.origem === "proprio") {
    const operacionalHora =
      numberOrZero(recurso.depreciacaoHora) +
      numberOrZero(recurso.custoManutencaoHora) +
      (recurso.combustivelIncluso ? 0 : numberOrZero(recurso.custoCombustivelHora)) +
      (recurso.operadorIncluso ? 0 : numberOrZero(recurso.custoOperadorHora));

    if (recurso.unidadeCobranca === "h") return operacionalHora;
    if (recurso.unidadeCobranca === "dia") return operacionalHora * 8;
  }

  return numberOrZero(recurso.valorUnitario);
}

router.get("/tenants/:tenantId/equipamentos-orcamento/recursos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(equipamentosRecursosTable)
    .where(eq(equipamentosRecursosTable.tenantId, tid))
    .orderBy(asc(equipamentosRecursosTable.nome));

  return res.json(rows.map((row) => ({
    ...row,
    custoUnitarioEfetivo: custoUnitarioEquipamento(row).toFixed(4),
  })));
});

router.post("/tenants/:tenantId/equipamentos-orcamento/recursos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertEquipamentoRecursoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [created] = await db.insert(equipamentosRecursosTable).values(parsed.data).returning();
  return res.status(201).json({ ...created, custoUnitarioEfetivo: custoUnitarioEquipamento(created).toFixed(4) });
});

router.put("/tenants/:tenantId/equipamentos-orcamento/recursos/:equipamentoId", async (req, res) => {
  const { tenantId: tid, equipamentoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateEquipamentoRecursoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [updated] = await db.update(equipamentosRecursosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(equipamentosRecursosTable.id, equipamentoId), eq(equipamentosRecursosTable.tenantId, tid)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Equipamento não encontrado" });

  return res.json({ ...updated, custoUnitarioEfetivo: custoUnitarioEquipamento(updated).toFixed(4) });
});

router.post("/tenants/:tenantId/equipamentos-orcamento/coberturas", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertEquipamentoCoberturaSchema.safeParse({
    ...req.body,
    tenantId: tid,
    criadoPorId: (req as any).user?.sub ?? null,
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const data = parsed.data;
  const idsPresentes = [
    data.composicaoId ? "composicao" : null,
    data.orcamentoEtapaId ? "etapa_orcamento" : null,
    data.orcamentoItemId ? "item_orcamento" : null,
  ].filter(Boolean);
  if (idsPresentes.length !== 1 || idsPresentes[0] !== data.escopoTipo) {
    return res.status(422).json({ error: "Informe exatamente um alvo compatível com escopoTipo." });
  }

  const [equipamento] = await db.select().from(equipamentosRecursosTable)
    .where(and(eq(equipamentosRecursosTable.id, data.equipamentoId), eq(equipamentosRecursosTable.tenantId, tid)));
  if (!equipamento) return res.status(422).json({ error: "Equipamento inválido para este tenant." });

  const valorUnitario = numberOrZero(data.valorUnitario) || custoUnitarioEquipamento(equipamento);
  const mobilizacao = data.mobilizacao != null ? numberOrZero(data.mobilizacao) : numberOrZero(equipamento.mobilizacao);
  const desmobilizacao = data.desmobilizacao != null ? numberOrZero(data.desmobilizacao) : numberOrZero(equipamento.desmobilizacao);
  const transporte = data.transporte != null ? numberOrZero(data.transporte) : numberOrZero(equipamento.transporte);
  const quantidade = numberOrZero(data.quantidade);
  const custoOperacionalExtra =
    equipamento.origem === "proprio" && data.horasOperacao != null
      ? numberOrZero(data.horasOperacao) * (
          (equipamento.combustivelIncluso ? 0 : numberOrZero(equipamento.custoCombustivelHora)) +
          (equipamento.operadorIncluso ? 0 : numberOrZero(equipamento.custoOperadorHora)) +
          numberOrZero(equipamento.custoManutencaoHora) +
          numberOrZero(equipamento.depreciacaoHora)
        )
      : 0;
  const custoTotal = quantidade * valorUnitario + mobilizacao + desmobilizacao + transporte + custoOperacionalExtra;

  const targetCondition =
    data.escopoTipo === "composicao"
      ? eq(equipamentosCoberturasTable.composicaoId, data.composicaoId!)
      : data.escopoTipo === "etapa_orcamento"
        ? eq(equipamentosCoberturasTable.orcamentoEtapaId, data.orcamentoEtapaId!)
        : eq(equipamentosCoberturasTable.orcamentoItemId, data.orcamentoItemId!);

  const created = await db.transaction(async (tx) => {
    // O mesmo slot técnico não pode ser cobrado duas vezes no mesmo alvo.
    await tx.update(equipamentosCoberturasTable)
      .set({ ativo: false, updatedAt: new Date() })
      .where(and(
        eq(equipamentosCoberturasTable.tenantId, tid),
        eq(equipamentosCoberturasTable.escopoTipo, data.escopoTipo),
        eq(equipamentosCoberturasTable.slotKey, data.slotKey),
        eq(equipamentosCoberturasTable.ativo, true),
        targetCondition,
      ));

    const [row] = await tx.insert(equipamentosCoberturasTable).values({
      ...data,
      unidadeCobranca: data.unidadeCobranca || equipamento.unidadeCobranca,
      valorUnitario: valorUnitario.toFixed(4),
      mobilizacao: mobilizacao.toFixed(4),
      desmobilizacao: desmobilizacao.toFixed(4),
      transporte: transporte.toFixed(4),
      custoTotal: custoTotal.toFixed(4),
      ativo: true,
    }).returning();
    return row;
  });

  return res.status(201).json(created);
});

router.get("/tenants/:tenantId/equipamentos-orcamento/resolver", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const composicaoId = typeof req.query.composicaoId === "string" ? req.query.composicaoId : null;
  const orcamentoEtapaId = typeof req.query.orcamentoEtapaId === "string" ? req.query.orcamentoEtapaId : null;
  const orcamentoItemId = typeof req.query.orcamentoItemId === "string" ? req.query.orcamentoItemId : null;

  const alvos = [];
  if (composicaoId) alvos.push(eq(equipamentosCoberturasTable.composicaoId, composicaoId));
  if (orcamentoEtapaId) alvos.push(eq(equipamentosCoberturasTable.orcamentoEtapaId, orcamentoEtapaId));
  if (orcamentoItemId) alvos.push(eq(equipamentosCoberturasTable.orcamentoItemId, orcamentoItemId));
  if (!alvos.length) return res.status(422).json({ error: "Informe ao menos um alvo." });

  const rows = await db.select().from(equipamentosCoberturasTable)
    .where(and(
      eq(equipamentosCoberturasTable.tenantId, tid),
      eq(equipamentosCoberturasTable.ativo, true),
      or(...alvos),
    ));

  const prioridade = { item_orcamento: 3, etapa_orcamento: 2, composicao: 1 } as const;
  const porSlot = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!porSlot.has(row.slotKey)) porSlot.set(row.slotKey, []);
    porSlot.get(row.slotKey)!.push(row);
  }

  const efetivas = [];
  const suprimidas = [];
  for (const [slotKey, slotRows] of porSlot) {
    const ordered = slotRows.sort((a, b) =>
      (prioridade[b.escopoTipo as keyof typeof prioridade] ?? 0) -
      (prioridade[a.escopoTipo as keyof typeof prioridade] ?? 0));
    efetivas.push(ordered[0]);
    for (const row of ordered.slice(1)) {
      suprimidas.push({ ...row, slotKey, motivoSupressao: "equipamento_equivalente_coberto_em_escopo_mais_especifico" });
    }
  }

  const custoTotal = efetivas.reduce((sum, row) => sum + numberOrZero(row.custoTotal), 0);
  return res.json({
    efetivas,
    suprimidas,
    custoTotal: custoTotal.toFixed(4),
    regra: "cada slot técnico soma uma vez; prioridade item_orcamento > etapa_orcamento > composicao",
  });
});

// ─── Serviços e subempreitadas ────────────────────────────────────────────────

router.get("/tenants/:tenantId/servicos-fornecedores", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(servicosFornecedoresTable)
    .where(eq(servicosFornecedoresTable.tenantId, tid))
    .orderBy(asc(servicosFornecedoresTable.nome));
  return res.json(rows);
});

router.post("/tenants/:tenantId/servicos-fornecedores", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = insertServicoFornecedorSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.insert(servicosFornecedoresTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.put("/tenants/:tenantId/servicos-fornecedores/:fornecedorId", async (req, res) => {
  const { tenantId: tid, fornecedorId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = updateServicoFornecedorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.update(servicosFornecedoresTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(servicosFornecedoresTable.id, fornecedorId), eq(servicosFornecedoresTable.tenantId, tid)))
    .returning();
  if (!row) return res.status(404).json({ error: "Fornecedor não encontrado" });
  return res.json(row);
});

router.get("/tenants/:tenantId/servicos-contratos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(servicosContratosTable)
    .where(eq(servicosContratosTable.tenantId, tid))
    .orderBy(desc(servicosContratosTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/servicos-contratos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertServicoContratoSchema.safeParse({
    ...req.body,
    tenantId: tid,
    criadoPorId: (req as any).user?.sub ?? null,
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.fornecedorId) {
    const [fornecedor] = await db.select({ id: servicosFornecedoresTable.id })
      .from(servicosFornecedoresTable)
      .where(and(
        eq(servicosFornecedoresTable.id, parsed.data.fornecedorId),
        eq(servicosFornecedoresTable.tenantId, tid),
      ));
    if (!fornecedor) return res.status(422).json({ error: "Fornecedor inválido para este tenant." });
  }

  const valorGlobal = numberOrZero(parsed.data.valorGlobal) ||
    numberOrZero(parsed.data.quantidadeContratada) * numberOrZero(parsed.data.valorUnitario);
  const saldoContratual = Math.max(0, valorGlobal - numberOrZero(parsed.data.adiantamentoValor));

  const [row] = await db.insert(servicosContratosTable).values({
    ...parsed.data,
    valorGlobal: valorGlobal.toFixed(4),
    saldoContratual: saldoContratual.toFixed(4),
  }).returning();

  return res.status(201).json(row);
});

router.put("/tenants/:tenantId/servicos-contratos/:contratoId", async (req, res) => {
  const { tenantId: tid, contratoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = updateServicoContratoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.update(servicosContratosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(servicosContratosTable.id, contratoId), eq(servicosContratosTable.tenantId, tid)))
    .returning();
  if (!row) return res.status(404).json({ error: "Contrato não encontrado" });
  return res.json(row);
});

router.post("/tenants/:tenantId/servicos-coberturas", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = insertServicoCoberturaSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const data = parsed.data;

  const idsPresentes = [
    data.composicaoId ? "composicao" : null,
    data.orcamentoEtapaId ? "etapa_orcamento" : null,
    data.orcamentoItemId ? "item_orcamento" : null,
  ].filter(Boolean);
  if (idsPresentes.length !== 1 || idsPresentes[0] !== data.escopoTipo) {
    return res.status(422).json({ error: "Informe exatamente um alvo compatível com escopoTipo." });
  }

  let custoUnitario = numberOrZero(data.custoUnitario);
  if (data.contratoId) {
    const [contrato] = await db.select().from(servicosContratosTable)
      .where(and(eq(servicosContratosTable.id, data.contratoId), eq(servicosContratosTable.tenantId, tid)));
    if (!contrato) return res.status(422).json({ error: "Contrato inválido para este tenant." });
    custoUnitario = custoUnitario || numberOrZero(contrato.valorUnitario) || numberOrZero(contrato.valorGlobal);
  }

  const custoTotal = numberOrZero(data.quantidade) * custoUnitario;
  const targetCondition =
    data.escopoTipo === "composicao"
      ? eq(servicosCoberturasTable.composicaoId, data.composicaoId!)
      : data.escopoTipo === "etapa_orcamento"
        ? eq(servicosCoberturasTable.orcamentoEtapaId, data.orcamentoEtapaId!)
        : eq(servicosCoberturasTable.orcamentoItemId, data.orcamentoItemId!);

  const row = await db.transaction(async (tx) => {
    await tx.update(servicosCoberturasTable)
      .set({ ativo: false, updatedAt: new Date() })
      .where(and(
        eq(servicosCoberturasTable.tenantId, tid),
        eq(servicosCoberturasTable.escopoTipo, data.escopoTipo),
        eq(servicosCoberturasTable.slotKey, data.slotKey),
        eq(servicosCoberturasTable.ativo, true),
        targetCondition,
      ));

    const [created] = await tx.insert(servicosCoberturasTable).values({
      ...data,
      custoUnitario: custoUnitario.toFixed(4),
      custoTotal: custoTotal.toFixed(4),
      ativo: true,
    }).returning();
    return created;
  });

  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/servicos-contratos/:contratoId/medicoes", async (req, res) => {
  const { tenantId: tid, contratoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [contrato] = await db.select().from(servicosContratosTable)
    .where(and(eq(servicosContratosTable.id, contratoId), eq(servicosContratosTable.tenantId, tid)));
  if (!contrato) return res.status(404).json({ error: "Contrato não encontrado" });

  const parsed = insertServicoMedicaoSchema.safeParse({ ...req.body, tenantId: tid, contratoId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const valorBruto = numberOrZero(parsed.data.valorBruto) ||
    (numberOrZero(parsed.data.quantidadeMedida) * numberOrZero(contrato.valorUnitario)) ||
    (numberOrZero(parsed.data.percentualMedido) / 100) * numberOrZero(contrato.valorGlobal);
  const retencaoValor = numberOrZero(parsed.data.retencaoValor) ||
    valorBruto * numberOrZero(contrato.retencaoPercentual) / 100;
  const valorLiquido = valorBruto - retencaoValor - numberOrZero(parsed.data.descontosValor) + numberOrZero(parsed.data.acrescimosValor);

  const [row] = await db.insert(servicosMedicoesTable).values({
    ...parsed.data,
    valorBruto: valorBruto.toFixed(4),
    retencaoValor: retencaoValor.toFixed(4),
    valorLiquido: valorLiquido.toFixed(4),
  }).returning();

  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/servicos-contratos/:contratoId/aditivos", async (req, res) => {
  const { tenantId: tid, contratoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [contrato] = await db.select().from(servicosContratosTable)
    .where(and(eq(servicosContratosTable.id, contratoId), eq(servicosContratosTable.tenantId, tid)));
  if (!contrato) return res.status(404).json({ error: "Contrato não encontrado" });

  const parsed = insertServicoAditivoSchema.safeParse({ ...req.body, tenantId: tid, contratoId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(servicosAditivosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/servicos-contratos/:contratoId/resumo", async (req, res) => {
  const { tenantId: tid, contratoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [contrato] = await db.select().from(servicosContratosTable)
    .where(and(eq(servicosContratosTable.id, contratoId), eq(servicosContratosTable.tenantId, tid)));
  if (!contrato) return res.status(404).json({ error: "Contrato não encontrado" });

  const medicoes = await db.select().from(servicosMedicoesTable)
    .where(and(eq(servicosMedicoesTable.tenantId, tid), eq(servicosMedicoesTable.contratoId, contratoId)));
  const aditivos = await db.select().from(servicosAditivosTable)
    .where(and(eq(servicosAditivosTable.tenantId, tid), eq(servicosAditivosTable.contratoId, contratoId)));

  const aditivosAprovados = aditivos.filter((a) => a.aprovado).reduce((s, a) => s + numberOrZero(a.valor), 0);
  const valorContratoAtual = numberOrZero(contrato.valorGlobal) + aditivosAprovados;
  const valorMedido = medicoes.reduce((s, m) => s + numberOrZero(m.valorBruto), 0);
  const valorLiquido = medicoes.reduce((s, m) => s + numberOrZero(m.valorLiquido), 0);
  const retencoes = medicoes.reduce((s, m) => s + numberOrZero(m.retencaoValor), 0);

  return res.json({
    contrato,
    valorContratoAtual: valorContratoAtual.toFixed(4),
    valorMedido: valorMedido.toFixed(4),
    valorLiquidoMedido: valorLiquido.toFixed(4),
    retencoes: retencoes.toFixed(4),
    saldoMedir: Math.max(0, valorContratoAtual - valorMedido).toFixed(4),
    medicoes,
    aditivos,
  });
});

// ─── Sistemas construtivos parametrizados ────────────────────────────────────

const SISTEMAS_PADRAO = [
  { chave: "icf", nome: "ICF", escoposAplicacao: ["parede_externa", "parede_interna"] },
  { chave: "alvenaria_convencional", nome: "Alvenaria convencional", escoposAplicacao: ["parede_externa", "parede_interna"] },
  { chave: "alvenaria_estrutural", nome: "Alvenaria estrutural", escoposAplicacao: ["parede_externa", "parede_interna", "estrutura"] },
  { chave: "concreto_armado_vedacao", nome: "Concreto armado + vedação", escoposAplicacao: ["estrutura", "parede_externa", "parede_interna"] },
  { chave: "parede_concreto", nome: "Parede de concreto", escoposAplicacao: ["parede_externa", "parede_interna", "estrutura"] },
  { chave: "steel_frame", nome: "Light Steel Frame", escoposAplicacao: ["parede_externa", "parede_interna", "estrutura"] },
  { chave: "wood_frame", nome: "Wood Frame", escoposAplicacao: ["parede_externa", "parede_interna", "estrutura"] },
  { chave: "pre_moldado_concreto", nome: "Pré-moldado de concreto", escoposAplicacao: ["estrutura", "parede_externa"] },
  { chave: "estrutura_metalica_fechamento", nome: "Estrutura metálica + fechamento", escoposAplicacao: ["estrutura", "parede_externa", "cobertura"] },
  { chave: "sip_paineis", nome: "SIP / painéis industrializados", escoposAplicacao: ["parede_externa", "parede_interna", "cobertura"] },
  { chave: "hibrido", nome: "Sistema híbrido", escoposAplicacao: ["outro"] },
] as const;

router.post("/tenants/:tenantId/sistemas-construtivos/catalogo-padrao", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const existentes = await db.select().from(sistemasConstrutivosTable)
    .where(eq(sistemasConstrutivosTable.tenantId, tid));
  const porChave = new Map(existentes.map((s) => [s.chave, s]));
  const criados = [];

  for (let i = 0; i < SISTEMAS_PADRAO.length; i++) {
    const sistema = SISTEMAS_PADRAO[i];
    if (porChave.has(sistema.chave)) continue;
    const [created] = await db.insert(sistemasConstrutivosTable).values({
      tenantId: tid,
      chave: sistema.chave,
      nome: sistema.nome,
      escoposAplicacao: [...sistema.escoposAplicacao],
      ativo: true,
      ordem: i,
    }).returning();
    criados.push(created);
  }

  return res.json({ existentes: existentes.length, criados: criados.length, itens: criados });
});

router.get("/tenants/:tenantId/sistemas-construtivos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(sistemasConstrutivosTable)
    .where(eq(sistemasConstrutivosTable.tenantId, tid))
    .orderBy(asc(sistemasConstrutivosTable.ordem), asc(sistemasConstrutivosTable.nome));
  return res.json(rows);
});

router.post("/tenants/:tenantId/sistemas-construtivos", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = insertSistemaConstrutivoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.insert(sistemasConstrutivosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.put("/tenants/:tenantId/sistemas-construtivos/:sistemaId", async (req, res) => {
  const { tenantId: tid, sistemaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = updateSistemaConstrutivoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.update(sistemasConstrutivosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(sistemasConstrutivosTable.id, sistemaId), eq(sistemasConstrutivosTable.tenantId, tid)))
    .returning();
  if (!row) return res.status(404).json({ error: "Sistema não encontrado" });
  return res.json(row);
});

router.post("/tenants/:tenantId/sistemas-construtivos/:sistemaId/variantes", async (req, res) => {
  const { tenantId: tid, sistemaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [sistema] = await db.select({ id: sistemasConstrutivosTable.id })
    .from(sistemasConstrutivosTable)
    .where(and(eq(sistemasConstrutivosTable.id, sistemaId), eq(sistemasConstrutivosTable.tenantId, tid)));
  if (!sistema) return res.status(404).json({ error: "Sistema não encontrado" });

  const parsed = insertSistemaVarianteSchema.safeParse({ ...req.body, sistemaId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.insert(sistemaVariantesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/sistemas-construtivos/:sistemaId/regras", async (req, res) => {
  const { tenantId: tid, sistemaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [sistema] = await db.select({ id: sistemasConstrutivosTable.id })
    .from(sistemasConstrutivosTable)
    .where(and(eq(sistemasConstrutivosTable.id, sistemaId), eq(sistemasConstrutivosTable.tenantId, tid)));
  if (!sistema) return res.status(404).json({ error: "Sistema não encontrado" });

  const parsed = insertSistemaComposicaoRegraSchema.safeParse({ ...req.body, sistemaId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.varianteId) {
    const [variante] = await db.select({ id: sistemaVariantesTable.id })
      .from(sistemaVariantesTable)
      .where(and(eq(sistemaVariantesTable.id, parsed.data.varianteId), eq(sistemaVariantesTable.sistemaId, sistemaId)));
    if (!variante) return res.status(422).json({ error: "Variante não pertence ao sistema." });
  }

  const [row] = await db.insert(sistemaComposicaoRegrasTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/sistemas-interfaces", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });
  const parsed = insertSistemaInterfaceSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const [row] = await db.insert(sistemaInterfacesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/sistemas-construtivos/:sistemaId/resolver", async (req, res) => {
  const { tenantId: tid, sistemaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [sistema] = await db.select().from(sistemasConstrutivosTable)
    .where(and(eq(sistemasConstrutivosTable.id, sistemaId), eq(sistemasConstrutivosTable.tenantId, tid)));
  if (!sistema) return res.status(404).json({ error: "Sistema não encontrado" });

  const varianteId = typeof req.query.varianteId === "string" ? req.query.varianteId : null;
  const etapaKey = typeof req.query.etapaKey === "string" ? req.query.etapaKey : null;

  const filtros = [eq(sistemaComposicaoRegrasTable.sistemaId, sistemaId)];
  if (varianteId) filtros.push(eq(sistemaComposicaoRegrasTable.varianteId, varianteId));
  if (etapaKey) filtros.push(eq(sistemaComposicaoRegrasTable.etapaKey, etapaKey));

  const regras = await db.select().from(sistemaComposicaoRegrasTable)
    .where(and(...filtros))
    .orderBy(asc(sistemaComposicaoRegrasTable.ordem));

  const interfaces = await db.select().from(sistemaInterfacesTable)
    .where(and(
      eq(sistemaInterfacesTable.tenantId, tid),
      eq(sistemaInterfacesTable.ativo, true),
      or(
        eq(sistemaInterfacesTable.sistemaOrigem, sistema.chave),
        eq(sistemaInterfacesTable.sistemaOrigem, "todos"),
      ),
    ));

  const porSlot = new Map<string, typeof regras>();
  for (const regra of regras) {
    if (!porSlot.has(regra.slotKey)) porSlot.set(regra.slotKey, []);
    porSlot.get(regra.slotKey)!.push(regra);
  }

  return res.json({
    sistema,
    varianteId,
    etapaKey,
    slots: [...porSlot.entries()].map(([slotKey, slotRegras]) => ({
      slotKey,
      regras: slotRegras,
    })),
    interfaces,
    acoesSuportadas: ["manter", "substituir", "adicionar", "remover", "dimensionar_pelo_projeto"],
  });
});

// ─── Ambientes, elementos, superfícies, faces e zonas ─────────────────────────

router.post("/tenants/:tenantId/obras/:obraId/pavimentos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraPavimentoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraPavimentosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/ambientes", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraAmbienteSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.pavimentoId) {
    const [pav] = await db.select({ id: obraPavimentosTable.id }).from(obraPavimentosTable)
      .where(and(eq(obraPavimentosTable.id, parsed.data.pavimentoId), eq(obraPavimentosTable.obraId, obraId)));
    if (!pav) return res.status(422).json({ error: "Pavimento inválido para esta obra." });
  }

  const [row] = await db.insert(obraAmbientesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/elementos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraElementoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const areaBruta = numberOrZero(parsed.data.areaBruta);
  const areaAberturas = numberOrZero(parsed.data.areaAberturas);
  const areaLiquida = parsed.data.areaLiquida != null
    ? numberOrZero(parsed.data.areaLiquida)
    : Math.max(0, areaBruta - areaAberturas);

  const [row] = await db.insert(obraElementosTable).values({
    ...parsed.data,
    areaLiquida: areaLiquida.toFixed(4),
  }).returning();

  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/superficies", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraSuperficieSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const areaBruta = numberOrZero(parsed.data.areaBruta);
  const areaAberturas = numberOrZero(parsed.data.areaAberturas);
  const areaLiquida = parsed.data.areaLiquida != null
    ? numberOrZero(parsed.data.areaLiquida)
    : Math.max(0, areaBruta - areaAberturas);

  const [row] = await db.insert(obraSuperficiesTable).values({
    ...parsed.data,
    areaLiquida: areaLiquida.toFixed(4),
  }).returning();

  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/superficies/:superficieId/zonas", async (req, res) => {
  const { tenantId: tid, obraId, superficieId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [superficie] = await db.select().from(obraSuperficiesTable)
    .where(and(eq(obraSuperficiesTable.id, superficieId), eq(obraSuperficiesTable.obraId, obraId)));
  if (!superficie) return res.status(404).json({ error: "Superfície não encontrada" });

  const parsed = insertObraSuperficieZonaSchema.safeParse({ ...req.body, superficieId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const zonasAtivas = await db.select().from(obraSuperficieZonasTable)
    .where(and(eq(obraSuperficieZonasTable.superficieId, superficieId), eq(obraSuperficieZonasTable.ativo, true)));

  const areaLiquida = numberOrZero(superficie.areaLiquida);
  const areaNova = numberOrZero(parsed.data.area);
  const areaJaAtribuida = zonasAtivas.reduce((sum, z) => sum + numberOrZero(z.area), 0);

  if (areaLiquida > 0 && areaJaAtribuida + areaNova > areaLiquida + 0.0001) {
    return res.status(422).json({
      error: "As zonas ultrapassam a área líquida da superfície.",
      areaLiquida: areaLiquida.toFixed(4),
      areaJaAtribuida: areaJaAtribuida.toFixed(4),
      areaTentada: areaNova.toFixed(4),
    });
  }

  const [row] = await db.insert(obraSuperficieZonasTable).values(parsed.data).returning();

  const areaAtribuida = areaJaAtribuida + areaNova;
  return res.status(201).json({
    zona: row,
    resumo: {
      areaLiquida: areaLiquida.toFixed(4),
      areaAtribuida: areaAtribuida.toFixed(4),
      areaNaoAtribuida: Math.max(0, areaLiquida - areaAtribuida).toFixed(4),
      completo: areaLiquida === 0 ? true : Math.abs(areaLiquida - areaAtribuida) < 0.0001,
    },
  });
});

router.get("/tenants/:tenantId/obras/:obraId/superficies/:superficieId/resumo-zonas", async (req, res) => {
  const { tenantId: tid, obraId, superficieId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [superficie] = await db.select().from(obraSuperficiesTable)
    .where(and(eq(obraSuperficiesTable.id, superficieId), eq(obraSuperficiesTable.obraId, obraId)));
  if (!superficie) return res.status(404).json({ error: "Superfície não encontrada" });

  const zonas = await db.select().from(obraSuperficieZonasTable)
    .where(and(eq(obraSuperficieZonasTable.superficieId, superficieId), eq(obraSuperficieZonasTable.ativo, true)))
    .orderBy(desc(obraSuperficieZonasTable.prioridade), asc(obraSuperficieZonasTable.createdAt));

  const areaLiquida = numberOrZero(superficie.areaLiquida);
  const areaAtribuida = zonas.reduce((sum, z) => sum + numberOrZero(z.area), 0);

  return res.json({
    superficie,
    zonas,
    areaLiquida: areaLiquida.toFixed(4),
    areaAtribuida: areaAtribuida.toFixed(4),
    areaNaoAtribuida: Math.max(0, areaLiquida - areaAtribuida).toFixed(4),
    alertaAreaNaoAtribuida: areaLiquida > 0 && areaAtribuida < areaLiquida - 0.0001,
    alertaSobreposicao: areaLiquida > 0 && areaAtribuida > areaLiquida + 0.0001,
  });
});

router.post("/tenants/:tenantId/obras/:obraId/acabamentos-padroes", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraAcabamentoPadraoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraAcabamentoPadroesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/superficies/:superficieId/resolver-acabamento", async (req, res) => {
  const { tenantId: tid, obraId, superficieId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [superficie] = await db.select().from(obraSuperficiesTable)
    .where(and(eq(obraSuperficiesTable.id, superficieId), eq(obraSuperficiesTable.obraId, obraId)));
  if (!superficie) return res.status(404).json({ error: "Superfície não encontrada" });

  const ambiente = superficie.ambienteId
    ? (await db.select().from(obraAmbientesTable).where(eq(obraAmbientesTable.id, superficie.ambienteId)))[0] ?? null
    : null;

  const padroes = await db.select().from(obraAcabamentoPadroesTable)
    .where(and(
      eq(obraAcabamentoPadroesTable.obraId, obraId),
      eq(obraAcabamentoPadroesTable.ativo, true),
    ))
    .orderBy(asc(obraAcabamentoPadroesTable.ordem));

  const prioridade = {
    padrao_empresa: 1,
    padrao_tipo_ambiente: 2,
    padrao_obra: 3,
    ambiente: 4,
    superficie: 5,
    zona: 6,
  } as const;

  const candidatos = padroes.filter((p) => {
    if (p.tipoAmbiente && p.tipoAmbiente !== ambiente?.tipo) return false;
    if (p.tipoSuperficie && p.tipoSuperficie !== superficie.tipo) return false;
    return true;
  }).sort((a, b) =>
    (prioridade[b.escopo as keyof typeof prioridade] ?? 0) -
    (prioridade[a.escopo as keyof typeof prioridade] ?? 0));

  return res.json({
    superficie,
    ambiente,
    acabamentoEfetivo: candidatos[0] ?? null,
    candidatos,
    regraHeranca: "empresa > tipo_ambiente > obra > ambiente > superficie > zona; o mais específico vence",
  });
});

router.get("/tenants/:tenantId/obras/:obraId/estrutura-espacial", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const [pavimentos, ambientes, elementos, superficies] = await Promise.all([
    db.select().from(obraPavimentosTable).where(eq(obraPavimentosTable.obraId, obraId)).orderBy(asc(obraPavimentosTable.ordem)),
    db.select().from(obraAmbientesTable).where(eq(obraAmbientesTable.obraId, obraId)),
    db.select().from(obraElementosTable).where(and(eq(obraElementosTable.obraId, obraId), eq(obraElementosTable.ativo, true))),
    db.select().from(obraSuperficiesTable).where(eq(obraSuperficiesTable.obraId, obraId)),
  ]);

  const superficieIds = superficies.map((s) => s.id);
  const zonas = superficieIds.length
    ? await db.select().from(obraSuperficieZonasTable).where(and(
        inArray(obraSuperficieZonasTable.superficieId, superficieIds),
        eq(obraSuperficieZonasTable.ativo, true),
      ))
    : [];

  return res.json({ pavimentos, ambientes, elementos, superficies, zonas });
});

// ─── Elétrica: pontos/dispositivos separados de circuitos/redes ───────────────

router.post("/tenants/:tenantId/obras/:obraId/eletrica/pontos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraEletricaPontoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.ambienteId) {
    const [amb] = await db.select({ id: obraAmbientesTable.id }).from(obraAmbientesTable)
      .where(and(eq(obraAmbientesTable.id, parsed.data.ambienteId), eq(obraAmbientesTable.obraId, obraId)));
    if (!amb) return res.status(422).json({ error: "Ambiente inválido para esta obra." });
  }

  const [row] = await db.insert(obraEletricaPontosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/eletrica/circuitos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraEletricaCircuitoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraEletricaCircuitosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/eletrica/quadros", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraEletricaQuadroSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraEletricaQuadrosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/eletrica/redes-especiais", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraEletricaRedeEspecialSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraEletricaRedesEspeciaisTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/eletrica/resumo", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const [pontos, circuitos, quadros, redes] = await Promise.all([
    db.select().from(obraEletricaPontosTable).where(and(eq(obraEletricaPontosTable.obraId, obraId), eq(obraEletricaPontosTable.ativo, true))),
    db.select().from(obraEletricaCircuitosTable).where(and(eq(obraEletricaCircuitosTable.obraId, obraId), eq(obraEletricaCircuitosTable.ativo, true))),
    db.select().from(obraEletricaQuadrosTable).where(and(eq(obraEletricaQuadrosTable.obraId, obraId), eq(obraEletricaQuadrosTable.ativo, true))),
    db.select().from(obraEletricaRedesEspeciaisTable).where(and(eq(obraEletricaRedesEspeciaisTable.obraId, obraId), eq(obraEletricaRedesEspeciaisTable.ativo, true))),
  ]);

  const circuitosPorCodigo = new Map(circuitos.map((c) => [c.id, c]));
  const alertas = [];

  for (const ponto of pontos) {
    if (ponto.circuitoId && !circuitosPorCodigo.has(ponto.circuitoId)) {
      alertas.push({
        tipo: "ponto_sem_circuito_valido",
        pontoId: ponto.id,
        circuitoId: ponto.circuitoId,
      });
    }
  }

  const potenciaPontosW = pontos.reduce((sum, p) => sum + numberOrZero(p.potenciaW) * numberOrZero(p.quantidade), 0);
  const potenciaCircuitosW = circuitos.reduce((sum, circuito) => sum + numberOrZero(circuito.potenciaInstaladaW), 0);

  return res.json({
    pontos,
    circuitos,
    quadros,
    redes,
    totais: {
      pontos: pontos.reduce((sum, p) => sum + numberOrZero(p.quantidade), 0),
      circuitos: circuitos.length,
      quadros: quadros.length,
      redesEspeciais: redes.length,
      potenciaPontosW: potenciaPontosW.toFixed(4),
      potenciaCircuitosW: potenciaCircuitosW.toFixed(4),
    },
    alertas,
    regraAntiduplicidade: {
      pontos: "caixa/dispositivo/ponto",
      circuitos: "cabos/eletrodutos/proteções e infraestrutura de rede",
      principio: "o mesmo material/serviço não deve constar simultaneamente na composição do ponto e do circuito",
    },
  });
});

router.get("/tenants/:tenantId/obras/:obraId/eletrica/verificar-duplicidade", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const pontos = await db.select().from(obraEletricaPontosTable)
    .where(and(eq(obraEletricaPontosTable.obraId, obraId), eq(obraEletricaPontosTable.ativo, true)));
  const circuitos = await db.select().from(obraEletricaCircuitosTable)
    .where(and(eq(obraEletricaCircuitosTable.obraId, obraId), eq(obraEletricaCircuitosTable.ativo, true)));

  const conflitos = [];
  for (const ponto of pontos) {
    if (!ponto.circuitoId) continue;
    const circuito = circuitos.find((circuito) => circuito.id === ponto.circuitoId);
    if (!circuito) continue;

    if (ponto.incluiInfraestruturaAteCaixa && circuito.composicaoId) {
      conflitos.push({
        pontoId: ponto.id,
        circuitoId: circuito.id,
        tipo: "infraestrutura_potencialmente_duplicada",
        mensagem: "O ponto inclui infraestrutura até a caixa e o circuito possui composição própria. Revisar escopo das composições.",
      });
    }
  }

  return res.json({
    conflitos,
    possuiConflito: conflitos.length > 0,
  });
});

// ─── Energia e sistemas especiais ─────────────────────────────────────────────

router.post("/tenants/:tenantId/obras/:obraId/energia/sistemas", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraEnergiaSistemaSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraEnergiaSistemasTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/energia/sistemas/:sistemaId/componentes", async (req, res) => {
  const { tenantId: tid, obraId, sistemaId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [sistema] = await db.select().from(obraEnergiaSistemasTable)
    .where(and(eq(obraEnergiaSistemasTable.id, sistemaId), eq(obraEnergiaSistemasTable.obraId, obraId)));
  if (!sistema) return res.status(404).json({ error: "Sistema de energia não encontrado" });

  const parsed = insertObraEnergiaComponenteSchema.safeParse({ ...req.body, sistemaId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.circuitoId) {
    const [circuito] = await db.select().from(obraEletricaCircuitosTable)
      .where(and(eq(obraEletricaCircuitosTable.id, parsed.data.circuitoId), eq(obraEletricaCircuitosTable.obraId, obraId)));
    if (!circuito) return res.status(422).json({ error: "Circuito elétrico inválido para esta obra." });
  }

  const [row] = await db.insert(obraEnergiaComponentesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/energia/resumo", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const sistemas = await db.select().from(obraEnergiaSistemasTable)
    .where(and(eq(obraEnergiaSistemasTable.obraId, obraId), eq(obraEnergiaSistemasTable.ativo, true)));
  const ids = sistemas.map((s) => s.id);
  const componentes = ids.length
    ? await db.select().from(obraEnergiaComponentesTable)
        .where(and(inArray(obraEnergiaComponentesTable.sistemaId, ids), eq(obraEnergiaComponentesTable.ativo, true)))
    : [];

  const alertas = [];
  for (const sistema of sistemas) {
    const comps = componentes.filter((c) => c.sistemaId === sistema.id);
    const slots = new Map<string, number>();
    for (const comp of comps) slots.set(comp.slotKey, (slots.get(comp.slotKey) ?? 0) + 1);

    for (const [slotKey, total] of slots) {
      if (total > 1) {
        alertas.push({
          tipo: "slot_duplicado",
          sistemaId: sistema.id,
          slotKey,
          quantidade: total,
          mensagem: "Há mais de um componente ativo no mesmo slot técnico. Revisar duplicidade.",
        });
      }
    }

    if (sistema.somenteInfraestrutura) {
      const equipamentosFinais = comps.filter((c) => c.tipo === "equipamento" || c.tipo === "geracao" || c.tipo === "armazenamento");
      if (equipamentosFinais.length) {
        alertas.push({
          tipo: "infraestrutura_com_equipamento_final",
          sistemaId: sistema.id,
          mensagem: "O sistema está marcado como somente infraestrutura, mas possui equipamento final ativo.",
        });
      }
    }
  }

  return res.json({
    sistemas,
    componentes,
    totais: {
      potenciaKw: sistemas.reduce((sum, s) => sum + numberOrZero(s.potenciaKw), 0).toFixed(4),
      energiaKwh: sistemas.reduce((sum, s) => sum + numberOrZero(s.energiaKwh), 0).toFixed(4),
    },
    alertas,
    regraAntiduplicidade: "infraestrutura, circuito e equipamento final devem ocupar slots distintos; o mesmo escopo não deve ser cobrado em mais de um componente",
  });
});

router.post("/tenants/:tenantId/obras/:obraId/energia/preconfigurar", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const tipo = typeof req.body?.tipo === "string" ? req.body.tipo : null;
  const permitidos = ["fotovoltaico_on_grid","fotovoltaico_hibrido","off_grid","banco_baterias","carregador_ve","gerador","nobreak_ups","quadro_cargas_essenciais","chave_transferencia","gestao_energia"];
  if (!tipo || !permitidos.includes(tipo)) return res.status(422).json({ error: "Tipo de sistema especial inválido." });

  const somenteInfraestrutura = Boolean(req.body?.somenteInfraestrutura);
  const parametros = req.body?.parametros && typeof req.body.parametros === "object" ? req.body.parametros : {};

  const defaults: Record<string, Array<{ tipo: string; slotKey: string; nome: string }>> = {
    fotovoltaico_on_grid: [
      { tipo: "geracao", slotKey: "modulos", nome: "Módulos fotovoltaicos" },
      { tipo: "conversao", slotKey: "inversor", nome: "Inversor fotovoltaico" },
      { tipo: "infraestrutura", slotKey: "cabos_cc_ca", nome: "Cabos e infraestrutura CC/CA" },
      { tipo: "protecao", slotKey: "protecoes_cc_ca", nome: "Proteções CC/CA" },
      { tipo: "estrutura_fixacao", slotKey: "estrutura_fixacao", nome: "Estrutura de fixação" },
      { tipo: "aterramento", slotKey: "aterramento", nome: "Aterramento/equipotencialização" },
      { tipo: "medicao", slotKey: "medicao", nome: "Medição/monitoramento" },
    ],
    carregador_ve: [
      { tipo: "infraestrutura", slotKey: "circuito_dedicado", nome: "Circuito dedicado para recarga VE" },
      { tipo: "protecao", slotKey: "protecao_ve", nome: "Proteções do circuito de recarga" },
      { tipo: "aterramento", slotKey: "aterramento_ve", nome: "Aterramento do ponto de recarga" },
      { tipo: "equipamento", slotKey: "wallbox", nome: "Carregador veicular / wallbox" },
      { tipo: "controle", slotKey: "gestao_carga", nome: "Gerenciamento/balanceamento de carga" },
    ],
    off_grid: [
      { tipo: "geracao", slotKey: "geracao", nome: "Geração principal" },
      { tipo: "armazenamento", slotKey: "baterias", nome: "Banco de baterias" },
      { tipo: "conversao", slotKey: "inversor_hibrido", nome: "Inversor híbrido/off-grid" },
      { tipo: "controle", slotKey: "controle_carga", nome: "Controle de carga/energia" },
      { tipo: "infraestrutura", slotKey: "quadro_cargas_essenciais", nome: "Quadro de cargas essenciais" },
      { tipo: "protecao", slotKey: "protecoes", nome: "Proteções elétricas" },
      { tipo: "aterramento", slotKey: "aterramento", nome: "Aterramento/equipotencialização" },
    ],
  };

  const [sistema] = await db.insert(obraEnergiaSistemasTable).values({
    obraId,
    tipo,
    nome: req.body?.nome ?? tipo,
    somenteInfraestrutura,
    parametros,
    origem: "preconfiguracao",
    ativo: true,
  }).returning();

  const componentesBase = defaults[tipo] ?? [];
  const componentesCriados = [];
  for (const item of componentesBase) {
    if (somenteInfraestrutura && ["equipamento","geracao","armazenamento","conversao"].includes(item.tipo)) continue;
    const [created] = await db.insert(obraEnergiaComponentesTable).values({
      sistemaId: sistema.id,
      tipo: item.tipo,
      slotKey: item.slotKey,
      nome: item.nome,
      quantidade: "1",
      unidade: "un",
      ativo: true,
    }).returning();
    componentesCriados.push(created);
  }

  return res.status(201).json({ sistema, componentes: componentesCriados });
});

// ─── Hidráulica: pontos, redes, tecnologias e segmentos ───────────────────────

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/redes", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraHidraulicaRedeSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaRedesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/pontos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraHidraulicaPontoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.redeId) {
    const [rede] = await db.select().from(obraHidraulicaRedesTable)
      .where(and(eq(obraHidraulicaRedesTable.id, parsed.data.redeId), eq(obraHidraulicaRedesTable.obraId, obraId)));
    if (!rede) return res.status(422).json({ error: "Rede hidráulica inválida para esta obra." });
  }

  const [row] = await db.insert(obraHidraulicaPontosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/redes/:redeId/segmentos", async (req, res) => {
  const { tenantId: tid, obraId, redeId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [rede] = await db.select().from(obraHidraulicaRedesTable)
    .where(and(eq(obraHidraulicaRedesTable.id, redeId), eq(obraHidraulicaRedesTable.obraId, obraId)));
  if (!rede) return res.status(404).json({ error: "Rede hidráulica não encontrada" });

  const parsed = insertObraHidraulicaSegmentoSchema.safeParse({ ...req.body, redeId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaSegmentosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/equipamentos", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraHidraulicaEquipamentoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaEquipamentosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/hidraulica/resumo", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const [redes, pontos, equipamentos] = await Promise.all([
    db.select().from(obraHidraulicaRedesTable).where(and(eq(obraHidraulicaRedesTable.obraId, obraId), eq(obraHidraulicaRedesTable.ativo, true))),
    db.select().from(obraHidraulicaPontosTable).where(and(eq(obraHidraulicaPontosTable.obraId, obraId), eq(obraHidraulicaPontosTable.ativo, true))),
    db.select().from(obraHidraulicaEquipamentosTable).where(and(eq(obraHidraulicaEquipamentosTable.obraId, obraId), eq(obraHidraulicaEquipamentosTable.ativo, true))),
  ]);

  const redeIds = redes.map((r) => r.id);
  const segmentos = redeIds.length
    ? await db.select().from(obraHidraulicaSegmentosTable)
        .where(and(inArray(obraHidraulicaSegmentosTable.redeId, redeIds), eq(obraHidraulicaSegmentosTable.ativo, true)))
    : [];

  const alertas = [];

  for (const ponto of pontos) {
    if (ponto.redeId) {
      const rede = redes.find((r) => r.id === ponto.redeId);
      if (!rede) {
        alertas.push({ tipo: "ponto_sem_rede_valida", pontoId: ponto.id, redeId: ponto.redeId });
        continue;
      }
      if (ponto.incluiLigacaoAteRede && rede.composicaoId) {
        alertas.push({
          tipo: "ligacao_potencialmente_duplicada",
          pontoId: ponto.id,
          redeId: rede.id,
          mensagem: "O ponto inclui ligação até a rede e a rede possui composição própria. Revisar escopo para evitar dupla contagem.",
        });
      }
    }
  }

  for (const rede of redes) {
    const segs = segmentos.filter((s) => s.redeId === rede.id);
    const tecnologias = new Set(segs.map((s) => s.tecnologia).filter(Boolean));
    if (tecnologias.size > 1 && !rede.configuracao?.includes("mista")) {
      alertas.push({
        tipo: "rede_com_tecnologias_mistas",
        redeId: rede.id,
        mensagem: "A rede possui segmentos com tecnologias diferentes. Marcar configuração mista ou revisar os trechos.",
      });
    }
  }

  const totalComprimento = segmentos.reduce((sum, s) => sum + numberOrZero(s.comprimentoM), 0);

  return res.json({
    redes,
    pontos,
    segmentos,
    equipamentos,
    totais: {
      redes: redes.length,
      pontos: pontos.reduce((sum, p) => sum + numberOrZero(p.quantidade), 0),
      segmentos: segmentos.length,
      comprimentoM: totalComprimento.toFixed(4),
    },
    alertas,
    regraAntiduplicidade: {
      pontos: "terminal/ligação final",
      redes: "tubulação principal, conexões, suportes, isolamento e infraestrutura",
      principio: "o mesmo trecho/material não deve existir simultaneamente na composição do ponto e da rede",
    },
  });
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/preconfigurar", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const funcao = typeof req.body?.funcao === "string" ? req.body.funcao : null;
  const tecnologia = typeof req.body?.tecnologia === "string" ? req.body.tecnologia : null;
  const permitidasFuncoes = ["agua_fria","agua_quente","esgoto","ventilacao","pluvial","drenagem","reuso","irrigacao","piscina","hidromassagem","outro"];
  const permitidasTecnologias = ["pex","ppr","pvc","cpvc","aquatherm","cobre","multicamada","pead","ferro_fundido","pp","outro"];

  if (!funcao || !permitidasFuncoes.includes(funcao)) return res.status(422).json({ error: "Função hidráulica inválida." });
  if (!tecnologia || !permitidasTecnologias.includes(tecnologia)) return res.status(422).json({ error: "Tecnologia hidráulica inválida." });

  const configuracao = typeof req.body?.configuracao === "string" ? req.body.configuracao : null;
  const codigo = typeof req.body?.codigo === "string" && req.body.codigo.trim()
    ? req.body.codigo.trim()
    : `${funcao.toUpperCase()}-01`;

  const [rede] = await db.insert(obraHidraulicaRedesTable).values({
    obraId,
    codigo,
    funcao,
    tipoRede: req.body?.tipoRede ?? "ramal",
    tecnologia,
    configuracao,
    diametroMm: req.body?.diametroMm != null ? String(req.body.diametroMm) : null,
    classePressao: req.body?.classePressao ?? null,
    origem: "preconfiguracao",
    metadata: req.body?.metadata ?? null,
    ativo: true,
  }).returning();

  return res.status(201).json({ rede });
});

// ─── Área técnica, água quente, pressurização e reservação ───────────────────

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/areas-tecnicas", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db.select({ id: obrasTable.id }).from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada" });

  const parsed = insertObraHidraulicaAreaTecnicaSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaAreasTecnicasTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/manifolds", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraHidraulicaManifoldSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.areaTecnicaId) {
    const [area] = await db.select({ id: obraHidraulicaAreasTecnicasTable.id })
      .from(obraHidraulicaAreasTecnicasTable)
      .where(and(eq(obraHidraulicaAreasTecnicasTable.id, parsed.data.areaTecnicaId), eq(obraHidraulicaAreasTecnicasTable.obraId, obraId)));
    if (!area) return res.status(422).json({ error: "Área técnica inválida para esta obra." });
  }

  const [row] = await db.insert(obraHidraulicaManifoldsTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/aquecimento", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraHidraulicaAquecimentoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaAquecimentoTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/pressurizacao", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraHidraulicaPressurizacaoSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaPressurizacaoTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/reservatorios", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraHidraulicaReservatorioSchema.safeParse({ ...req.body, obraId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraHidraulicaReservatoriosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/obras/:obraId/hidraulica/area-tecnica-resumo", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [areas, manifolds, aquecimento, pressurizacao, reservatorios] = await Promise.all([
    db.select().from(obraHidraulicaAreasTecnicasTable)
      .where(and(eq(obraHidraulicaAreasTecnicasTable.obraId, obraId), eq(obraHidraulicaAreasTecnicasTable.ativo, true))),
    db.select().from(obraHidraulicaManifoldsTable)
      .where(and(eq(obraHidraulicaManifoldsTable.obraId, obraId), eq(obraHidraulicaManifoldsTable.ativo, true))),
    db.select().from(obraHidraulicaAquecimentoTable)
      .where(and(eq(obraHidraulicaAquecimentoTable.obraId, obraId), eq(obraHidraulicaAquecimentoTable.ativo, true))),
    db.select().from(obraHidraulicaPressurizacaoTable)
      .where(and(eq(obraHidraulicaPressurizacaoTable.obraId, obraId), eq(obraHidraulicaPressurizacaoTable.ativo, true))),
    db.select().from(obraHidraulicaReservatoriosTable)
      .where(and(eq(obraHidraulicaReservatoriosTable.obraId, obraId), eq(obraHidraulicaReservatoriosTable.ativo, true))),
  ]);

  const alertas = [];

  for (const aq of aquecimento) {
    if (aq.tipoGeracao === "solar_termico" && !aq.apoioEletrico && !aq.apoioGas) {
      alertas.push({
        tipo: "solar_termico_sem_apoio",
        aquecimentoId: aq.id,
        mensagem: "Sistema solar térmico sem apoio configurado. Revisar estratégia de contingência.",
      });
    }
    if (aq.recirculacao && !aq.areaTecnicaId) {
      alertas.push({
        tipo: "recirculacao_sem_area_tecnica",
        aquecimentoId: aq.id,
        mensagem: "Sistema com recirculação sem área técnica associada.",
      });
    }
  }

  for (const p of pressurizacao) {
    if (!p.areaTecnicaId && !p.somenteInfraestrutura) {
      alertas.push({
        tipo: "pressurizador_sem_area_tecnica",
        pressurizacaoId: p.id,
        mensagem: "Pressurização sem área técnica associada.",
      });
    }
  }

  for (const m of manifolds) {
    if (!m.areaTecnicaId) {
      alertas.push({
        tipo: "manifold_sem_area_tecnica",
        manifoldId: m.id,
        mensagem: "Manifold sem área técnica/shaft associado.",
      });
    }
  }

  const volumeReservacaoL = reservatorios.reduce((sum, r) => sum + numberOrZero(r.volumeL), 0);
  const volumeQuenteL = aquecimento.reduce((sum, a) => sum + numberOrZero(a.volumeAcumulacaoL), 0);
  const potenciaAquecimentoKw = aquecimento.reduce((sum, a) => sum + numberOrZero(a.potenciaKw), 0);
  const potenciaPressurizacaoKw = pressurizacao.reduce((sum, p) => sum + numberOrZero(p.potenciaKw), 0);

  return res.json({
    areas,
    manifolds,
    aquecimento,
    pressurizacao,
    reservatorios,
    totais: {
      volumeReservacaoL: volumeReservacaoL.toFixed(2),
      volumeAguaQuenteL: volumeQuenteL.toFixed(2),
      potenciaAquecimentoKw: potenciaAquecimentoKw.toFixed(4),
      potenciaPressurizacaoKw: potenciaPressurizacaoKw.toFixed(4),
    },
    alertas,
  });
});

router.post("/tenants/:tenantId/obras/:obraId/hidraulica/preconfigurar-area-tecnica", async (req, res) => {
  const { tenantId: tid, obraId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const nome = typeof req.body?.nome === "string" && req.body.nome.trim()
    ? req.body.nome.trim()
    : "Central hidráulica";
  const tipo = typeof req.body?.tipo === "string" ? req.body.tipo : "central_hidraulica";

  const [area] = await db.insert(obraHidraulicaAreasTecnicasTable).values({
    obraId,
    nome,
    tipo,
    ventilacaoObrigatoria: Boolean(req.body?.ventilacaoObrigatoria),
    drenoObrigatorio: req.body?.drenoObrigatorio !== false,
    pontoEletricoObrigatorio: Boolean(req.body?.pontoEletricoObrigatorio),
    pontoGasObrigatorio: Boolean(req.body?.pontoGasObrigatorio),
    acessoManutencao: true,
    parametros: req.body?.parametros ?? null,
    ativo: true,
  }).returning();

  return res.status(201).json({ areaTecnica: area });
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
      perdaPercentualOverride: composicaoInsumosTable.perdaPercentualOverride,
      precoMestre: insumosTable.precoUnitario,
      perdaPadraoPercentual: insumosTable.perdaPadraoPercentual,
    })
    .from(composicaoInsumosTable)
    .leftJoin(insumosTable, eq(composicaoInsumosTable.insumoId, insumosTable.id))
    .where(eq(composicaoInsumosTable.composicaoId, composicaoId));

  const total = itens.reduce((sum, item) => {
    const quantidade = numberOrZero(item.quantidade);
    const preco = numberOrZero(item.precoMestre);
    const perda = item.perdaPercentualOverride != null
      ? numberOrZero(item.perdaPercentualOverride)
      : numberOrZero(item.perdaPadraoPercentual);
    return sum + quantidade * (1 + perda / 100) * preco;
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
    tipo: z.enum(["material", "mao_de_obra", "equipamento", "servico", "subempreitada", "consumivel", "frete", "outro_custo_direto"]).optional().nullable(),
    precoUnitario: z.union([z.string(), z.number()]).optional().nullable(),
    origemPreco: z.string().trim().max(100).optional().nullable(),
    precoValidade: z.string().trim().max(20).optional().nullable(),
    regiaoPreco: z.string().trim().max(255).optional().nullable(),
    fornecedorPreferencial: z.string().trim().max(255).optional().nullable(),
    marca: z.string().trim().max(255).optional().nullable(),
    modelo: z.string().trim().max(255).optional().nullable(),
    fabricante: z.string().trim().max(255).optional().nullable(),
    especificacaoTecnica: z.record(z.string(), z.unknown()).optional().nullable(),
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
    tipo?: "material" | "mao_de_obra" | "equipamento" | "servico" | "subempreitada" | "consumivel" | "frete" | "outro_custo_direto";
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
        ? { precoUnitario: String(raw.precoUnitario).trim(), precoAtualizadoEm: new Date() }
        : {}),
      ...(raw.origemPreco?.trim() ? { origemPreco: raw.origemPreco.trim() } : {}),
      ...(raw.precoValidade?.trim() ? { precoValidade: raw.precoValidade.trim() } : {}),
      ...(raw.regiaoPreco?.trim() ? { regiaoPreco: raw.regiaoPreco.trim() } : {}),
      ...(raw.fornecedorPreferencial?.trim() ? { fornecedorPreferencial: raw.fornecedorPreferencial.trim() } : {}),
      ...(raw.marca?.trim() ? { marca: raw.marca.trim() } : {}),
      ...(raw.modelo?.trim() ? { modelo: raw.modelo.trim() } : {}),
      ...(raw.fabricante?.trim() ? { fabricante: raw.fabricante.trim() } : {}),
      ...(raw.especificacaoTecnica ? { especificacaoTecnica: raw.especificacaoTecnica } : {}),
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

router.post("/tenants/:tenantId/insumos/:insumoId/duplicar", async (req, res) => {
  const { tenantId: tid, insumoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [original] = await db
    .select()
    .from(insumosTable)
    .where(and(eq(insumosTable.id, insumoId), eq(insumosTable.tenantId, tid)));
  if (!original) return res.status(404).json({ error: "Insumo não encontrado" });

  const nome = typeof req.body?.nome === "string" && req.body.nome.trim()
    ? req.body.nome.trim()
    : `${original.nome} — cópia`;
  const codigo = typeof req.body?.codigo === "string" && req.body.codigo.trim()
    ? req.body.codigo.trim()
    : original.codigo
      ? `${original.codigo}-COPIA`
      : null;

  const [created] = await db.insert(insumosTable).values({
    tenantId: tid,
    nome,
    descricao: original.descricao,
    unidade: original.unidade,
    unidadeCompra: original.unidadeCompra,
    fatorCompraParaConsumo: original.fatorCompraParaConsumo,
    embalagemQuantidade: original.embalagemQuantidade,
    quantidadeMinimaCompra: original.quantidadeMinimaCompra,
    multiploCompra: original.multiploCompra,
    permiteFracionarCompra: original.permiteFracionarCompra,
    perdaPadraoPercentual: original.perdaPadraoPercentual,
    tipo: original.tipo,
    precoUnitario: original.precoUnitario,
    origemPreco: original.origemPreco,
    precoValidade: original.precoValidade,
    precoAtualizadoEm: original.precoAtualizadoEm,
    regiaoPreco: original.regiaoPreco,
    fornecedorPreferencial: original.fornecedorPreferencial,
    marca: original.marca,
    modelo: original.modelo,
    fabricante: original.fabricante,
    especificacaoTecnica: original.especificacaoTecnica,
    categoria: original.categoria,
    codigo,
  }).returning();

  return res.status(201).json(created);
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
        .select({ id: insumosTable.id, precoUnitario: insumosTable.precoUnitario, perdaPadraoPercentual: insumosTable.perdaPadraoPercentual })
        .from(insumosTable)
        .where(and(eq(insumosTable.tenantId, tid), inArray(insumosTable.id, insumoIds)))
    : [];

  if (insumos.length !== insumoIds.length) {
    return res.status(422).json({ error: "Um ou mais insumos não pertencem a este tenant." });
  }

  const dadosPorInsumo = new Map(insumos.map((item) => [item.id, {
    preco: Number(item.precoUnitario ?? 0),
    perdaPadrao: Number(item.perdaPadraoPercentual ?? 0),
  }]));
  const custoTotal = parsedItens.data.reduce((sum, item) => {
    const dados = dadosPorInsumo.get(item.insumoId) ?? { preco: 0, perdaPadrao: 0 };
    const perda = item.perdaPercentualOverride != null
      ? Number(item.perdaPercentualOverride)
      : dados.perdaPadrao;
    const quantidadeEfetiva = Number(item.quantidade ?? 0) * (1 + perda / 100);
    return sum + quantidadeEfetiva * dados.preco;
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
          perdaPercentualOverride: item.perdaPercentualOverride ?? null,
          formulaQuantidade: item.formulaQuantidade ?? null,
          condicaoAplicabilidade: item.condicaoAplicabilidade ?? null,
          observacaoTecnica: item.observacaoTecnica ?? null,
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

router.post("/tenants/:tenantId/composicoes/:composicaoId/duplicar", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [original] = await db
    .select()
    .from(composicoesTable)
    .where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
  if (!original) return res.status(404).json({ error: "Composição não encontrada" });

  const itens = await db
    .select()
    .from(composicaoInsumosTable)
    .where(eq(composicaoInsumosTable.composicaoId, composicaoId));

  const nome = typeof req.body?.nome === "string" && req.body.nome.trim()
    ? req.body.nome.trim()
    : `${original.nome} — variante`;
  const codigo = typeof req.body?.codigo === "string" && req.body.codigo.trim()
    ? req.body.codigo.trim()
    : original.codigo
      ? `${original.codigo}-VAR`
      : null;

  const duplicada = await db.transaction(async (tx) => {
    const [created] = await tx.insert(composicoesTable).values({
      tenantId: tid,
      nome,
      descricao: original.descricao,
      unidade: original.unidade,
      tipoComposicao: original.tipoComposicao,
      aplicacao: original.aplicacao,
      inclui: original.inclui,
      naoInclui: original.naoInclui,
      criterioMedicao: original.criterioMedicao,
      observacoesTecnicas: original.observacoesTecnicas,
      formulaCalculo: original.formulaCalculo,
      parametrosPadrao: original.parametrosPadrao,
      composicaoOrigemId: original.composicaoOrigemId ?? original.id,
      varianteDeId: original.id,
      versao: 1,
      statusVersao: "rascunho",
      versaoAtual: true,
      custoTotal: original.custoTotal,
      produtividadeDia: original.produtividadeDia,
      equipePadrao: original.equipePadrao,
      horasDiaPadrao: original.horasDiaPadrao,
      codigo,
      etapaKey: original.etapaKey,
      sistemasConstrutivos: original.sistemasConstrutivos,
      comumTodosSistemas: original.comumTodosSistemas,
      ativo: true,
      ordem: original.ordem,
    }).returning();

    if (itens.length) {
      await tx.insert(composicaoInsumosTable).values(itens.map((item) => ({
        composicaoId: created.id,
        insumoId: item.insumoId,
        quantidade: item.quantidade,
        perdaPercentualOverride: item.perdaPercentualOverride,
        formulaQuantidade: item.formulaQuantidade,
        condicaoAplicabilidade: item.condicaoAplicabilidade,
        observacaoTecnica: item.observacaoTecnica,
        precoUnitario: item.precoUnitario,
      })));
    }

    return created;
  });

  return res.status(201).json(duplicada);
});

router.post("/tenants/:tenantId/composicoes/:composicaoId/nova-versao", async (req, res) => {
  const { tenantId: tid, composicaoId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [original] = await db
    .select()
    .from(composicoesTable)
    .where(and(eq(composicoesTable.id, composicaoId), eq(composicoesTable.tenantId, tid)));
  if (!original) return res.status(404).json({ error: "Composição não encontrada" });

  const raizId = original.composicaoOrigemId ?? original.id;
  const versoes = await db
    .select({ versao: composicoesTable.versao })
    .from(composicoesTable)
    .where(and(
      eq(composicoesTable.tenantId, tid),
      or(eq(composicoesTable.id, raizId), eq(composicoesTable.composicaoOrigemId, raizId)),
    ));
  const nextVersao = Math.max(original.versao, ...versoes.map((v) => v.versao ?? 1)) + 1;

  const itens = await db
    .select()
    .from(composicaoInsumosTable)
    .where(eq(composicaoInsumosTable.composicaoId, composicaoId));

  const nova = await db.transaction(async (tx) => {
    await tx.update(composicoesTable)
      .set({ versaoAtual: false, updatedAt: new Date() })
      .where(and(
        eq(composicoesTable.tenantId, tid),
        or(eq(composicoesTable.id, raizId), eq(composicoesTable.composicaoOrigemId, raizId)),
      ));

    const [created] = await tx.insert(composicoesTable).values({
      tenantId: tid,
      nome: original.nome,
      descricao: original.descricao,
      unidade: original.unidade,
      tipoComposicao: original.tipoComposicao,
      aplicacao: original.aplicacao,
      inclui: original.inclui,
      naoInclui: original.naoInclui,
      criterioMedicao: original.criterioMedicao,
      observacoesTecnicas: original.observacoesTecnicas,
      formulaCalculo: original.formulaCalculo,
      parametrosPadrao: original.parametrosPadrao,
      composicaoOrigemId: raizId,
      varianteDeId: original.varianteDeId,
      versao: nextVersao,
      statusVersao: "rascunho",
      versaoAtual: true,
      custoTotal: original.custoTotal,
      produtividadeDia: original.produtividadeDia,
      equipePadrao: original.equipePadrao,
      horasDiaPadrao: original.horasDiaPadrao,
      codigo: original.codigo,
      etapaKey: original.etapaKey,
      sistemasConstrutivos: original.sistemasConstrutivos,
      comumTodosSistemas: original.comumTodosSistemas,
      ativo: original.ativo,
      ordem: original.ordem,
    }).returning();

    if (itens.length) {
      await tx.insert(composicaoInsumosTable).values(itens.map((item) => ({
        composicaoId: created.id,
        insumoId: item.insumoId,
        quantidade: item.quantidade,
        perdaPercentualOverride: item.perdaPercentualOverride,
        formulaQuantidade: item.formulaQuantidade,
        condicaoAplicabilidade: item.condicaoAplicabilidade,
        observacaoTecnica: item.observacaoTecnica,
        precoUnitario: item.precoUnitario,
      })));
    }

    return created;
  });

  return res.status(201).json(nova);
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
      perdaPercentualOverride: composicaoInsumosTable.perdaPercentualOverride,
      formulaQuantidade: composicaoInsumosTable.formulaQuantidade,
      condicaoAplicabilidade: composicaoInsumosTable.condicaoAplicabilidade,
      observacaoTecnica: composicaoInsumosTable.observacaoTecnica,
      precoUnitario: composicaoInsumosTable.precoUnitario,
      insumo: insumosTable,
    })
    .from(composicaoInsumosTable)
    .leftJoin(insumosTable, eq(composicaoInsumosTable.insumoId, insumosTable.id))
    .where(eq(composicaoInsumosTable.composicaoId, composicaoId));

  const custoTotal = itens.reduce((sum, item) => {
    const quantidade = Number(item.quantidade ?? 0);
    const preco = Number(item.insumo?.precoUnitario ?? 0);
    const perda = item.perdaPercentualOverride != null
      ? Number(item.perdaPercentualOverride)
      : Number(item.insumo?.perdaPadraoPercentual ?? 0);
    return sum + quantidade * (1 + perda / 100) * preco;
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
          .select({ id: insumosTable.id, precoUnitario: insumosTable.precoUnitario, perdaPadraoPercentual: insumosTable.perdaPadraoPercentual })
          .from(insumosTable)
          .where(and(eq(insumosTable.tenantId, tid), inArray(insumosTable.id, insumoIds)))
      : [];

    if (insumos.length !== insumoIds.length) {
      return res.status(422).json({ error: "Um ou mais insumos não pertencem a este tenant." });
    }

    const dadosPorInsumo = new Map(insumos.map((item) => [item.id, {
      preco: Number(item.precoUnitario ?? 0),
      perdaPadrao: Number(item.perdaPadraoPercentual ?? 0),
    }]));
    custoTotal = parsedItens.reduce((sum, item) => {
      const dados = dadosPorInsumo.get(item.insumoId) ?? { preco: 0, perdaPadrao: 0 };
      const perda = item.perdaPercentualOverride != null
        ? Number(item.perdaPercentualOverride)
        : dados.perdaPadrao;
      const quantidadeEfetiva = Number(item.quantidade ?? 0) * (1 + perda / 100);
      return sum + quantidadeEfetiva * dados.preco;
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
            perdaPercentualOverride: item.perdaPercentualOverride ?? null,
            formulaQuantidade: item.formulaQuantidade ?? null,
            condicaoAplicabilidade: item.condicaoAplicabilidade ?? null,
            observacaoTecnica: item.observacaoTecnica ?? null,
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
