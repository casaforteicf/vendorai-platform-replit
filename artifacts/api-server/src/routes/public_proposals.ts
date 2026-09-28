import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, propostasTable, leadProposalsTable } from "@workspace/db";
import { proposalAccepted } from "../lib/proposal-accepted.js";

const router: IRouter = Router();

const acceptPublicBodySchema = z.object({
  nome: z.string().min(1).optional(),
  documento: z.string().optional(),
});

// ── GET /public/proposals/:token — fetch summary for the accept page ───────────
router.get("/public/proposals/:token", async (req, res) => {
  const token = String(req.params.token);
  const [proposta] = await db
    .select({
      id: propostasTable.id,
      titulo: propostasTable.titulo,
      itens: propostasTable.itens,
      valorTotal: propostasTable.valorTotal,
      status: propostasTable.status,
      validadeAte: propostasTable.validadeAte,
      numero: propostasTable.numero,
      observacoes: propostasTable.observacoes,
      condPagamento: propostasTable.condPagamento,
    })
    .from(propostasTable)
    .where(eq(propostasTable.publicToken, token))
    .limit(1);

  if (proposta) {
    res.json({ kind: "budget", ...proposta });
    return;
  }

  // Proposal Builder versions (v1, v2, v3...) live in lead_proposals rather
  // than propostas. Their row id is already an opaque UUID, so it is a stable,
  // unique public token for exactly one generated proposal version.
  const [generatedProposal] = await db
    .select({
      id: leadProposalsTable.id,
      version: leadProposalsTable.version,
      status: leadProposalsTable.status,
      createdAt: leadProposalsTable.createdAt,
    })
    .from(leadProposalsTable)
    .where(eq(leadProposalsTable.id, token))
    .limit(1);

  if (!generatedProposal) {
    res.status(404).json({ error: "Proposta não encontrada" });
    return;
  }

  res.json({
    kind: "generated",
    id: generatedProposal.id,
    version: generatedProposal.version,
    status: generatedProposal.status,
    createdAt: generatedProposal.createdAt,
  });
});

// ── GET /public/generated-proposals/:id/html — stream exact proposal HTML ────
// Keep the large proposal document out of JSON. Some generated HTML contains
// characters/embedded data that should be delivered as text/html, not parsed as
// a JSON property by the browser.
router.get("/public/generated-proposals/:id/html", async (req, res) => {
  const id = String(req.params.id);
  const [proposal] = await db
    .select({
      id: leadProposalsTable.id,
      htmlContent: leadProposalsTable.htmlContent,
    })
    .from(leadProposalsTable)
    .where(eq(leadProposalsTable.id, id))
    .limit(1);

  if (!proposal) {
    res.status(404).type("text/plain; charset=utf-8").send("Proposta não encontrada");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(proposal.htmlContent);
});

// ── POST /public/proposals/:token/accept — public accept (no auth) ─────────────
router.post("/public/proposals/:token/accept", async (req, res) => {
  const token = String(req.params.token);

  const parsed = acceptPublicBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  let [proposta] = await db
    .select({ id: propostasTable.id, status: propostasTable.status, validadeAte: propostasTable.validadeAte })
    .from(propostasTable)
    .where(eq(propostasTable.publicToken, token))
    .limit(1);

  // Generated proposal versions use lead_proposals.id as their exclusive public
  // link token. Resolve the source orçamento saved in jsonContent so the
  // interactive microsite can use the same acceptance pipeline as the budget.
  if (!proposta) {
    const [generated] = await db
      .select({ jsonContent: leadProposalsTable.jsonContent })
      .from(leadProposalsTable)
      .where(eq(leadProposalsTable.id, token))
      .limit(1);

    if (generated?.jsonContent) {
      try {
        const parsed = JSON.parse(generated.jsonContent) as {
          _proposalMeta?: { sourcePropostaId?: string | null };
        };
        const sourcePropostaId = parsed?._proposalMeta?.sourcePropostaId;
        if (sourcePropostaId) {
          [proposta] = await db
            .select({ id: propostasTable.id, status: propostasTable.status, validadeAte: propostasTable.validadeAte })
            .from(propostasTable)
            .where(eq(propostasTable.id, sourcePropostaId))
            .limit(1);
        }
      } catch {
        // Invalid legacy jsonContent simply means this old generated proposal
        // cannot resolve to a source budget for acceptance.
      }
    }
  }

  if (!proposta) {
    res.status(400).json({ error: "Proposta não encontrada ou link inválido" });
    return;
  }

  if (proposta.status !== "enviada" && proposta.status !== "pendente" && proposta.status !== "aceita" && proposta.status !== "rascunho") {
    res.status(400).json({ error: `Esta proposta não pode mais ser aceita (status: ${proposta.status})` });
    return;
  }

  if (proposta.validadeAte && new Date(proposta.validadeAte) < new Date()) {
    res.status(400).json({ error: "Esta proposta expirou e não pode mais ser aceita" });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string) ?? req.ip ?? undefined;

  const result = await proposalAccepted(proposta.id, "link", {
    ip,
    nome: parsed.data.nome,
    documento: parsed.data.documento,
  });

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(409).json({ error: "Esta proposta já foi aceita anteriormente" });
    return;
  }

  res.status(200).json({ message: "Proposta aceita com sucesso", propostaId: result.propostaId });
});

export default router;
