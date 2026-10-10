import { Router, type IRouter } from "express";
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
