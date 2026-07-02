/**
 * Daily Agenda Summary — Job 18
 *
 * Runs every day at 08:00 BRT.
 * For each tenant, finds all agendamentos today (status=agendado/confirmado),
 * then:
 *  1. Sends a WhatsApp summary to each responsável with their full day's schedule
 *  2. Sends an individual reminder to each lead with their specific appointment
 *  3. Logs each send to notification_logs to avoid duplicates
 */
import { and, eq, gte, lt, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  agendamentosTable,
  leadsTable,
  usersTable,
  tenantsTable,
  businessProfilesTable,
  notificationLogsTable,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";

function formatData(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "long", timeZone: "America/Sao_Paulo" });
}

function formatHora(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function modalidadeLabel(ag: { modalidade: string | null; gerarMeet: boolean | null; tipo: string }): string {
  if (ag.modalidade === "meet" || ag.gerarMeet) return "Google Meet 📹";
  if (ag.modalidade === "ligacao") return "Ligação 📞";
  if (ag.modalidade === "presencial" || ag.tipo === "visita") return "Presencial 📍";
  return "Reunião";
}

function tipoEmoji(ag: { modalidade: string | null; gerarMeet: boolean | null; tipo: string }): string {
  if (ag.modalidade === "meet" || ag.gerarMeet) return "🎥";
  if (ag.modalidade === "ligacao") return "📞";
  return "📍";
}

async function alreadySent(
  referenceId: string,
  recipient: string,
  notificationType: string,
): Promise<boolean> {
  // Check for sends today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [existing] = await db
    .select({ id: notificationLogsTable.id })
    .from(notificationLogsTable)
    .where(
      and(
        eq(notificationLogsTable.referenceId, referenceId),
        eq(notificationLogsTable.recipient, recipient),
        eq(notificationLogsTable.notificationType, notificationType),
        gte(notificationLogsTable.sentAt, todayStart),
      ),
    )
    .limit(1);

  return !!existing;
}

async function logSent(
  tenantId: string,
  referenceId: string,
  recipient: string,
  channel: string,
  notificationType: string,
): Promise<void> {
  await db.insert(notificationLogsTable).values({
    tenantId,
    referenceId,
    referenceType: "agendamento",
    recipient,
    channel,
    notificationType,
  });
}

export async function runDailyAgendaSummary(log: Logger): Promise<void> {
  log.info("daily-agenda-summary: starting");

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Fetch all today's agendamentos across all tenants (status agendado/confirmado)
  const agendamentos = await db
    .select({
      id:              agendamentosTable.id,
      tenantId:        agendamentosTable.tenantId,
      tipo:            agendamentosTable.tipo,
      modalidade:      agendamentosTable.modalidade,
      titulo:          agendamentosTable.titulo,
      dataHoraInicio:  agendamentosTable.dataHoraInicio,
      dataHoraFim:     agendamentosTable.dataHoraFim,
      local:           agendamentosTable.local,
      meetLink:        agendamentosTable.meetLink,
      gerarMeet:       agendamentosTable.gerarMeet,
      responsavelId:   agendamentosTable.responsavelId,
      leadId:          agendamentosTable.leadId,
      observacoes:     agendamentosTable.observacoes,
      leadNome:        leadsTable.nome,
      leadTelefone:    leadsTable.telefone,
      responsavelNome: usersTable.name,
      responsavelPhone: usersTable.telefone,
    })
    .from(agendamentosTable)
    .leftJoin(leadsTable, eq(leadsTable.id, agendamentosTable.leadId))
    .leftJoin(usersTable, eq(usersTable.id, agendamentosTable.responsavelId))
    .where(
      and(
        gte(agendamentosTable.dataHoraInicio, todayStart),
        lt(agendamentosTable.dataHoraInicio, todayEnd),
        inArray(agendamentosTable.status, ["agendado", "confirmado"]),
      ),
    )
    .orderBy(agendamentosTable.dataHoraInicio);

  if (agendamentos.length === 0) {
    log.info("daily-agenda-summary: no agendamentos today");
    return;
  }

  // Group by tenant
  const byTenant = new Map<string, typeof agendamentos>();
  for (const ag of agendamentos) {
    const list = byTenant.get(ag.tenantId) ?? [];
    list.push(ag);
    byTenant.set(ag.tenantId, list);
  }

  for (const [tenantId, ags] of byTenant) {
    try {
      // Load business profile for company name
      const [bp] = await db
        .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.tenantId, tenantId))
        .limit(1);
      const nomeEmpresa = bp?.nomeFantasia ?? bp?.razaoSocial ?? "Vendor.ai";

      // ── 1. Responsável summary ──────────────────────────────────────────
      // Group by responsavel within this tenant
      const byResp = new Map<string, { nome: string; phone: string | null; ags: typeof ags }>();
      for (const ag of ags) {
        if (!ag.responsavelId) continue;
        const existing = byResp.get(ag.responsavelId);
        if (existing) {
          existing.ags.push(ag);
        } else {
          byResp.set(ag.responsavelId, {
            nome: ag.responsavelNome ?? "Responsável",
            phone: ag.responsavelPhone ?? null,
            ags: [ag],
          });
        }
      }

      for (const [responsavelId, { nome, phone, ags: respAgs }] of byResp) {
        if (!phone) continue;

        // Dedup: one summary per responsavel per day
        const notifType = "daily_summary";
        const dedupeKey = `${tenantId}:${responsavelId}:summary`;
        if (await alreadySent(dedupeKey, phone, notifType)) continue;

        const linhas = respAgs.map((ag) => {
          const hora = formatHora(ag.dataHoraInicio);
          const emoji = tipoEmoji(ag);
          const tipo = modalidadeLabel(ag);
          const leadNome = ag.leadNome ?? "Cliente";
          const meetPart = (ag.modalidade === "meet" || ag.gerarMeet) && ag.meetLink
            ? ` 🔗 ${ag.meetLink}`
            : ag.local ? ` — ${ag.local}` : "";
          return `${emoji} ${hora} — ${tipo} com ${leadNome}${meetPart}`;
        });

        const dataLabel = formatData(respAgs[0]!.dataHoraInicio);
        const plural = respAgs.length > 1 ? `s` : "";
        const msg = [
          `☀️ Bom dia, ${nome}! Sua agenda de ${dataLabel}:`,
          ``,
          ...linhas,
          ``,
          `Total: ${respAgs.length} compromisso${plural}. Boa sorte! — ${nomeEmpresa}`,
        ].join("\n");

        try {
          await sendDirectWhatsAppMessage(tenantId, phone, msg, log);
          await logSent(tenantId, dedupeKey, phone, "whatsapp", notifType);
          log.info({ tenantId, responsavelId, count: respAgs.length }, "daily-agenda-summary: responsavel summary sent");
        } catch (err) {
          log.warn({ err, tenantId, responsavelId }, "daily-agenda-summary: responsavel WhatsApp failed (non-fatal)");
        }
      }

      // ── 2. Lead individual reminders ────────────────────────────────────
      for (const ag of ags) {
        const phone = ag.leadTelefone;
        if (!phone) continue;

        const notifType = "daily_lead_reminder";
        if (await alreadySent(ag.id, phone, notifType)) continue;

        const hora = formatHora(ag.dataHoraInicio);
        const tipo = modalidadeLabel(ag);
        const meetPart = (ag.modalidade === "meet" || ag.gerarMeet) && ag.meetLink
          ? `\nAcesse o Google Meet: ${ag.meetLink}`
          : ag.local ? `\nLocal: ${ag.local}` : "";
        const msg = [
          `☀️ Bom dia, ${ag.leadNome ?? ""}! Lembrete: hoje às ${hora} temos ${tipo} agendado.${meetPart}`,
          ``,
          `Qualquer imprevisto, é só responder aqui. Até logo! — ${nomeEmpresa}`,
        ].join("\n");

        try {
          await sendDirectWhatsAppMessage(tenantId, phone, msg, log);
          await logSent(tenantId, ag.id, phone, "whatsapp", notifType);
          log.info({ tenantId, agendamentoId: ag.id, leadId: ag.leadId }, "daily-agenda-summary: lead reminder sent");
        } catch (err) {
          log.warn({ err, tenantId, agendamentoId: ag.id }, "daily-agenda-summary: lead WhatsApp failed (non-fatal)");
        }

        // Small delay between WhatsApp sends
        await new Promise<void>((r) => setTimeout(r, 800));
      }
    } catch (err) {
      log.error({ err, tenantId }, "daily-agenda-summary: tenant loop error (non-fatal)");
    }
  }

  log.info("daily-agenda-summary: done");
}
