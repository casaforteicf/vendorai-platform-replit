import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, leadsTable, scoutRegrasTable, scoutOportunidadesTable } from "@workspace/db";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";

const router: IRouter = Router();

function requireInternalKey(req: any, res: any, next: any) {
  const configured = process.env["PRACA_AI_INTERNAL_KEY"];
  if (!configured) {
    return res.status(503).json({ error: "PRACA_AI_INTERNAL_KEY não configurada" });
  }
  if (req.header("x-internal-key") !== configured) {
    return res.status(401).json({ error: "Chave interna inválida" });
  }
  next();
}

/**
 * Alinha os dois motores de Scout: o Praça.ai (lado comprador) chama
 * isso quando gera uma oportunidade pra um consumidor que tem lead
 * vinculado num tenant.
 */
router.post("/internal/scout/consumer-signal", requireInternalKey, async (req, res) => {
  const { leadId, tenantId, tipo, descricao, canal, scoreOportunidade } = req.body as {
    leadId?: string;
    tenantId?: string;
    tipo?: string;
    descricao?: string;
    canal?: string;
    scoreOportunidade?: number;
  };

  if (!leadId || !tenantId || !descricao) {
    return res.status(422).json({ error: "leadId, tenantId e descricao sao obrigatorios" });
  }

  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));
  if (!lead) {
    return res.json({ ok: false, reason: "lead not found for tenant" });
  }

  const nomeRegra = "Sinal do Praca.ai";
  let [regra] = await db.select().from(scoutRegrasTable).where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.nome, nomeRegra)));
  if (!regra) {
    const [criada] = await db.insert(scoutRegrasTable).values({
      tenantId,
      nome: nomeRegra,
      tipo: "sinal_praca_ai",
      condicoes: { origem: "praca_ai" },
      acao: { canal: "human_approval", automaticContact: false },
      ativo: true,
    }).returning();
    regra = criada!;
  }

  await db.insert(scoutOportunidadesTable).values({
    tenantId,
    clienteId: leadId,
    regraId: regra.id,
    tipo: "sinal_praca_ai",
    descricao: `[Praca.ai] ${descricao}`,
    status: "pendente",
    scoreOportunidade: String(scoreOportunidade ?? 50),
  } as any);

  captureLeadFeatureSnapshot(tenantId, leadId, "sinal_praca_ai", { tipoOriginal: tipo, canal }, req.log).catch(() => {});

  return res.json({ ok: true });
});

export default router;
