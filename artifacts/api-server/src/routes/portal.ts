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

  const etapas = await db.select().from(obraEtapasTable)
    .where(eq(obraEtapasTable.obraId, obra.id))
    .orderBy(asc(obraEtapasTable.ordem));

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
  if (config.showDiary || config.showDocuments || config.showDiaryPhotos) {
    diario = await db.select().from(obraDiarioTable)
      .where(and(eq(obraDiarioTable.obraId, obra.id), eq(obraDiarioTable.status, "aprovado")))
      .orderBy(desc(obraDiarioTable.data)).limit(12);
    if (!config.showDiaryPhotos) diario = diario.map((entry) => ({
      ...entry,
      fotos: [],
      videos: [],
      anexos: config.showDocuments ? entry.anexos : [],
    }));
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

  const etapaRows = etapas as any[];
  const weightedBase = etapaRows.reduce((sum, item) => sum + Number(item.pesoFisico ?? item.peso_fisico ?? 0), 0);
  const progressoGeral = etapaRows.length
    ? weightedBase > 0
      ? etapaRows.reduce((sum, item) => sum + Number(item.percentualExecutado ?? item.percentual_executado ?? 0) * Number(item.pesoFisico ?? item.peso_fisico ?? 0), 0) / weightedBase
      : etapaRows.reduce((sum, item) => sum + Number(item.percentualExecutado ?? item.percentual_executado ?? 0), 0) / etapaRows.length
    : 0;

  const etapaAtual = config.showOverview && etapaRows.length
    ? etapaRows
        .filter((item) => Number(item.percentualExecutado ?? item.percentual_executado ?? 0) > 0 && Number(item.percentualExecutado ?? item.percentual_executado ?? 0) < 100)
        .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))[0] ?? null
    : null;

  const proximasEtapas = config.showOverview
    ? etapaRows
        .filter((item) => Number(item.percentualExecutado ?? item.percentual_executado ?? 0) <= 0)
        .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))
        .slice(0, 4)
    : [];

  const marcos = config.showMilestones
    ? etapaRows.filter((item) => Boolean(item.marco)).map((item) => ({
        id: item.id,
        nome: item.nome,
        status: item.status,
        percentualExecutado: item.percentualExecutado ?? item.percentual_executado,
        dataInicioPrevista: item.dataInicioPrevista ?? item.data_inicio_prevista,
        dataFimPrevista: item.dataFimPrevista ?? item.data_fim_prevista,
        dataFimReal: item.dataFimReal ?? item.data_fim_real,
      }))
    : [];

  let medicoes: any[] = [];
  if (config.showMeasurements && config.showSchedule) {
    const result = await pool.query(
      `SELECT m.id, m.etapa_id, e.nome AS etapa_nome, m.data,
              m.percentual_anterior, m.percentual_novo, m.observacao, m.created_at
         FROM obra_etapa_medicoes m
         INNER JOIN obra_etapas e ON e.id = m.etapa_id
        WHERE e.obra_id = $1
        ORDER BY m.data DESC, m.created_at DESC
        LIMIT 80`,
      [obra.id],
    );
    medicoes = result.rows;
  }

  let documentos: any[] = config.showDocuments
    ? diario.flatMap((entry: any) => {
        const anexos = Array.isArray(entry.anexos) ? entry.anexos : [];
        return anexos.map((anexo: any, index: number) => ({
          id: `${entry.id}-${index}`,
          diarioId: entry.id,
          data: entry.data,
          nome: anexo.name ?? anexo.caption ?? `Documento ${index + 1}`,
          url: anexo.url,
          mimeType: anexo.mimeType ?? null,
          tipo: "diario",
        }));
      })
    : [];

  let compras: any[] = [];
  if (config.showProcurementSummary) {
    const result = await pool.query(
      `SELECT c.id, c.descricao, c.fornecedor, c.status, c.prioridade,
              c.data_prevista, c.data_efetuada, c.data_necessidade,
              c.prazo_fornecedor_dias,
              CASE WHEN $3::boolean THEN c.valor_total ELSE NULL END AS valor_total,
              e.nome AS etapa_nome
         FROM compras_obras c
         LEFT JOIN obra_etapas e ON e.id = c.etapa_id AND e.obra_id = c.obra_id
        WHERE c.obra_id = $1 AND c.tenant_id = $2
        ORDER BY
          CASE c.status WHEN 'recebido' THEN 2 WHEN 'cancelado' THEN 3 ELSE 0 END,
          COALESCE(c.data_necessidade, e.data_inicio_prevista) ASC NULLS LAST,
          c.created_at DESC
        LIMIT 60`,
      [obra.id, obra.tenantId, config.showFinancialSummary],
    );
    compras = result.rows;
  }

  const comprasRecebidas = config.showFinancialSummary
    ? await pool.query(
        `SELECT COALESCE(SUM(valor_total),0)::numeric AS total
           FROM compras_obras
          WHERE obra_id = $1 AND tenant_id = $2
            AND lower(status) IN ('recebido','parcial')`,
        [obra.id, obra.tenantId],
      )
    : null;

  const maoObraExecutada = config.showFinancialSummary
    ? etapaRows.reduce((sum: number, item: any) => {
        const percentual = Math.max(0, Math.min(100, Number(item.percentualExecutado ?? item.percentual_executado ?? 0))) / 100;
        if (percentual <= 0) return sum;
        const inicio = item.dataInicioPrevista ?? item.data_inicio_prevista;
        const fim = item.dataFimPrevista ?? item.data_fim_prevista;
        if (!inicio || !fim) return sum;
        const start = new Date(`${inicio}T12:00:00Z`);
        const end = new Date(`${fim}T12:00:00Z`);
        const dias = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
        const planejado = dias
          * Math.max(1, Number(item.equipeQuantidade ?? item.equipe_quantidade ?? 1))
          * Math.max(0, Number(item.horasDia ?? item.horas_dia ?? 8))
          * Math.max(0, Number(item.custoHoraPessoa ?? item.custo_hora_pessoa ?? 0));
        return sum + planejado * percentual;
      }, 0)
    : 0;

  const custoRealizadoCalculado = config.showFinancialSummary
    ? Number(comprasRecebidas?.rows?.[0]?.total ?? 0) + maoObraExecutada
    : Number(obra.custoRealizado ?? 0);

  let financeiro: any = null;
  if (config.showFinancialSummary) {
    const result = config.showFinancialDetails
      ? await pool.query(
          `SELECT id, tipo, fornecedor, numero, valor, data_emissao, data_vencimento,
                  descricao, status, documento_url, observacoes
             FROM obra_lancamentos
            WHERE obra_id = $1 AND tenant_id = $2
            ORDER BY COALESCE(data_vencimento, data_emissao) DESC NULLS LAST, created_at DESC
            LIMIT 100`,
          [obra.id, obra.tenantId],
        )
      : { rows: [] as any[] };

    const lancamentos = result.rows;
    const totalLancado = lancamentos.reduce((sum: number, item: any) => sum + Number(item.valor ?? 0), 0);
    const totalPago = lancamentos
      .filter((item: any) => ["pago", "recebido", "quitado"].includes(String(item.status ?? "").toLowerCase()))
      .reduce((sum: number, item: any) => sum + Number(item.valor ?? 0), 0);
    const totalPendente = lancamentos
      .filter((item: any) => !["pago", "recebido", "quitado", "cancelado"].includes(String(item.status ?? "").toLowerCase()))
      .reduce((sum: number, item: any) => sum + Number(item.valor ?? 0), 0);

    if (config.showDocuments && config.showFinancialDetails) {
      const financialDocs = result.rows
        .filter((item: any) => Boolean(item.documento_url))
        .map((item: any) => ({
          id: `financeiro-${item.id}`,
          nome: item.descricao ?? item.numero ?? item.tipo ?? "Documento financeiro",
          url: item.documento_url,
          mimeType: null,
          data: item.data_emissao ?? item.data_vencimento ?? null,
          tipo: "financeiro",
        }));
      documentos = [...documentos, ...financialDocs];
    }

    financeiro = {
      orcamentoTotal: Number(obra.orcamentoTotal ?? 0),
      custoRealizado: custoRealizadoCalculado,
      percentualConsumido: Number(obra.orcamentoTotal ?? 0) > 0
        ? custoRealizadoCalculado / Number(obra.orcamentoTotal ?? 0) * 100
        : 0,
      totalLancado: config.showFinancialDetails ? totalLancado : null,
      totalPago: config.showFinancialDetails ? totalPago : null,
      totalPendente: config.showFinancialDetails ? totalPendente : null,
      lancamentos: config.showFinancialDetails ? lancamentos : [],
    };
  }

  let galeriaProjeto: any[] = [];
  if (config.showProjectGallery) {
    const projectResult = await pool.query(
      `SELECT id, titulo
         FROM arch_projetos
        WHERE obra_id = $1 AND tenant_id = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [obra.id, obra.tenantId],
    );
    const project = projectResult.rows[0];
    if (project) {
      const renders = await pool.query(
        `SELECT id, ambiente, material_name, result_image_url, version_tag,
                status, approved_at, approval_note, created_at
           FROM arch_ai_renders
          WHERE project_id = $1
            AND tenant_id = $2
            AND status = 'concluido'
            AND approved_at IS NOT NULL
            AND result_image_url IS NOT NULL
          ORDER BY
            CASE WHEN approved_at IS NOT NULL THEN 0 ELSE 1 END,
            created_at DESC
          LIMIT 40`,
        [project.id, obra.tenantId],
      );
      galeriaProjeto = renders.rows;
    }
  }

  const fotosRecentes = config.showDiaryPhotos
    ? diario.flatMap((entry: any) => {
        const fotos = Array.isArray(entry.fotos) ? entry.fotos : [];
        return fotos.map((foto: any, index: number) => ({
          id: `${entry.id}-foto-${index}`,
          diarioId: entry.id,
          data: entry.data,
          url: foto.url,
          caption: foto.caption ?? null,
        }));
      }).slice(0, 30)
    : [];

  const previsaoEntrega = config.showOverview
    ? (
        obra.dataFimPrevista
        ?? etapaRows.map((item) => item.dataFimPrevista ?? item.data_fim_prevista).filter(Boolean).sort().at(-1)
        ?? null
      )
    : null;

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
      custoRealizado: config.showFinancialSummary ? String(custoRealizadoCalculado) : null,
    },
    tenant: tenant ?? { id: obra.tenantId, name: "Construtora" },
    orcamento: orcamentoComEtapas,
    etapas: config.showSchedule ? etapas : [],
    diario: config.showDiary ? diario : [],
    ocorrencias,
    decisions,
    resumo: config.showOverview ? {
      progressoGeral,
      etapaAtual,
      proximasEtapas,
      previsaoEntrega,
      etapasConcluidas: etapaRows.filter((item) => Number(item.percentualExecutado ?? item.percentual_executado ?? 0) >= 100).length,
      totalEtapas: etapaRows.length,
      decisoesPendentes: decisions.length,
      ocorrenciasAbertas: ocorrencias.length,
    } : null,
    marcos,
    medicoes,
    documentos,
    compras,
    financeiro,
    galeriaProjeto,
    fotosRecentes,
  });
});

router.post("/portal/obra/:token/decisions/:decisionId/respond", async (req, res) => {
  const token = String(req.params.token ?? "");
  const decisionId = String(req.params.decisionId ?? "");
  const action = String(req.body?.action ?? "");
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 15000) : "";
  const selectedOption = typeof req.body?.selectedOption === "string" ? req.body.selectedOption.trim().slice(0, 1000) : "";

  if (!decisionId) return res.status(400).json({ error: "decisionId é obrigatório." });
  if (!['approve', 'reject'].includes(action)) return res.status(422).json({ error: "Ação inválida." });
  if (action === 'reject' && !comment) return res.status(422).json({ error: "Informe o motivo da rejeição." });

  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const config = portalConfig(obra.portalConfig);
  if (!config.showClientDecisions) return res.status(403).json({ error: "Decisões do cliente não estão publicadas neste portal." });

  const current = await pool.query(
    `SELECT id, status, decision_type, options
       FROM arch_project_decisions
      WHERE id = $1::uuid
        AND obra_id = $2
        AND tenant_id::text = $3
      LIMIT 1`,
    [decisionId, obra.id, obra.tenantId],
  );
  const decision = current.rows[0];
  if (!decision) return res.status(404).json({ error: "Decisão não encontrada neste portal." });
  if (decision.decision_type !== 'client') return res.status(403).json({ error: "Esta decisão não está disponível para o cliente." });
  if (decision.status !== 'pending') return res.status(409).json({ error: "Esta decisão já foi respondida." });

  const options = Array.isArray(decision.options) ? decision.options : [];
  if (selectedOption && options.length > 0 && !options.includes(selectedOption)) {
    return res.status(422).json({ error: "Opção selecionada não pertence a esta decisão." });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const result = await pool.query(
    `UPDATE arch_project_decisions
        SET status = $1,
            selected_option = $2::jsonb,
            decision_comment = $3,
            decided_by_name = $4,
            decided_at = now(),
            updated_at = now()
      WHERE id = $5::uuid
        AND obra_id = $6
        AND tenant_id::text = $7
        AND decision_type = 'client'
        AND status = 'pending'
      RETURNING id, status, selected_option, decision_comment, decided_at`,
    [status, selectedOption ? JSON.stringify(selectedOption) : null, comment || null, obra.clienteNome ?? 'Cliente', decisionId, obra.id, obra.tenantId],
  );
  if (!result.rows[0]) return res.status(409).json({ error: "A decisão foi alterada antes desta resposta. Atualize o portal." });

  return res.json({ ok: true, decision: result.rows[0] });
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
