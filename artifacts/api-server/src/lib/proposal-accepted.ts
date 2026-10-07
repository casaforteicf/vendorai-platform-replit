import { and, eq } from "drizzle-orm";
import {
  db,
  propostasTable,
  dealsTable,
  leadsTable,
  tenantsTable,
  activitiesTable,
  inventoryItemsTable,
  inventoryMovementsTable,
  produtosCatalogoTable,
  agentTasksTable,
  notificationsTable,
  usersTable,
  erpTitulosTable,
  archProjetosTable,
  obrasTable,
  obraEtapasTable,
  obraEtapaDependenciasTable,
  obraEtapaFasesTable,
  obraEtapaFaseDependenciasTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { analyzeLeadIntelligence } from "./analyze-intelligence.js";
import { logger } from "./logger.js";
import { checkCatalogMatch } from "./catalog-price-check.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { triggerOnboardingHandoff } from "./agent-engine.js";
import { createEntregasFromProposta } from "./entregas.js";
import { reconcileScoutOnDealWon } from "../services/revenueScout.js";
import { exportLeadToCRM } from "./crm-export.js";
import { syncDealValueFromProposal } from "./deal-value.js";

export type ProposalAcceptanceChannel = "link" | "whatsapp" | "manual";

export interface ProposalAcceptanceResult {
  ok: true;
  alreadyProcessed: boolean;
  propostaId: string;
  dealId: string | null;
  channel: ProposalAcceptanceChannel;
  closureTriggeredAt: Date | null;
  chargeCreated: boolean;
  inventoryDeducted: boolean;
  activityCreated: boolean;
  webhookDispatched: boolean;
  /** true when the closure was blocked pending manual approval (valor ≠ catálogo) */
  pendingApproval?: boolean;
  /** true when the closure was paused pending manual stock confirmation */
  pendingStockConfirmation?: boolean;
  agentTaskId?: string;
  divergence?: { valorProposta: number; valorCatalogo: number; diferenca: number };
  /** Obra provisionada a partir da linha de base contratada, quando aplicável. */
  obraId?: string;
  /** Link do portal do cliente para acompanhamento da obra. */
  portalClienteUrl?: string;
  /** Indica que esta aceitação criou uma nova versão da linha de base. */
  baselineCreated?: boolean;
}

export interface ProposalAcceptanceError {
  ok: false;
  error: string;
  propostaId: string;
}

export interface ProposalAcceptedOptions {
  /**
   * Skips the catalog-price divergence check. Used when re-running the
   * closure after an "aprovacao_fechamento" agent_task has been approved —
   * the check already ran once and a human already signed off on it.
   */
  skipApprovalCheck?: boolean;
  /**
   * Skips the stock-confirmation gate. Used when re-running the closure
   * after a "conferencia_estoque" agent_task has been approved — the check
   * already ran once and the designated user already confirmed availability.
   */
  skipStockCheck?: boolean;
}

async function syncAcceptedProposalToArqdor(proposta: typeof propostasTable.$inferSelect) {
  try {
    let [project] = await db
      .select()
      .from(archProjetosTable)
      .where(and(
        eq(archProjetosTable.tenantId, proposta.tenantId),
        eq(archProjetosTable.propostaId, proposta.id),
      ))
      .limit(1);

    if (!project && proposta.dealId) {
      [project] = await db
        .select()
        .from(archProjetosTable)
        .where(and(
          eq(archProjetosTable.tenantId, proposta.tenantId),
          eq(archProjetosTable.dealId, proposta.dealId),
        ))
        .limit(1);
    }

    if (!project && proposta.leadId) {
      const leadProjects = await db
        .select()
        .from(archProjetosTable)
        .where(and(
          eq(archProjetosTable.tenantId, proposta.tenantId),
          eq(archProjetosTable.leadId, proposta.leadId),
        ))
        .limit(2);
      if (leadProjects.length === 1) project = leadProjects[0];
    }

    if (!project) return;

    let obraId = project.obraId;
    if (!obraId) {
      const [obra] = await db
        .insert(obrasTable)
        .values({
          tenantId: proposta.tenantId,
          nome: project.titulo,
          descricao: `[ARQDOR:${project.id}] Obra criada automaticamente após aprovação da proposta ${proposta.numero ?? proposta.id}.`,
          clienteNome: project.clienteNome,
          clienteContato: project.clienteTelefone ?? project.clienteEmail,
          status: "planejamento",
          orcamentoTotal: proposta.valorTotal ? String(proposta.valorTotal) : project.orcamentoTotal,
          custoRealizado: "0",
          linkCliente: project.portalToken ? `/arch/portal/${project.portalToken}` : null,
        })
        .returning({ id: obrasTable.id });
      obraId = obra?.id ?? null;
    } else {
      await db
        .update(obrasTable)
        .set({
          orcamentoTotal: proposta.valorTotal ? String(proposta.valorTotal) : project.orcamentoTotal,
          clienteNome: project.clienteNome,
          clienteContato: project.clienteTelefone ?? project.clienteEmail,
          linkCliente: project.portalToken ? `/arch/portal/${project.portalToken}` : null,
          updatedAt: new Date(),
        })
        .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, proposta.tenantId)));
    }

    await db
      .update(archProjetosTable)
      .set({
        leadId: proposta.leadId ?? project.leadId,
        dealId: proposta.dealId ?? project.dealId,
        propostaId: proposta.id,
        obraId,
        status: "aprovado",
        portalAtivo: true,
        updatedAt: new Date(),
      })
      .where(eq(archProjetosTable.id, project.id));

    logger.info(
      { projectId: project.id, propostaId: proposta.id, obraId },
      "proposalAccepted: Arqdor project synced to accepted proposal and obra",
    );
  } catch (err) {
    logger.warn({ err, propostaId: proposta.id }, "proposalAccepted: failed to sync Arqdor project (non-fatal)");
  }
}


type WorkBaselineProvisioning = {
  obraId: string;
  portalClienteUrl: string | null;
  baselineCreated: boolean;
  baselineVersion: number;
};

function parseContractDate(value?: string | null): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T12:00:00Z`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function contractDateOnly(value?: string | Date | null): string | null {
  const date = value instanceof Date ? value : parseContractDate(value ?? null);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function addContractDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveContractDependencyStart(
  predecessor: { start: Date | null; end: Date | null } | undefined,
  type: string,
  lagDays: number,
  durationDays: number,
): Date | null {
  if (!predecessor) return null;
  if (type === "SS" && predecessor.start) return addContractDays(predecessor.start, lagDays);
  if (type === "FS" && predecessor.end) return addContractDays(predecessor.end, 1 + lagDays);
  if (type === "FF" && predecessor.end) {
    return addContractDays(predecessor.end, lagDays - Math.max(0, durationDays - 1));
  }
  if (type === "SF" && predecessor.start) {
    return addContractDays(predecessor.start, lagDays - Math.max(0, durationDays - 1));
  }
  return null;
}

async function syncAcceptedProposalToWorkBaseline(
  proposta: typeof propostasTable.$inferSelect,
): Promise<WorkBaselineProvisioning | null> {
  const items = proposta.itens ?? [];
  const presentation = proposta.apresentacao ?? {
    modoPadrao: "completo",
    etapas: {},
    mostrarTotalGeral: true,
    cronogramaEtapas: {},
    mostrarCronogramaExecucao: true,
    mostrarFisicoFinanceiro: true,
  };

  const hasStageSignal = items.some(
    (item) => Boolean(item.etapaId || item.etapaNome || item.etapaOrdem),
  ) || Object.keys(presentation.cronogramaEtapas ?? {}).length > 0;

  const [archProject] = await db
    .select({
      id: archProjetosTable.id,
      obraId: archProjetosTable.obraId,
      titulo: archProjetosTable.titulo,
    })
    .from(archProjetosTable)
    .where(and(
      eq(archProjetosTable.tenantId, proposta.tenantId),
      eq(archProjetosTable.propostaId, proposta.id),
    ))
    .limit(1);

  // Não cria "obra" para propostas comerciais genéricas/SaaS. A existência
  // de etapas de execução ou de um projeto Arqdor é o sinal canônico.
  if (!hasStageSignal && !archProject) return null;

  const [lead] = await db
    .select({
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      telefone: leadsTable.telefone,
      email: leadsTable.email,
      endereco: leadsTable.endereco,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, proposta.leadId))
    .limit(1);

  let [obra] = await db
    .select()
    .from(obrasTable)
    .where(eq(obrasTable.propostaOrigemId, proposta.id))
    .limit(1);

  if (!obra && proposta.dealId) {
    [obra] = await db
      .select()
      .from(obrasTable)
      .where(eq(obrasTable.dealOrigemId, proposta.dealId))
      .limit(1);
  }

  if (!obra && archProject?.obraId) {
    [obra] = await db
      .select()
      .from(obrasTable)
      .where(and(
        eq(obrasTable.id, archProject.obraId),
        eq(obrasTable.tenantId, proposta.tenantId),
      ))
      .limit(1);
  }

  type GroupedItem = {
    item: (typeof items)[number];
    index: number;
  };
  const grouped = new Map<string, {
    sourceId: string;
    nome: string;
    ordem: number;
    itens: GroupedItem[];
  }>();

  items.forEach((item, index) => {
    const ordem = Number(item.etapaOrdem ?? item.ordemExecucao ?? index + 1);
    const nome = item.etapaNome?.trim() || (hasStageSignal ? `Etapa ${ordem}` : "Execução contratada");
    const sourceId = item.etapaId?.trim() || `proposta:${proposta.id}:etapa:${ordem}:${nome}`;
    const group = grouped.get(sourceId) ?? { sourceId, nome, ordem, itens: [] };
    group.itens.push({ item, index });
    grouped.set(sourceId, group);
  });

  if (grouped.size === 0) {
    grouped.set(`proposta:${proposta.id}:etapa:1`, {
      sourceId: `proposta:${proposta.id}:etapa:1`,
      nome: archProject?.titulo || "Execução contratada",
      ordem: 1,
      itens: [],
    });
  }

  const groups = Array.from(grouped.values()).sort((a, b) => a.ordem - b.ordem);
  const proposalTotal = Number(proposta.valorTotal ?? 0)
    || groups.reduce(
      (sum, group) => sum + group.itens.reduce(
        (stageSum, entry) => stageSum + Number(entry.item.quantidade || 0) * Number(entry.item.valorUnitario || 0),
        0,
      ),
      0,
    );

  const globalStart = parseContractDate(presentation.previsaoInicio ?? null);
  const stageDateBySource = new Map<string, { start: Date | null; end: Date | null }>();

  const plannedStages = groups.map((group, index) => {
    const config = presentation.cronogramaEtapas?.[group.sourceId]
      ?? (group.itens[0]?.item.etapaId
        ? presentation.cronogramaEtapas?.[group.itens[0].item.etapaId!]
        : undefined)
      ?? {};
    const stageValue = group.itens.reduce(
      (sum, entry) => sum + Number(entry.item.quantidade || 0) * Number(entry.item.valorUnitario || 0),
      0,
    );
    const explicitStart = parseContractDate(config.inicioPrevisto ?? null);
    const explicitEnd = parseContractDate(config.fimPrevisto ?? null);
    const duration = Number(config.duracaoDias ?? 0) > 0
      ? Math.round(Number(config.duracaoDias))
      : explicitStart && explicitEnd
        ? Math.max(1, Math.round((explicitEnd.getTime() - explicitStart.getTime()) / 86_400_000) + 1)
        : 1;

    const defaultDependency = index > 0 ? groups[index - 1]?.sourceId : undefined;
    const dependencyId = config.dependeDeEtapaId ?? defaultDependency;
    const predecessor = dependencyId ? stageDateBySource.get(dependencyId) : undefined;
    const dependencyType = config.tipoDependencia ?? "FS";
    const lagDays = Number(config.defasagemDias ?? 0);
    const automaticStart = config.inicioAutomatico !== false;
    const startDate = (!automaticStart && explicitStart)
      ? explicitStart
      : (index === 0 ? explicitStart ?? globalStart : null)
        ?? resolveContractDependencyStart(predecessor, dependencyType, lagDays, duration)
        ?? explicitStart
        ?? globalStart;
    const endDate = explicitEnd && !automaticStart
      ? explicitEnd
      : startDate ? addContractDays(startDate, duration - 1) : explicitEnd;

    stageDateBySource.set(group.sourceId, { start: startDate, end: endDate });
    const configuredPhysical = Number(config.percentualFisico);

    return {
      ...group,
      config,
      dependencyId,
      dependencyType,
      lagDays,
      stageValue,
      financialPercent: proposalTotal > 0 ? (stageValue / proposalTotal) * 100 : 0,
      configuredPhysicalPercent: Number.isFinite(configuredPhysical) ? configuredPhysical : null,
      start: startDate,
      end: endDate,
      duration,
    };
  });

  const missingPhysical = plannedStages.filter((stage) => stage.configuredPhysicalPercent === null);
  const configuredPhysicalTotal = plannedStages.reduce(
    (sum, stage) => sum + Number(stage.configuredPhysicalPercent ?? 0),
    0,
  );
  const remainingPhysical = Math.max(0, 100 - configuredPhysicalTotal);
  const missingDurationTotal = missingPhysical.reduce(
    (sum, stage) => sum + Number(stage.duration ?? 0),
    0,
  );

  const stages = plannedStages.map((stage) => ({
    ...stage,
    physicalPercent: stage.configuredPhysicalPercent !== null
      ? Math.max(0, Math.min(100, stage.configuredPhysicalPercent))
      : missingPhysical.length === 0
        ? 0
        : missingDurationTotal > 0 && stage.duration
          ? (Number(stage.duration) / missingDurationTotal) * remainingPhysical
          : remainingPhysical / missingPhysical.length,
  }));

  const startDates = stages.flatMap((stage) => stage.start ? [stage.start] : []);
  const endDates = stages.flatMap((stage) => stage.end ? [stage.end] : []);
  const obraStart = startDates.length
    ? new Date(Math.min(...startDates.map((date) => date.getTime())))
    : globalStart;
  const obraEnd = endDates.length
    ? new Date(Math.max(...endDates.map((date) => date.getTime())))
    : null;

  if (!obra) {
    [obra] = await db
      .insert(obrasTable)
      .values({
        tenantId: proposta.tenantId,
        nome: archProject?.titulo || proposta.titulo,
        descricao: `[PROPOSTA:${proposta.id}] Obra originada da proposta contratada ${proposta.numero ?? proposta.id}.`,
        propostaOrigemId: proposta.id,
        dealOrigemId: proposta.dealId ?? null,
        leadOrigemId: proposta.leadId,
        clienteNome: lead?.empresa || lead?.nome || null,
        clienteContato: lead?.telefone ?? lead?.email ?? null,
        endereco: lead?.endereco ?? null,
        status: "planejamento",
        dataInicio: contractDateOnly(obraStart),
        dataFimPrevista: contractDateOnly(obraEnd),
        orcamentoTotal: proposalTotal > 0 ? proposalTotal.toFixed(2) : null,
        custoRealizado: "0",
      })
      .returning();
  } else {
    const [updated] = await db
      .update(obrasTable)
      .set({
        propostaOrigemId: obra.propostaOrigemId ?? proposta.id,
        dealOrigemId: obra.dealOrigemId ?? proposta.dealId ?? null,
        leadOrigemId: obra.leadOrigemId ?? proposta.leadId,
        clienteNome: obra.clienteNome ?? lead?.empresa ?? lead?.nome ?? null,
        clienteContato: obra.clienteContato ?? lead?.telefone ?? lead?.email ?? null,
        endereco: obra.endereco ?? lead?.endereco ?? null,
        dataInicio: contractDateOnly(obraStart) ?? obra.dataInicio,
        dataFimPrevista: contractDateOnly(obraEnd) ?? obra.dataFimPrevista,
        orcamentoTotal: proposalTotal > 0 ? proposalTotal.toFixed(2) : obra.orcamentoTotal,
        updatedAt: new Date(),
      })
      .where(and(
        eq(obrasTable.id, obra.id),
        eq(obrasTable.tenantId, proposta.tenantId),
      ))
      .returning();
    if (updated) obra = updated;
  }

  if (!obra) return null;

  const portalClienteUrl = obra.portalToken ? `/portal/obra/${obra.portalToken}` : null;
  if (portalClienteUrl && obra.linkCliente !== portalClienteUrl) {
    const [updated] = await db
      .update(obrasTable)
      .set({ linkCliente: portalClienteUrl, updatedAt: new Date() })
      .where(eq(obrasTable.id, obra.id))
      .returning();
    if (updated) obra = updated;
  }

  const stageDbBySource = new Map<string, typeof obraEtapasTable.$inferSelect>();
  const phaseDbBySource = new Map<string, typeof obraEtapaFasesTable.$inferSelect>();

  for (const stage of stages) {
    let [existingStage] = await db
      .select()
      .from(obraEtapasTable)
      .where(and(
        eq(obraEtapasTable.obraId, obra.id),
        eq(obraEtapasTable.origemEtapaId, stage.sourceId),
      ))
      .limit(1);

    const values = {
      nome: stage.nome,
      ordem: stage.ordem,
      descricao: stage.config.observacao?.trim()
        || `Etapa originada da proposta contratada ${proposta.numero ?? proposta.id}.`,
      dataInicioPrevista: contractDateOnly(stage.start),
      dataFimPrevista: contractDateOnly(stage.end),
      custoPrevisto: stage.stageValue.toFixed(2),
      pesoFisico: stage.physicalPercent.toFixed(4),
      marco: Boolean(stage.config.marcoPagamento),
    };

    if (existingStage) {
      const [updatedStage] = await db
        .update(obraEtapasTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(obraEtapasTable.id, existingStage.id))
        .returning();
      existingStage = updatedStage ?? existingStage;
    } else {
      [existingStage] = await db
        .insert(obraEtapasTable)
        .values({
          obraId: obra.id,
          origemEtapaId: stage.sourceId,
          ...values,
          status: "pendente",
          percentualExecutado: "0",
        })
        .returning();
    }

    if (!existingStage) continue;
    stageDbBySource.set(stage.sourceId, existingStage);

    const phases = stage.config.fases ?? [];
    const configuredShare = phases.reduce((sum, phase) => sum + Number(phase.percentualEtapa ?? 0), 0);
    const phaseDates = new Map<string, { start: Date | null; end: Date | null }>();
    for (const [phaseIndex, phase] of phases.entries()) {
      const phaseSourceId = phase.id || `${stage.sourceId}:fase:${phaseIndex + 1}`;
      const share = Number(phase.percentualEtapa ?? 0) > 0
        ? Number(phase.percentualEtapa)
        : phases.length ? 100 / phases.length : 100;
      // Se foram cadastradas fases, elas representam a decomposição completa da etapa.
      // Normalizamos a distribuição configurada para 100% para não deixar valor da etapa
      // sem fase (e, portanto, impossível de medir/cobrar).
      const normalizedShare = configuredShare > 0
        ? (share / configuredShare) * 100
        : phases.length ? 100 / phases.length : 100;
      const phaseValue = stage.stageValue * (normalizedShare / 100);

      const explicitPhaseStart = parseContractDate(phase.inicioPrevisto ?? null);
      const explicitPhaseEnd = parseContractDate(phase.fimPrevisto ?? null);
      const phaseDuration = Number(phase.duracaoDias ?? 0) > 0
        ? Math.round(Number(phase.duracaoDias))
        : explicitPhaseStart && explicitPhaseEnd
          ? Math.max(1, Math.round((explicitPhaseEnd.getTime() - explicitPhaseStart.getTime()) / 86_400_000) + 1)
          : Math.max(1, Math.round(stage.duration * (normalizedShare / 100)));
      const defaultPhaseDependency = phaseIndex > 0 ? phases[phaseIndex - 1]?.id : undefined;
      const phaseDependencyId = phase.dependeDeFaseId ?? defaultPhaseDependency;
      const phasePredecessor = phaseDependencyId ? phaseDates.get(phaseDependencyId) : undefined;
      const phaseStart = phaseIndex === 0
        ? explicitPhaseStart ?? stage.start
        : resolveContractDependencyStart(
            phasePredecessor,
            phase.tipoDependencia ?? "FS",
            Number(phase.defasagemDias ?? 0),
            phaseDuration,
          ) ?? explicitPhaseStart ?? stage.start;
      const phaseEnd = explicitPhaseEnd ?? (phaseStart ? addContractDays(phaseStart, phaseDuration - 1) : stage.end);
      phaseDates.set(phaseSourceId, { start: phaseStart, end: phaseEnd });
      if (phase.id && phase.id !== phaseSourceId) {
        phaseDates.set(phase.id, { start: phaseStart, end: phaseEnd });
      }

      let [dbPhase] = await db
        .select()
        .from(obraEtapaFasesTable)
        .where(and(
          eq(obraEtapaFasesTable.etapaId, existingStage.id),
          eq(obraEtapaFasesTable.origemFaseId, phaseSourceId),
        ))
        .limit(1);

      const phaseValues = {
        nome: phase.nome || `Fase ${phaseIndex + 1}`,
        ordem: Number(phase.ordem ?? phaseIndex + 1),
        dataInicioPrevista: contractDateOnly(phaseStart),
        dataFimPrevista: contractDateOnly(phaseEnd),
        percentualEtapa: normalizedShare.toFixed(4),
        custoPrevisto: phaseValue.toFixed(2),
      };

      if (dbPhase) {
        const [updatedPhase] = await db
          .update(obraEtapaFasesTable)
          .set({ ...phaseValues, updatedAt: new Date() })
          .where(eq(obraEtapaFasesTable.id, dbPhase.id))
          .returning();
        dbPhase = updatedPhase ?? dbPhase;
      } else {
        [dbPhase] = await db
          .insert(obraEtapaFasesTable)
          .values({
            obraId: obra.id,
            etapaId: existingStage.id,
            origemFaseId: phaseSourceId,
            ...phaseValues,
            status: "pendente",
            percentualExecutado: "0",
          })
          .returning();
      }
      if (dbPhase) phaseDbBySource.set(phaseSourceId, dbPhase);
    }
  }

  // Materializa dependências depois de todas as etapas/fases existirem.
  for (const stage of stages) {
    const dbStage = stageDbBySource.get(stage.sourceId);
    const predecessor = stage.dependencyId ? stageDbBySource.get(stage.dependencyId) : undefined;
    if (!dbStage) continue;
    await db.delete(obraEtapaDependenciasTable).where(eq(obraEtapaDependenciasTable.etapaId, dbStage.id));
    if (predecessor) {
      await db.insert(obraEtapaDependenciasTable).values({
        tenantId: proposta.tenantId,
        obraId: obra.id,
        etapaId: dbStage.id,
        dependeDeEtapaId: predecessor.id,
        tipo: stage.dependencyType,
        defasagemDias: stage.lagDays,
      });
    }

    for (const phase of stage.config.fases ?? []) {
      const dbPhase = phaseDbBySource.get(phase.id);
      if (!dbPhase) continue;
      await db.delete(obraEtapaFaseDependenciasTable).where(eq(obraEtapaFaseDependenciasTable.faseId, dbPhase.id));
      if (phase.dependeDeFaseId) {
        const predecessorPhase = phaseDbBySource.get(phase.dependeDeFaseId);
        if (predecessorPhase) {
          await db.insert(obraEtapaFaseDependenciasTable).values({
            tenantId: proposta.tenantId,
            obraId: obra.id,
            faseId: dbPhase.id,
            dependeDeFaseId: predecessorPhase.id,
            tipo: phase.tipoDependencia ?? "FS",
            defasagemDias: Number(phase.defasagemDias ?? 0),
          });
        }
      }
    }
  }

  const [existingBaseline] = await db
    .select()
    .from(obraOrcamentosTable)
    .where(eq(obraOrcamentosTable.propostaOrigemId, proposta.id))
    .limit(1);

  if (existingBaseline) {
    return {
      obraId: obra.id,
      portalClienteUrl,
      baselineCreated: false,
      baselineVersion: existingBaseline.versao,
    };
  }

  const previousBaselines = await db
    .select()
    .from(obraOrcamentosTable)
    .where(eq(obraOrcamentosTable.obraId, obra.id));

  const nextVersion = previousBaselines.reduce(
    (max, item) => Math.max(max, Number(item.versao ?? 0)),
    0,
  ) + 1;

  for (const baseline of previousBaselines.filter((item) => item.status === "aprovado")) {
    await db
      .update(obraOrcamentosTable)
      .set({ status: "substituido", updatedAt: new Date() })
      .where(eq(obraOrcamentosTable.id, baseline.id));
  }

  const [baseline] = await db
    .insert(obraOrcamentosTable)
    .values({
      tenantId: proposta.tenantId,
      obraId: obra.id,
      propostaOrigemId: proposta.id,
      versao: nextVersion,
      titulo: `Linha de base contratada · ${proposta.numero ?? proposta.titulo}`,
      descricao: "Snapshot da proposta aceita. Alterações posteriores devem gerar nova versão/aditivo.",
      status: "aprovado",
      bdiGlobal: "0",
      linhaBaseSnapshot: {
        propostaId: proposta.id,
        numero: proposta.numero,
        titulo: proposta.titulo,
        acceptedAt: proposta.acceptedAt ? proposta.acceptedAt.toISOString() : null,
        valorTotal: proposta.valorTotal,
        formaPagamento: proposta.formaPagamento,
        condPagamento: proposta.condPagamento,
        prazoEntrega: proposta.prazoEntrega,
        validadeAte: proposta.validadeAte ? proposta.validadeAte.toISOString() : null,
        paymentCompositions: proposta.paymentCompositions ?? [],
        apresentacao: proposta.apresentacao,
        itens: proposta.itens ?? [],
      },
    })
    .returning();

  if (!baseline) {
    return {
      obraId: obra.id,
      portalClienteUrl,
      baselineCreated: false,
      baselineVersion: nextVersion,
    };
  }

  for (const stage of stages) {
    const [budgetStage] = await db
      .insert(obraOrcamentoEtapasTable)
      .values({
        orcamentoId: baseline.id,
        origemEtapaId: stage.sourceId,
        nome: stage.nome,
        ordem: stage.ordem,
      })
      .returning();

    if (!budgetStage || stage.itens.length === 0) continue;

    await db.insert(obraOrcamentoItensTable).values(
      stage.itens.map(({ item, index }) => ({
        etapaId: budgetStage.id,
        nome: item.nome,
        unidade: item.unidade || "un",
        quantidade: Number(item.quantidade || 0).toFixed(4),
        custoUnitario: Number(item.valorUnitario || 0).toFixed(4),
        composicaoId: item.composicaoId ?? null,
        origemPreco: "proposta_contratada",
        ordem: index + 1,
      })),
    );
  }

  logger.info(
    {
      propostaId: proposta.id,
      obraId: obra.id,
      baselineVersion: nextVersion,
      etapas: stages.length,
      portalClienteUrl,
    },
    "proposalAccepted: work baseline provisioned from accepted proposal",
  );

  return {
    obraId: obra.id,
    portalClienteUrl,
    baselineCreated: true,
    baselineVersion: nextVersion,
  };
}

/**
 * Idempotent proposal acceptance.
 * If the deal already has `closure_triggered_at`, the call is a no-op
 * (silently returns alreadyProcessed=true).
 *
 * This is the SINGLE funnel: all channels (link, WhatsApp, manual) must call
 * this function so the automation happens exactly once.
 */
export async function proposalAccepted(
  propostaId: string,
  channel: ProposalAcceptanceChannel,
  metadata?: {
    ip?: string;
    nome?: string;
    documento?: string;
  },
  options?: ProposalAcceptedOptions
): Promise<ProposalAcceptanceResult | ProposalAcceptanceError> {
  const log = logger.child({ propostaId, channel });

  // 1. Resolve proposta
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, propostaId));

  if (!proposta) {
    return { ok: false, error: "Proposta not found", propostaId };
  }

  if (proposta.status === "aceita") {
    log.info("proposalAccepted: proposta already accepted, checking deal closure");
  }

  const now = new Date();

  // 2. Mark proposta as accepted (idempotent — no-op if already aceita)
  const [updatedProposta] = await db
    .update(propostasTable)
    .set({
      status: "aceita" as typeof propostasTable.$inferInsert.status,
      acceptedAt: proposta.status === "aceita" ? proposta.acceptedAt : now,
      acceptedVia: proposta.status === "aceita" ? proposta.acceptedVia : channel,
      acceptedBy: proposta.status === "aceita" ? proposta.acceptedBy : (metadata?.nome ?? null),
      acceptanceMetadata: {
        channel,
        acceptedAt: now.toISOString(),
        ...(metadata?.ip ? { ip: metadata.ip } : {}),
        ...(metadata?.nome ? { nome: metadata.nome } : {}),
        ...(metadata?.documento ? { documento: metadata.documento } : {}),
      },
      updatedAt: now,
    })
    .where(eq(propostasTable.id, propostaId))
    .returning();

  const acceptedProposal = updatedProposta ?? proposta;
  await syncDealValueFromProposal({
    dealId: acceptedProposal.dealId,
    tenantId: acceptedProposal.tenantId,
    valorTotal: acceptedProposal.valorTotal,
  });
  let workProvisioning: WorkBaselineProvisioning | null | undefined;
  const ensureConstructionProvisioning = async () => {
    if (workProvisioning !== undefined) return workProvisioning;
    await syncAcceptedProposalToArqdor(acceptedProposal);
    try {
      workProvisioning = await syncAcceptedProposalToWorkBaseline(acceptedProposal);
    } catch (err) {
      log.warn({ err, propostaId }, "proposalAccepted: work baseline provisioning failed (non-fatal)");
      workProvisioning = null;
    }
    return workProvisioning;
  };

  // 3. Resolve deal & idempotency check
  if (!proposta.dealId) {
    log.warn("proposalAccepted: no deal linked to proposta");
    const provisioning = await ensureConstructionProvisioning();
    return {
      ok: true,
      alreadyProcessed: false,
      propostaId,
      dealId: null,
      channel,
      closureTriggeredAt: null,
      chargeCreated: false,
      inventoryDeducted: false,
      activityCreated: false,
      webhookDispatched: false,
      ...(provisioning ? {
        obraId: provisioning.obraId,
        portalClienteUrl: provisioning.portalClienteUrl ?? undefined,
        baselineCreated: provisioning.baselineCreated,
      } : {}),
    };
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, proposta.dealId));

  if (!deal) {
    log.warn("proposalAccepted: linked deal not found");
    const provisioning = await ensureConstructionProvisioning();
    return {
      ok: true,
      alreadyProcessed: false,
      propostaId,
      dealId: null,
      channel,
      closureTriggeredAt: null,
      chargeCreated: false,
      inventoryDeducted: false,
      activityCreated: false,
      webhookDispatched: false,
      ...(provisioning ? {
        obraId: provisioning.obraId,
        portalClienteUrl: provisioning.portalClienteUrl ?? undefined,
        baselineCreated: provisioning.baselineCreated,
      } : {}),
    };
  }

  // Idempotency gate: if deal already triggered closure, skip silently
  if (deal.closureTriggeredAt) {
    log.info(
      { dealId: deal.id, closureTriggeredAt: deal.closureTriggeredAt },
      "proposalAccepted: deal already closed, skipping automation"
    );
    const provisioning = await ensureConstructionProvisioning();
    return {
      ok: true,
      alreadyProcessed: true,
      propostaId,
      dealId: deal.id,
      channel,
      closureTriggeredAt: deal.closureTriggeredAt,
      chargeCreated: false,
      inventoryDeducted: false,
      activityCreated: false,
      webhookDispatched: false,
      ...(provisioning ? {
        obraId: provisioning.obraId,
        portalClienteUrl: provisioning.portalClienteUrl ?? undefined,
        baselineCreated: provisioning.baselineCreated,
      } : {}),
    };
  }

  // 3b. Catalog-price divergence guard — Closer não pode fechar sozinho se o
  // valor da proposta divergir do preço de catálogo (produtos_catalogo).
  if (!options?.skipApprovalCheck) {
    const itens = (proposta.itens ?? []).map((i) => ({
      nome: i.nome,
      sku: i.sku ?? null,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
    }));
    const catalogCheck = await checkCatalogMatch(
      proposta.tenantId,
      itens,
      proposta.valorTotal !== null && proposta.valorTotal !== undefined
        ? Number(proposta.valorTotal)
        : undefined
    );

    if (catalogCheck.hasCatalogBasis && !catalogCheck.matches) {
      if (!proposta.leadId) {
        log.error(
          { dealId: deal.id },
          "proposalAccepted: catalog divergence but proposta has no leadId — cannot create agent_task, blocking closure"
        );
        return { ok: false, error: "Valor diverge do catálogo e não há lead vinculado para aprovação", propostaId };
      }

      const [task] = await db
        .insert(agentTasksTable)
        .values({
          tenantId: proposta.tenantId,
          leadId: proposta.leadId,
          agentName: "closer",
          actionType: "aprovacao_fechamento",
          payload: {
            origin: "proposal_accepted",
            propostaId,
            dealId: deal.id,
            channel,
            metadata: metadata ?? null,
            valorProposta: catalogCheck.propostaTotal,
            valorCatalogo: catalogCheck.catalogTotal,
            diferenca: catalogCheck.diferenca,
            itens: catalogCheck.itemDetails,
          },
        })
        .returning();

      const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await db.insert(notificationsTable).values({
        tenantId: proposta.tenantId,
        title: "Fechamento pendente de aprovação — valor diverge do catálogo",
        message: `Proposta "${proposta.numero ?? proposta.titulo}" (lead ${proposta.leadId}) tem valor de ${fmt(catalogCheck.propostaTotal)}, mas o catálogo indica ${fmt(catalogCheck.catalogTotal)} (diferença: ${fmt(catalogCheck.diferenca)}). Aprovação manual necessária para fechar este negócio.`,
        type: "warning",
        category: "deal_closure_approval",
      });

      // Best-effort WhatsApp to the deal owner
      try {
        if (deal.assignedTo) {
          const [owner] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, deal.assignedTo));
          if (owner?.telefone) {
            const msg = `⚠️ Fechamento pendente de aprovação\n\nProposta "${proposta.numero ?? proposta.titulo}" tem valor de ${fmt(catalogCheck.propostaTotal)}, diferente do catálogo (${fmt(catalogCheck.catalogTotal)}). Diferença: ${fmt(catalogCheck.diferenca)}.\n\nAprove ou rejeite no painel para concluir o fechamento.`;
            await sendDirectWhatsAppMessage(proposta.tenantId, owner.telefone, msg, log);
          }
        }
      } catch (wErr) {
        log.warn({ err: wErr, dealId: deal.id }, "proposalAccepted: WhatsApp approval alert failed (non-fatal)");
      }

      log.warn(
        { dealId: deal.id, taskId: task.id, ...catalogCheck },
        "proposalAccepted: valor diverge do catálogo, fechamento bloqueado até aprovação"
      );

      return {
        ok: true,
        alreadyProcessed: false,
        propostaId,
        dealId: deal.id,
        channel,
        closureTriggeredAt: null,
        chargeCreated: false,
        inventoryDeducted: false,
        activityCreated: false,
        webhookDispatched: false,
        pendingApproval: true,
        agentTaskId: task.id,
        divergence: {
          valorProposta: catalogCheck.propostaTotal,
          valorCatalogo: catalogCheck.catalogTotal,
          diferenca: catalogCheck.diferenca,
        },
      };
    }
  }

  // 3c. Stock confirmation gate — tenant pode exigir confirmação de estoque
  // humana antes de disparar contrato/cobrança, evitando vender item sem
  // disponibilidade real. Roda depois do guardrail de valor do Bloco 1.
  if (!options?.skipStockCheck) {
    const [tenantCfg] = await db
      .select({
        confirmarEstoqueAntesFinanceiro: tenantsTable.confirmarEstoqueAntesFinanceiro,
        usuarioConferenciaEstoqueId: tenantsTable.usuarioConferenciaEstoqueId,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, proposta.tenantId));

    if (tenantCfg?.confirmarEstoqueAntesFinanceiro) {
      if (!proposta.leadId) {
        log.error(
          { dealId: deal.id },
          "proposalAccepted: confirmação de estoque exigida mas proposta não tem leadId — não é possível criar agent_task"
        );
        return { ok: false, error: "Confirmação de estoque exigida e não há lead vinculado para conferência", propostaId };
      }

      const etapaAnterior = deal.etapa;
      await db
        .update(dealsTable)
        .set({
          etapa: "conferencia_estoque" as typeof dealsTable.$inferInsert.etapa,
          updatedAt: new Date(),
        })
        .where(eq(dealsTable.id, deal.id));

      const [task] = await db
        .insert(agentTasksTable)
        .values({
          tenantId: proposta.tenantId,
          leadId: proposta.leadId,
          agentName: "closer",
          actionType: "conferencia_estoque",
          payload: {
            origin: "proposal_accepted",
            propostaId,
            dealId: deal.id,
            channel,
            metadata: metadata ?? null,
            etapaAnterior,
            assignedUserId: tenantCfg.usuarioConferenciaEstoqueId ?? null,
            itens: (proposta.itens ?? []).map((i) => ({ nome: i.nome, sku: i.sku ?? null, quantidade: i.quantidade })),
          },
        })
        .returning();

      await db.insert(notificationsTable).values({
        tenantId: proposta.tenantId,
        title: "Confirmação de estoque pendente antes do fechamento",
        message: `Proposta "${proposta.numero ?? proposta.titulo}" (lead ${proposta.leadId}) aguarda confirmação de disponibilidade em estoque antes de seguir para contrato e cobrança.`,
        type: "warning",
        category: "conferencia_estoque",
      });

      try {
        if (tenantCfg.usuarioConferenciaEstoqueId) {
          const [responsavel] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, tenantCfg.usuarioConferenciaEstoqueId));
          if (responsavel?.telefone) {
            const msg = `📦 Confirmação de estoque pendente\n\nProposta "${proposta.numero ?? proposta.titulo}" precisa de conferência de estoque antes de seguir para contrato/cobrança.\n\nAprove ou reprove no painel para continuar o fechamento.`;
            await sendDirectWhatsAppMessage(proposta.tenantId, responsavel.telefone, msg, log);
          }
        }
      } catch (wErr) {
        log.warn({ err: wErr, dealId: deal.id }, "proposalAccepted: WhatsApp de conferência de estoque falhou (non-fatal)");
      }

      log.info(
        { dealId: deal.id, taskId: task.id },
        "proposalAccepted: aguardando confirmação de estoque, fechamento pausado"
      );

      return {
        ok: true,
        alreadyProcessed: false,
        propostaId,
        dealId: deal.id,
        channel,
        closureTriggeredAt: null,
        chargeCreated: false,
        inventoryDeducted: false,
        activityCreated: false,
        webhookDispatched: false,
        pendingStockConfirmation: true,
        agentTaskId: task.id,
      };
    }
  }

  // 4. Move deal to ganho — this triggers the full closure automation
  // (contract, onboarding, Asaas charge via the existing deal-etapa=ganho hook)
  await db
    .update(dealsTable)
    .set({
      etapa: "ganho" as typeof dealsTable.$inferInsert.etapa,
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, deal.id));

  // Update lead status to "convertido" so it leaves the "novo" pipeline
  if (proposta.leadId) {
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, proposta.leadId));
    log.info({ dealId: deal.id, leadId: proposta.leadId }, "proposalAccepted: lead status updated to convertido");

    // Fecha o placar do Revenue Scout automaticamente, se essa venda veio de
    // uma oferta proativa recente — non-blocking, não deve atrapalhar o fechamento.
    reconcileScoutOnDealWon({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      dealId: deal.id,
      log,
    }).catch((err) => {
      log.warn({ err, dealId: deal.id }, "proposalAccepted: scout reconciliation failed (non-fatal)");
    });

    // Exporta para CRM externo (HubSpot, RD Station etc.) se configurado — fire-and-forget.
    exportLeadToCRM({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      event: "deal_won",
      log,
    }).catch(() => undefined);
  }

  log.info({ dealId: deal.id }, "proposalAccepted: deal moved to ganho");

  // A proposta aprovada torna-se a linha de base da execução: cria/reusa a
  // obra, etapas, orçamento contratado versionado e o portal do cliente.
  const provisioning = await ensureConstructionProvisioning();

  // 4a. Handoff proativo: fechamento → onboarding. Em vez de esperar o cliente
  // escrever de novo, dispara a mensagem de boas-vindas imediatamente — non-blocking.
  if (proposta.leadId) {
    triggerOnboardingHandoff({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      dealId: deal.id,
      extraPayload: { propostaId },
      log,
    }).catch((err) => {
      log.warn({ err, dealId: deal.id }, "proposalAccepted: onboarding handoff failed (non-fatal)");
    });
  }

  // 4b. Trigger re-analysis of churn risk — non-blocking
  // A deal moving to ganho is a strong engagement signal; the churn score
  // should be recomputed immediately so the UI reflects the real state.
  Promise.resolve()
    .then(async () => {
      try {
        await analyzeLeadIntelligence({
          tenantId: proposta.tenantId,
          leadId:   proposta.leadId,
          log,
          triggeredBy: "auto",
        });
        log.info({ dealId: deal.id, leadId: proposta.leadId }, "proposalAccepted: churn re-analysis triggered");
      } catch (err) {
        log.warn({ err, dealId: deal.id, leadId: proposta.leadId }, "proposalAccepted: churn re-analysis failed (non-fatal)");
      }
    })
    .catch(() => { /* ignore */ });

  // 5. Create CRM activity
  let activityCreated = false;
  try {
    await db.insert(activitiesTable).values({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      dealId: deal.id,
      tipo: "whatsapp" as typeof activitiesTable.$inferInsert.tipo,
      titulo: "Proposta aceita",
      descricao: `Proposta aceita via ${channel} em ${new Date().toLocaleString("pt-BR")}. Proposta: ${proposta.numero ?? proposta.titulo}`,
      status: "concluida" as typeof activitiesTable.$inferInsert.status,
      concluidaEm: new Date(),
      resultadoExecucao: "aceite",
      responsavelId: deal.assignedTo ?? null,
    });
    activityCreated = true;
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: failed to create activity");
  }

  // 6. Inventory deduction
  let inventoryDeducted = false;
  try {
    const itens = (proposta.itens ?? []) as Array<{ nome: string; quantidade: number; produtoId?: string | null }>;
    for (const item of itens) {
      // Prefer the immutable catalog reference captured in the budget item.
      // Name lookup remains only as legacy fallback for old proposals.
      const [produto] = item.produtoId
        ? await db
            .select({ id: produtosCatalogoTable.id })
            .from(produtosCatalogoTable)
            .where(and(
              eq(produtosCatalogoTable.tenantId, proposta.tenantId),
              eq(produtosCatalogoTable.id, item.produtoId),
            ))
            .limit(1)
        : await db
            .select({ id: produtosCatalogoTable.id })
            .from(produtosCatalogoTable)
            .where(and(
              eq(produtosCatalogoTable.tenantId, proposta.tenantId),
              eq(produtosCatalogoTable.nome, item.nome),
            ))
            .limit(1);

      if (!produto) continue;

      const [invItem] = await db
        .select({ id: inventoryItemsTable.id, quantidadeAtual: inventoryItemsTable.quantidadeAtual })
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.tenantId, proposta.tenantId),
            eq(inventoryItemsTable.produtoId, produto.id)
          )
        )
        .limit(1);

      if (invItem) {
        const novaQuantidade = Math.max(0, Number(invItem.quantidadeAtual) - item.quantidade);
        await db
          .update(inventoryItemsTable)
          .set({ quantidadeAtual: String(novaQuantidade), updatedAt: new Date() })
          .where(eq(inventoryItemsTable.id, invItem.id));

        await db.insert(inventoryMovementsTable).values({
          tenantId: proposta.tenantId,
          inventoryItemId: invItem.id,
          tipo: "saida" as typeof inventoryMovementsTable.$inferInsert.tipo,
          quantidade: String(item.quantidade),
          motivo: `Venda: proposta ${proposta.numero ?? proposta.titulo}`,
          referenciaId: proposta.id,
        });
      }
    }
    inventoryDeducted = true;
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: inventory deduction failed");
  }

  // 6b. Create entregas (Agenda de entrega por motorista) — best-effort
  try {
    await createEntregasFromProposta(propostaId, log);
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: entrega creation failed (non-fatal)");
  }

  // Financeiro integrado: toda venda aceita gera uma conta a receber.
  // Idempotente pela origem e não bloqueia o fechamento comercial.
  try {
    if (proposta.valorTotal) {
      await db.insert(erpTitulosTable).values({
        tenantId: proposta.tenantId,
        tipo: "receber",
        categoria: "receita",
        descricao: proposta.titulo,
        documento: proposta.numero,
        valorOriginal: proposta.valorTotal,
        vencimento: proposta.acceptedAt ?? new Date(),
        origemTipo: "proposta",
        origemId: proposta.id,
      }).onConflictDoNothing();
    }
  } catch (err) {
    log.warn({ err, propostaId }, "proposalAccepted: ERP receivable creation failed (non-fatal)");
  }

  // 7. Dispatch ERP webhook (non-blocking)
  let webhookDispatched = false;
  try {
    const [tenant] = await db
      .select({ webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl, integrationType: tenantsTable.integrationType })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, proposta.tenantId));

    if (tenant?.webhookEstoqueUrl) {
      const itens = (proposta.itens ?? []) as Array<{
        nome: string;
        sku?: string | null;
        quantidade: number;
        precoUnitario?: number | null;
      }>;
      const valorTotal = itens.reduce(
        (acc, item) => acc + item.quantidade * (item.precoUnitario ?? 0),
        0
      );
      dispatchVendaWebhook(
        tenant.webhookEstoqueUrl,
        {
          event: "venda_realizada",
          tenantId: proposta.tenantId,
          vendaId: updatedProposta.id,
          tipo: "proposta",
          integrationType: (tenant.integrationType as "n8n" | "api" | undefined) ?? undefined,
          produtos: itens.map((item) => ({
            nome: item.nome,
            sku: item.sku ?? null,
            quantidade: item.quantidade,
          })),
          valorTotal,
          realizadaEm: new Date().toISOString(),
        },
        log
      );
      webhookDispatched = true;
    }
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: webhook dispatch failed");
  }

  // Re-fetch deal to get closureTriggeredAt (should be set by the deal-ganho hook)
  const [dealAfter] = await db
    .select({ closureTriggeredAt: dealsTable.closureTriggeredAt })
    .from(dealsTable)
    .where(eq(dealsTable.id, deal.id));

  return {
    ok: true,
    alreadyProcessed: false,
    propostaId,
    dealId: deal.id,
    channel,
    closureTriggeredAt: dealAfter?.closureTriggeredAt ?? null,
    chargeCreated: false, // Asaas charge is created by the deal-ganho hook
    inventoryDeducted,
    activityCreated,
    webhookDispatched,
    ...(provisioning ? {
      obraId: provisioning.obraId,
      portalClienteUrl: provisioning.portalClienteUrl ?? undefined,
      baselineCreated: provisioning.baselineCreated,
    } : {}),
  };
}
