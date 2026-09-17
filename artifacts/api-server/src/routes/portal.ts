import { Router } from "express";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import {
  db,
  pool,
  obrasTable,
  tenantsTable,
  obraEtapasTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  obraDiarioTable,
  archProjetosTable,
  archCenasTable,
  archAiRendersTable,
  archRenderSolicitacoesTable,
  DEFAULT_OBRA_PORTAL_CONFIG,
  type ObraPortalConfig,
} from "@workspace/db";

const router = Router();

function portalConfig(raw: unknown): ObraPortalConfig {
  const value = raw && typeof raw === "object" ? raw as Partial<ObraPortalConfig> : {};
  return { ...DEFAULT_OBRA_PORTAL_CONFIG, ...value };
}

async function getArqdorPortalProject(token: string) {
  const [project] = await db.select().from(archProjetosTable)
    .where(and(eq(archProjetosTable.portalToken, token), eq(archProjetosTable.portalAtivo, true)))
    .limit(1);
  return project ?? null;
}

router.get("/portal/arqdor/:token/versions", async (req, res) => {
  const token = String(req.params.token ?? "");
  const project = await getArqdorPortalProject(token);
  if (!project) return res.status(404).json({ error: "Portal não encontrado ou inativo." });

  const versions = await db.select({
    id: archAiRendersTable.id,
    parentRenderId: archAiRendersTable.parentRenderId,
    ambiente: archAiRendersTable.ambiente,
    operationType: archAiRendersTable.operationType,
    materialId: archAiRendersTable.materialId,
    materialName: archAiRendersTable.materialName,
    resultImageUrl: archAiRendersTable.resultImageUrl,
    originalImageUrl: archAiRendersTable.originalImageUrl,
    versionTag: archAiRendersTable.versionTag,
    status: archAiRendersTable.status,
    approvedAt: archAiRendersTable.approvedAt,
    approvalNote: archAiRendersTable.approvalNote,
    createdAt: archAiRendersTable.createdAt,
    concluidoEm: archAiRendersTable.concluidoEm,
  }).from(archAiRendersTable).where(and(
    eq(archAiRendersTable.tenantId, project.tenantId),
    eq(archAiRendersTable.projectId, project.id),
    eq(archAiRendersTable.status, "concluido"),
  )).orderBy(asc(archAiRendersTable.createdAt));

  const numbered = versions.map((version, index) => ({ ...version, versionNumber: index + 1 }));
  const byEnvironment = numbered.reduce<Record<string, typeof numbered>>((acc, version) => {
    const key = version.ambiente || "sem_ambiente";
    (acc[key] ??= []).push(version);
    return acc;
  }, {});

  return res.json({ project: { id: project.id, title: project.titulo, clientName: project.clienteNome }, versions: numbered, byEnvironment });
});

router.post("/portal/arqdor/:token/revisions", async (req, res) => {
  const token = String(req.params.token ?? "");
  const project = await getArqdorPortalProject(token);
  if (!project) return res.status(404).json({ error: "Portal não encontrado ou inativo." });

  const cenaId = String(req.body?.cenaId ?? "").trim();
  const sourceAiRenderId = String(req.body?.sourceAiRenderId ?? "").trim();
  const observacoes = typeof req.body?.observacoes === "string" ? req.body.observacoes.trim() : "";
  const clienteNome = typeof req.body?.clienteNome === "string" && req.body.clienteNome.trim()
    ? req.body.clienteNome.trim()
    : project.clienteNome ?? null;

  if (!cenaId || !sourceAiRenderId) return res.status(400).json({ error: "cenaId e sourceAiRenderId são obrigatórios." });
  if (!observacoes && !Array.isArray(req.body?.itensAdicionados) && !Array.isArray(req.body?.texturasAlteradas)) {
    return res.status(400).json({ error: "Descreva a revisão solicitada." });
  }

  const [scene] = await db.select({ id: archCenasTable.id, projetoId: archCenasTable.projetoId })
    .from(archCenasTable)
    .where(and(eq(archCenasTable.id, cenaId), eq(archCenasTable.projetoId, project.id)))
    .limit(1);
  if (!scene) return res.status(404).json({ error: "Cena não pertence a este projeto." });

  const [sourceVersion] = await db.select({ id: archAiRendersTable.id, status: archAiRendersTable.status })
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, sourceAiRenderId),
      eq(archAiRendersTable.tenantId, project.tenantId),
      eq(archAiRendersTable.projectId, project.id),
    )).limit(1);
  if (!sourceVersion) return res.status(404).json({ error: "Versão do render não pertence a este projeto." });
  if (sourceVersion.status !== "concluido") return res.status(409).json({ error: "Somente versões concluídas podem receber pedido de revisão." });

  const [revision] = await db.insert(archRenderSolicitacoesTable).values({
    cenaId,
    clienteNome,
    status: "pendente",
    sourceAiRenderId,
    itensAdicionados: Array.isArray(req.body?.itensAdicionados) ? req.body.itensAdicionados : [],
    texturasAlteradas: Array.isArray(req.body?.texturasAlteradas) ? req.body.texturasAlteradas : [],
    observacoes: observacoes || null,
  } as any).returning();

  return res.status(201).json({ revision, projectId: project.id, sourceAiRenderId, nextAction: "revisao_pendente" });
});

router.get("/portal/obra/:token", async (req, res) => {
  const { token } = req.params;
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });

  const config = portalConfig(obra.portalConfig);
  const [tenant] = await db.select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable).where(eq(tenantsTable.id, obra.tenantId));

  const etapas = config.showSchedule
    ? await db.select().from(obraEtapasTable).where(eq(obraEtapasTable.obraId, obra.id)).orderBy(asc(obraEtapasTable.ordem))
    : [];

  let orcamentoComEtapas: any = null;
  if (config.showBudget) {
    const orcamentos = await db.select().from(obraOrcamentosTable)
      .where(and(eq(obraOrcamentosTable.obraId, obra.id), eq(obraOrcamentosTable.tenantId, obra.tenantId)))
      .orderBy(desc(obraOrcamentosTable.versao));
    const orcamento = orcamentos.find((o) => o.status === "aprovado") ?? orcamentos.find((o) => o.status === "enviado") ?? null;
    if (orcamento) {
      const orcEtapas = await db.select().from(obraOrcamentoEtapasTable)
        .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamento.id)).orderBy(asc(obraOrcamentoEtapasTable.ordem));
      const etapaIds = orcEtapas.map((e) => e.id);
      const allItens = etapaIds.length > 0
        ? await db.select().from(obraOrcamentoItensTable).where(inArray(obraOrcamentoItensTable.etapaId, etapaIds)).orderBy(asc(obraOrcamentoItensTable.ordem))
        : [];
      const byEtapa: Record<string, typeof allItens> = {};
      for (const item of allItens) (byEtapa[item.etapaId] ??= []).push(item);
      orcamentoComEtapas = { ...orcamento, etapas: orcEtapas.map((e) => ({ ...e, itens: byEtapa[e.id] ?? [] })) };
    }
  }

  let diario: any[] = [];
  if (config.showDiary) {
    diario = await db.select().from(obraDiarioTable)
      .where(and(eq(obraDiarioTable.obraId, obra.id), eq(obraDiarioTable.status, "aprovado")))
      .orderBy(desc(obraDiarioTable.data)).limit(12);
    if (!config.showDiaryPhotos) diario = diario.map((entry) => ({ ...entry, fotos: [], videos: [], anexos: [] }));
  }

  const ocorrencias = config.showDiary
    ? diario.filter((entry) => Boolean(entry.observacoes)).slice(0, 10).map((entry) => ({
        id: entry.id,
        data: entry.data,
        observacoes: entry.observacoes,
        status: entry.status,
        responsavelNome: entry.responsavelNome,
      }))
    : [];

  let decisions: any[] = [];
  if (config.showClientDecisions) {
    const result = await pool.query(
      `SELECT id, title, description, category, priority, due_date, options, financial_impact, schedule_impact_days
         FROM arch_project_decisions
        WHERE obra_id = $1
          AND tenant_id::text = $2
          AND decision_type = 'client'
          AND status = 'pending'
        ORDER BY
          CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          due_date ASC NULLS LAST,
          created_at DESC
        LIMIT 30`,
      [obra.id, obra.tenantId],
    );
    decisions = result.rows;
  }

  return res.json({
    publication: config,
    obra: {
      id: obra.id,
      nome: obra.nome,
      descricao: config.showOverview ? obra.descricao : null,
      clienteNome: obra.clienteNome,
      endereco: config.showOverview ? obra.endereco : null,
      status: obra.status,
      dataInicio: config.showOverview ? obra.dataInicio : null,
      dataFimPrevista: config.showOverview ? obra.dataFimPrevista : null,
      dataFimReal: config.showOverview ? obra.dataFimReal : null,
      orcamentoTotal: config.showFinancialSummary ? obra.orcamentoTotal : null,
      custoRealizado: config.showFinancialSummary ? obra.custoRealizado : null,
    },
    tenant: tenant ?? { id: obra.tenantId, name: "Construtora" },
    orcamento: orcamentoComEtapas,
    etapas,
    diario,
    ocorrencias,
    decisions,
  });
});

router.post("/portal/obra/:token/aprovar-orcamento", async (req, res) => {
  const { token } = req.params;
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const config = portalConfig(obra.portalConfig);
  if (!config.showBudget) return res.status(403).json({ error: "Orçamento não está publicado neste portal." });

  const [orcamento] = await db.select().from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.obraId, obra.id), eq(obraOrcamentosTable.status, "enviado")));
  if (!orcamento) return res.status(404).json({ error: "Nenhum orçamento aguardando aprovação." });

  const [updated] = await db.update(obraOrcamentosTable)
    .set({ status: "aprovado", updatedAt: new Date() })
    .where(eq(obraOrcamentosTable.id, orcamento.id)).returning();
  return res.json({ ok: true, orcamento: updated });
});

export default router;
