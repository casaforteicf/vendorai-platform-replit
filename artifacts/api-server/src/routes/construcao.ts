import { Router, type IRouter } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { resolveAIKey } from "../lib/ai-gateway.js";
import { and, eq, desc, asc, ilike, max, inArray, gte, lte } from "drizzle-orm";
import { searchSinapi } from "../data/sinapi";
import { gerarRelatorioDiarioPdf } from "../lib/pdf-diario";
import { gerarOrcamentoPdf } from "../lib/pdf-orcamento";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  db,
  obrasTable,
  tenantsTable,
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
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
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
  insertComposicaoSchema,
  insertComposicaoInsumoSchema,
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

// ─── Gate de vertical: todas as rotas com :tenantId exigem vertical=construcao ──
router.param("tenantId", async (req: any, res: any, next: any, tid: string) => {
  if (isSuperAdmin(req)) return next();
  const [tenant] = await db
    .select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tid));
  // BUG CORRIGIDO (auditoria): comparava com o literal "construcao", que
  // NUNCA bate com o nome real de nenhum segment_template no banco (ex:
  // "Construção & Reforma") — o módulo inteiro era inacessível pra
  // qualquer tenant real, só super_admin passava. Comparação por
  // conteúdo (case-insensitive) em vez de string exata, resiliente a
  // pequenas variações de nome do template no futuro.
  if (!tenant?.vertical || !tenant.vertical.toLowerCase().includes("constru")) {
    return res.status(403).json({ error: "Acesso restrito à vertical de construção civil." });
  }
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
    responsavelId: (req as any).user?.sub,
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

  const parsed = insertInsumoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [insumo] = await db.insert(insumosTable).values(parsed.data).returning();
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

  const rows = await db.select().from(composicoesTable).where(and(...filters)).orderBy(asc(composicoesTable.nome));
  return res.json(rows);
});

router.post("/tenants/:tenantId/composicoes", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const { itens, ...rest } = req.body as { itens?: unknown[]; [key: string]: unknown };

  const parsedComposicao = insertComposicaoSchema.safeParse({ ...rest, tenantId: tid });
  if (!parsedComposicao.success) return res.status(422).json({ error: parsedComposicao.error.message });

  const [composicao] = await db.insert(composicoesTable).values(parsedComposicao.data).returning();

  if (itens && itens.length > 0) {
    const parsedItens = z.array(insertComposicaoInsumoSchema).safeParse(
      itens.map((i) => ({ ...(i as object), composicaoId: composicao.id }))
    );
    if (!parsedItens.success) return res.status(422).json({ error: parsedItens.error.message });
    await db.insert(composicaoInsumosTable).values(parsedItens.data);
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

  const parsed = insertObraOrcamentoSchema.safeParse({
    ...req.body,
    tenantId: tid,
    obraId,
    versao: nextVersao,
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
          bdi: i.bdi,
          ordem: i.ordem,
        }))
      );
    }
  }

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
  if (orc.status === "aprovado") return res.status(409).json({ error: "Orçamento aprovado não pode ser editado" });

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
  if (orc.status === "aprovado") return res.status(409).json({ error: "Orçamento aprovado não pode ser editado" });

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
  if (orc.status === "aprovado") return res.status(409).json({ error: "Orçamento aprovado não pode ser editado" });

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
  if (orc.status === "aprovado") return res.status(409).json({ error: "Orçamento aprovado não pode ser editado" });

  const parsed = insertObraOrcamentoItemSchema.safeParse({ ...req.body, etapaId });
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
  if (orc.status === "aprovado") return res.status(409).json({ error: "Orçamento aprovado não pode ser editado" });

  const parsed = updateObraOrcamentoItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db
    .update(obraOrcamentoItensTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(obraOrcamentoItensTable.id, itemId), eq(obraOrcamentoItensTable.etapaId, etapaId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Item not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/obras/:obraId/orcamentos/:orcamentoId/etapas/:etapaId/itens/:itemId", async (req, res) => {
  const { tenantId: tid, obraId, orcamentoId, etapaId, itemId } = req.params;
  if (!canAccessTenant(req, tid)) return res.status(403).json({ error: "Forbidden" });

  const [orc] = await db
    .select({ status: obraOrcamentosTable.status })
    .from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.id, orcamentoId), eq(obraOrcamentosTable.tenantId, tid), eq(obraOrcamentosTable.obraId, obraId)));
  if (!orc) return res.status(404).json({ error: "Orçamento not found" });
  if (orc.status === "aprovado") return res.status(409).json({ error: "Orçamento aprovado não pode ser editado" });

  await db
    .delete(obraOrcamentoItensTable)
    .where(and(eq(obraOrcamentoItensTable.id, itemId), eq(obraOrcamentoItensTable.etapaId, etapaId)));
  return res.status(204).end();
});

export default router;
