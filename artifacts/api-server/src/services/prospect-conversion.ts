import { and, asc, eq, isNull } from "drizzle-orm";
import {
  activitiesTable,
  crmTenantCompaniesTable,
  db,
  dealsTable,
  funisTable,
  leadBriefingsTable,
  leadsTable,
  prospectInteractionsTable,
  prospectsTable,
  prospectorQueueTable,
} from "@workspace/db";
import { leadRegistrationMetadata } from "../lib/lead-registration-standard.js";
import { resolveColdProspectingConfig } from "./cold-prospecting-config.js";

function hasFact(prospect: typeof prospectsTable.$inferSelect, key: string): boolean {
  return Boolean(prospect.qualification?.facts?.some((f) => f.key === key && f.value === true && f.confirmed));
}

export function evaluateProspectConversion(
  prospect: typeof prospectsTable.$inferSelect,
  config: Awaited<ReturnType<typeof resolveColdProspectingConfig>>,
) {
  const criteria = config.conversionCriteria;
  const hasResponsible =
    prospect.accountMap?.some((p) => p.confirmed && p.roles.includes("responsavel")) ||
    hasFact(prospect, "responsible_identified");
  const hasDecisionOrPath =
    prospect.accountMap?.some((p) => p.confirmed && p.roles.includes("decisor")) ||
    hasFact(prospect, "decision_maker_identified") ||
    hasFact(prospect, "path_to_responsible_known");
  const hasPain = Boolean(prospect.qualification?.confirmedPains?.length);
  const meetingAccepted = hasFact(prospect, "meeting_accepted");
  const scoreOk = (prospect.qualificationScore ?? prospect.fitScore ?? 0) >= config.qualificationThreshold;

  const missing: string[] = [];
  if (criteria.requireResponsible && !hasResponsible) missing.push("responsible");
  if (criteria.requireConfirmedPain && !hasPain) missing.push("confirmed_pain");
  if (criteria.requireDecisionMakerOrPath && !hasDecisionOrPath) missing.push("decision_maker_or_path");
  if (criteria.requireMeetingAccepted && !meetingAccepted) missing.push("meeting_accepted");
  if (!scoreOk) missing.push("qualification_score");

  return { eligible: missing.length === 0, missing };
}

function activityType(channel: string): "whatsapp" | "email" | "ligacao" | "tarefa" {
  if (channel === "whatsapp") return "whatsapp";
  if (channel === "email") return "email";
  if (channel === "phone") return "ligacao";
  return "tarefa";
}

export async function convertProspectToLead(input: {
  tenantId: string;
  prospectId: string;
  requireEligibility?: boolean;
}) {
  const [prospect] = await db.select().from(prospectsTable).where(and(
    eq(prospectsTable.id, input.prospectId),
    eq(prospectsTable.tenantId, input.tenantId),
  )).limit(1);
  if (!prospect) throw new Error("prospect_not_found");

  if (prospect.convertedLeadId) {
    return {
      leadId: prospect.convertedLeadId,
      dealId: prospect.convertedDealId,
      alreadyConverted: true,
    };
  }
  if (prospect.stage === "nao_contatar" || prospect.stage === "sem_aderencia") {
    throw new Error("prospect_not_convertible");
  }

  const runtime = await resolveColdProspectingConfig(input.tenantId);
  const eligibility = evaluateProspectConversion(prospect, runtime);
  if (input.requireEligibility !== false && !eligibility.eligible) {
    const error = new Error("prospect_not_qualified");
    (error as Error & { missing?: string[] }).missing = eligibility.missing;
    throw error;
  }

  const interactions = await db.select().from(prospectInteractionsTable).where(and(
    eq(prospectInteractionsTable.tenantId, input.tenantId),
    eq(prospectInteractionsTable.prospectId, prospect.id),
  )).orderBy(asc(prospectInteractionsTable.occurredAt));

  const now = new Date();
  const name = prospect.displayName || prospect.accountMap?.find((p) => p.confirmed)?.name || "Prospect";
  const [lead] = await db.insert(leadsTable).values({
    tenantId: input.tenantId,
    nome: name,
    empresa: prospect.displayName || name,
    telefone: prospect.phone,
    email: prospect.email,
    endereco: prospect.address,
    websiteUrl: prospect.website,
    source: "cold_prospect_converted",
    tipoPessoa: "juridica",
    status: "novo",
    mercadoSegmento: prospect.segment,
    dorPrincipal: prospect.qualification?.confirmedPains?.[0] ?? null,
    proximaAcao: prospect.nextBestAction,
    assignedTo: prospect.assignedUserId,
    metadata: leadRegistrationMetadata({
      prospectId: prospect.id,
      prospectSource: prospect.source,
      prospectSourceRef: prospect.sourceRef,
      prospectAccountMap: prospect.accountMap,
      prospectQualification: prospect.qualification,
      prospectFit: {
        overall: prospect.fitScore,
        vendorai: prospect.vendoraiFitScore,
        arqdor: prospect.arqdorFitScore,
        recommendedSolution: prospect.recommendedSolution,
        primaryHook: prospect.primaryHook,
      },
      convertedAt: now.toISOString(),
    }, {
      entryChannel: "prospeccao",
      entrySource: "cold_prospect_converted",
      capturedAt: now.toISOString(),
      details: { prospectId: prospect.id },
    }),
  }).returning();

  if (!lead) throw new Error("lead_creation_failed");

  const [funil] = await db.select({ id: funisTable.id }).from(funisTable)
    .where(eq(funisTable.tenantId, input.tenantId))
    .orderBy(asc(funisTable.createdAt))
    .limit(1);

  const [deal] = await db.insert(dealsTable).values({
    tenantId: input.tenantId,
    leadId: lead.id,
    titulo: `${name} — Oportunidade qualificada`,
    funilId: funil?.id ?? null,
    etapa: "qualificado",
    assignedTo: prospect.assignedUserId,
    probabilidade: Math.max(10, Math.min(95, prospect.meetingReadinessScore ?? prospect.qualificationScore ?? prospect.fitScore ?? 50)),
    aiBriefing: [
      prospect.opportunitySummary,
      prospect.qualification?.confirmedPains?.length
        ? `Dores confirmadas: ${prospect.qualification.confirmedPains.join("; ")}`
        : null,
      prospect.nextBestAction ? `Próxima melhor ação: ${prospect.nextBestAction}` : null,
    ].filter(Boolean).join("\n"),
    aiBriefingGeneratedAt: now,
  }).returning();

  if (!deal) throw new Error("deal_creation_failed");

  if (prospect.companyId) {
    await db.update(crmTenantCompaniesTable).set({
      leadId: lead.id,
      relationshipType: "lead",
      status: "ativo",
      updatedAt: now,
    }).where(and(
      eq(crmTenantCompaniesTable.tenantId, input.tenantId),
      eq(crmTenantCompaniesTable.companyId, prospect.companyId),
    ));
  }

  const channels = [...new Set(interactions.map((i) => i.channel).filter((c) => c !== "system"))];
  await db.insert(leadBriefingsTable).values({
    tenantId: input.tenantId,
    leadId: lead.id,
    channelsUsed: channels,
    contactType: "prospeccao_fria",
    contactDate: prospect.lastInteractionAt?.toISOString() ?? now.toISOString(),
    freeNotes: [
      `Prospect convertido: ${prospect.id}`,
      prospect.opportunitySummary ?? "",
      `Mapa da conta: ${JSON.stringify(prospect.accountMap ?? [])}`,
      `Histórico de prospecção preservado em prospect_interactions.`,
    ].filter(Boolean).join("\n"),
    nextStepType: prospect.nextBestAction,
    aiSummary: {
      resumoCliente: prospect.opportunitySummary ?? `Oportunidade originada por prospecção fria (${prospect.source}).`,
      doresPrincipais: prospect.qualification?.confirmedPains ?? [],
      pontosDeForte: [],
      comoContornarObjecoes: [],
      abordagemRecomendada: prospect.nextBestAction ?? "Dar continuidade ao diagnóstico comercial.",
      alertas: prospect.qualification?.inferredPains?.length
        ? [`Dores ainda inferidas: ${prospect.qualification.inferredPains.join("; ")}`]
        : [],
    },
  }).onConflictDoNothing();

  for (const interaction of interactions.slice(-100)) {
    await db.insert(activitiesTable).values({
      tenantId: input.tenantId,
      leadId: lead.id,
      dealId: deal.id,
      tipo: activityType(interaction.channel),
      titulo: interaction.direction === "inbound"
        ? "Interação recebida durante prospecção"
        : interaction.direction === "outbound"
          ? "Interação enviada durante prospecção"
          : "Evento da prospecção",
      descricao: interaction.content?.slice(0, 4000) ?? interaction.reason ?? null,
      status: "concluida",
      concluidaEm: interaction.occurredAt,
      objetivo: interaction.objective,
      origem: "prospect_conversion",
      responsavelId: prospect.assignedUserId,
    });
  }

  await db.update(prospectsTable).set({
    convertedLeadId: lead.id,
    convertedDealId: deal.id,
    convertedAt: now,
    stage: "qualificado",
    currentState: "Prospect convertido em Lead/Negócio",
    currentObjective: "Continuar a oportunidade no CRM sem perder contexto",
    nextBestAction: "Abrir o negócio qualificado e seguir o próximo passo acordado",
    nextBestActionReason: "Os critérios de conversão foram atendidos.",
    updatedAt: now,
  }).where(eq(prospectsTable.id, prospect.id));

  if (prospect.sourceRef) {
    await db.update(prospectorQueueTable).set({
      leadId: lead.id,
      updatedAt: now,
    }).where(and(
      eq(prospectorQueueTable.tenantId, input.tenantId),
      eq(prospectorQueueTable.placeId, prospect.sourceRef),
    )).catch(() => undefined);
  }

  return { leadId: lead.id, dealId: deal.id, alreadyConverted: false };
}
