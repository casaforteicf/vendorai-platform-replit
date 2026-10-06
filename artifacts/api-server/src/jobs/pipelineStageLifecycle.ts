import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  dealsTable,
  leadsTable,
  notificationsTable,
  pipelineStagesTable,
  scoutOportunidadesTable,
  usersTable,
  workCardAttachmentsTable,
  workCardsTable,
} from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { sendAgentAttachments, sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { executeConfiguredStageEvents } from "../services/pipeline-stage-events.js";

const DISTRIBUTED_LOCK_KEY = "vendorai:pipeline-stage-lifecycle:v1";
const APP_BASE_URL = "https://app.appvendorai.com";
const TIME_ZONE = "America/Sao_Paulo";
const RECENT_TRANSITION_MINUTES = 65;

type PipelineKey = "comercial" | "execucao" | "aquecimento" | "parceiros" | "scout";

type LeadContext = {
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  endereco: string | null;
  tipoPessoa: string | null;
  dadosPj: unknown;
};

type OwnerContext = {
  id: string | null;
  name: string | null;
  telefone: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dateKeyInTimeZone(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function plannedDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatDatePtBr(value: Date | string | null | undefined): string {
  const key = plannedDateKey(value);
  if (!key) return "Não informada";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

function minutesSince(value: Date | string | null | undefined, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = value instanceof Date ? value : new Date(value);
  const ms = now.getTime() - date.getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / 60_000) : Number.POSITIVE_INFINITY;
}

function clientName(lead: LeadContext | null): string {
  return lead?.empresa || lead?.nome || "Cliente não identificado";
}

function clientContact(lead: LeadContext | null): { name: string | null; phone: string | null } {
  if (!lead) return { name: null, phone: null };
  const dados = asRecord(lead.dadosPj);
  const socios = Array.isArray(dados.socios) ? dados.socios as Array<Record<string, unknown>> : [];
  const first = socios[0];
  const name = lead.empresa
    ? lead.nome
    : lead.tipoPessoa === "juridica"
      ? typeof first?.nome === "string" ? first.nome : null
      : null;
  const phone = lead.telefone || (typeof first?.telefone === "string" ? first.telefone : null);
  return { name, phone };
}

async function hasNotification(tenantId: string, category: string): Promise<boolean> {
  const [row] = await db.select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.tenantId, tenantId),
      eq(notificationsTable.category, category),
    ))
    .limit(1);
  return Boolean(row);
}

async function markNotification(input: {
  tenantId: string;
  category: string;
  title: string;
  message: string;
}) {
  await db.insert(notificationsTable).values({
    tenantId: input.tenantId,
    category: input.category,
    title: input.title,
    message: input.message,
    type: "warning",
  });
}

async function sendStageWhatsApp(input: {
  tenantId: string;
  owner: OwnerContext | null;
  lead: LeadContext | null;
  pipelineLabel: string;
  stageLabel: string;
  title: string;
  dueDate?: Date | string | null;
  detail?: string | null;
  url: string;
  attachmentCardId?: string | null;
  log: Logger;
}) {
  if (!input.owner?.telefone) return;

  const name = clientName(input.lead);
  const contact = clientContact(input.lead);
  const message = [
    "📌 Acompanhamento da pipeline",
    `Pipeline: ${input.pipelineLabel}`,
    `Etapa: ${input.stageLabel}`,
    `Cliente: ${name}`,
    contact.name && contact.name !== name ? `Contato: ${contact.name}` : null,
    contact.phone ? `Telefone: ${contact.phone}` : null,
    input.lead?.endereco ? `Endereço: ${input.lead.endereco}` : null,
    input.dueDate ? `Data prevista: ${formatDatePtBr(input.dueDate)}` : null,
    `Responsável: ${input.owner.name || "não informado"}`,
    input.title,
    input.detail ? `Detalhes: ${input.detail}` : null,
    `🔗 Abrir e continuar no Vendor.ai: ${input.url}`,
  ].filter(Boolean).join("\n");

  await sendDirectWhatsAppMessage(input.tenantId, input.owner.telefone, message, input.log);

  if (input.attachmentCardId) {
    const attachments = await db.select({
      nome: workCardAttachmentsTable.nome,
      url: workCardAttachmentsTable.url,
      mimeType: workCardAttachmentsTable.mimeType,
      tamanho: workCardAttachmentsTable.tamanho,
    }).from(workCardAttachmentsTable).where(and(
      eq(workCardAttachmentsTable.tenantId, input.tenantId),
      eq(workCardAttachmentsTable.workCardId, input.attachmentCardId),
    ));
    const images = attachments
      .filter((item) => item.mimeType?.startsWith("image/") && item.url.startsWith("/api/storage"))
      .slice(0, 5)
      .map((item) => ({
        name: item.nome,
        objectPath: item.url.replace(/^\/api\/storage/, ""),
        mimeType: item.mimeType!,
        size: item.tamanho ?? undefined,
      }));
    if (images.length) await sendAgentAttachments(input.tenantId, input.owner.telefone, images, input.log);
  }
}

function dealPipelineAndStage(deal: typeof dealsTable.$inferSelect): { pipeline: PipelineKey; stage: string } | null {
  if (deal.etapa === "em_aquecimento") {
    return { pipeline: "aquecimento", stage: deal.relationshipStage || deal.aquecimentoTipo || "em_aquecimento" };
  }
  if (deal.etapa === "parceiro") {
    return { pipeline: "parceiros", stage: deal.relationshipStage || "parceiro_identificado" };
  }
  if (["ganho", "entregue", "perdido"].includes(deal.etapa)) return null;
  return { pipeline: "comercial", stage: deal.etapa };
}

function pipelineLabel(pipeline: PipelineKey): string {
  switch (pipeline) {
    case "comercial": return "Comercial";
    case "execucao": return "Execução / Pedidos";
    case "aquecimento": return "Aquecimento";
    case "parceiros": return "Parceiros";
    case "scout": return "Scout";
  }
}

function routeForDeal(pipeline: PipelineKey, leadId: string | null, dealId: string): string {
  if (leadId) return `${APP_BASE_URL}/trabalho/${encodeURIComponent(leadId)}?dealId=${encodeURIComponent(dealId)}`;
  if (pipeline === "aquecimento" || pipeline === "parceiros") {
    return `${APP_BASE_URL}/pipeline-relacionamento/${pipeline}`;
  }
  return `${APP_BASE_URL}/deals?dealId=${encodeURIComponent(dealId)}`;
}

export async function runPipelineStageLifecycle(log: Logger): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtext(${DISTRIBUTED_LOCK_KEY})) as acquired
    `);
    if (!Boolean(lockResult.rows?.[0]?.acquired)) {
      log.info("pipeline-stage-lifecycle: ciclo ignorado; outra instância possui o lock");
      return;
    }

    const now = new Date();
    const todayKey = dateKeyInTimeZone(now);
    const stageRows = await tx.select().from(pipelineStagesTable);
    const stageMap = new Map(stageRows.map((row) => [
      `${row.tenantId}:${row.pipeline}:${row.key}`,
      row,
    ]));
    const businessHoursCache = new Map<string, boolean>();
    let transitions = 0;
    let overdue = 0;

    const canRunTenant = async (tenantId: string) => {
      let allowed = businessHoursCache.get(tenantId);
      if (allowed === undefined) {
        allowed = await tenantIsWithinBusinessHours(tenantId);
        businessHoursCache.set(tenantId, allowed);
      }
      return allowed;
    };

    // Comercial + Aquecimento + Parceiros share the real deal record.
    const deals = await tx.select({
      deal: dealsTable,
      lead: {
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        endereco: leadsTable.endereco,
        tipoPessoa: leadsTable.tipoPessoa,
        dadosPj: leadsTable.dadosPj,
      },
      owner: {
        id: usersTable.id,
        name: usersTable.name,
        telefone: usersTable.telefone,
      },
    }).from(dealsTable)
      .leftJoin(leadsTable, and(eq(leadsTable.id, dealsTable.leadId), eq(leadsTable.tenantId, dealsTable.tenantId)))
      .leftJoin(usersTable, eq(usersTable.id, dealsTable.assignedTo))
      .orderBy(asc(dealsTable.updatedAt))
      .limit(2000);

    for (const row of deals) {
      const state = dealPipelineAndStage(row.deal);
      if (!state || !(await canRunTenant(row.deal.tenantId))) continue;

      const config = stageMap.get(`${row.deal.tenantId}:${state.pipeline}:${state.stage}`);
      const stageLabel = config?.label || state.stage;
      const enteredAt = row.deal.etapaAlteradaEm || row.deal.updatedAt;
      const transitionCategory = `pipeline_stage_entered:${state.pipeline}:${row.deal.id}:${state.stage}`;

      if (minutesSince(enteredAt, now) <= RECENT_TRANSITION_MINUTES) {
        await executeConfiguredStageEvents({
          tenantId: row.deal.tenantId,
          pipeline: state.pipeline,
          stageKey: state.stage,
          gatilho: "entrada",
          entityType: "deal",
          entityId: row.deal.id,
          leadId: row.deal.leadId,
          dealId: row.deal.id,
          client: { name: clientName(row.lead), phone: clientContact(row.lead).phone },
          owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? null, phone: row.owner?.telefone ?? null },
          processTitle: row.deal.titulo,
          url: routeForDeal(state.pipeline, row.deal.leadId, row.deal.id),
          log,
        });

        if (row.deal.assignedTo && !(await hasNotification(row.deal.tenantId, transitionCategory))) {
          await markNotification({
            tenantId: row.deal.tenantId,
            category: transitionCategory,
            title: `${pipelineLabel(state.pipeline)}: nova etapa`,
            message: `${clientName(row.lead)} entrou em ${stageLabel}.`,
          });
          try {
            await sendStageWhatsApp({
              tenantId: row.deal.tenantId,
              owner: row.owner,
              lead: row.lead,
              pipelineLabel: pipelineLabel(state.pipeline),
              stageLabel,
              title: "O processo entrou nesta etapa e está sob sua responsabilidade.",
              dueDate: row.deal.dataFechamentoPrevista,
              detail: row.deal.titulo,
              url: routeForDeal(state.pipeline, row.deal.leadId, row.deal.id),
              log,
            });
          } catch (error) {
            log.warn({ err: error, dealId: row.deal.id }, "pipeline-stage-lifecycle: aviso de entrada do deal falhou");
          }
          transitions++;
        }
      }

      const dueDateKey = plannedDateKey(row.deal.dataFechamentoPrevista);
      const slaMinutes = config?.slaMinutos ?? null;
      const overdueByDate = dueDateKey ? todayKey >= dueDateKey : false;
      const overdueBySla = !dueDateKey && slaMinutes != null && slaMinutes > 0 && minutesSince(enteredAt, now) >= slaMinutes;
      if (!overdueByDate && !overdueBySla) continue;

      await executeConfiguredStageEvents({
        tenantId: row.deal.tenantId,
        pipeline: state.pipeline,
        stageKey: state.stage,
        gatilho: "atraso",
        entityType: "deal",
        entityId: row.deal.id,
        leadId: row.deal.leadId,
        dealId: row.deal.id,
        client: { name: clientName(row.lead), phone: clientContact(row.lead).phone },
        owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? null, phone: row.owner?.telefone ?? null },
        processTitle: row.deal.titulo,
        url: routeForDeal(state.pipeline, row.deal.leadId, row.deal.id),
        log,
      });

      const overdueCategory = `pipeline_stage_overdue:${state.pipeline}:${row.deal.id}:${state.stage}`;
      if (!row.deal.assignedTo || await hasNotification(row.deal.tenantId, overdueCategory)) continue;
      await markNotification({
        tenantId: row.deal.tenantId,
        category: overdueCategory,
        title: `${pipelineLabel(state.pipeline)}: etapa precisa de atenção`,
        message: `${clientName(row.lead)} permanece em ${stageLabel} além do prazo esperado.`,
      });
      try {
        await sendStageWhatsApp({
          tenantId: row.deal.tenantId,
          owner: row.owner,
          lead: row.lead,
          pipelineLabel: pipelineLabel(state.pipeline),
          stageLabel,
          title: dueDateKey ? "Etapa chegou à data prevista sem avanço." : "Etapa ultrapassou o SLA configurado.",
          dueDate: row.deal.dataFechamentoPrevista,
          detail: row.deal.titulo,
          url: routeForDeal(state.pipeline, row.deal.leadId, row.deal.id),
          log,
        });
      } catch (error) {
        log.warn({ err: error, dealId: row.deal.id }, "pipeline-stage-lifecycle: aviso de atraso do deal falhou");
      }
      overdue++;
    }

    // Execução / Pedidos — cada card tem estágio próprio e anexos.
    const cards = await tx.select({
      card: workCardsTable,
      lead: {
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        endereco: leadsTable.endereco,
        tipoPessoa: leadsTable.tipoPessoa,
        dadosPj: leadsTable.dadosPj,
      },
      owner: {
        id: usersTable.id,
        name: usersTable.name,
        telefone: usersTable.telefone,
      },
    }).from(workCardsTable)
      .leftJoin(leadsTable, and(eq(leadsTable.id, workCardsTable.leadId), eq(leadsTable.tenantId, workCardsTable.tenantId)))
      .leftJoin(usersTable, eq(usersTable.id, workCardsTable.responsavelId))
      .where(eq(workCardsTable.pipeline, "execucao"))
      .orderBy(asc(workCardsTable.updatedAt))
      .limit(2000);

    for (const row of cards) {
      const card = row.card;
      if (["concluido", "entrega_obra", "instalacao_finalizada"].includes(card.etapa)) continue;
      if (!(await canRunTenant(card.tenantId))) continue;

      const metadata = asRecord(card.metadata);
      const trackedStage = typeof metadata.pipelineLifecycleStage === "string" ? metadata.pipelineLifecycleStage : null;
      const trackedEnteredAt = typeof metadata.pipelineStageEnteredAt === "string" ? metadata.pipelineStageEnteredAt : null;
      const stageChanged = trackedStage !== card.etapa;
      const enteredAt = stageChanged ? card.updatedAt : trackedEnteredAt || card.updatedAt;
      const config = stageMap.get(`${card.tenantId}:execucao:${card.etapa}`);
      const stageLabel = config?.label || card.etapa;
      const transitionCategory = `pipeline_stage_entered:execucao:${card.id}:${card.etapa}`;

      if (stageChanged || !trackedEnteredAt) {
        await tx.update(workCardsTable).set({
          metadata: {
            ...metadata,
            pipelineLifecycleStage: card.etapa,
            pipelineStageEnteredAt: new Date(enteredAt).toISOString(),
          },
        }).where(and(eq(workCardsTable.id, card.id), eq(workCardsTable.tenantId, card.tenantId)));
      }

      if (minutesSince(enteredAt, now) <= RECENT_TRANSITION_MINUTES) {
        await executeConfiguredStageEvents({
          tenantId: card.tenantId,
          pipeline: "execucao",
          stageKey: card.etapa,
          gatilho: "entrada",
          entityType: "work_card",
          entityId: card.id,
          leadId: card.leadId,
          dealId: card.dealId,
          workCardId: card.id,
          client: { name: clientName(row.lead), phone: clientContact(row.lead).phone },
          owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? null, phone: row.owner?.telefone ?? null },
          processTitle: card.titulo,
          processCode: card.codigo,
          url: `${APP_BASE_URL}/pipeline-operacional/execucao?card=${encodeURIComponent(card.id)}`,
          log,
        });

        if (card.responsavelId && !(await hasNotification(card.tenantId, transitionCategory))) {
          await markNotification({
            tenantId: card.tenantId,
            category: transitionCategory,
            title: "Execução: nova etapa",
            message: `${clientName(row.lead)} entrou em ${stageLabel}.`,
          });
          try {
            await sendStageWhatsApp({
              tenantId: card.tenantId,
              owner: row.owner,
              lead: row.lead,
              pipelineLabel: "Execução / Pedidos",
              stageLabel,
              title: "O processo entrou nesta etapa e está sob sua responsabilidade.",
              dueDate: card.dataFimPrevista,
              detail: `${card.codigo} — ${card.titulo}`,
              url: `${APP_BASE_URL}/pipeline-operacional/execucao?card=${encodeURIComponent(card.id)}`,
              attachmentCardId: card.id,
              log,
            });
          } catch (error) {
            log.warn({ err: error, workCardId: card.id }, "pipeline-stage-lifecycle: aviso de entrada da execução falhou");
          }
          transitions++;
        }
      }

      const dueDateKey = plannedDateKey(card.dataFimPrevista);
      const slaMinutes = config?.slaMinutos ?? null;
      const overdueByDate = dueDateKey ? todayKey >= dueDateKey : false;
      const overdueBySla = !dueDateKey && slaMinutes != null && slaMinutes > 0 && minutesSince(enteredAt, now) >= slaMinutes;
      if (!overdueByDate && !overdueBySla) continue;

      await executeConfiguredStageEvents({
        tenantId: card.tenantId,
        pipeline: "execucao",
        stageKey: card.etapa,
        gatilho: "atraso",
        entityType: "work_card",
        entityId: card.id,
        leadId: card.leadId,
        dealId: card.dealId,
        workCardId: card.id,
        client: { name: clientName(row.lead), phone: clientContact(row.lead).phone },
        owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? null, phone: row.owner?.telefone ?? null },
        processTitle: card.titulo,
        processCode: card.codigo,
        url: `${APP_BASE_URL}/pipeline-operacional/execucao?card=${encodeURIComponent(card.id)}`,
        log,
      });

      const overdueCategory = `pipeline_stage_overdue:execucao:${card.id}:${card.etapa}`;
      if (!card.responsavelId || await hasNotification(card.tenantId, overdueCategory)) continue;
      await markNotification({
        tenantId: card.tenantId,
        category: overdueCategory,
        title: "Execução: etapa precisa de atenção",
        message: `${clientName(row.lead)} permanece em ${stageLabel} além do prazo esperado.`,
      });
      try {
        await sendStageWhatsApp({
          tenantId: card.tenantId,
          owner: row.owner,
          lead: row.lead,
          pipelineLabel: "Execução / Pedidos",
          stageLabel,
          title: dueDateKey ? "Etapa chegou à data prevista sem avanço." : "Etapa ultrapassou o SLA configurado.",
          dueDate: card.dataFimPrevista,
          detail: `${card.codigo} — ${card.titulo}`,
          url: `${APP_BASE_URL}/pipeline-operacional/execucao?card=${encodeURIComponent(card.id)}`,
          attachmentCardId: card.id,
          log,
        });
      } catch (error) {
        log.warn({ err: error, workCardId: card.id }, "pipeline-stage-lifecycle: aviso de atraso da execução falhou");
      }
      overdue++;
    }

    // Scout — pipeline próprio, sem misturar com deals.
    const scoutRows = await tx.select({
      opportunity: scoutOportunidadesTable,
      lead: {
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        endereco: leadsTable.endereco,
        tipoPessoa: leadsTable.tipoPessoa,
        dadosPj: leadsTable.dadosPj,
      },
      owner: {
        id: usersTable.id,
        name: usersTable.name,
        telefone: usersTable.telefone,
      },
    }).from(scoutOportunidadesTable)
      .innerJoin(leadsTable, and(eq(leadsTable.id, scoutOportunidadesTable.clienteId), eq(leadsTable.tenantId, scoutOportunidadesTable.tenantId)))
      .leftJoin(usersTable, eq(usersTable.id, scoutOportunidadesTable.assignedTo))
      .orderBy(asc(scoutOportunidadesTable.createdAt))
      .limit(2000);

    for (const row of scoutRows) {
      const op = row.opportunity;
      if (["convertida", "descartada"].includes(op.pipelineStage)) continue;
      if (!(await canRunTenant(op.tenantId))) continue;

      const config = stageMap.get(`${op.tenantId}:scout:${op.pipelineStage}`);
      const stageLabel = config?.label || op.pipelineStage;
      // approvedAt/enviadoEm representam as mudanças operacionais mais relevantes;
      // createdAt é fallback para oportunidades ainda na etapa inicial.
      const enteredAt = op.enviadoEm || op.approvedAt || op.createdAt;
      const transitionCategory = `pipeline_stage_entered:scout:${op.id}:${op.pipelineStage}`;

      if (minutesSince(enteredAt, now) <= RECENT_TRANSITION_MINUTES) {
        await executeConfiguredStageEvents({
          tenantId: op.tenantId,
          pipeline: "scout",
          stageKey: op.pipelineStage,
          gatilho: "entrada",
          entityType: "scout",
          entityId: op.id,
          leadId: op.clienteId,
          client: { name: clientName(row.lead), phone: clientContact(row.lead).phone },
          owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? null, phone: row.owner?.telefone ?? null },
          processTitle: op.descricao,
          url: `${APP_BASE_URL}/scout?tab=acoes`,
          log,
        });

        if (op.assignedTo && !(await hasNotification(op.tenantId, transitionCategory))) {
          await markNotification({
            tenantId: op.tenantId,
            category: transitionCategory,
            title: "Scout: nova etapa",
            message: `${clientName(row.lead)} entrou em ${stageLabel}.`,
          });
          try {
            await sendStageWhatsApp({
              tenantId: op.tenantId,
              owner: row.owner,
              lead: row.lead,
              pipelineLabel: "Scout",
              stageLabel,
              title: "A oportunidade entrou nesta etapa e está sob sua responsabilidade.",
              detail: op.descricao,
              url: `${APP_BASE_URL}/scout?tab=acoes`,
              log,
            });
          } catch (error) {
            log.warn({ err: error, opportunityId: op.id }, "pipeline-stage-lifecycle: aviso de entrada do Scout falhou");
          }
          transitions++;
        }
      }

      const slaMinutes = config?.slaMinutos ?? null;
      if (slaMinutes == null || slaMinutes <= 0 || minutesSince(enteredAt, now) < slaMinutes) continue;
      await executeConfiguredStageEvents({
        tenantId: op.tenantId,
        pipeline: "scout",
        stageKey: op.pipelineStage,
        gatilho: "atraso",
        entityType: "scout",
        entityId: op.id,
        leadId: op.clienteId,
        client: { name: clientName(row.lead), phone: clientContact(row.lead).phone },
        owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? null, phone: row.owner?.telefone ?? null },
        processTitle: op.descricao,
        url: `${APP_BASE_URL}/scout?tab=acoes`,
        log,
      });

      const overdueCategory = `pipeline_stage_overdue:scout:${op.id}:${op.pipelineStage}`;
      if (!op.assignedTo || await hasNotification(op.tenantId, overdueCategory)) continue;

      await markNotification({
        tenantId: op.tenantId,
        category: overdueCategory,
        title: "Scout: etapa precisa de atenção",
        message: `${clientName(row.lead)} permanece em ${stageLabel} além do SLA configurado.`,
      });
      try {
        await sendStageWhatsApp({
          tenantId: op.tenantId,
          owner: row.owner,
          lead: row.lead,
          pipelineLabel: "Scout",
          stageLabel,
          title: "Etapa ultrapassou o SLA configurado.",
          detail: op.descricao,
          url: `${APP_BASE_URL}/scout?tab=acoes`,
          log,
        });
      } catch (error) {
        log.warn({ err: error, opportunityId: op.id }, "pipeline-stage-lifecycle: aviso de atraso do Scout falhou");
      }
      overdue++;
    }

    log.info({ transitions, overdue }, "pipeline-stage-lifecycle: complete");
  });
}
