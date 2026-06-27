import { Router } from "express";
import { and, eq, desc, asc, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  obrasTable,
  tenantsTable,
  obraEtapasTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  obraDiarioTable,
} from "@workspace/db";

const router = Router();

// GET /api/portal/obra/:token — public, no auth required
router.get("/portal/obra/:token", async (req, res) => {
  const { token } = req.params;

  const [obra] = await db
    .select()
    .from(obrasTable)
    .where(eq(obrasTable.portalToken, token));

  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });

  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, obra.tenantId));

  // Cronograma etapas
  const etapas = await db
    .select()
    .from(obraEtapasTable)
    .where(eq(obraEtapasTable.obraId, obra.id))
    .orderBy(asc(obraEtapasTable.ordem));

  // Latest orcamento — prefer 'aprovado', then 'enviado'
  const orcamentos = await db
    .select()
    .from(obraOrcamentosTable)
    .where(
      and(
        eq(obraOrcamentosTable.obraId, obra.id),
        eq(obraOrcamentosTable.tenantId, obra.tenantId),
      ),
    )
    .orderBy(desc(obraOrcamentosTable.versao));

  const orcamento =
    orcamentos.find((o) => o.status === "aprovado") ??
    orcamentos.find((o) => o.status === "enviado") ??
    null;

  let orcamentoComEtapas = null;
  if (orcamento) {
    const orcEtapas = await db
      .select()
      .from(obraOrcamentoEtapasTable)
      .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamento.id))
      .orderBy(asc(obraOrcamentoEtapasTable.ordem));

    const etapaIds = orcEtapas.map((e) => e.id);
    const allItens =
      etapaIds.length > 0
        ? await db
            .select()
            .from(obraOrcamentoItensTable)
            .where(inArray(obraOrcamentoItensTable.etapaId, etapaIds))
            .orderBy(asc(obraOrcamentoItensTable.ordem))
        : [];

    const byEtapa: Record<string, typeof allItens> = {};
    for (const item of allItens) {
      if (!byEtapa[item.etapaId]) byEtapa[item.etapaId] = [];
      byEtapa[item.etapaId]!.push(item);
    }

    orcamentoComEtapas = {
      ...orcamento,
      etapas: orcEtapas.map((e) => ({ ...e, itens: byEtapa[e.id] ?? [] })),
    };
  }

  // Last 5 diario entries ordered by date desc
  const diario = await db
    .select()
    .from(obraDiarioTable)
    .where(eq(obraDiarioTable.obraId, obra.id))
    .orderBy(desc(obraDiarioTable.data))
    .limit(5);

  // Ocorrências: non-approved entries with observacoes filled
  const ocorrencias = await db
    .select()
    .from(obraDiarioTable)
    .where(
      and(
        eq(obraDiarioTable.obraId, obra.id),
        isNotNull(obraDiarioTable.observacoes),
      ),
    )
    .orderBy(desc(obraDiarioTable.data))
    .limit(10)
    .then((rows) => rows.filter((r) => r.status !== "aprovado"));

  return res.json({
    obra: {
      id: obra.id,
      nome: obra.nome,
      descricao: obra.descricao,
      clienteNome: obra.clienteNome,
      endereco: obra.endereco,
      status: obra.status,
      dataInicio: obra.dataInicio,
      dataFimPrevista: obra.dataFimPrevista,
      dataFimReal: obra.dataFimReal,
      orcamentoTotal: obra.orcamentoTotal,
      custoRealizado: obra.custoRealizado,
    },
    tenant: tenant ?? { id: obra.tenantId, name: "Construtora" },
    orcamento: orcamentoComEtapas,
    etapas,
    diario,
    ocorrencias,
  });
});

// POST /api/portal/obra/:token/aprovar-orcamento — client approves the budget
router.post("/portal/obra/:token/aprovar-orcamento", async (req, res) => {
  const { token } = req.params;

  const [obra] = await db
    .select()
    .from(obrasTable)
    .where(eq(obrasTable.portalToken, token));

  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });

  const [orcamento] = await db
    .select()
    .from(obraOrcamentosTable)
    .where(
      and(
        eq(obraOrcamentosTable.obraId, obra.id),
        eq(obraOrcamentosTable.status, "enviado"),
      ),
    );

  if (!orcamento)
    return res.status(404).json({ error: "Nenhum orçamento aguardando aprovação." });

  const [updated] = await db
    .update(obraOrcamentosTable)
    .set({ status: "aprovado", updatedAt: new Date() })
    .where(eq(obraOrcamentosTable.id, orcamento.id))
    .returning();

  return res.json({ ok: true, orcamento: updated });
});

export default router;
