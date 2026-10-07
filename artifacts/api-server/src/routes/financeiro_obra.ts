/**
 * Financeiro de Obra — lançamentos, análise IA de documentos, DRE simplificado
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  pool,
  obrasTable,
  obraEtapasTable,
  obraLancamentosTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  tenantsTable,
  insertObraLancamentoSchema,
  updateObraLancamentoSchema,
  obraFinanceiroTitulosTable,
  obraFinanceiroMovimentosTable,
  obraFinanceiroFluxoSnapshotsTable,
  obraPedidosCompraTable,
  obraExecucaoAtividadesTable,
  obraExecucaoSnapshotsTable,
  insertObraFinanceiroTituloSchema,
  insertObraFinanceiroMovimentoSchema,
} from "@workspace/db";
import { resolveAIKey, logUsage, estimateCost } from "../lib/ai-gateway.js";
import { gerarDrePdf } from "../lib/pdf-dre.js";

const router: IRouter = Router();

// ─── Helper: recalcula custoRealizado da obra a partir dos lançamentos ────────
async function recalcCustoRealizado(obraId: string, tenantId: string): Promise<void> {
  const [result] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${obraLancamentosTable.status} != 'cancelado' then ${obraLancamentosTable.valor} else 0 end), '0')`,
    })
    .from(obraLancamentosTable)
    .where(and(eq(obraLancamentosTable.obraId, obraId), eq(obraLancamentosTable.tenantId, tenantId)));
  const maoObraResult = await pool.query(
    `SELECT COALESCE(SUM(custo_mao_obra), 0)::numeric AS total
       FROM obra_apontamentos_producao
      WHERE obra_id = $1 AND tenant_id = $2`,
    [obraId, tenantId],
  );
  const totalRealizado = Number(result?.total ?? 0) + Number(maoObraResult.rows[0]?.total ?? 0);
  await db
    .update(obrasTable)
    .set({ custoRealizado: String(totalRealizado), updatedAt: new Date() })
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tenantId)));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

function canAccess(req: Express.Request, tid: string) {
  const u = (req as any).user;
  return u?.tenantId === tid || u?.platformRole === "super_admin";
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

// ─── Gate de vertical: todas as rotas com :tenantId exigem vertical=construcao ──
router.param("tenantId", async (req: any, res: any, next: any, tid: string) => {
  if (isSuperAdmin(req)) return next();
  const [tenant] = await db
    .select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tid));
  // BUG CORRIGIDO (auditoria) — mesmo problema de construcao.ts: literal
  // "construcao" nunca batia com nome real de template ("Construção &
  // Reforma"). Comparação por conteúdo, case-insensitive.
  if (!tenant?.vertical || !tenant.vertical.toLowerCase().includes("constru")) {
    return res.status(403).json({ error: "Acesso restrito à vertical de construção civil." });
  }
  return next();
});

// ─── 1. Análise IA de documento ────────────────────────────────────────────────

router.post(
  "/tenants/:tenantId/obras/:obraId/lancamentos/analisar",
  upload.single("documento"),
  async (req, res) => {
    const { tenantId, obraId } = req.params as Record<string, string>;
    if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

    const file = req.file;
    if (!file) return res.status(422).json({ error: "Nenhum arquivo enviado." });

    const isXml =
      file.originalname.toLowerCase().endsWith(".xml") ||
      file.mimetype.includes("xml");
    const isPdf =
      file.originalname.toLowerCase().endsWith(".pdf") ||
      file.mimetype === "application/pdf";

    if (!isPdf && !isXml) {
      return res.status(422).json({ error: "Somente arquivos PDF ou XML são suportados." });
    }

    const systemPrompt = `Você é um especialista em documentos fiscais e financeiros brasileiros.
Analise o documento fornecido e extraia as informações no seguinte formato JSON (sem markdown, apenas JSON puro):
{
  "tipo": "nota_fiscal" | "boleto" | "recibo" | "outros",
  "fornecedor": "nome do fornecedor/emitente",
  "numero": "número do documento (NF, boleto, etc.)",
  "valor": 0.00,
  "dataEmissao": "YYYY-MM-DD ou null",
  "dataVencimento": "YYYY-MM-DD ou null",
  "descricao": "descrição resumida dos itens/serviços",
  "observacoes": "informações adicionais relevantes"
}
Se um campo não puder ser extraído, use null. Valor sempre como número (float).`;

    try {
      const { apiKey } = await resolveAIKey(tenantId, "anthropic");
      const anthropic = new Anthropic({ apiKey });

      let messageContent: Anthropic.MessageParam["content"];

      if (isPdf) {
        const base64 = file.buffer.toString("base64");
        messageContent = [
          {
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: base64,
            },
          },
          {
            type: "text" as const,
            text: "Extraia as informações financeiras deste documento conforme as instruções do sistema.",
          },
        ];
      } else {
        // XML → text
        const xmlText = file.buffer.toString("utf-8");
        messageContent = [
          {
            type: "text" as const,
            text: `Extraia as informações financeiras deste documento XML:\n\n${xmlText.slice(0, 40000)}`,
          },
        ];
      }

      const model = "claude-sonnet-4-6";
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: messageContent }],
      });

      const rawText =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      // Parse JSON from response
      let extracted: Record<string, unknown> = {};
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          extracted = JSON.parse(jsonMatch[0]);
        } catch {
          extracted = { descricao: rawText, tipo: "outros" };
        }
      } else {
        extracted = { descricao: rawText, tipo: "outros" };
      }

      // Log usage
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costUsd = estimateCost(model, inputTokens, outputTokens);
      await logUsage({
        tenantId,
        provider: "anthropic",
        model,
        feature: "proposal_generator",
        inputTokens,
        outputTokens,
        costEstimateUsd: costUsd,
        usedByok: false,
        success: true,
      });

      return res.json({ extracted, filename: file.originalname, size: file.size });
    } catch (err: any) {
      req.log?.error({ err }, "financeiro-obra: AI analysis failed");
      return res.status(500).json({ error: err.message ?? "Falha na análise do documento." });
    }
  },
);

// ─── 2. CRUD de Lançamentos ────────────────────────────────────────────────────

// GET — lista todos os lançamentos da obra
router.get("/tenants/:tenantId/obras/:obraId/lancamentos", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(obraLancamentosTable)
    .where(
      and(
        eq(obraLancamentosTable.obraId, obraId),
        eq(obraLancamentosTable.tenantId, tenantId),
      ),
    )
    .orderBy(desc(obraLancamentosTable.createdAt));

  return res.json(rows);
});

// POST — cria lançamento confirmado
router.post("/tenants/:tenantId/obras/:obraId/lancamentos", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertObraLancamentoSchema.safeParse({ ...req.body, obraId, tenantId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraLancamentosTable).values(parsed.data).returning();

  // REMOVIDO (achado de auditoria): existia aqui uma tentativa de criar
  // cobrança na Asaas pra lançamento interno de obra, usando customer:
  // "none" e a chave da PLATAFORMA (não do tenant) — conceitualmente
  // errado desde o início. Lançamento interno é conta a pagar (o que a
  // obra deve a um fornecedor), não é "cobrar um cliente" — não existe
  // cliente real pra vincular. A chamada sempre falhava silenciosamente
  // (Asaas exige um customer válido), então nunca funcionou de verdade;
  // era código morto que só confundia. dataVencimento e valor já ficam
  // salvos direto na tabela, suficiente pra controle interno sem Asaas.

  await recalcCustoRealizado(obraId, tenantId);
  return res.status(201).json(row);
});

// PUT — atualiza lançamento
router.put("/tenants/:tenantId/obras/:obraId/lancamentos/:lancamentoId", async (req, res) => {
  const { tenantId, obraId, lancamentoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateObraLancamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db
    .update(obraLancamentosTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(obraLancamentosTable.id, lancamentoId),
        eq(obraLancamentosTable.obraId, obraId),
        eq(obraLancamentosTable.tenantId, tenantId),
      ),
    )
    .returning();

  if (!row) return res.status(404).json({ error: "Lançamento não encontrado." });
  await recalcCustoRealizado(obraId, tenantId);
  return res.json(row);
});

// DELETE — remove lançamento
router.delete("/tenants/:tenantId/obras/:obraId/lancamentos/:lancamentoId", async (req, res) => {
  const { tenantId, obraId, lancamentoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db
    .delete(obraLancamentosTable)
    .where(
      and(
        eq(obraLancamentosTable.id, lancamentoId),
        eq(obraLancamentosTable.obraId, obraId),
        eq(obraLancamentosTable.tenantId, tenantId),
      ),
    );

  await recalcCustoRealizado(obraId, tenantId);
  return res.status(204).send();
});

// ─── 3. DRE Simplificado ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/financeiro/dre", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  // Obra + orçamento manual legado (fallback quando ainda não existe orçamento estruturado)
  const [obra] = await db
    .select({ orcamentoTotal: obrasTable.orcamentoTotal, nome: obrasTable.nome })
    .from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tenantId)));

  if (!obra) return res.status(404).json({ error: "Obra não encontrada." });

  // Vincula automaticamente o custo da obra à versão correta do orçamento:
  // contratado > aprovado > versão mais recente não rejeitada.
  const orcamentos = await db
    .select({
      id: obraOrcamentosTable.id,
      versao: obraOrcamentosTable.versao,
      titulo: obraOrcamentosTable.titulo,
      status: obraOrcamentosTable.status,
      bdiGlobal: obraOrcamentosTable.bdiGlobal,
    })
    .from(obraOrcamentosTable)
    .where(
      and(
        eq(obraOrcamentosTable.tenantId, tenantId),
        eq(obraOrcamentosTable.obraId, obraId),
      ),
    )
    .orderBy(desc(obraOrcamentosTable.versao));

  const orcamentoVinculado =
    orcamentos.find((o) => o.status === "contratado") ??
    orcamentos.find((o) => o.status === "aprovado") ??
    orcamentos.find((o) => o.status !== "rejeitado") ??
    null;

  let custoOrcado = 0;
  let orcamentoCalculado = 0;
  let orcamentoEtapas: Array<{ id: string; nome: string; custoOrcado: number; valorVenda: number }> = [];

  if (orcamentoVinculado) {
    const etapasOrc = await db
      .select({
        id: obraOrcamentoEtapasTable.id,
        nome: obraOrcamentoEtapasTable.nome,
      })
      .from(obraOrcamentoEtapasTable)
      .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamentoVinculado.id));

    const etapaIds = etapasOrc.map((e) => e.id);
    const itensOrc = etapaIds.length > 0
      ? await db
          .select({
            etapaId: obraOrcamentoItensTable.etapaId,
            quantidade: obraOrcamentoItensTable.quantidade,
            custoUnitario: obraOrcamentoItensTable.custoUnitario,
            bdi: obraOrcamentoItensTable.bdi,
          })
          .from(obraOrcamentoItensTable)
          .where(inArray(obraOrcamentoItensTable.etapaId, etapaIds))
      : [];

    const bdiGlobal = Number(orcamentoVinculado.bdiGlobal ?? 0);

    orcamentoEtapas = etapasOrc.map((etapa) => {
      const itens = itensOrc.filter((i) => i.etapaId === etapa.id);
      const etapaCusto = itens.reduce(
        (total, item) => total + Number(item.quantidade ?? 0) * Number(item.custoUnitario ?? 0),
        0,
      );
      const etapaVenda = itens.reduce((total, item) => {
        const base = Number(item.quantidade ?? 0) * Number(item.custoUnitario ?? 0);
        const bdi = item.bdi != null ? Number(item.bdi) : bdiGlobal;
        return total + base * (1 + bdi / 100);
      }, 0);

      return { id: etapa.id, nome: etapa.nome, custoOrcado: etapaCusto, valorVenda: etapaVenda };
    });

    custoOrcado = orcamentoEtapas.reduce((total, etapa) => total + etapa.custoOrcado, 0);
    orcamentoCalculado = orcamentoEtapas.reduce((total, etapa) => total + etapa.valorVenda, 0);
  }

  const orcamentoTotal = orcamentoCalculado > 0
    ? orcamentoCalculado
    : Number(obra.orcamentoTotal ?? 0);

  // Sem orçamento estruturado, mantém compatibilidade usando o valor global da obra
  // também como base de custo, evitando quebrar obras antigas.
  const custoOrcadoBase = custoOrcado > 0 ? custoOrcado : orcamentoTotal;

  // Etapas de execução
  const etapas = await db
    .select({ id: obraEtapasTable.id, nome: obraEtapasTable.nome })
    .from(obraEtapasTable)
    .where(eq(obraEtapasTable.obraId, obraId));

  // Totais de lançamentos por etapa e tipo
  const lancamentosRows = await db
    .select({
      etapaId: obraLancamentosTable.etapaId,
      tipo: obraLancamentosTable.tipo,
      status: obraLancamentosTable.status,
      total: sql<string>`coalesce(sum(${obraLancamentosTable.valor}), 0)`,
    })
    .from(obraLancamentosTable)
    .where(
      and(
        eq(obraLancamentosTable.obraId, obraId),
        eq(obraLancamentosTable.tenantId, tenantId),
      ),
    )
    .groupBy(
      obraLancamentosTable.etapaId,
      obraLancamentosTable.tipo,
      obraLancamentosTable.status,
    );

  const maoObraApontadaResult = await pool.query(
    `SELECT etapa_id, COALESCE(SUM(custo_mao_obra), 0)::numeric AS total
       FROM obra_apontamentos_producao
      WHERE obra_id = $1 AND tenant_id = $2
      GROUP BY etapa_id`,
    [obraId, tenantId],
  );
  const maoObraPorEtapa = new Map<string | null, number>(
    maoObraApontadaResult.rows.map((row: any) => [row.etapa_id ?? null, Number(row.total ?? 0)]),
  );
  const maoObraApontada = maoObraApontadaResult.rows.reduce(
    (sum: number, row: any) => sum + Number(row.total ?? 0),
    0,
  );

  // Totais globais
  const [totais] = await db
    .select({
      totalGasto: sql<string>`coalesce(sum(case when ${obraLancamentosTable.status} != 'cancelado' then ${obraLancamentosTable.valor} else 0 end), 0)`,
      totalPago: sql<string>`coalesce(sum(case when ${obraLancamentosTable.status} = 'pago' then ${obraLancamentosTable.valor} else 0 end), 0)`,
      totalPendente: sql<string>`coalesce(sum(case when ${obraLancamentosTable.status} = 'pendente' then ${obraLancamentosTable.valor} else 0 end), 0)`,
    })
    .from(obraLancamentosTable)
    .where(
      and(
        eq(obraLancamentosTable.obraId, obraId),
        eq(obraLancamentosTable.tenantId, tenantId),
      ),
    );

  // Totais por tipo
  const porTipo = await db
    .select({
      tipo: obraLancamentosTable.tipo,
      total: sql<string>`coalesce(sum(${obraLancamentosTable.valor}), 0)`,
    })
    .from(obraLancamentosTable)
    .where(
      and(
        eq(obraLancamentosTable.obraId, obraId),
        eq(obraLancamentosTable.tenantId, tenantId),
        sql`${obraLancamentosTable.status} != 'cancelado'`,
      ),
    )
    .groupBy(obraLancamentosTable.tipo);

  const totalGastoFinanceiro = Number(totais?.totalGasto ?? 0);
  const totalGasto = totalGastoFinanceiro + maoObraApontada;
  const normalizeEtapa = (nome: string) =>
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const custoOrcadoPorNome = new Map(
    orcamentoEtapas.map((e) => [normalizeEtapa(e.nome), e.custoOrcado] as const),
  );

  const etapasCompatibilizadas = etapas.map((e) => {
    const gastoFinanceiro = lancamentosRows
      .filter((l) => l.etapaId === e.id && l.status !== "cancelado")
      .reduce((s, l) => s + Number(l.total), 0);
    const maoObra = maoObraPorEtapa.get(e.id) ?? 0;
    const gasto = gastoFinanceiro + maoObra;
    const previsto = custoOrcadoPorNome.get(normalizeEtapa(e.nome)) ?? 0;
    return {
      id: e.id,
      nome: e.nome,
      custoOrcado: previsto,
      totalGasto: gasto,
      desvio: previsto > 0 ? previsto - gasto : null,
    };
  });

  const desvioCusto = custoOrcadoBase - totalGasto;
  const percentualCustoRealizado = custoOrcadoBase > 0
    ? (totalGasto / custoOrcadoBase) * 100
    : 0;
  const margemOrcada = orcamentoTotal - custoOrcadoBase;
  const margemOrcadaPct = orcamentoTotal > 0 ? (margemOrcada / orcamentoTotal) * 100 : 0;

  return res.json({
    orcamentoTotal,
    custoOrcado: custoOrcadoBase,
    totalGasto,
    totalGastoFinanceiro,
    maoObraApontada,
    totalPago: Number(totais?.totalPago ?? 0),
    totalPendente: Number(totais?.totalPendente ?? 0),
    // compatibilidade com clientes existentes: saldo continua sendo valor de venda menos gasto
    saldo: orcamentoTotal - totalGasto,
    desvioCusto,
    percentualCustoRealizado,
    margemOrcada,
    margemOrcadaPct,
    orcamentoFonte: orcamentoVinculado ? "orcamento_obra" : "obra_manual",
    orcamentoVinculado: orcamentoVinculado
      ? {
          id: orcamentoVinculado.id,
          versao: orcamentoVinculado.versao,
          titulo: orcamentoVinculado.titulo,
          status: orcamentoVinculado.status,
        }
      : null,
    porTipo: [
      ...porTipo.map((p) => ({ tipo: p.tipo, total: Number(p.total) })),
      ...(maoObraApontada > 0 ? [{ tipo: "mao_de_obra_apontada", total: maoObraApontada }] : []),
    ],
    etapas: etapasCompatibilizadas,
    orcamentoEtapas,
    semEtapa: lancamentosRows
      .filter((l) => !l.etapaId && l.status !== "cancelado")
      .reduce((s, l) => s + Number(l.total), 0) + (maoObraPorEtapa.get(null) ?? 0),
  });
});

// ─── 4. Financeiro V19: contas a pagar/receber e fluxo de caixa ───────────────

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusTitulo(tipo: string, valorAberto: number, dataVencimento?: string | null): string {
  if (valorAberto <= 0.0001) return tipo === "pagar" ? "pago" : "recebido";
  if (dataVencimento) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (dataVencimento < hoje) return "vencido";
  }
  return "aberto";
}

router.get("/tenants/:tenantId/obras/:obraId/financeiro/titulos", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(obraFinanceiroTitulosTable)
    .where(and(eq(obraFinanceiroTitulosTable.tenantId, tenantId), eq(obraFinanceiroTitulosTable.obraId, obraId)))
    .orderBy(desc(obraFinanceiroTitulosTable.dataVencimento), desc(obraFinanceiroTitulosTable.createdAt));

  return res.json(rows);
});

router.post("/tenants/:tenantId/obras/:obraId/financeiro/titulos", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const valor = num(req.body?.valorOriginal);
  if (valor <= 0) return res.status(422).json({ error: "Valor original deve ser maior que zero." });

  const parsed = insertObraFinanceiroTituloSchema.safeParse({
    ...req.body,
    tenantId,
    obraId,
    valorOriginal: String(valor),
    valorAberto: req.body?.valorAberto == null ? String(valor) : String(req.body.valorAberto),
    valorLiquidado: req.body?.valorLiquidado == null ? "0" : String(req.body.valorLiquidado),
    criadoPorId: (req as any).user?.sub ?? null,
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(obraFinanceiroTitulosTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/obras/:obraId/financeiro/sincronizar-compras", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const pedidos = await db.select().from(obraPedidosCompraTable)
    .where(and(eq(obraPedidosCompraTable.tenantId, tenantId), eq(obraPedidosCompraTable.obraId, obraId)));

  const elegiveis = pedidos.filter((p) => ["aprovado","enviado","parcialmente_recebido","recebido"].includes(p.status));
  const existentes = await db.select().from(obraFinanceiroTitulosTable)
    .where(and(
      eq(obraFinanceiroTitulosTable.tenantId, tenantId),
      eq(obraFinanceiroTitulosTable.obraId, obraId),
      eq(obraFinanceiroTitulosTable.origem, "pedido_compra"),
    ));

  const criados = [];
  for (const pedido of elegiveis) {
    if (existentes.some((t) => t.origemId === pedido.id || t.pedidoCompraId === pedido.id)) continue;

    const valor = num(pedido.valorTotal);
    if (valor <= 0) continue;

    const [titulo] = await db.insert(obraFinanceiroTitulosTable).values({
      tenantId,
      obraId,
      tipo: "pagar",
      status: "aberto",
      origem: "pedido_compra",
      origemId: pedido.id,
      pedidoCompraId: pedido.id,
      contraparte: pedido.fornecedorNomeSnapshot,
      documentoNumero: pedido.numeroPedido ?? null,
      descricao: `Pedido de compra ${pedido.numeroPedido ?? pedido.id}`,
      categoria: "compras",
      dataEmissao: pedido.dataPedido ?? null,
      dataVencimento: pedido.dataPrevistaEntrega ?? pedido.dataNecessidade ?? null,
      valorOriginal: valor.toFixed(4),
      valorAberto: valor.toFixed(4),
      valorLiquidado: "0",
      criadoPorId: (req as any).user?.sub ?? null,
      metadata: { cotacaoId: pedido.cotacaoId, propostaId: pedido.propostaId },
    }).returning();
    criados.push(titulo);
  }

  return res.json({ criados, ignorados: elegiveis.length - criados.length });
});

router.post("/tenants/:tenantId/obras/:obraId/financeiro/recebiveis-contrato", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const orcamentoId = typeof req.body?.orcamentoId === "string" ? req.body.orcamentoId : null;
  if (!orcamentoId) return res.status(422).json({ error: "orcamentoId obrigatório." });

  const [orcamento] = await db.select().from(obraOrcamentosTable)
    .where(and(
      eq(obraOrcamentosTable.id, orcamentoId),
      eq(obraOrcamentosTable.tenantId, tenantId),
      eq(obraOrcamentosTable.obraId, obraId),
    ));
  if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado." });
  if (orcamento.status !== "contratado" && orcamento.status !== "aprovado") {
    return res.status(409).json({ error: "Orçamento precisa estar aprovado ou contratado." });
  }

  const parcelas = Array.isArray(req.body?.parcelas) ? req.body.parcelas : [];
  if (!parcelas.length) return res.status(422).json({ error: "Informe as parcelas do contrato." });

  const totalParcelas = parcelas.reduce((s: number, p: any) => s + num(p.valor), 0);
  if (totalParcelas <= 0) return res.status(422).json({ error: "Total das parcelas deve ser maior que zero." });

  const criados = [];
  for (let i = 0; i < parcelas.length; i++) {
    const p = parcelas[i];
    const valor = num(p.valor);
    if (valor <= 0 || typeof p.dataVencimento !== "string") {
      return res.status(422).json({ error: `Parcela ${i + 1} inválida.` });
    }

    const origemId = `${orcamentoId}:parcela:${i + 1}`;
    const [existente] = await db.select({ id: obraFinanceiroTitulosTable.id }).from(obraFinanceiroTitulosTable)
      .where(and(
        eq(obraFinanceiroTitulosTable.tenantId, tenantId),
        eq(obraFinanceiroTitulosTable.obraId, obraId),
        eq(obraFinanceiroTitulosTable.origem, "contrato"),
        eq(obraFinanceiroTitulosTable.origemId, origemId),
      ));
    if (existente) continue;

    const [titulo] = await db.insert(obraFinanceiroTitulosTable).values({
      tenantId,
      obraId,
      tipo: "receber",
      status: "aberto",
      origem: "contrato",
      origemId,
      orcamentoId,
      contraparte: req.body?.clienteNome ?? null,
      descricao: p.descricao ?? `Parcela ${i + 1} do contrato`,
      categoria: "receita_contrato",
      dataEmissao: req.body?.dataContrato ?? null,
      dataVencimento: p.dataVencimento,
      valorOriginal: valor.toFixed(4),
      valorAberto: valor.toFixed(4),
      valorLiquidado: "0",
      criadoPorId: (req as any).user?.sub ?? null,
      metadata: { parcela: i + 1, totalParcelas: parcelas.length },
    }).returning();
    criados.push(titulo);
  }

  return res.status(201).json({ criados, totalParcelas: totalParcelas.toFixed(4) });
});

router.post("/tenants/:tenantId/obras/:obraId/financeiro/titulos/:tituloId/movimentos", async (req, res) => {
  const { tenantId, obraId, tituloId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [titulo] = await db.select().from(obraFinanceiroTitulosTable)
    .where(and(
      eq(obraFinanceiroTitulosTable.id, tituloId),
      eq(obraFinanceiroTitulosTable.tenantId, tenantId),
      eq(obraFinanceiroTitulosTable.obraId, obraId),
    ));
  if (!titulo) return res.status(404).json({ error: "Título não encontrado." });

  const valor = num(req.body?.valor);
  if (valor <= 0) return res.status(422).json({ error: "Valor do movimento deve ser maior que zero." });

  const tipoEsperado = titulo.tipo === "pagar" ? "pagamento" : "recebimento";
  const tipo = req.body?.tipo ?? tipoEsperado;
  if (!["pagamento","recebimento","estorno"].includes(tipo)) return res.status(422).json({ error: "Tipo de movimento inválido." });
  if (tipo !== "estorno" && tipo !== tipoEsperado) return res.status(422).json({ error: "Movimento incompatível com o título." });

  const abertoAtual = num(titulo.valorAberto);
  const liquidadoAtual = num(titulo.valorLiquidado);
  if (tipo !== "estorno" && valor > abertoAtual + 0.0001) {
    return res.status(422).json({ error: "Movimento excede o valor em aberto." });
  }

  const parsed = insertObraFinanceiroMovimentoSchema.safeParse({
    ...req.body,
    tituloId,
    tipo,
    valor: String(valor),
    responsavelId: (req as any).user?.sub ?? null,
  });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const resultado = await db.transaction(async (tx) => {
    const [mov] = await tx.insert(obraFinanceiroMovimentosTable).values(parsed.data).returning();

    const novoLiquidado = tipo === "estorno"
      ? Math.max(0, liquidadoAtual - valor)
      : liquidadoAtual + valor;
    const novoAberto = tipo === "estorno"
      ? Math.min(num(titulo.valorOriginal), abertoAtual + valor)
      : Math.max(0, abertoAtual - valor);
    const status = statusTitulo(titulo.tipo, novoAberto, titulo.dataVencimento);

    const [updated] = await tx.update(obraFinanceiroTitulosTable)
      .set({
        valorLiquidado: novoLiquidado.toFixed(4),
        valorAberto: novoAberto.toFixed(4),
        status,
        updatedAt: new Date(),
      })
      .where(eq(obraFinanceiroTitulosTable.id, tituloId))
      .returning();

    return { movimento: mov, titulo: updated };
  });

  return res.status(201).json(resultado);
});

router.get("/tenants/:tenantId/obras/:obraId/financeiro/fluxo-caixa", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [titulos, movimentos, execucao] = await Promise.all([
    db.select().from(obraFinanceiroTitulosTable)
      .where(and(eq(obraFinanceiroTitulosTable.tenantId, tenantId), eq(obraFinanceiroTitulosTable.obraId, obraId))),
    db.select({
      tituloId: obraFinanceiroMovimentosTable.tituloId,
      tipo: obraFinanceiroMovimentosTable.tipo,
      valor: obraFinanceiroMovimentosTable.valor,
      dataMovimento: obraFinanceiroMovimentosTable.dataMovimento,
    }).from(obraFinanceiroMovimentosTable)
      .innerJoin(obraFinanceiroTitulosTable, eq(obraFinanceiroMovimentosTable.tituloId, obraFinanceiroTitulosTable.id))
      .where(and(eq(obraFinanceiroTitulosTable.tenantId, tenantId), eq(obraFinanceiroTitulosTable.obraId, obraId))),
    db.select().from(obraExecucaoAtividadesTable)
      .where(and(eq(obraExecucaoAtividadesTable.tenantId, tenantId), eq(obraExecucaoAtividadesTable.obraId, obraId), eq(obraExecucaoAtividadesTable.ativo, true))),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);
  const pagarAberto = titulos.filter((t) => t.tipo === "pagar" && !["pago","cancelado"].includes(t.status)).reduce((s,t) => s + num(t.valorAberto), 0);
  const receberAberto = titulos.filter((t) => t.tipo === "receber" && !["recebido","cancelado"].includes(t.status)).reduce((s,t) => s + num(t.valorAberto), 0);
  const vencidoPagar = titulos.filter((t) => t.tipo === "pagar" && t.dataVencimento && t.dataVencimento < hoje && num(t.valorAberto) > 0).reduce((s,t) => s + num(t.valorAberto), 0);
  const vencidoReceber = titulos.filter((t) => t.tipo === "receber" && t.dataVencimento && t.dataVencimento < hoje && num(t.valorAberto) > 0).reduce((s,t) => s + num(t.valorAberto), 0);
  const pago = movimentos.filter((m) => m.tipo === "pagamento").reduce((s,m) => s + num(m.valor), 0) - movimentos.filter((m) => m.tipo === "estorno").reduce((s,m) => s + num(m.valor), 0);
  const recebido = movimentos.filter((m) => m.tipo === "recebimento").reduce((s,m) => s + num(m.valor), 0);
  const custoRealizado = execucao.reduce((s,a) => s + num(a.custoRealizado), 0);

  const porData = new Map<string, { data: string; pagar: number; receber: number }>();
  for (const titulo of titulos) {
    if (!titulo.previsaoCaixa || !titulo.dataVencimento || ["pago","recebido","cancelado"].includes(titulo.status)) continue;
    const row = porData.get(titulo.dataVencimento) ?? { data: titulo.dataVencimento, pagar: 0, receber: 0 };
    if (titulo.tipo === "pagar") row.pagar += num(titulo.valorAberto);
    else row.receber += num(titulo.valorAberto);
    porData.set(titulo.dataVencimento, row);
  }

  const projecao = [...porData.values()].sort((a,b) => a.data.localeCompare(b.data));
  let saldoProjetado = recebido - pago;
  const fluxoProjetado = projecao.map((x) => {
    saldoProjetado += x.receber - x.pagar;
    return { ...x, saldoProjetado };
  });

  return res.json({
    totais: {
      pagarAberto,
      receberAberto,
      vencidoPagar,
      vencidoReceber,
      pagoAcumulado: pago,
      recebidoAcumulado: recebido,
      saldoCaixa: recebido - pago,
      custoRealizado,
    },
    fluxoProjetado,
    titulos,
  });
});

router.post("/tenants/:tenantId/obras/:obraId/financeiro/fluxo-caixa/snapshot", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const titulos = await db.select().from(obraFinanceiroTitulosTable)
    .where(and(eq(obraFinanceiroTitulosTable.tenantId, tenantId), eq(obraFinanceiroTitulosTable.obraId, obraId)));
  const movimentos = await db.select({
    tipo: obraFinanceiroMovimentosTable.tipo,
    valor: obraFinanceiroMovimentosTable.valor,
  }).from(obraFinanceiroMovimentosTable)
    .innerJoin(obraFinanceiroTitulosTable, eq(obraFinanceiroMovimentosTable.tituloId, obraFinanceiroTitulosTable.id))
    .where(and(eq(obraFinanceiroTitulosTable.tenantId, tenantId), eq(obraFinanceiroTitulosTable.obraId, obraId)));
  const execucao = await db.select().from(obraExecucaoAtividadesTable)
    .where(and(eq(obraExecucaoAtividadesTable.tenantId, tenantId), eq(obraExecucaoAtividadesTable.obraId, obraId), eq(obraExecucaoAtividadesTable.ativo, true)));

  const pagarAberto = titulos.filter((t) => t.tipo === "pagar" && !["pago","cancelado"].includes(t.status)).reduce((s,t) => s + num(t.valorAberto), 0);
  const receberAberto = titulos.filter((t) => t.tipo === "receber" && !["recebido","cancelado"].includes(t.status)).reduce((s,t) => s + num(t.valorAberto), 0);
  const pago = movimentos.filter((m) => m.tipo === "pagamento").reduce((s,m) => s + num(m.valor), 0) - movimentos.filter((m) => m.tipo === "estorno").reduce((s,m) => s + num(m.valor), 0);
  const recebido = movimentos.filter((m) => m.tipo === "recebimento").reduce((s,m) => s + num(m.valor), 0);
  const custoRealizado = execucao.reduce((s,a) => s + num(a.custoRealizado), 0);
  const receitaContratada = titulos.filter((t) => t.tipo === "receber" && t.origem === "contrato").reduce((s,t) => s + num(t.valorOriginal), 0);
  const margemRealizada = recebido - custoRealizado;

  const [snapshot] = await db.insert(obraFinanceiroFluxoSnapshotsTable).values({
    obraId,
    dataReferencia: typeof req.body?.dataReferencia === "string" ? req.body.dataReferencia : new Date().toISOString().slice(0,10),
    contasPagarAberto: pagarAberto.toFixed(4),
    contasReceberAberto: receberAberto.toFixed(4),
    pagoAcumulado: pago.toFixed(4),
    recebidoAcumulado: recebido.toFixed(4),
    saldoCaixa: (recebido - pago).toFixed(4),
    custoRealizado: custoRealizado.toFixed(4),
    receitaContratada: receitaContratada.toFixed(4),
    margemRealizada: margemRealizada.toFixed(4),
    memoriaCalculo: { titulos: titulos.length, movimentos: movimentos.length, atividadesExecucao: execucao.length },
    criadoPorId: (req as any).user?.sub ?? null,
  }).returning();

  return res.status(201).json(snapshot);
});

// ─── 5. DRE PDF ───────────────────────────────────────────────────────────────

router.post("/tenants/:tenantId/obras/:obraId/financeiro/dre/pdf", async (req, res) => {
  const { tenantId, obraId } = req.params as Record<string, string>;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [obra] = await db
    .select({ nome: obrasTable.nome, endereco: obrasTable.endereco, orcamentoTotal: obrasTable.orcamentoTotal })
    .from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tenantId)));
  if (!obra) return res.status(404).json({ error: "Obra não encontrada." });

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  const lancamentos = await db
    .select({
      tipo: obraLancamentosTable.tipo,
      fornecedor: obraLancamentosTable.fornecedor,
      valor: obraLancamentosTable.valor,
      status: obraLancamentosTable.status,
      dataEmissao: obraLancamentosTable.dataEmissao,
      dataVencimento: obraLancamentosTable.dataVencimento,
      descricao: obraLancamentosTable.descricao,
    })
    .from(obraLancamentosTable)
    .where(and(eq(obraLancamentosTable.obraId, obraId), eq(obraLancamentosTable.tenantId, tenantId)))
    .orderBy(desc(obraLancamentosTable.dataEmissao));

  const pdf = await gerarDrePdf({
    tenantName: tenant?.name ?? "Construtora",
    obraNome: obra.nome,
    obraEndereco: obra.endereco,
    orcamentoTotal: obra.orcamentoTotal,
    lancamentos,
  });

  const slug = obra.nome.replace(/\s+/g, "-").toLowerCase();
  const filename = `dre-financeiro-${encodeURIComponent(slug)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdf.length);
  return res.send(pdf);
});

export default router;
