import { and, eq, isNotNull } from "drizzle-orm";
import {
  activitiesTable,
  agendasTable,
  businessProfilesTable,
  agendamentosTable,
  db,
  leadsTable,
  prospectsTable,
  tenantsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { createGoogleEvent } from "../lib/google-calendar.js";
import { sendDirectWhatsAppMessage, sendOperationalEmail } from "./omnichannel.js";
import { convertProspectToLead } from "./prospect-conversion.js";
import { resolveColdProspectingConfig } from "./cold-prospecting-config.js";

function meetingBrief(prospect: typeof prospectsTable.$inferSelect): string {
  const account = (prospect.accountMap ?? [])
    .map((p) => `${p.name}${p.jobTitle ? " — " + p.jobTitle : ""}: ${p.roles.join(", ")}`)
    .join("\n");
  return [
    `Empresa/Prospect: ${prospect.displayName ?? prospect.id}`,
    prospect.segment ? `Segmento: ${prospect.segment}` : null,
    prospect.opportunitySummary ? `Resumo: ${prospect.opportunitySummary}` : null,
    prospect.qualification?.confirmedPains?.length ? `Dores confirmadas: ${prospect.qualification.confirmedPains.join("; ")}` : null,
    prospect.qualification?.inferredPains?.length ? `Hipóteses ainda não confirmadas: ${prospect.qualification.inferredPains.join("; ")}` : null,
    `Fit Vendor.ai: ${prospect.vendoraiFitScore ?? "N/A"} | Fit Arqdor: ${prospect.arqdorFitScore ?? "N/A"}`,
    `Gancho recomendado: ${prospect.primaryHook ?? "diagnóstico"}`,
    account ? `Mapa da conta:\n${account}` : null,
    prospect.nextBestAction ? `Próxima melhor ação: ${prospect.nextBestAction}` : null,
  ].filter(Boolean).join("\n\n");
}

export async function scheduleProspectMeeting(input: {
  tenantId: string;
  prospectId: string;
  start: Date;
  end: Date;
  title?: string | null;
  modality?: "meet" | "presencial" | "ligacao";
  location?: string | null;
  autonomous?: boolean;
  log: Logger;
}) {
  if (input.end <= input.start || input.start <= new Date()) throw new Error("invalid_meeting_time");

  const runtime = await resolveColdProspectingConfig(input.tenantId);
  const [prospect] = await db.select().from(prospectsTable).where(and(
    eq(prospectsTable.id, input.prospectId),
    eq(prospectsTable.tenantId, input.tenantId),
  )).limit(1);
  if (!prospect) throw new Error("prospect_not_found");
  if (prospect.stage === "nao_contatar" || prospect.stage === "sem_aderencia") throw new Error("prospect_contact_blocked");

  if (input.autonomous) {
    if (runtime.mode !== "autonomous") throw new Error("autonomous_mode_disabled");
    const meetingAccepted = prospect.qualification?.facts?.some((f) => f.key === "meeting_accepted" && f.value === true && f.confirmed);
    if (!meetingAccepted) throw new Error("meeting_not_accepted");
    if ((prospect.meetingReadinessScore ?? 0) < runtime.meetingReadinessThreshold) throw new Error("meeting_readiness_below_threshold");
  }

  const converted = await convertProspectToLead({
    tenantId: input.tenantId,
    prospectId: input.prospectId,
    requireEligibility: input.autonomous === true,
  });

  const [lead] = await db.select().from(leadsTable).where(and(
    eq(leadsTable.id, converted.leadId),
    eq(leadsTable.tenantId, input.tenantId),
  )).limit(1);
  if (!lead) throw new Error("converted_lead_not_found");

  const [agenda] = await db.select().from(agendasTable)
    .where(and(eq(agendasTable.tenantId, input.tenantId), isNotNull(agendasTable.googleRefreshToken)))
    .limit(1);

  let [appointment] = await db.insert(agendamentosTable).values({
    tenantId: input.tenantId,
    agendaId: agenda?.id ?? null,
    leadId: converted.leadId,
    dealId: converted.dealId ?? null,
    tipo: "reuniao",
    modalidade: input.modality ?? "meet",
    titulo: input.title?.trim() || `Demonstração — ${prospect.displayName ?? lead.nome}`,
    dataHoraInicio: input.start,
    dataHoraFim: input.end,
    local: input.location ?? null,
    status: "confirmado",
    responsavelId: prospect.assignedUserId,
    gerarMeet: (input.modality ?? "meet") === "meet",
    criadoPor: input.autonomous ? "agente_ia" : "humano",
    participantes: [{
      nome: lead.nome,
      ...(lead.email ? { email: lead.email } : {}),
      ...(lead.telefone ? { telefone: lead.telefone } : {}),
      tipo: "cliente",
    }],
    observacoes: meetingBrief(prospect),
  }).returning();

  let meetLink: string | null = null;
  if (agenda?.id && agenda.googleRefreshToken) {
    try {
      const google = await createGoogleEvent(
        agenda.id,
        {
          id: appointment.id,
          tenantId: input.tenantId,
          titulo: appointment.titulo,
          dataHoraInicio: appointment.dataHoraInicio,
          dataHoraFim: appointment.dataHoraFim,
          observacoes: appointment.observacoes,
          local: appointment.local,
          gerarMeet: appointment.gerarMeet ?? false,
          participantes: appointment.participantes ?? [],
        },
        lead.nome,
        lead.email ?? undefined,
        appointment.gerarMeet ?? false,
      );
      meetLink = google.meetLink ?? null;
      await db.update(agendamentosTable).set({
        googleEventId: google.googleEventId ?? null,
        meetLink,
        updatedAt: new Date(),
      }).where(eq(agendamentosTable.id, appointment.id));
      appointment = { ...appointment, googleEventId: google.googleEventId ?? null, meetLink };
    } catch (error) {
      input.log.warn({ error, prospectId: prospect.id }, "prospect meeting: Google Calendar sync failed (non-fatal)");
    }
  }

  const [activity] = await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: converted.leadId,
    dealId: converted.dealId ?? null,
    tipo: "reuniao",
    titulo: appointment.titulo,
    descricao: "Reunião originada pela prospecção fria inteligente.",
    status: "pendente",
    dataVencimento: input.start,
    responsavelId: prospect.assignedUserId,
    agendaId: agenda?.id ?? null,
    dataHoraInicio: input.start,
    dataHoraFim: input.end,
    gerarMeet: appointment.gerarMeet,
    googleEventId: appointment.googleEventId,
    meetLink: appointment.meetLink,
    spinBriefing: meetingBrief(prospect),
    spinGeneratedAt: new Date(),
    origem: "cold_prospecting",
    objetivo: prospect.currentObjective,
  }).returning();

  const when = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: runtime.timezone,
  }).format(input.start);
  const [brand] = await db.select({ nomeFantasia: businessProfilesTable.nomeFantasia })
    .from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, input.tenantId)).limit(1);
  const [tenant] = await db.select({ name: tenantsTable.name, nomeEmpresa: tenantsTable.nomeEmpresa })
    .from(tenantsTable).where(eq(tenantsTable.id, input.tenantId)).limit(1);
  const tenantName = brand?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || "Empresa";

  const confirmation = [
    `Reunião confirmada para ${when}.`,
    meetLink ? `Google Meet: ${meetLink}` : input.location ? `Local: ${input.location}` : null,
    "Qualquer ajuste, responda por aqui.",
  ].filter(Boolean).join("\n");

  if (lead.telefone && runtime.allowedChannels.includes("whatsapp")) {
    await sendDirectWhatsAppMessage(input.tenantId, lead.telefone, confirmation, input.log).catch((error) =>
      input.log.warn({ error, prospectId: prospect.id }, "prospect meeting: WhatsApp confirmation failed"),
    );
  } else if (lead.email && runtime.allowedChannels.includes("email")) {
    await sendOperationalEmail({
      tenantId: input.tenantId,
      tenantName,
      to: lead.email,
      subject: appointment.titulo,
      text: confirmation,
    }, input.log).catch((error) =>
      input.log.warn({ error, prospectId: prospect.id }, "prospect meeting: email confirmation failed"),
    );
  }

  await db.update(prospectsTable).set({
    stage: "reuniao_agendada",
    currentState: "Reunião agendada e oportunidade convertida",
    currentObjective: "Preparar a reunião com todo o contexto da prospecção",
    nextBestAction: "Revisar briefing e conduzir a reunião",
    nextBestActionReason: "Data e horário da reunião foram registrados.",
    nextActionAt: input.start,
    updatedAt: new Date(),
  }).where(eq(prospectsTable.id, prospect.id));

  return { appointment, activity, leadId: converted.leadId, dealId: converted.dealId, meetLink };
}
