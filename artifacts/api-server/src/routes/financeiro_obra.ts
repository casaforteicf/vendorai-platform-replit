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

// ─── 4. DRE PDF ───────────────────────────────────────────────────────────────

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
