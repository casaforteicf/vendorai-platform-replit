/**
 * SDR Service — Cmd 16
 * Detects approach scenario, resolves template variables, sends first WhatsApp approach.
 */
import { and, eq, isNull, or, desc, asc } from "drizzle-orm";
import {
  db,
  leadsTable,
  activitiesTable,
  usersTable,
  dealsTable,
  sdrTemplatesTable,
  agendasTable,
  agendamentosTable,
  businessProfilesTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";

export type SdrCenario = "frio_teste" | "frio_revelacao" | "pos_visita" | "direto_dono" | "inbound_site" | null;

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

  // Cenário 3 — direct owner contact
  if ((lead.metadata as Record<string, unknown>)?.contato_tipo === "decisor") return "direto_dono";

  // Cenário 2 — post-visit without decision-maker
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
    const desc = (v.descricao ?? "").toLowerCase();
    return desc.includes("falou_com_decisor:false") || desc.includes("não falou com o decisor") || desc.includes("nao falou com o decisor");
  });
  if (visitas.length > 0 && visitaSemDecisao) return "pos_visita";

  // Cenário 1 — cold prospector lead
  if (lead.source === "prospector" && visitas.length === 0) return "frio_teste";

  // Cenário 4 — inbound: lead chegou pelo formulário do site institucional ou landing pages
  if (lead.source?.startsWith("site_")) return "inbound_site";

  return null;
}

// ── Variable resolution ───────────────────────────────────────────────────────

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

  // Deal / responsável
  let vendedorNome = "nossa equipe";
  let responsavelId: string | null = null;
  if (dealId) {
    const [deal] = await db
      .select({ assignedTo: dealsTable.assignedTo })
      .from(dealsTable)
      .where(eq(dealsTable.id, dealId))
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

  // Business profile (segmento fallback)
  const [bp] = await db
    .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);
  const empresaNome = bp?.nomeFantasia ?? bp?.razaoSocial ?? "Vendor.ai";

  // Gatekeeper from visita activity
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

  // Available agenda slots for next 2 business days
  const nextDays = nextBusinessDays(new Date(), 2);
  const diaSugestao1 = formatDia(nextDays[0]);
  const diaSugestao2 = nextDays[1] ? formatDia(nextDays[1]) : "outro dia";
  const horaSugestao1 = "10h";

  // Extract main complaint from reviews
  let principalReclamacao = "demora no atendimento";
  const reviews = (meta.reviews ?? meta.avaliações ?? []) as Array<{ text?: string; comment?: string }>;
  if (reviews.length > 0) {
    const reviewText = reviews.map((r) => r.text ?? r.comment ?? "").join(" ");
    if (/demora|lento|espera|resposta/i.test(reviewText)) principalReclamacao = "demora na resposta";
    else if (/whatsapp|mensagem/i.test(reviewText)) principalReclamacao = "atendimento no WhatsApp";
    else if (/preço|caro|valor/i.test(reviewText)) principalReclamacao = "preços";
  }

  // Dono name
  const socios = (lead.dadosPj as any)?.socios as Array<{ nome: string }> | undefined;
  const donoNome = socios?.[0]?.nome ?? (meta.dono_nome as string) ?? "o dono";

  const vars: Record<string, string> = {
    segmento_produto: (meta.categoria as string) ?? (meta.setor as string) ?? "seu segmento",
    segmento:         (meta.setor as string) ?? (meta.categoria as string) ?? "seu segmento",
    cidade:           (meta.localidade as string) ?? (meta.cidade as string) ?? "sua cidade",
    dono_nome:        donoNome,
    nome_gatekeeper:  nomeGatekeeper,
    principal_reclamacao: principalReclamacao,
    vendedor_nome:    vendedorNome,
    nome_atendente:   "", // filled when revelation fires after response
    tempo_espera:     "pouco tempo",
    status_resposta:  "ainda não tive resposta",
    dia_sugestao_1:   diaSugestao1,
    dia_sugestao_2:   diaSugestao2,
    hora_sugestao_1:  horaSugestao1,
    empresa_nome:     empresaNome,
    nome_lead:        lead.nome ?? "",
    empresa_lead:     lead.empresa ?? lead.nome ?? "",
  };

  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }

  // Strip any remaining unfilled {placeholders} with empty string
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
  // Try tenant-specific first, fallback to global (tenant_id IS NULL)
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

// ── Main entry — send first SDR approach ─────────────────────────────────────

export async function sendSdrFirstApproach(
  leadId: string,
  dealId: string | null,
  tenantId: string,
  log: Logger,
): Promise<{ sent: boolean; cenario: SdrCenario; message?: string }> {
  const cenario = await detectSdrCenario(leadId, tenantId);
  if (!cenario || cenario === "frio_revelacao") {
    log.info({ leadId, cenario }, "sdrService: no applicable scenario for first approach");
    return { sent: false, cenario };
  }

  // Check not already sent
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
    .select({ telefone: leadsTable.telefone, nome: leadsTable.nome })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead?.telefone) {
    log.warn({ leadId }, "sdrService: lead has no phone — cannot send SDR approach");
    return { sent: false, cenario };
  }

  const rawTemplate = await getTemplateForCenario(tenantId, cenario);
  if (!rawTemplate) {
    log.warn({ leadId, cenario }, "sdrService: no active template for cenario");
    return { sent: false, cenario };
  }

  const message = await resolveTemplateVars(rawTemplate, leadId, dealId, tenantId, log);

  await sendDirectWhatsAppMessage(tenantId, lead.telefone, message, log);

  // Register activity
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

  // Check not already sent revelation
  const [existingRev] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.leadId, leadId),
      eq(activitiesTable.tenantId, tenantId),
    ))
    .limit(1);

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
  const msg = `Oi ${leadNome.split(" ")[0]}! Sei que a correria é grande — só não queria que você perdesse isso. Consigo te mostrar em 15 min essa semana. Qual dia fica melhor?`;
  await sendDirectWhatsAppMessage(tenantId, leadTelefone, msg, log);

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId: dealId ?? undefined,
    tipo: "whatsapp",
    titulo: "SDR — follow-up 48h",
    descricao: msg,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: "cenario:followup_48h",
  });

  log.info({ leadId, tenantId }, "sdrService: 48h follow-up sent");
  return true;
}
