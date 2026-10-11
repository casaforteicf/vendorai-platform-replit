import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import { extractQuoteData } from "../lib/document-extraction";
import { reviewImport, type OriginalBudget } from "../lib/commercial-import-review";
import { and, eq, desc, inArray, like, or, sql } from "drizzle-orm";
import {
  db,
  orcamentoRevisoesTable,
  insertOrcamentoRevisaoSchema,
  updateOrcamentoRevisaoSchema,
  propostasTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { buildFinancialSchedule } from "../lib/commercial-financial-schedule";
import { calculateBudget, compositionPackages, marginReport } from "../lib/commercial-budget-core";
import { validatePartialExecution, rankSupplierOffers } from "../lib/commercial-execution-supplier";

const router: IRouter = Router();

function hasAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

// ─── LOTE 05: prévia determinística, sem gravação em banco ───────────────
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/simular-cronograma", (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const input = z.object({
    grossCents: z.number().int().nonnegative().safe(),
    advanceCents: z.number().int().nonnegative().safe(),
    stages: z.array(z.object({
      id: z.string().trim().min(1),
      weight: z.number().finite().positive(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    })).min(1).max(200),
  }).safeParse(req.body);
  if (!input.success) return res.status(422).json({ error: "Dados inválidos", details: input.error.flatten() });
  try {
    return res.json({ tenantId, leadId: String(req.params.leadId), preview: buildFinancialSchedule(
      input.data.grossCents, input.data.advanceCents, input.data.stages,
    ) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Cronograma inválido" });
  }
});

// ─── LOTE 05: simulação universal, sem alterar proposta ou catálogo ──────────
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/simular-comercial", (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const lineSchema = z.object({
    id: z.string().min(1), kind: z.enum(["product", "service", "package", "composition"]),
    description: z.string().min(1), sku: z.string().optional(), unit: z.string().min(1),
    quantity: z.number().int().nonnegative().safe(),
    unitPriceCents: z.number().int().nonnegative().safe(),
    discountCents: z.number().int().nonnegative().safe().optional(),
    inclusion: z.enum(["included", "excluded", "optional"]).optional(),
    environmentId: z.string().optional(), phaseId: z.string().optional(), sourceItemId: z.string().optional(),
  });
  const payload = z.object({
    lines: z.array(lineSchema).max(1000),
    costCents: z.number().int().nonnegative().safe().optional(),
    inputs: z.array(z.object({
      id: z.string().min(1), quantity: z.number().int().nonnegative().safe(),
      packageQuantity: z.number().int().positive().safe(),
      packagePriceCents: z.number().int().nonnegative().safe(),
      lossPercent: z.number().finite().min(0).lt(100).optional(),
    })).max(500).optional(),
  }).safeParse(req.body);
  if (!payload.success) return res.status(422).json({ error: "Dados comerciais inválidos", details: payload.error.flatten() });
  try {
    const totals = calculateBudget(payload.data.lines);
    return res.json({
      tenantId, leadId: String(req.params.leadId), totals,
      compositions: (payload.data.inputs ?? []).map(compositionPackages),
      margin: payload.data.costCents === undefined ? null : marginReport(totals.includedCents, payload.data.costCents),
      persisted: false,
    });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Orçamento inválido" });
  }
});

// ─── LOTE 05: verificação de envio parcial, sem criar execução ───────────────
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/simular-execucao", (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const body = z.object({ items: z.array(z.object({
    itemId: z.string().min(1),
    approvedMilliQuantity: z.number().int().nonnegative().safe(),
    previouslyReleasedMilliQuantity: z.number().int().nonnegative().safe(),
    requestedMilliQuantity: z.number().int().nonnegative().safe(),
  })).min(1).max(1000) }).safeParse(req.body);
  if (!body.success) return res.status(422).json({ error: "Itens inválidos", details: body.error.flatten() });
  try { return res.json({ ...validatePartialExecution(body.data.items), persisted: false }); }
  catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Execução inválida" }); }
});

// ─── LOTE 05: avaliação de ofertas, sem contratar fornecedor ────────────────
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/comparar-fornecedores", (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const body = z.object({ offers: z.array(z.object({
    supplierId: z.string().min(1), itemId: z.string().min(1),
    priceCents: z.number().int().nonnegative().safe(),
    freightCents: z.number().int().nonnegative().safe(),
    deliveryDays: z.number().int().nonnegative().safe(),
  })).max(1000) }).safeParse(req.body);
  if (!body.success) return res.status(422).json({ error: "Ofertas inválidas", details: body.error.flatten() });
  try { return res.json({ offers: rankSupplierOffers(body.data.offers), persisted: false }); }
  catch (error) { return res.status(422).json({ error: error instanceof Error ? error.message : "Ofertas inválidas" }); }
});

// ─── LOTE 05: importação de PDF externa para revisão, sem persistência ──────
const externalPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf" && /\.pdf$/i.test(file.originalname)),
});
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/importar-pdf/preview",
  externalPdfUpload.single("file"), async (req, res) => {
    const tenantId = String(req.params.tenantId);
    if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
    if (!req.file || req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(422).json({ error: "PDF válido é obrigatório." });
    }
    try {
      const extracted = await extractQuoteData([{
        buffer: req.file.buffer, mimeType: "application/pdf", originalName: req.file.originalname,
      }], tenantId);
      const brl = (n: number | null | undefined): string =>
        typeof n === "number" && Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
      const original: OriginalBudget = {
        tenantId, sourceFileName: req.file.originalname,
        sourceSha256: createHash("sha256").update(req.file.buffer).digest("hex"),
        budgetNumber: extracted.numeroDocumento ?? undefined,
        customerDocument: extracted.clienteDocumento ?? undefined,
        issueDate: extracted.dataEmissao ?? undefined,
        originalTotalText: brl(extracted.valorTotal),
        lines: (extracted.itens ?? []).map(item => ({
          description: item.descricao,
          sku: item.codigo ?? undefined,
          unit: item.unidade ?? "",
          quantityText: item.quantidade == null ? "" : String(item.quantidade),
          unitPriceText: brl(item.valorUnitario),
          totalText: brl(item.valorTotal),
        })),
        unrecognizedFields: {
          originalExtraction: extracted,
          warnings: extracted.informacoesAdicionais ?? [],
        },
      };
      return res.json({
        previewOnly: true, requiresConfirmation: true,
        leadId: String(req.params.leadId),
        extracted, original, review: reviewImport(original),
        sourceAttachmentPersisted: false,
      });
    } catch (error) {
      return res.status(422).json({ error: "Falha na extração do PDF; nenhuma alteração foi gravada." });
    }
  },
);

// ─── List revision history for a lead ──────────────────────────────────────
router.get("/tenants/:tenantId/leads/:leadId/orcamento-revisoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const rows = await db
    .select()
    .from(orcamentoRevisoesTable)
    .where(and(eq(orcamentoRevisoesTable.tenantId, tenantId), eq(orcamentoRevisoesTable.leadId, leadId)))
    .orderBy(desc(orcamentoRevisoesTable.dataOrcamento), desc(orcamentoRevisoesTable.createdAt));

  const revisionProposalIds = rows
    .map((row) => row.propostaRevisaoId)
    .filter((id): id is string => Boolean(id));

  if (revisionProposalIds.length === 0) {
    return res.json(rows);
  }

  const revisionProposals = await db
    .select()
    .from(propostasTable)
    .where(and(
      eq(propostasTable.tenantId, tenantId),
      inArray(propostasTable.id, revisionProposalIds),
    ));

  const proposalById = new Map(revisionProposals.map((proposal) => [proposal.id, proposal] as const));

  return res.json(rows.map((row) => ({
    ...row,
    propostaRevisao: row.propostaRevisaoId ? proposalById.get(row.propostaRevisaoId) ?? null : null,
  })));
});

// ─── Create a revision entry ────────────────────────────────────────────────
router.post("/tenants/:tenantId/leads/:leadId/orcamento-revisoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const bodySchema = insertOrcamentoRevisaoSchema
    .omit({
      tenantId: true,
      leadId: true,
      createdBy: true,
      basePropostaId: true,
      propostaRevisaoId: true,
      revisaoNumero: true,
    })
    .extend({
      dealId: z.string().optional().nullable(),
      basePropostaId: z.string().min(1),
    });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [baseProposta] = await db
    .select()
    .from(propostasTable)
    .where(and(
      eq(propostasTable.id, parsed.data.basePropostaId),
      eq(propostasTable.tenantId, tenantId),
      eq(propostasTable.leadId, leadId),
    ))
    .limit(1);

  if (!baseProposta) {
    return res.status(404).json({ error: "Orçamento base não encontrado para este cliente." });
  }

  const baseNumero = String(baseProposta.numero || parsed.data.numeroOrcamento || baseProposta.id);

  const revisionCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orcamentoRevisoesTable)
    .where(and(
      eq(orcamentoRevisoesTable.tenantId, tenantId),
      eq(orcamentoRevisoesTable.leadId, leadId),
      or(
        eq(orcamentoRevisoesTable.basePropostaId, baseProposta.id),
        eq(orcamentoRevisoesTable.numeroOrcamento, baseNumero),
        like(orcamentoRevisoesTable.numeroOrcamento, `${baseNumero}-R%`),
      ),
    ));

  const revisionNumber = (revisionCount[0]?.count ?? 0) + 1;
  const isContractAddendum = baseProposta.status === "aceita";
  const revisionLabel = `${isContractAddendum ? "A" : "R"}${revisionNumber}`;
  const revisionNumero = `${baseNumero}-${revisionLabel}`;

  const revisionProposalId = crypto.randomUUID();
  const basePresentation = (baseProposta.apresentacao ?? {}) as any;
  const baseSourceSnapshot = basePresentation.sourceSnapshot && typeof basePresentation.sourceSnapshot === "object"
    ? basePresentation.sourceSnapshot
    : {};
  const revisionPresentation = {
    ...basePresentation,
    sourceSnapshot: {
      ...baseSourceSnapshot,
      schemaVersion: Number(baseSourceSnapshot.schemaVersion ?? 1),
      capturedAt: new Date().toISOString(),
      immutableForVersion: true,
      origin: "revision",
      changeType: isContractAddendum ? "contract_addendum" : "commercial_revision",
      baseBudgetId: baseProposta.id,
      baseBudgetNumber: baseNumero,
      revisionLabel,
      parentSnapshotCapturedAt: baseSourceSnapshot.capturedAt ?? null,
    },
  };

  const [revisionProposal] = await db
    .insert(propostasTable)
    .values({
      id: revisionProposalId,
      tenantId,
      leadId,
      dealId: baseProposta.dealId,
      titulo: baseProposta.titulo,
      itens: baseProposta.itens,
      apresentacao: revisionPresentation,
      valorTotal: baseProposta.valorTotal,
      status: "rascunho",
      validadeAte: baseProposta.validadeAte,
      observacoes: baseProposta.observacoes,
      formaPagamento: baseProposta.formaPagamento,
      condPagamento: baseProposta.condPagamento,
      prazoEntrega: baseProposta.prazoEntrega,
      formaPagamentoMensalidade: baseProposta.formaPagamentoMensalidade,
      condPagamentoMensalidade: baseProposta.condPagamentoMensalidade,
      numero: revisionNumero,
      arquivoImportadoUrl: baseProposta.arquivoImportadoUrl,
      arquivoImportadoNome: baseProposta.arquivoImportadoNome,
      recorrente: baseProposta.recorrente,
      valorMensal: baseProposta.valorMensal,
      prazoContratoMeses: baseProposta.prazoContratoMeses,
      numParcelas: baseProposta.numParcelas,
      autoGenerated: false,
      publicToken: crypto.randomUUID().replace(/-/g, ""),
      acceptedAt: null,
      acceptedVia: null,
      acceptedBy: null,
      acceptanceMetadata: null,
      paymentCompositions: baseProposta.paymentCompositions,
    })
    .returning();

  const [created] = await db
    .insert(orcamentoRevisoesTable)
    .values({
      ...parsed.data,
      numeroOrcamento: revisionNumero,
      tenantId,
      leadId,
      basePropostaId: baseProposta.id,
      propostaRevisaoId: revisionProposal.id,
      revisaoNumero: revisionLabel,
      createdBy: req.user?.id,
    })
    .returning();

  return res.status(201).json({
    ...created,
    changeType: isContractAddendum ? "contract_addendum" : "commercial_revision",
    propostaRevisao: revisionProposal,
  });
});

// ─── Update a revision entry ────────────────────────────────────────────────
router.patch("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const parsed = updateOrcamentoRevisaoSchema
    .omit({ basePropostaId: true, propostaRevisaoId: true, revisaoNumero: true })
    .safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [updated] = await db
    .update(orcamentoRevisoesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(orcamentoRevisoesTable.id, String(req.params.id)),
        eq(orcamentoRevisoesTable.tenantId, tenantId),
        eq(orcamentoRevisoesTable.leadId, leadId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Revisão não encontrada." });
  return res.json(updated);
});

// ─── Delete a revision entry ────────────────────────────────────────────────
router.delete("/tenants/:tenantId/leads/:leadId/orcamento-revisoes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  if (!hasAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const [row] = await db
    .select()
    .from(orcamentoRevisoesTable)
    .where(
      and(
        eq(orcamentoRevisoesTable.id, String(req.params.id)),
        eq(orcamentoRevisoesTable.tenantId, tenantId),
        eq(orcamentoRevisoesTable.leadId, leadId),
      ),
    );
  if (!row) return res.status(404).json({ error: "Revisão não encontrada." });

  if (row.propostaRevisaoId) {
    const [revisionProposal] = await db
      .select({ status: propostasTable.status })
      .from(propostasTable)
      .where(and(
        eq(propostasTable.id, row.propostaRevisaoId),
        eq(propostasTable.tenantId, tenantId),
      ))
      .limit(1);

    if (revisionProposal && revisionProposal.status !== "rascunho") {
      return res.status(409).json({
        error: "Uma revisão já emitida não pode ser excluída. Preserve o histórico e crie uma nova revisão/aditivo.",
        code: "EMITTED_REVISION_IMMUTABLE",
      });
    }
  }

  await db.delete(orcamentoRevisoesTable).where(eq(orcamentoRevisoesTable.id, row.id));
  if (row.propostaRevisaoId) {
    await db
      .delete(propostasTable)
      .where(and(
        eq(propostasTable.id, row.propostaRevisaoId),
        eq(propostasTable.tenantId, tenantId),
      ));
  }
  return res.json({ success: true });
});

export default router;
