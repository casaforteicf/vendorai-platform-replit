import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, propostasTable } from "@workspace/db";
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

  if (!proposta) {
    res.status(404).json({ error: "Proposta não encontrada" });
    return;
  }

  res.json(proposta);
});

// ── POST /public/proposals/:token/accept — public accept (no auth) ─────────────
router.post("/public/proposals/:token/accept", async (req, res) => {
  const token = String(req.params.token);

  const parsed = acceptPublicBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [proposta] = await db
    .select({ id: propostasTable.id, status: propostasTable.status, validadeAte: propostasTable.validadeAte })
    .from(propostasTable)
    .where(eq(propostasTable.publicToken, token))
    .limit(1);

  if (!proposta) {
    res.status(400).json({ error: "Proposta não encontrada ou link inválido" });
    return;
  }

  if (proposta.status !== "enviada" && proposta.status !== "pendente" && proposta.status !== "aceita") {
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
