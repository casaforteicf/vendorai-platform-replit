/**
 * Financeiro de Obra — lançamentos, análise IA de documentos, DRE simplificado
 */
import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq, desc, sum, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  obrasTable,
  obraEtapasTable,
  obraLancamentosTable,
  insertObraLancamentoSchema,
  updateObraLancamentoSchema,
} from "@workspace/db";
import { resolveAIKey, logUsage, estimateCost } from "../lib/ai-gateway.js";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

function canAccess(req: Express.Request, tid: string) {
  const u = (req as any).user;
  return u?.tenantId === tid || u?.platformRole === "super_admin";
}

// ─── 1. Análise IA de documento ────────────────────────────────────────────────

router.post(
  "/tenants/:tenantId/obras/:obraId/lancamentos/analisar",
  upload.single("documento"),
  async (req, res) => {
    const { tenantId, obraId } = req.params;
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
        feature: "proposal_generation",
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

  // Opcional: integração Asaas — só se ASAAS_API_KEY configurado e lançamento tem vencimento
  if (process.env["ASAAS_API_KEY"] && row && parsed.data.dataVencimento && Number(parsed.data.valor ?? 0) > 0) {
    try {
      const { createCharge } = await import("../lib/asaas.js");
      const charge = await createCharge({
        customer: "none",  // sem cliente vinculado — conta a pagar interna
        billingType: "BOLETO",
        value: Number(parsed.data.valor),
        dueDate: parsed.data.dataVencimento,
        description: parsed.data.descricao ?? `Lançamento obra #${row.id.slice(0, 8)}`,
        externalReference: row.id,
      });
      if (charge?.id) {
        await db
          .update(obraLancamentosTable)
          .set({ asaasPaymentId: charge.id })
          .where(eq(obraLancamentosTable.id, row.id));
        return res.status(201).json({ ...row, asaasPaymentId: charge.id });
      }
    } catch {
      // Asaas falhou — retorna row sem ID Asaas (não-bloqueante)
    }
  }

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

  return res.status(204).send();
});

// ─── 3. DRE Simplificado ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/obras/:obraId/financeiro/dre", async (req, res) => {
  const { tenantId, obraId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  // Obra + orçamento total
  const [obra] = await db
    .select({ orcamentoTotal: obrasTable.orcamentoTotal, nome: obrasTable.nome })
    .from(obrasTable)
    .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tenantId)));

  if (!obra) return res.status(404).json({ error: "Obra não encontrada." });

  // Etapas para linha de orçamento por etapa
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

  return res.json({
    orcamentoTotal: Number(obra.orcamentoTotal ?? 0),
    totalGasto: Number(totais?.totalGasto ?? 0),
    totalPago: Number(totais?.totalPago ?? 0),
    totalPendente: Number(totais?.totalPendente ?? 0),
    saldo: Number(obra.orcamentoTotal ?? 0) - Number(totais?.totalGasto ?? 0),
    porTipo: porTipo.map((p) => ({ tipo: p.tipo, total: Number(p.total) })),
    etapas: etapas.map((e) => {
      const gastos = lancamentosRows
        .filter((l) => l.etapaId === e.id && l.status !== "cancelado")
        .reduce((s, l) => s + Number(l.total), 0);
      return { id: e.id, nome: e.nome, totalGasto: gastos };
    }),
    semEtapa: lancamentosRows
      .filter((l) => !l.etapaId && l.status !== "cancelado")
      .reduce((s, l) => s + Number(l.total), 0),
  });
});

export default router;
