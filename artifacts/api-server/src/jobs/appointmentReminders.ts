/**
 * Appointment Reminders — lembretes automáticos de agendamentos.
 *
 * runAppointmentReminders(log): cron a cada 30min, envia:
 *   - Lembrete 1 (24h antes): para agendamentos beauty e clinic
 *   - Lembrete 2 (2h antes):  idem
 *
 * handleAppointmentConfirmation(tenantId, leadId, mensagem, log):
 *   Detecta respostas SIM/NÃO e atualiza status do agendamento.
 *   Retorna true se a mensagem foi consumida (não passar para agent-dispatch).
 */
import { and, eq, gte, lte, or, isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  leadsTable,
  beautyAgendamentosTable,
  beautyServicosTable,
  beautyProfissionaisTable,
  clinicConsultasTable,
  clinicMedicosTable,
  clinicEspecialidadesTable,
  businessProfilesTable,
  activitiesTable,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import type { SpinRoteiro } from "../routes/spin.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHora(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function normalizeReply(mensagem: string): "sim" | "nao" | null {
  const t = mensagem.trim().toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove diacritics
    .replace(/[^A-Z]/g, "");
  if (t === "SIM" || t === "S") return "sim";
  if (t === "NAO" || t === "N") return "nao";
  return null;
}

// ─── Beauty reminders ─────────────────────────────────────────────────────────

async function sendBeautyReminders(
  tenantId: string,
  janelaDe: Date,
  janelaAte: Date,
  lembrete: 1 | 2,
  log: Logger,
): Promise<number> {
  const flagField = lembrete === 1 ? beautyAgendamentosTable.lembrete1Enviado : beautyAgendamentosTable.lembrete2Enviado;

  const rows = await db
    .select({
      id:          beautyAgendamentosTable.id,
      dataHora:    beautyAgendamentosTable.dataHora,
      clienteId:   beautyAgendamentosTable.clienteId,
      profissionalId: beautyAgendamentosTable.profissionalId,
      servicoId:   beautyAgendamentosTable.servicoId,
      clienteNome: leadsTable.nome,
      clienteTel:  leadsTable.telefone,
      servicoNome: beautyServicosTable.nome,
      profNome:    beautyProfissionaisTable.nome,
    })
    .from(beautyAgendamentosTable)
    .innerJoin(leadsTable,               eq(leadsTable.id,               beautyAgendamentosTable.clienteId))
    .innerJoin(beautyServicosTable,      eq(beautyServicosTable.id,      beautyAgendamentosTable.servicoId))
    .leftJoin(beautyProfissionaisTable,  eq(beautyProfissionaisTable.id, beautyAgendamentosTable.profissionalId))
    .where(
      and(
        eq(beautyAgendamentosTable.tenantId, tenantId),
        or(
          eq(beautyAgendamentosTable.status, "agendado"),
          eq(beautyAgendamentosTable.status, "confirmado"),
        ),
        gte(beautyAgendamentosTable.dataHora, janelaDe),
        lte(beautyAgendamentosTable.dataHora, janelaAte),
        eq(flagField, false),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    try {
      if (!row.clienteTel) continue;

      const hora = formatHora(row.dataHora);
      const profNome = row.profNome ?? "nosso profissional";

      const mensagem = lembrete === 1
        ? `Olá ${row.clienteNome ?? ""}! Lembrando do seu ${row.servicoNome} amanhã às ${hora} com ${profNome}. Confirma? Responda SIM ou NÃO.`
        : `Daqui a pouco é sua vez! ${row.servicoNome} às ${hora}. Te esperamos!`;

      await sendDirectWhatsAppMessage(tenantId, row.clienteTel, mensagem, log);

      const update = lembrete === 1
        ? { lembrete1Enviado: true }
        : { lembrete2Enviado: true };

      await db
        .update(beautyAgendamentosTable)
        .set(update)
        .where(eq(beautyAgendamentosTable.id, row.id));

      sent++;
      log.info({ tenantId, agendamentoId: row.id, lembrete }, "reminders/beauty: lembrete enviado");
    } catch (err) {
      log.error({ err, agendamentoId: row.id }, "reminders/beauty: falha ao enviar (non-fatal)");
    }
  }
  return sent;
}

// ─── Clinic reminders ─────────────────────────────────────────────────────────

async function sendClinicReminders(
  tenantId: string,
  janelaDe: Date,
  janelaAte: Date,
  lembrete: 1 | 2,
  log: Logger,
): Promise<number> {
  const flagField = lembrete === 1 ? clinicConsultasTable.lembrete1Enviado : clinicConsultasTable.lembrete2Enviado;

  const rows = await db
    .select({
      id:              clinicConsultasTable.id,
      dataHora:        clinicConsultasTable.dataHora,
      pacienteId:      clinicConsultasTable.pacienteId,
      pacienteNome:    leadsTable.nome,
      pacienteTel:     leadsTable.telefone,
      medicoNome:      clinicMedicosTable.nome,
      especialidadeNome: clinicEspecialidadesTable.nome,
    })
    .from(clinicConsultasTable)
    .innerJoin(leadsTable,              eq(leadsTable.id,              clinicConsultasTable.pacienteId))
    .innerJoin(clinicMedicosTable,      eq(clinicMedicosTable.id,      clinicConsultasTable.medicoId))
    .leftJoin(clinicEspecialidadesTable, eq(clinicEspecialidadesTable.id, clinicConsultasTable.especialidadeId))
    .where(
      and(
        eq(clinicConsultasTable.tenantId, tenantId),
        or(
          eq(clinicConsultasTable.status, "agendada"),
          eq(clinicConsultasTable.status, "confirmada"),
        ),
        gte(clinicConsultasTable.dataHora, janelaDe),
        lte(clinicConsultasTable.dataHora, janelaAte),
        eq(flagField, false),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    try {
      if (!row.pacienteTel) continue;

      const hora = formatHora(row.dataHora);
      const especialidade = row.especialidadeNome ?? "consulta";

      const mensagem = lembrete === 1
        ? `Olá ${row.pacienteNome ?? ""}! Lembrando da sua consulta de ${especialidade} amanhã às ${hora} com Dr(a). ${row.medicoNome}. Confirma? Responda SIM ou NÃO.`
        : `Daqui a pouco é sua consulta! ${especialidade} às ${hora}. Te esperamos!`;

      await sendDirectWhatsAppMessage(tenantId, row.pacienteTel, mensagem, log);

      const update = lembrete === 1
        ? { lembrete1Enviado: true }
        : { lembrete2Enviado: true };

      await db
        .update(clinicConsultasTable)
        .set(update)
        .where(eq(clinicConsultasTable.id, row.id));

      sent++;
      log.info({ tenantId, consultaId: row.id, lembrete }, "reminders/clinic: lembrete enviado");
    } catch (err) {
      log.error({ err, consultaId: row.id }, "reminders/clinic: falha ao enviar (non-fatal)");
    }
  }
  return sent;
}

// ─── CRM Meeting SPIN Reminders ───────────────────────────────────────────────

async function sendCrmSpinReminders(
  tenantId: string,
  janelaDe: Date,
  janelaAte: Date,
  log: Logger,
): Promise<number> {
  const rows = await db
    .select({
      id:           activitiesTable.id,
      titulo:       activitiesTable.titulo,
      dataHoraInicio: activitiesTable.dataHoraInicio,
      leadId:       activitiesTable.leadId,
      tenantId:     activitiesTable.tenantId,
      spinBriefing: activitiesTable.spinBriefing,
      leadNome:     leadsTable.nome,
    })
    .from(activitiesTable)
    .innerJoin(leadsTable, eq(leadsTable.id, activitiesTable.leadId))
    .where(
      and(
        eq(activitiesTable.tenantId, tenantId),
        eq(activitiesTable.tipo, "reuniao"),
        isNotNull(activitiesTable.spinBriefing),
        isNotNull(activitiesTable.dataHoraInicio),
        gte(activitiesTable.dataHoraInicio, janelaDe),
        lte(activitiesTable.dataHoraInicio, janelaAte),
      ),
    );

  if (!rows.length) return 0;

  const [profile] = await db
    .select({ telefone: businessProfilesTable.telefone })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);

  if (!profile?.telefone) return 0;

  let sent = 0;
  for (const row of rows) {
    try {
      let roteiro: SpinRoteiro | null = null;
      try { roteiro = row.spinBriefing ? (JSON.parse(row.spinBriefing) as SpinRoteiro) : null; } catch { null; }
      if (!roteiro) continue;

      const hora = row.dataHoraInicio ? formatHora(row.dataHoraInicio) : "–";
      const lines: string[] = [
        `🧭 *Roteiro SPIN — ${row.leadNome ?? "Lead"}*`,
        `📅 Reunião em 2h — às ${hora}`,
        ``,
        `*Abertura:* ${roteiro.abertura}`,
        ``,
        `*Situação:*`,
        ...roteiro.situacao.slice(0, 2).map((q) => `• ${q.pergunta}`),
        `*Problema:*`,
        ...roteiro.problema.slice(0, 2).map((q) => `• ${q.pergunta}`),
        `*Implicação:*`,
        ...roteiro.implicacao.slice(0, 2).map((q) => `• ${q.pergunta}`),
        `*Necessidade:*`,
        ...roteiro.necessidade.slice(0, 2).map((q) => `• ${q.pergunta}`),
        ``,
        `*Fechamento:* ${roteiro.fechamento}`,
      ];

      if (roteiro.alertas?.length) {
        lines.push(``, `⚠️ ${roteiro.alertas[0]}`);
      }

      await sendDirectWhatsAppMessage(tenantId, profile.telefone, lines.join("\n"), log);
      sent++;
      log.info({ tenantId, activityId: row.id, leadId: row.leadId }, "reminders/spin: roteiro enviado 2h antes");
    } catch (err) {
      log.error({ err, activityId: row.id }, "reminders/spin: falha ao enviar (non-fatal)");
    }
  }
  return sent;
}

// ─── runAppointmentReminders ─────────────────────────────────────────────────

export async function runAppointmentReminders(log: Logger): Promise<void> {
  log.info("reminders: iniciando verificação de lembretes");

  const now     = new Date();
  const h23     = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const h25     = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const m105    = new Date(now.getTime() + (1 * 60 + 45) * 60 * 1000); // 1h45m
  const m135    = new Date(now.getTime() + (2 * 60 + 15) * 60 * 1000); // 2h15m

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  let totalBeauty1 = 0, totalBeauty2 = 0, totalClinic1 = 0, totalClinic2 = 0, totalSpin = 0;

  for (const tenant of tenants) {
    try {
      const [b1, b2, c1, c2, spin] = await Promise.all([
        sendBeautyReminders(tenant.id, h23, h25, 1, log),
        sendBeautyReminders(tenant.id, m105, m135, 2, log),
        sendClinicReminders(tenant.id, h23, h25, 1, log),
        sendClinicReminders(tenant.id, m105, m135, 2, log),
        sendCrmSpinReminders(tenant.id, m105, m135, log),
      ]);
      totalBeauty1 += b1;
      totalBeauty2 += b2;
      totalClinic1 += c1;
      totalClinic2 += c2;
      totalSpin += spin;
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "reminders: tenant falhou (non-fatal)");
    }
  }

  log.info({ totalBeauty1, totalBeauty2, totalClinic1, totalClinic2, totalSpin }, "reminders: ciclo concluído");
}

// ─── handleAppointmentConfirmation ───────────────────────────────────────────

/**
 * Verifica se a mensagem é uma resposta SIM/NÃO para um agendamento pendente
 * nas próximas 26h. Se sim, atualiza o status e retorna true.
 * O webhook deve pular o agent-dispatch quando retornar true.
 */
export async function handleAppointmentConfirmation(
  tenantId: string,
  leadId: string,
  mensagem: string,
  log: Logger,
): Promise<boolean> {
  const reply = normalizeReply(mensagem);
  if (!reply) return false;

  const agora    = new Date();
  const limite26 = new Date(agora.getTime() + 26 * 60 * 60 * 1000);

  // Procura agendamento beauty pendente nas próximas 26h
  const [beautyAg] = await db
    .select({ id: beautyAgendamentosTable.id, status: beautyAgendamentosTable.status, tenantId: beautyAgendamentosTable.tenantId })
    .from(beautyAgendamentosTable)
    .where(
      and(
        eq(beautyAgendamentosTable.tenantId, tenantId),
        eq(beautyAgendamentosTable.clienteId, leadId),
        or(
          eq(beautyAgendamentosTable.status, "agendado"),
          eq(beautyAgendamentosTable.status, "confirmado"),
        ),
        gte(beautyAgendamentosTable.dataHora, agora),
        lte(beautyAgendamentosTable.dataHora, limite26),
      ),
    )
    .limit(1);

  if (beautyAg) {
    if (reply === "sim") {
      await db
        .update(beautyAgendamentosTable)
        .set({ status: "confirmado" })
        .where(eq(beautyAgendamentosTable.id, beautyAg.id));
      log.info({ leadId, agendamentoId: beautyAg.id }, "reminders/confirm: beauty confirmado via SIM");
    } else {
      await db
        .update(beautyAgendamentosTable)
        .set({ status: "cancelado" })
        .where(eq(beautyAgendamentosTable.id, beautyAg.id));
      log.info({ leadId, agendamentoId: beautyAg.id }, "reminders/confirm: beauty cancelado via NÃO");
      await notifyTenantCancellation(tenantId, leadId, "agendamento", log);
    }
    return true;
  }

  // Procura consulta clinic pendente nas próximas 26h
  const [clinicCon] = await db
    .select({ id: clinicConsultasTable.id, status: clinicConsultasTable.status })
    .from(clinicConsultasTable)
    .where(
      and(
        eq(clinicConsultasTable.tenantId, tenantId),
        eq(clinicConsultasTable.pacienteId, leadId),
        or(
          eq(clinicConsultasTable.status, "agendada"),
          eq(clinicConsultasTable.status, "confirmada"),
        ),
        gte(clinicConsultasTable.dataHora, agora),
        lte(clinicConsultasTable.dataHora, limite26),
      ),
    )
    .limit(1);

  if (clinicCon) {
    if (reply === "sim") {
      await db
        .update(clinicConsultasTable)
        .set({ status: "confirmada" })
        .where(eq(clinicConsultasTable.id, clinicCon.id));
      log.info({ leadId, consultaId: clinicCon.id }, "reminders/confirm: clinic confirmada via SIM");
    } else {
      await db
        .update(clinicConsultasTable)
        .set({ status: "cancelada" })
        .where(eq(clinicConsultasTable.id, clinicCon.id));
      log.info({ leadId, consultaId: clinicCon.id }, "reminders/confirm: clinic cancelada via NÃO");
      await notifyTenantCancellation(tenantId, leadId, "consulta", log);
    }
    return true;
  }

  return false;
}

// ─── notifyTenantCancellation ─────────────────────────────────────────────────

async function notifyTenantCancellation(
  tenantId: string,
  leadId: string,
  tipo: "agendamento" | "consulta",
  log: Logger,
): Promise<void> {
  try {
    const [lead] = await db
      .select({ nome: leadsTable.nome })
      .from(leadsTable)
      .where(eq(leadsTable.id, leadId));

    const [profile] = await db
      .select({ telefone: businessProfilesTable.telefone })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1);

    if (!profile?.telefone) {
      log.info({ tenantId }, "reminders/notify: sem telefone de notificação para o tenant");
      return;
    }

    const nomeLead = lead?.nome ?? "um cliente";
    const mensagem = `⚠️ Cancelamento: ${nomeLead} cancelou o ${tipo} via WhatsApp.`;

    await sendDirectWhatsAppMessage(tenantId, profile.telefone, mensagem, log);
    log.info({ tenantId, leadId }, "reminders/notify: tenant notificado do cancelamento");
  } catch (err) {
    log.error({ err, tenantId, leadId }, "reminders/notify: falha ao notificar tenant (non-fatal)");
  }
}
