/**
 * SDR Service — Cmd 16
 * Detects approach scenario, resolves template variables, sends first WhatsApp approach.
 */
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  db,
  leadsTable,
  activitiesTable,
  usersTable,
  dealsTable,
  sdrTemplatesTable,
  businessProfilesTable,
  conversationsTable,
  messagesTable,
  customerIntelligenceTable,
  agentConfigsTable,
  agentTasksTable,
  resolveAgentAutonomyLevel,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { dispatchAgentBackground } from "./agent-dispatch.js";
import { ensureColdProspectLandingPage } from "./coldProspectLandingPage.js";
import type { ColdEvidence } from "../lib/coldProspectQuality.js";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { getAgentConfig, insertAndRun } from "../lib/agent-engine.js";
import {
  buildProspectorOpening,
  isColdProspectSource,
  resolveProspectorPlaybook,
} from "../lib/prospector-consultive.js";

export type SdrCenario = "frio_teste" | "frio_revelacao" | "pos_visita" | "direto_dono" | "inbound_site" | null;

type ColdProspectDossier = {
  status?: string;
  fitScore?: number;
  painScore?: number;
  evidence?: ColdEvidence[];
  playbook?: {
    segment?: string;
    niche?: string;
    recommendedModules?: string[];
  };
  lpBrief?: {
    city?: unknown;
  };
  lpUrl?: string;
  lpSiteId?: string | null;
  lpSlug?: string;
  lpGeneratedAt?: string;
};

async function recordProspectorOutboundMessage(
  tenantId: string,
  leadId: string,
  message: string,
  log: Logger,
): Promise<void> {
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.tenantId, tenantId),
      eq(conversationsTable.leadId, leadId),
      eq(conversationsTable.channel, "whatsapp"),
    ))
    .orderBy(desc(conversationsTable.ultimaMensagemEm))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({
        tenantId,
        leadId,
        channel: "whatsapp",
        status: "open",
        naoLidas: 0,
      })
      .returning();
  }

  if (!conversation) throw new Error("PROSPECTOR_CONVERSATION_NOT_CREATED");

  await db.insert(messagesTable).values({
    tenantId,
    conversationId: conversation.id,
    leadId,
    conteudo: message,
    direcao: "saida",
    enviadoPor: "agente_ia",
    agentName: "sdr",
    tipoConteudo: "texto",
    status: "enviado",
    canal: "whatsapp",
  });

  await db
    .update(conversationsTable)
    .set({ ultimaMensagemEm: new Date(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  log.debug({ tenantId, leadId, conversationId: conversation.id }, "sdrService: Prospecctor outbound persisted");
}

function metadataSuppressesColdOutreach(metadata: Record<string, unknown>): boolean {
  const booleanFlags = ["optOut", "opt_out", "doNotContact", "nao_contatar", "não_contatar", "unsubscribed", "blacklisted"];
  if (booleanFlags.some((key) => metadata[key] === true)) return true;

  const status = String(metadata["contact_status"] ?? metadata["outreach_status"] ?? "").trim().toLowerCase();
  return ["opt_out", "opt-out", "nao_contatar", "não_contatar", "unsubscribed", "blocked", "blacklisted"].includes(status);
}

async function assertColdOutreachAllowed(leadId: string, tenantId: string, log: Logger): Promise<void> {
  if (!(await tenantIsWithinBusinessHours(tenantId))) {
    log.info({ leadId, tenantId }, "sdrService: cold outreach postponed outside business hours");
    throw new Error("COLD_OUTREACH_OUTSIDE_BUSINESS_HOURS");
  }

  const [lead] = await db
    .select({
      agenteDesativado: leadsTable.agenteDesativado,
      excluidoEm: leadsTable.excluidoEm,
      naoLeadTipo: leadsTable.naoLeadTipo,
      iaAtiva: leadsTable.iaAtiva,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) throw new Error("COLD_OUTREACH_LEAD_NOT_FOUND");

  const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
  const suppressed = Boolean(
    lead.agenteDesativado ||
    lead.excluidoEm ||
    lead.naoLeadTipo ||
    lead.iaAtiva === false ||
    metadataSuppressesColdOutreach(metadata)
  );

  if (suppressed) {
    log.info({ leadId, tenantId }, "sdrService: cold outreach blocked by suppression rule");
    throw new Error("COLD_OUTREACH_SUPPRESSED");
  }
}

// ── Scenario detection ────────────────────────────────────────────────────────

export async function detectSdrCenario(
  leadId: string,
  tenantId: string,
): Promise<SdrCenario> {
  const [lead] = await db
    .select({ source: leadsTable.source, telefone: leadsTable.telefone, dadosPj: leadsTable.dadosPj, metadata: leadsTable.metadata })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) return null;

  if ((lead.metadata as Record<string, unknown>)?.contato_tipo === "decisor") return "direto_dono";

  const visitas = await db
    .select({ id: activitiesTable.id, titulo: activitiesTable.titulo, descricao: activitiesTable.descricao })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.leadId, leadId),
      eq(activitiesTable.tenantId, tenantId),
      eq(activitiesTable.tipo, "visita"),
    ))
    .limit(5);

  const visitaSemDecisao = visitas.some((v) => {
    const descricao = (v.descricao ?? "").toLowerCase();
    return descricao.includes("falou_com_decisor:false") || descricao.includes("não falou com o decisor") || descricao.includes("nao falou com o decisor");
  });
  if (visitas.length > 0 && visitaSemDecisao) return "pos_visita";

  if (isColdProspectSource(lead.source) && visitas.length === 0) return "frio_teste";

  if (lead.source?.startsWith("site_")) return "inbound_site";

  return null;
}

// ── Variable resolution ────────────────────────────────────────────────────────

function nextBusinessDays(from: Date, count: number): Date[] {
  const days: Date[] = [];
  const d = new Date(from);
  while (days.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
  }
  return days;
}

function formatDia(d: Date): string {
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return `${names[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`;
}

function dossierFromMetadata(metadata: Record<string, unknown>): ColdProspectDossier | null {
  const raw = metadata["coldProspectDossier"];
  return raw && typeof raw === "object" ? raw as ColdProspectDossier : null;
}

export async function resolveTemplateVars(
  template: string,
  leadId: string,
  dealId: string | null,
  tenantId: string,
  log: Logger,
): Promise<string> {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) return template;

  const meta = (lead.metadata ?? {}) as Record<string, unknown>;
  const dossier = dossierFromMetadata(meta);

  let vendedorNome = "nossa equipe";
  let responsavelId: string | null = null;
  if (dealId) {
    const [deal] = await db
      .select({ assignedTo: dealsTable.assignedTo })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)))
      .limit(1);
    responsavelId = deal?.assignedTo ?? null;
  }
  if (responsavelId) {
    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, responsavelId))
      .limit(1);
    if (user) vendedorNome = user.name;
  }

  const [bp] = await db
    .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);
  const empresaNome = bp?.nomeFantasia ?? bp?.razaoSocial ?? "Vendor.ai";

  let nomeGatekeeper = "a atendente";
  const [visita] = await db
    .select({ descricao: activitiesTable.descricao })
    .from(activitiesTable)
    .where(and(eq(activitiesTable.leadId, leadId), eq(activitiesTable.tenantId, tenantId), eq(activitiesTable.tipo, "visita")))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);
  if (visita?.descricao) {
    const m = visita.descricao.match(/falou com[:\s]+([^\n,;]+)/i);
    if (m) nomeGatekeeper = m[1].trim();
  }

  const nextDays = nextBusinessDays(new Date(), 2);
  const diaSugestao1 = formatDia(nextDays[0]);
  const diaSugestao2 = nextDays[1] ? formatDia(nextDays[1]) : "outro dia";
  const horaSugestao1 = "10h";

  let principalReclamacao = "oportunidade de atendimento identificada em sinais públicos";
  const reviews = (meta.reviews ?? meta.avaliações ?? []) as Array<{ text?: string; comment?: string }>;
  if (reviews.length > 0) {
    const reviewText = reviews.map((r) => r.text ?? r.comment ?? "").join(" ");
    if (/demora|lento|espera|resposta/i.test(reviewText)) principalReclamacao = "demora na resposta mencionada em avaliações públicas";
    else if (/whatsapp|mensagem/i.test(reviewText)) principalReclamacao = "atendimento por mensagem mencionado em avaliações públicas";
    else if (/preço|caro|valor/i.test(reviewText)) principalReclamacao = "percepção de preço mencionada em avaliações públicas";
  }

  const socios = (lead.dadosPj as any)?.socios as Array<{ nome: string }> | undefined;
  const donoNome = socios?.[0]?.nome ?? (meta.dono_nome as string) ?? "o responsável";

  const vars: Record<string, string> = {
    segmento_produto: (meta.categoria as string) ?? (meta.setor as string) ?? "seu segmento",
    segmento:         (meta.setor as string) ?? (meta.categoria as string) ?? "seu segmento",
    cidade:           (meta.localidade as string) ?? (meta.cidade as string) ?? "sua cidade",
    dono_nome:        donoNome,
    nome_gatekeeper:  nomeGatekeeper,
    principal_reclamacao: principalReclamacao,
    vendedor_nome:    vendedorNome,
    nome_atendente:   "",
    tempo_espera:     "pouco tempo",
    status_resposta:  "ainda não tive resposta",
    dia_sugestao_1:   diaSugestao1,
    dia_sugestao_2:   diaSugestao2,
    hora_sugestao_1:  horaSugestao1,
    empresa_nome:     empresaNome,
    nome_lead:        lead.nome ?? "",
    empresa_lead:     lead.empresa ?? lead.nome ?? "",
    lp_url:           dossier?.lpUrl ?? "",
  };

  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }

  result = result.replace(/\{[^}]+\}/g, "");

  log.info({ leadId, tenantId }, "sdrService: template variables resolved");
  return result;
}

// ── Select best template for cenario ─────────────────────────────────────────

export async function getTemplateForCenario(
  tenantId: string,
  cenario: string,
  ordem: number = 1,
): Promise<string | null> {
  const [tenantTpl] = await db
    .select({ template: sdrTemplatesTable.template })
    .from(sdrTemplatesTable)
    .where(and(
      eq(sdrTemplatesTable.tenantId, tenantId),
      eq(sdrTemplatesTable.cenario, cenario),
      eq(sdrTemplatesTable.ordem, ordem),
      eq(sdrTemplatesTable.ativo, true),
    ))
    .limit(1);
  if (tenantTpl) return tenantTpl.template;

  const [globalTpl] = await db
    .select({ template: sdrTemplatesTable.template })
    .from(sdrTemplatesTable)
    .where(and(
      isNull(sdrTemplatesTable.tenantId),
      eq(sdrTemplatesTable.cenario, cenario),
      eq(sdrTemplatesTable.ordem, ordem),
      eq(sdrTemplatesTable.ativo, true),
    ))
    .limit(1);
  return globalTpl?.template ?? null;
}

async function ensureColdLandingBeforeApproach(
  leadId: string,
  tenantId: string,
  log: Logger,
): Promise<string> {
  const [lead] = await db
    .select({
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      endereco: leadsTable.endereco,
      mercadoSegmento: leadsTable.mercadoSegmento,
      logoUrl: leadsTable.logoUrl,
      websiteUrl: leadsTable.websiteUrl,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) throw new Error("Cold prospect not found for tenant");

  const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
  const dossier = dossierFromMetadata(metadata);
  if (!dossier || dossier.status !== "ready_for_outreach") {
    throw new Error("Cold prospect dossier is not ready for outreach");
  }
  if (dossier.lpUrl) return dossier.lpUrl;

  const evidence = Array.isArray(dossier.evidence) ? dossier.evidence : [];
  if (evidence.length < 2) throw new Error("Cold prospect dossier has insufficient evidence");

  const landing = await ensureColdProspectLandingPage({
    tenantId,
    leadId,
    companyName: lead.empresa ?? lead.nome,
    city: typeof dossier.lpBrief?.city === "string" ? dossier.lpBrief.city : lead.endereco,
    niche: dossier.playbook?.niche ?? lead.mercadoSegmento ?? "geral",
    segment: dossier.playbook?.segment ?? lead.mercadoSegmento ?? "geral",
    logoUrl: lead.logoUrl,
    websiteUrl: lead.websiteUrl,
    evidence,
    modules: dossier.playbook?.recommendedModules ?? ["crm", "sdr", "follow_up", "marketing", "jarvis"],
    fitScore: Number(dossier.fitScore ?? 0),
    painScore: Number(dossier.painScore ?? 0),
  });

  const updatedDossier: ColdProspectDossier = {
    ...dossier,
    lpUrl: landing.publicUrl,
    lpSiteId: landing.id,
    lpSlug: landing.siteSlug,
    lpGeneratedAt: new Date().toISOString(),
  };

  await db
    .update(leadsTable)
    .set({
      metadata: { ...metadata, coldProspectDossier: updatedDossier },
      updatedAt: new Date(),
    })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  log.info({ leadId, tenantId, lpUrl: landing.publicUrl }, "sdrService: cold prospect LP ready");
  return landing.publicUrl;
}

// ── Main entry — send first SDR approach ─────────────────────────────────────

export async function sendSdrFirstApproach(
  leadId: string,
  dealId: string | null,
  tenantId: string,
  log: Logger,
): Promise<{ sent: boolean; queuedForApproval?: boolean; taskId?: string; cenario: SdrCenario; message?: string }> {
  const cenario = await detectSdrCenario(leadId, tenantId);
  if (!cenario || cenario === "frio_revelacao") {
    log.info({ leadId, cenario }, "sdrService: no applicable scenario for first approach");
    return { sent: false, cenario };
  }

  if (cenario === "frio_teste") {
    // Throwing is intentional: leadEnrichment catches the block and cannot
    // fall through to its generic SDR fallback. The lead remains queued for a
    // later run rather than being contacted outside policy.
    await assertColdOutreachAllowed(leadId, tenantId, log);
  }

  const [agentRuntimeConfig] = await db
    .select({
      autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
      agents: agentConfigsTable.agents,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const now = new Date();
  const legacyAutonomyEnabled = Boolean(
    agentRuntimeConfig?.autonomyEnabledAt && agentRuntimeConfig.autonomyEnabledAt <= now,
  );
  const autonomyLevel = resolveAgentAutonomyLevel(
    agentRuntimeConfig?.agents,
    "sdr",
    legacyAutonomyEnabled,
  );
  const isAutonomous = autonomyLevel === "autonomous";

  const [existingPendingTask] = await db
    .select({ id: agentTasksTable.id, status: agentTasksTable.status })
    .from(agentTasksTable)
    .where(and(
      eq(agentTasksTable.tenantId, tenantId),
      eq(agentTasksTable.leadId, leadId),
      eq(agentTasksTable.agentName, "sdr"),
      eq(agentTasksTable.actionType, "enviar_whatsapp"),
    ))
    .orderBy(desc(agentTasksTable.createdAt))
    .limit(1);

  if (existingPendingTask && ["pendente_aprovacao", "aprovado", "executando"].includes(existingPendingTask.status)) {
    log.info(
      { leadId, tenantId, taskId: existingPendingTask.id, status: existingPendingTask.status },
      "sdrService: first approach task already active — skipping duplicate",
    );
    return {
      sent: existingPendingTask.status === "executando",
      queuedForApproval: existingPendingTask.status === "pendente_aprovacao" || existingPendingTask.status === "aprovado",
      taskId: existingPendingTask.id,
      cenario,
    };
  }

  const [existingActivity] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.leadId, leadId),
      eq(activitiesTable.tenantId, tenantId),
      eq(activitiesTable.tipo, "whatsapp"),
    ))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  if (existingActivity) {
    log.info({ leadId }, "sdrService: approach activity already exists — skipping");
    return { sent: false, cenario };
  }

  const [lead] = await db
    .select({
      telefone: leadsTable.telefone,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      mercadoSegmento: leadsTable.mercadoSegmento,
      source: leadsTable.source,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead?.telefone) {
    log.warn({ leadId }, "sdrService: lead has no phone — cannot send SDR WhatsApp approach");
    return { sent: false, cenario };
  }

  const [intelligence] = await db
    .select({ outreachPlan: customerIntelligenceTable.outreachPlan })
    .from(customerIntelligenceTable)
    .where(and(
      eq(customerIntelligenceTable.tenantId, tenantId),
      eq(customerIntelligenceTable.leadId, leadId),
    ))
    .limit(1);

  const outreachPlan = (intelligence?.outreachPlan ?? null) as {
    messageSuggestion?: string;
    objective?: string;
    freeValueOffer?: string;
    expectedResult?: string;
    nextStepIfPositive?: string;
  } | null;

  const queueOrExecute = async (message: string, source: string) => {
    const task = await insertAndRun({
      tenantId,
      leadId,
      agentName: "sdr",
      actionType: "enviar_whatsapp",
      resposta: message,
      extraPayload: {
        dealId: dealId ?? null,
        source,
        outreachPlan: outreachPlan ?? undefined,
      },
      isAutonomous,
      now: new Date(),
      log,
    });

    if (task.status === "concluido") {
      await db.insert(activitiesTable).values({
        tenantId,
        leadId,
        dealId: dealId ?? undefined,
        tipo: "whatsapp",
        titulo: source === "prospector_value_first"
          ? "Prospecctor — primeira abordagem de valor"
          : `SDR — ${cenario} — primeira abordagem`,
        descricao: message,
        status: "concluida",
        concluidaEm: new Date(),
        resultadoExecucao: `cenario:${cenario}|source:${source}|value_first:v1`,
      });
      return { sent: true, queuedForApproval: false, taskId: task.id, cenario, message };
    }

    log.info(
      { leadId, tenantId, taskId: task.id, autonomyLevel },
      "sdrService: approach prepared and waiting for human approval",
    );
    return { sent: false, queuedForApproval: true, taskId: task.id, cenario, message };
  };

  // Cold outbound discovered by Prospector must open as research, not as a pitch.
  // Do not send the legacy maturity survey, product claim or landing page before
  // the lead has confirmed the real project/business context.
  if (cenario === "frio_teste") {
    let resolvedProspector;
    try {
      resolvedProspector = await getAgentConfig(tenantId, "prospector");
    } catch (err) {
      log.info({ err, tenantId, leadId }, "sdrService: Prospector explicitly disabled — cold approach not sent");
      return { sent: false, cenario };
    }

    const params = (resolvedProspector?.parametros ?? {}) as Record<string, unknown>;
    const playbook = resolveProspectorPlaybook(
      params["prospectorPlaybook"],
      lead.mercadoSegmento,
      {
        ...((lead.metadata ?? {}) as Record<string, unknown>),
        lead_source: lead.source ?? "",
      },
    );
    const valueFirstMessage = outreachPlan?.messageSuggestion?.trim();
    const message = valueFirstMessage || buildProspectorOpening({
      playbook,
      leadName: lead.nome,
      companyName: lead.empresa,
      metadata: (lead.metadata ?? {}) as Record<string, unknown>,
    });

    return queueOrExecute(message, valueFirstMessage ? "prospector_value_first" : "prospector_consultive_fallback");
  }

  const rawTemplate = await getTemplateForCenario(tenantId, cenario);
  if (!rawTemplate) {
    log.warn({ leadId, cenario }, "sdrService: no active template for cenario");
    return { sent: false, cenario };
  }

  const templateMessage = await resolveTemplateVars(rawTemplate, leadId, dealId, tenantId, log);
  const message = outreachPlan?.messageSuggestion?.trim() || templateMessage;
  return queueOrExecute(message, outreachPlan?.messageSuggestion ? "customer_intelligence_value_first" : `template:${cenario}`);
}

// ── Send revelation (cenário 1, msg 2) ───────────────────────────────────────

export async function sendSdrRevelacao(
  leadId: string,
  dealId: string | null,
  tenantId: string,
  log: Logger,
  nomeAtendente?: string,
  statusResposta?: string,
): Promise<boolean> {
  const rawTemplate = await getTemplateForCenario(tenantId, "frio_revelacao", 2);
  if (!rawTemplate) return false;

  const [lead] = await db
    .select({ telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead?.telefone) return false;

  let message = await resolveTemplateVars(rawTemplate, leadId, dealId, tenantId, log);
  if (nomeAtendente) message = message.replace("{nome_atendente}", `, ${nomeAtendente}!`).replace(/\{nome_atendente\}/g, "");
  if (statusResposta) message = message.replace("{status_resposta}", statusResposta);

  await sendDirectWhatsAppMessage(tenantId, lead.telefone, message, log);

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId: dealId ?? undefined,
    tipo: "whatsapp",
    titulo: "SDR — frio_revelacao — revelação",
    descricao: message,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: "cenario:frio_revelacao|template_ordem:2",
  });

  log.info({ leadId, tenantId }, "sdrService: frio_revelacao sent");
  return true;
}

// ── 48h follow-up ─────────────────────────────────────────────────────────────

export async function sendSdrFollowup(
  leadId: string,
  dealId: string | null,
  tenantId: string,
  leadNome: string,
  leadTelefone: string,
  log: Logger,
): Promise<boolean> {
  dispatchAgentBackground({
    tenantId,
    leadId,
    mensagem: `[FOLLOW-UP AUTOMÁTICO 48h] ${leadNome.split(" ")[0]} não respondeu à abordagem inicial. ` +
      "Envie uma mensagem de follow-up natural, curta e sem pressão. " +
      "Mantenha o modelo de pesquisa consultiva e avance somente a próxima pergunta diagnóstica ainda não respondida " +
      "do playbook configurado para este tenant, sem presumir segmento, dor, produto ou solução.",
    log,
    forcedAgent: "sdr",
    scenario: {
      cold_outreach: true,
      origem: "sdr_followup_48h",
      template_ordem: 2,
    },
  });

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId: dealId ?? undefined,
    tipo: "whatsapp",
    titulo: "SDR — follow-up 48h",
    descricao: `Follow-up automático 48h para ${leadNome}`,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: "cenario:followup_48h",
  });

  log.info({ leadId, tenantId }, "sdrService: 48h follow-up dispatched via agent");
  return true;
}
