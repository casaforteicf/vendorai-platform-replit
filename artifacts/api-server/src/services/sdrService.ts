/**
 * SDR Service — Cmd 16
 * Detects approach scenario, resolves template variables, sends first WhatsApp approach.
 */
import { and, eq, isNull, desc, or, sql } from "drizzle-orm";
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
} from "@workspace/db";
import type { Logger } from "pino";
import { sendDirectWhatsAppMessage, sendOutgoingMessage } from "./omnichannel.js";
import { dispatchAgentBackground } from "./agent-dispatch.js";
import { ensureColdProspectLandingPage } from "./coldProspectLandingPage.js";
import type { ColdEvidence, ColdOutreachChannel, ColdOutreachChannelPlan } from "../lib/coldProspectQuality.js";
import { PROSPECTOR_COLD_CADENCE, type ProspectorCadenceStep } from "../lib/prospector-cold-cadence.js";
import {
  buildProspectorEmailSubject,
  sendProspectorColdEmail,
} from "./prospector-email.js";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { getAgentConfig } from "../lib/agent-engine.js";
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
  preferredChannel?: ColdOutreachChannel | null;
  outreachChannels?: ColdOutreachChannelPlan[];
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
  channel: "whatsapp" | "email",
  log: Logger,
  sourceMessageId?: string | null,
): Promise<void> {
  let [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.tenantId, tenantId),
      eq(conversationsTable.leadId, leadId),
      eq(conversationsTable.channel, channel),
    ))
    .orderBy(desc(conversationsTable.ultimaMensagemEm))
    .limit(1);

  if (!conversation) {
    [conversation] = await db
      .insert(conversationsTable)
      .values({
        tenantId,
        leadId,
        channel,
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
    canal: channel,
    sourceMessageId: sourceMessageId ?? null,
    provider: channel === "email" ? "resend" : null,
  });

  await db
    .update(conversationsTable)
    .set({ ultimaMensagemEm: new Date(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  log.debug({ tenantId, leadId, conversationId: conversation.id, channel }, "sdrService: Prospecctor outbound persisted");
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
): Promise<{ sent: boolean; cenario: SdrCenario; message?: string; channel?: "whatsapp" | "email" }> {
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

  const [existingActivity] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.leadId, leadId),
      eq(activitiesTable.tenantId, tenantId),
      or(eq(activitiesTable.tipo, "whatsapp"), eq(activitiesTable.tipo, "email")),
      or(
        sql`${activitiesTable.resultadoExecucao} LIKE '%prospector_consultivo:%'`,
        sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:%|template_ordem:1%'`,
      ),
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
      email: leadsTable.email,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      mercadoSegmento: leadsTable.mercadoSegmento,
      source: leadsTable.source,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) {
    log.warn({ leadId }, "sdrService: lead not found for first approach");
    return { sent: false, cenario };
  }

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
    const message = buildProspectorOpening({
      playbook,
      leadName: lead.nome,
      companyName: lead.empresa,
      metadata: (lead.metadata ?? {}) as Record<string, unknown>,
    });

    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const dossier = dossierFromMetadata(metadata);
    const executableChannels = (dossier?.outreachChannels ?? []).filter((item) => item.autoExecutable);
    const preferredChannel =
      (dossier?.preferredChannel && executableChannels.some((item) => item.channel === dossier.preferredChannel)
        ? dossier.preferredChannel
        : null) ??
      (lead.telefone && executableChannels.some((item) => item.channel === "whatsapp") ? "whatsapp" : null) ??
      (lead.email && executableChannels.some((item) => item.channel === "email") ? "email" : null);

    if (preferredChannel === "whatsapp" && lead.telefone) {
      // Usa o omnichannel canônico para aproveitar conexão QR/Evolution ativa e
      // persistir corretamente a conversa. O quality gate só libera cold-start
      // WhatsApp quando há transporte de texto livre.
      await sendOutgoingMessage({
        tenantId,
        leadId,
        conteudo: message,
        canal: "whatsapp",
        agentName: "sdr",
      }, log);
    } else if (preferredChannel === "email" && lead.email) {
      const [bp] = await db
        .select({ nomeFantasia: businessProfilesTable.nomeFantasia })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.tenantId, tenantId))
        .limit(1);
      const emailResult = await sendProspectorColdEmail({
        to: lead.email,
        leadId,
        subject: buildProspectorEmailSubject(lead.empresa ?? lead.nome),
        body: message,
        tenantName: bp?.nomeFantasia ?? null,
      });
      await recordProspectorOutboundMessage(
        tenantId,
        leadId,
        message,
        "email",
        log,
        emailResult.id,
      );
    } else {
      log.info(
        { leadId, tenantId, preferredChannel, executableChannels },
        "sdrService: no executable cold channel available at send time",
      );
      return { sent: false, cenario };
    }

    await db.insert(activitiesTable).values({
      tenantId,
      leadId,
      dealId: dealId ?? undefined,
      tipo: preferredChannel,
      titulo: `Prospecctor — primeira abordagem consultiva — ${preferredChannel}`,
      descricao: message,
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: `cenario:frio_teste|template_ordem:1|prospector_consultivo:v3|channel:${preferredChannel}`,
    });

    log.info({ leadId, tenantId, channel: preferredChannel }, "sdrService: Prospecctor research-first opening sent");
    return { sent: true, cenario, message, channel: preferredChannel };
  }

  if (!lead.telefone) {
    log.warn({ leadId, cenario }, "sdrService: legacy SDR scenario requires phone");
    return { sent: false, cenario };
  }

    const rawTemplate = await getTemplateForCenario(tenantId, cenario);
  if (!rawTemplate) {
    log.warn({ leadId, cenario }, "sdrService: no active template for cenario");
    return { sent: false, cenario };
  }

  const message = await resolveTemplateVars(rawTemplate, leadId, dealId, tenantId, log);
  await sendDirectWhatsAppMessage(tenantId, lead.telefone, message, log);

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId: dealId ?? undefined,
    tipo: "whatsapp",
    titulo: `SDR — ${cenario} — primeira abordagem`,
    descricao: message,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: `cenario:${cenario}|template_ordem:1`,
  });

  log.info({ leadId, tenantId, cenario }, "sdrService: first SDR approach sent");
  return { sent: true, cenario, message };
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

const DEFAULT_PROSPECTOR_FOLLOWUP: ProspectorCadenceStep = PROSPECTOR_COLD_CADENCE[0]!;

export async function sendSdrFollowup(
  leadId: string,
  dealId: string | null,
  tenantId: string,
  leadNome: string,
  leadTelefone: string,
  log: Logger,
  step: ProspectorCadenceStep = DEFAULT_PROSPECTOR_FOLLOWUP,
): Promise<boolean> {
  // Follow-up frio obedece exatamente as mesmas regras de horário, opt-out,
  // lead desativado e bloqueio usadas na primeira abordagem.
  await assertColdOutreachAllowed(leadId, tenantId, log);

  dispatchAgentBackground({
    tenantId,
    leadId,
    mensagem: `[CADÊNCIA FRIA PROSPECCTOR — ${step.label}] ${leadNome.split(" ")[0]} ainda não respondeu. ` +
      step.instruction + " " +
      "Mantenha o modelo de pesquisa consultiva, use apenas evidências verificadas já existentes e não presuma segmento, dor, produto ou solução.",
    log,
    forcedAgent: "sdr",
    scenario: {
      cold_outreach: true,
      origem: `prospector_${step.key}`,
      prospector_cadence_step: step.key,
      template_ordem: step.key === "followup_48h" ? 2 : step.key === "followup_120h" ? 3 : 4,
    },
  });

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId: dealId ?? undefined,
    tipo: "whatsapp",
    titulo: `Prospecctor — cadência fria — ${step.label}`,
    descricao: `Cadência automática ${step.label} para ${leadNome}`,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: `cenario:${step.key}|prospector_cadence:v2`,
  });

  log.info({ leadId, tenantId, step: step.key }, "sdrService: Prospecctor cadence step dispatched");
  return true;
}
