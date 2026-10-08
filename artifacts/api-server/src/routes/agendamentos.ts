import { Router, type IRouter } from "express";
import { and, eq, gte, lte, lt, gt, or, inArray, isNotNull, like } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agendamentosTable,
  agendasTable,
  leadsTable,
  dealsTable,
  activitiesTable,
  usersTable,
  businessProfilesTable,
  notificationLogsTable,
  notificationsTable,
  insertAgendamentoSchema,
  updateAgendamentoSchema,
  bloqueiosAgendaTable,
} from "@workspace/db";
import type { Logger } from "pino";
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  listGoogleCalendarBusyTimes,
} from "../lib/google-calendar";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { sendMeetingInviteEmail } from "../lib/email.js";
import { generateSpinForActivity } from "./spin.js";
import { buildUserFunctionFilter } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── Handoff proativo: agendamento confirmado → aviso interno ao Closer ────────
// Sinal apenas interno (notificação + WhatsApp para o dono do deal); NUNCA
// reabre a conversa com o lead automaticamente.
async function notifyCloserOnMeetingConfirmed(
  agendamento: typeof agendamentosTable.$inferSelect,
  log: Logger
): Promise<void> {
  if (!agendamento.dealId || !agendamento.leadId) return;

  try {
    const [deal] = await db
      .select({
        id: dealsTable.id,
        etapa: dealsTable.etapa,
        assignedTo: dealsTable.assignedTo,
        titulo: dealsTable.titulo,
      })
      .from(dealsTable)
      .where(eq(dealsTable.id, agendamento.dealId));

    if (!deal || deal.etapa === "ganho" || deal.etapa === "perdido") return;

    const [lead] = await db
      .select({ nome: leadsTable.nome })
      .from(leadsTable)
      .where(eq(leadsTable.id, agendamento.leadId));

    const dataStr = new Date(agendamento.dataHoraInicio).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
    });
    const horaStr = new Date(agendamento.dataHoraInicio).toLocaleTimeString("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    });
    const leadNome = lead?.nome ?? "Lead";

    await db.insert(notificationsTable).values({
      tenantId: agendamento.tenantId,
      title: "Reunião confirmada",
      message: `${leadNome} confirmou a reunião "${agendamento.titulo}" para ${dataStr} às ${horaStr} (negócio: ${deal.titulo}). Prepare-se para conduzir o fechamento.`,
      type: "info",
      category: "meeting_confirmed",
    });

    if (deal.assignedTo) {
      const [owner] = await db
        .select({ telefone: usersTable.telefone })
        .from(usersTable)
        .where(eq(usersTable.id, deal.assignedTo));
      if (owner?.telefone) {
        const msg = `📅 Reunião confirmada\n\n${leadNome} confirmou "${agendamento.titulo}" para ${dataStr} às ${horaStr}.\nNegócio: ${deal.titulo}.\n\nPrepare-se para conduzir o fechamento.`;
        await sendDirectWhatsAppMessage(agendamento.tenantId, owner.telefone, msg, log);
      }
    }

    log.info({ agendamentoId: agendamento.id, dealId: deal.id }, "agendamento: closer notified on meeting confirmed");
  } catch (err) {
    log.warn({ err, agendamentoId: agendamento.id }, "agendamento: closer notification on confirm failed (non-fatal)");
  }
}

router.post("/agendamentos", async (req, res) => {
  const parsed = insertAgendamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.issues, body: req.body }, "agendamento validation failed");
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const leadConditions = [
    eq(leadsTable.id, parsed.data.leadId),
    eq(leadsTable.tenantId, parsed.data.tenantId),
    ...buildUserFunctionFilter(req, leadsTable),
  ];
  const [accessibleLead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(...leadConditions))
    .limit(1);
  if (!accessibleLead) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  if (parsed.data.dealId) {
    const [deal] = await db
      .select({ id: dealsTable.id, leadId: dealsTable.leadId })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, parsed.data.dealId), eq(dealsTable.tenantId, parsed.data.tenantId)))
      .limit(1);
    if (!deal || deal.leadId !== parsed.data.leadId) {
      res.status(422).json({ error: "Deal does not belong to this lead and tenant" });
      return;
    }
  }

  if (parsed.data.responsavelId) {
    const [responsavel] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, parsed.data.responsavelId), eq(usersTable.tenantId, parsed.data.tenantId)))
      .limit(1);
    if (!responsavel) {
      res.status(422).json({ error: "Responsible user does not belong to this tenant" });
      return;
    }
  }

  if (parsed.data.agendaId) {
    const [agenda] = await db
      .select({ id: agendasTable.id })
      .from(agendasTable)
      .where(and(eq(agendasTable.id, parsed.data.agendaId), eq(agendasTable.tenantId, parsed.data.tenantId)))
      .limit(1);
    if (!agenda) {
      res.status(422).json({ error: "Agenda does not belong to this tenant" });
      return;
    }
  }

  // Extra field not in DB schema — read directly from body
  const bodyLeadEmail: string | undefined = typeof req.body.leadEmail === "string" && req.body.leadEmail.trim()
    ? req.body.leadEmail.trim()
    : undefined;

  const { dataHoraInicio, dataHoraFim } = parsed.data;
  if (dataHoraFim <= dataHoraInicio) {
    res.status(422).json({ error: "dataHoraFim must be after dataHoraInicio" });
    return;
  }
  if (dataHoraInicio <= new Date()) {
    res.status(400).json({ error: "Nao e possivel agendar para uma data/horario no passado." });
    return;
  }

  // Auto-resolve agendaId: if not supplied by the caller (common in AI-driven
  // flows), fall back to the first Google Calendar-connected agenda for this
  // tenant so the Meet link is always generated when OAuth is configured.
  let resolvedInsertData = parsed.data;
  if (!parsed.data.agendaId && (parsed.data.gerarMeet || parsed.data.tipo === "reuniao")) {
    try {
      const [connectedAgenda] = await db
        .select({ id: agendasTable.id })
        .from(agendasTable)
        .where(and(eq(agendasTable.tenantId, parsed.data.tenantId), isNotNull(agendasTable.googleRefreshToken)))
        .limit(1);
      if (connectedAgenda) {
        resolvedInsertData = { ...parsed.data, agendaId: connectedAgenda.id };
        req.log.info({ agendaId: connectedAgenda.id }, "agendamento: auto-resolved agendaId from connected Google Calendar agenda");
      }
    } catch (err) {
      req.log.warn({ err }, "agendamento: agendaId auto-resolution failed (non-fatal)");
    }
  }

  let agendamento: typeof agendamentosTable.$inferSelect;
  try {
    const rows = await db
      .insert(agendamentosTable)
      .values(resolvedInsertData)
      .returning();
    agendamento = rows[0];
  } catch (err: unknown) {
    req.log.error({ err, body: req.body }, "agendamento insert failed");
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
    return;
  }

  // ── Google Calendar sync — runs BEFORE the 201 response (8-second timeout) ───
  // This ensures the agendamento returned to the caller and stored in DB already
  // contains the real meetLink before the agent dispatch reads it. Previously the
  // sync ran async after the response, causing a race condition where the scheduler
  // agent could read meetLink=null and reproduce the placeholder verbatim.
  req.log?.info({ agendaId: agendamento.agendaId, agendamentoId: agendamento.id }, "agendamento: starting Google Calendar sync");

  // calendarLead is stored here so the async WhatsApp block (after response) can
  // reference it without an extra DB round-trip.
  let calendarLead: { nome: string | null; email: string | null; telefone: string | null } | null = null;

  if (agendamento.agendaId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, agendamento.agendaId));

      req.log?.info({ agendaId: agendamento.agendaId, hasRefreshToken: !!agenda?.googleRefreshToken }, "agendamento: agenda lookup done");

      if (agenda?.googleRefreshToken) {
        const [fetchedLead] = await db
          .select({ nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
          .from(leadsTable)
          .where(eq(leadsTable.id, agendamento.leadId));
        calendarLead = fetchedLead ?? null;

        req.log.info({ agendaId: agendamento.agendaId, leadId: agendamento.leadId }, "agendamento: calling createGoogleEvent");
        const { googleEventId, meetLink } = await Promise.race([
          createGoogleEvent(
            agendamento.agendaId,
            {
              id: agendamento.id,
              tenantId: agendamento.tenantId,
              titulo: agendamento.titulo,
              dataHoraInicio: agendamento.dataHoraInicio,
              dataHoraFim: agendamento.dataHoraFim,
              observacoes: agendamento.observacoes,
              local: agendamento.local,
              gerarMeet: agendamento.gerarMeet ?? false,
              participantes: agendamento.participantes ?? [],
            },
            calendarLead?.nome ?? undefined,
            bodyLeadEmail,
            agendamento.gerarMeet ?? false
          ),
          new Promise<{ googleEventId: null; meetLink: null }>((resolve) =>
            setTimeout(() => {
              req.log.warn(
                { agendaId: agendamento.agendaId, agendamentoId: agendamento.id },
                "agendamento: Google Calendar sync timeout (8s) — continuing without meetLink",
              );
              resolve({ googleEventId: null, meetLink: null });
            }, 8000)
          ),
        ]);
        if (googleEventId || meetLink) {
          await db
            .update(agendamentosTable)
            .set({
              ...(googleEventId ? { googleEventId } : {}),
              ...(meetLink ? { meetLink } : {}),
              updatedAt: new Date(),
            })
            .where(eq(agendamentosTable.id, agendamento.id));
          // Update the in-memory object so the 201 response and all downstream code
          // (WhatsApp, email, activity) see the real meetLink without another DB fetch.
          if (googleEventId) agendamento = { ...agendamento, googleEventId };
          if (meetLink)      agendamento = { ...agendamento, meetLink };
        }
        req.log.info({ agendaId: agendamento.agendaId, googleEventId, meetLink }, "agendamento: Google Calendar sync result");
      } else {
        req.log.warn({ agendaId: agendamento.agendaId }, "agendamento: agenda has no refresh_token, skipping Google Calendar sync");
      }
    } catch (err) {
      req.log.error({ err }, "agendamento: Google Calendar sync failed on create");
    }
  }

  // ── 201 response — meetLink is now resolved (or null if sync timed out / skipped) ──
  res.status(201).json(agendamento);

  // ── Async post-processing (after response is sent) ────────────────────────────

  // WhatsApp confirmation to lead (agenda-connected path)
  if (agendamento.agendaId && calendarLead) {
    const leadPhone = calendarLead.telefone ?? null;
    if (leadPhone) {
      try {
        const dataStr = new Date(agendamento.dataHoraInicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
        const horaStr = new Date(agendamento.dataHoraInicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const modalidade = agendamento.modalidade ?? (agendamento.gerarMeet ? "meet" : "presencial");
        const meetPart = (modalidade === "meet" || agendamento.gerarMeet) && agendamento.meetLink
          ? `\nAcesse o Google Meet: ${agendamento.meetLink}`
          : agendamento.local ? `\nLocal: ${agendamento.local}` : "";
        const [bp] = await db
          .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
          .from(businessProfilesTable)
          .where(eq(businessProfilesTable.tenantId, agendamento.tenantId))
          .limit(1);
        const nomeEmpresa = bp?.nomeFantasia ?? bp?.razaoSocial ?? "Vendor.ai";
        const tipoLabel = modalidade === "meet" ? "via Google Meet" : modalidade === "ligacao" ? "por ligação" : "presencial";
        const msg = `Olá, ${calendarLead.nome ?? ""}! Reunião confirmada ${tipoLabel}: ${dataStr} às ${horaStr}.${meetPart}\nQualquer dúvida, responda aqui. Até lá! — ${nomeEmpresa}`;
        await sendDirectWhatsAppMessage(agendamento.tenantId, leadPhone, msg, req.log);
        req.log.info({ agendamentoId: agendamento.id }, "agendamento: WhatsApp confirmation sent to lead");
      } catch (waErr) {
        req.log.warn({ err: waErr, agendamentoId: agendamento.id }, "agendamento: WhatsApp confirmation failed (non-fatal)");
      }
    }
  } else if (!agendamento.agendaId && agendamento.leadId) {
    // No agenda connected — still send WhatsApp confirmation if possible
    try {
      const [lead] = await db
        .select({ nome: leadsTable.nome, telefone: leadsTable.telefone })
        .from(leadsTable)
        .where(eq(leadsTable.id, agendamento.leadId));
      const leadPhone = lead?.telefone ?? null;
      if (leadPhone) {
        const dataStr = new Date(agendamento.dataHoraInicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
        const horaStr = new Date(agendamento.dataHoraInicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const modalidade = agendamento.modalidade ?? "presencial";
        const tipoLabel = modalidade === "meet" ? "via Google Meet" : modalidade === "ligacao" ? "por ligação" : "presencial";
        const [bp] = await db
          .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
          .from(businessProfilesTable)
          .where(eq(businessProfilesTable.tenantId, agendamento.tenantId))
          .limit(1);
        const nomeEmpresa = bp?.nomeFantasia ?? bp?.razaoSocial ?? "Vendor.ai";
        const msg = `Olá, ${lead?.nome ?? ""}! Reunião confirmada ${tipoLabel}: ${dataStr} às ${horaStr}.\nQualquer dúvida, responda aqui. Até lá! — ${nomeEmpresa}`;
        await sendDirectWhatsAppMessage(agendamento.tenantId, leadPhone, msg, req.log);
      }
    } catch (waErr) {
      req.log.warn({ err: waErr }, "agendamento: WhatsApp confirmation (no-agenda path) failed (non-fatal)");
    }
  }

  // ── Email invite to lead (when enviarCliente=true and leadEmail provided) ─
  if (bodyLeadEmail) {
    try {
      const [lead2] = await db
        .select({ nome: leadsTable.nome })
        .from(leadsTable)
        .where(eq(leadsTable.id, agendamento.leadId));
      const [bp2] = await db
        .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.tenantId, agendamento.tenantId))
        .limit(1);
      const nomeEmpresa2 = bp2?.nomeFantasia ?? bp2?.razaoSocial ?? "Vendor.ai";
      const modalidade2 = agendamento.modalidade ?? (agendamento.gerarMeet ? "meet" : "presencial");
      const dataStr2 = new Date(agendamento.dataHoraInicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
      const horaStr2 = new Date(agendamento.dataHoraInicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      await sendMeetingInviteEmail({
        to: bodyLeadEmail,
        leadNome: lead2?.nome ?? "Cliente",
        nomeEmpresa: nomeEmpresa2,
        dataStr: dataStr2,
        horaStr: horaStr2,
        modalidade: modalidade2,
        meetLink: agendamento.meetLink,
        local: agendamento.local,
        observacoes: agendamento.observacoes,
      });
      req.log.info({ agendamentoId: agendamento.id, to: bodyLeadEmail }, "agendamento: email invite sent to lead");
    } catch (emailErr) {
      req.log.warn({ err: emailErr, agendamentoId: agendamento.id }, "agendamento: email invite failed (non-fatal)");
    }
  }

  // Convites por e-mail para participantes extras do cliente.
  const extraClientEmails = (agendamento.participantes ?? [])
    .filter((p) => p.tipo === "cliente" && p.email)
    .filter((p) => !bodyLeadEmail || p.email!.toLowerCase() !== bodyLeadEmail.toLowerCase());

  if (extraClientEmails.length) {
    try {
      const [bpExtra] = await db
        .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.tenantId, agendamento.tenantId))
        .limit(1);
      const nomeEmpresaExtra = bpExtra?.nomeFantasia ?? bpExtra?.razaoSocial ?? "Vendor.ai";
      const modalidadeExtra = agendamento.modalidade ?? (agendamento.gerarMeet ? "meet" : "presencial");
      const dataStrExtra = new Date(agendamento.dataHoraInicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
      const horaStrExtra = new Date(agendamento.dataHoraInicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

      for (const participante of extraClientEmails) {
        await sendMeetingInviteEmail({
          to: participante.email!,
          leadNome: participante.nome || "Participante",
          nomeEmpresa: nomeEmpresaExtra,
          dataStr: dataStrExtra,
          horaStr: horaStrExtra,
          modalidade: modalidadeExtra,
          meetLink: agendamento.meetLink,
          local: agendamento.local,
          observacoes: agendamento.observacoes,
        });
      }
    } catch (emailErr) {
      req.log.warn({ err: emailErr, agendamentoId: agendamento.id }, "agendamento: extra participant email invite failed (non-fatal)");
    }
  }

  // ── Reunião activity on lead timeline ────────────────────────────────────
  if (agendamento.leadId) {
    try {
      const modalidade = agendamento.modalidade ?? (agendamento.gerarMeet ? "meet" : "presencial");
      const tipoLabel = modalidade === "meet" ? "Google Meet" : modalidade === "ligacao" ? "Ligação" : "Presencial";
      const criadoPor = agendamento.criadoPor ?? "humano";
      const agendamentoMarker = `[agendamento:${agendamento.id}]`;
      const descricao =
        `Reunião ${tipoLabel} agendada. ` +
        `Criado por: ${criadoPor === "agente_ia" ? "Agente IA" : "Usuário"}.` +
        (agendamento.meetLink ? ` Meet: ${agendamento.meetLink}` : "") +
        ` ${agendamentoMarker}`;
      const [newActivity] = await db
        .insert(activitiesTable)
        .values({
          tenantId:       agendamento.tenantId,
          leadId:         agendamento.leadId,
          dealId:         agendamento.dealId ?? undefined,
          tipo:           "reuniao",
          titulo:         `Reunião — ${tipoLabel}`,
          descricao,
          status:         "planejado",
          dataHoraInicio: new Date(agendamento.dataHoraInicio),
          dataHoraFim:    new Date(agendamento.dataHoraFim),
          meetLink:       agendamento.meetLink ?? undefined,
        })
        .returning();
      req.log.info({ leadId: agendamento.leadId, activityId: newActivity.id, agendamentoId: agendamento.id }, "agendamento: reuniao activity created");
      generateSpinForActivity(newActivity.id, agendamento.tenantId, req.log).catch((err: unknown) => {
        req.log.warn({ err, activityId: newActivity.id }, "agendamento: SPIN generation failed (non-fatal)");
      });
    } catch (actErr) {
      req.log.warn({ err: actErr }, "agendamento: reuniao activity creation failed (non-fatal)");
    }
  }

  // ── Handoff proativo: se já criado como "confirmado", avisa o Closer ───────
  if (agendamento.status === "confirmado") {
    await notifyCloserOnMeetingConfirmed(agendamento, req.log);
  }
});

router.get("/tenants/:tenantId/agendamentos", async (req, res) => {
  const { leadId, status, from, to, agendaId } = req.query as Record<
    string,
    string | undefined
  >;

  const conditions = [
    eq(agendamentosTable.tenantId, tenantId),
  ];

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSeller = req.user?.platformRole === "tenant_seller";
  const userFn = req.user?.userFunction as string | undefined;
  const userId = req.user?.sub;
  if (!isAdmin && userId && (isSeller || userFn === "vendedor" || userFn === "representante_comercial" || userFn === "entrega")) {
    conditions.push(eq(agendamentosTable.responsavelId, userId));
  }

  if (leadId) conditions.push(eq(agendamentosTable.leadId, leadId));
  if (agendaId) conditions.push(eq(agendamentosTable.agendaId, agendaId));
  if (status)
    conditions.push(
      eq(agendamentosTable.status, status as typeof agendamentosTable.status._.data)
    );
  if (from) conditions.push(gte(agendamentosTable.dataHoraInicio, new Date(from)));
  if (to) conditions.push(lte(agendamentosTable.dataHoraInicio, new Date(to)));

  const agendamentos = await db
    .select()
    .from(agendamentosTable)
    .where(and(...conditions))
    .orderBy(agendamentosTable.dataHoraInicio);

  res.json(agendamentos);
});

// ── Slots endpoint ────────────────────────────────────────────────────────────
// GET /tenants/:tenantId/agendamentos/slots
// Query: date (YYYY-MM-DD), duracao (minutes, default 30), agendaId (optional)
//        responsavelId (legacy) or responsavelIds (comma-separated) — conflicts for all selected users
// Returns: { slots: [{start, end, label}] }
const slotsQuerySchema = z.object({
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  duracao:       z.coerce.number().int().min(15).max(240).default(30),
  agendaId:       z.string().optional(),
  responsavelId:  z.string().optional(),
  responsavelIds: z.string().optional(),
});

router.get("/tenants/:tenantId/agendamentos/slots", async (req, res) => {
  const parsed = slotsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(422).json({ error: "Query params: date (YYYY-MM-DD), duracao, agendaId?, responsavelId? ou responsavelIds?" });
    return;
  }

  const { date, duracao, agendaId, responsavelId, responsavelIds } = parsed.data;
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const selectedResponsavelIds = Array.from(new Set(
    (responsavelIds ?? responsavelId ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  ));

  // Build day boundaries in São Paulo timezone
  // We convert YYYY-MM-DD (interpreted as São Paulo local) to UTC
  const tzOffset = -3 * 60; // São Paulo (BRT = UTC-3, no DST in winter)
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const workStart = new Date(Date.UTC(year, month - 1, day, 8  - (-3), 0, 0)); // 08:00 BRT = 11:00 UTC
  const workEnd   = new Date(Date.UTC(year, month - 1, day, 18 - (-3), 0, 0)); // 18:00 BRT = 21:00 UTC

  // Collect busy periods from internal agendamentos. For multiple selected team
  // participants, a meeting conflicts when any selected user is either the
  // primary responsavelId or is stored in participantes[].userId.
  const conditions = [
    eq(agendamentosTable.tenantId, tenantId),
    lt(agendamentosTable.dataHoraInicio, workEnd),
    gt(agendamentosTable.dataHoraFim, workStart),
    inArray(agendamentosTable.status, ["agendado", "confirmado"]),
  ];

  const internalRows = await db
    .select({
      start: agendamentosTable.dataHoraInicio,
      end: agendamentosTable.dataHoraFim,
      responsavelId: agendamentosTable.responsavelId,
      participantes: agendamentosTable.participantes,
    })
    .from(agendamentosTable)
    .where(and(...conditions));

  const selectedSet = new Set(selectedResponsavelIds);
  const internal = selectedResponsavelIds.length === 0
    ? internalRows
    : internalRows.filter((row) => {
        if (row.responsavelId && selectedSet.has(row.responsavelId)) return true;
        return (row.participantes ?? []).some((p) => p.userId && selectedSet.has(p.userId));
      });

  // Collect busy periods from Google Calendar (if agendaId provided)
  let googleBusy: { start: Date; end: Date }[] = [];
  if (agendaId) {
    try {
      googleBusy = await listGoogleCalendarBusyTimes(agendaId, workStart, workEnd);
    } catch (e) {
      req.log.warn({ err: e, agendaId }, "slots: Google Calendar lookup failed (non-fatal)");
    }
  }

  // Bloqueios de agenda (Bloqueio de agenda feature) — subtract periods where
  // the responsavel is marked unavailable. dia_inteiro blocks the full
  // workday; manha/tarde block half the day.
  let bloqueioBusy: { start: Date; end: Date }[] = [];
  if (selectedResponsavelIds.length) {
    const bloqueios = await db
      .select({ dataInicio: bloqueiosAgendaTable.dataInicio, dataFim: bloqueiosAgendaTable.dataFim, periodo: bloqueiosAgendaTable.periodo })
      .from(bloqueiosAgendaTable)
      .where(
        and(
          inArray(bloqueiosAgendaTable.responsavelId, selectedResponsavelIds),
          lt(bloqueiosAgendaTable.dataInicio, workEnd),
          gt(bloqueiosAgendaTable.dataFim, workStart)
        )
      );

    const morningEnd = new Date(Date.UTC(year, month - 1, day, 12 - -3, 0, 0)); // 12:00 BRT
    const afternoonStart = new Date(Date.UTC(year, month - 1, day, 13 - -3, 0, 0)); // 13:00 BRT

    for (const b of bloqueios) {
      if (b.periodo === "manha") bloqueioBusy.push({ start: workStart, end: morningEnd });
      else if (b.periodo === "tarde") bloqueioBusy.push({ start: afternoonStart, end: workEnd });
      else bloqueioBusy.push({ start: workStart, end: workEnd }); // dia_inteiro
    }
  }

  const busy = [
    ...internal.map((r) => ({ start: new Date(r.start), end: new Date(r.end) })),
    ...googleBusy,
    ...bloqueioBusy,
  ];

  // Build candidate slots at 30-min intervals within working hours
  const slotMinutes = duracao;
  const slots: { start: string; end: string; label: string }[] = [];
  let cursor = new Date(workStart);

  while (cursor < workEnd) {
    const slotEnd = new Date(cursor.getTime() + slotMinutes * 60_000);
    if (slotEnd > workEnd) break;

    // Check conflict
    const hasConflict = busy.some((b) => b.start < slotEnd && b.end > cursor);
    if (!hasConflict) {
      const label = cursor.toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      });
      slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString(), label });
    }

    cursor = new Date(cursor.getTime() + 30 * 60_000); // advance by 30-min increments
  }

  res.json({ slots });
});

const disponibilidadeQuerySchema = z.object({
  responsavelId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

router.get(
  "/tenants/:tenantId/agendamentos/disponibilidade",
  async (req, res) => {
    const parsed = disponibilidadeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(422).json({
        error:
          "Query params required: responsavelId, from (ISO date), to (ISO date)",
      });
      return;
    }

    const tenantId = String(req.params.tenantId);
    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const { responsavelId, from, to } = parsed.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      res.status(422).json({ error: "Invalid date format for from or to" });
      return;
    }

    if (toDate <= fromDate) {
      res.status(422).json({ error: "to must be after from" });
      return;
    }

    const conflitos = await db
      .select()
      .from(agendamentosTable)
      .where(
        and(
          eq(agendamentosTable.tenantId, String(req.params.tenantId)),
          eq(agendamentosTable.responsavelId, responsavelId),
          lt(agendamentosTable.dataHoraInicio, toDate),
          gt(agendamentosTable.dataHoraFim, fromDate)
        )
      )
      .orderBy(agendamentosTable.dataHoraInicio);

    res.json({
      disponivel: conflitos.length === 0,
      conflitos,
    });
  }
);

router.get("/agendamentos/:id", async (req, res) => {
  const [agendamento] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!agendamento) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && agendamento.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const role = req.user?.platformRole;
  const fn = req.user?.userFunction as string | undefined;
  const isSeller =
    role === "tenant_seller" || fn === "vendedor" || fn === "representante_comercial" || fn === "entrega";
  const isAdmin =
    role === "super_admin" || role === "tenant_admin";

  if (!isAdmin && isSeller && agendamento.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this agendamento" });
    return;
  }

  res.json(agendamento);
});

router.patch("/agendamentos/:id", async (req, res) => {
  const parsed = updateAgendamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdminPatch = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSellerPatch = req.user?.platformRole === "tenant_seller";
  const userFnPatch = req.user?.userFunction as string | undefined;
  const userIdPatch = req.user?.sub;
  if (!isAdminPatch && userIdPatch && (isSellerPatch || userFnPatch === "vendedor" || userFnPatch === "representante_comercial" || userFnPatch === "entrega")) {
    if (existing.responsavelId !== userIdPatch) {
      res.status(403).json({ error: "Acesso negado: este agendamento pertence a outro responsável" });
      return;
    }
  }

  const data = parsed.data;
  if (
    data.dataHoraInicio &&
    data.dataHoraFim &&
    data.dataHoraFim <= data.dataHoraInicio
  ) {
    res.status(422).json({ error: "dataHoraFim must be after dataHoraInicio" });
    return;
  }
  if (data.dataHoraInicio && data.dataHoraInicio <= new Date()) {
    res.status(400).json({ error: "Nao e possivel agendar para uma data/horario no passado." });
    return;
  }

  const [agendamento] = await db
    .update(agendamentosTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agendamentosTable.id, existing.id))
    .returning();

  res.json(agendamento);

  // Async Google Calendar sync — update existing event
  const agendaId = agendamento.agendaId ?? existing.agendaId;
  if (agendaId && agendamento.googleEventId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, agendaId));

      if (agenda?.googleRefreshToken) {
        const [lead] = await db
          .select({ nome: leadsTable.nome })
          .from(leadsTable)
          .where(eq(leadsTable.id, agendamento.leadId));

        await updateGoogleEvent(agendaId, agendamento, lead?.nome ?? undefined, agendamento.googleEventId);
      }
    } catch (err) {
      req.log.warn({ err }, "Google Calendar sync failed on update");
    }
  }

  // Fix 3: If gerarMeet=true but no event was ever created (original sync failed silently),
  // retry creating the Calendar event so the lead gets a real meet link on reschedule.
  if (agendaId && !agendamento.googleEventId && agendamento.gerarMeet && !agendamento.meetLink) {
    try {
      const [agendaRetry] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, agendaId));

      if (agendaRetry?.googleRefreshToken) {
        const [leadRetry] = await db
          .select({ nome: leadsTable.nome, email: leadsTable.email })
          .from(leadsTable)
          .where(eq(leadsTable.id, agendamento.leadId));

        const { googleEventId: newEventId, meetLink: newMeetLink } = await createGoogleEvent(
          agendaId,
          {
            id: agendamento.id,
            tenantId: agendamento.tenantId,
            titulo: agendamento.titulo,
            dataHoraInicio: agendamento.dataHoraInicio,
            dataHoraFim: agendamento.dataHoraFim,
            observacoes: agendamento.observacoes,
            local: agendamento.local,
            gerarMeet: true,
            participantes: agendamento.participantes ?? [],
          },
          leadRetry?.nome ?? undefined,
          leadRetry?.email ?? undefined,
          true,
        );
        if (newEventId || newMeetLink) {
          await db
            .update(agendamentosTable)
            .set({
              ...(newEventId   ? { googleEventId: newEventId } : {}),
              ...(newMeetLink  ? { meetLink: newMeetLink }      : {}),
              updatedAt: new Date(),
            })
            .where(eq(agendamentosTable.id, agendamento.id));
          req.log.info(
            { agendamentoId: agendamento.id, newEventId, newMeetLink },
            "agendamento: Calendar event created on PATCH retry (original sync had failed)",
          );
        }
      }
    } catch (err) {
      req.log.warn({ err, agendamentoId: agendamento.id }, "agendamento: Calendar event creation on PATCH retry failed (non-fatal)");
    }
  }

  // ── Sync linked reuniao activity ──────────────────────────────────────────
  if (existing.leadId) {
    try {
      const actUpd: Record<string, unknown> = { updatedAt: new Date() };
      if (data.dataHoraInicio) actUpd.dataHoraInicio = data.dataHoraInicio;
      if (data.dataHoraFim)    actUpd.dataHoraFim    = data.dataHoraFim;
      if (agendamento.meetLink) actUpd.meetLink = agendamento.meetLink;
      if (data.status === "cancelado") actUpd.status = "cancelada";
      if (Object.keys(actUpd).length > 1) {
        await db
          .update(activitiesTable)
          .set(actUpd)
          .where(
            and(
              eq(activitiesTable.tenantId, existing.tenantId),
              eq(activitiesTable.leadId,   existing.leadId),
              eq(activitiesTable.tipo,     "reuniao"),
              like(activitiesTable.descricao, `%[agendamento:${existing.id}]%`),
            ),
          );
      }
    } catch (actErr) {
      req.log.warn({ err: actErr }, "agendamento: activity sync on update failed (non-fatal)");
    }
  }

  // ── Handoff proativo: transição para "confirmado" avisa o Closer ───────────
  if (existing.status !== "confirmado" && agendamento.status === "confirmado") {
    await notifyCloserOnMeetingConfirmed(agendamento, req.log).catch((err) => {
      req.log.warn({ err }, "agendamento: closer notification on update failed (non-fatal)");
    });
  }
});

router.delete("/agendamentos/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agendamentosTable)
    .where(eq(agendamentosTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agendamento not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdminDelete = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSellerDelete = req.user?.platformRole === "tenant_seller";
  const userFnDelete = req.user?.userFunction as string | undefined;
  const userIdDelete = req.user?.sub;
  if (!isAdminDelete && userIdDelete && (isSellerDelete || userFnDelete === "vendedor" || userFnDelete === "representante_comercial" || userFnDelete === "entrega")) {
    if (existing.responsavelId !== userIdDelete) {
      res.status(403).json({ error: "Acesso negado: este agendamento pertence a outro responsável" });
      return;
    }
  }

  await db.delete(agendamentosTable).where(eq(agendamentosTable.id, existing.id));
  res.status(204).send();

  // ── Cancel linked reuniao activity ────────────────────────────────────────
  if (existing.leadId) {
    try {
      await db
        .update(activitiesTable)
        .set({ status: "cancelada", updatedAt: new Date() })
        .where(
          and(
            eq(activitiesTable.tenantId, existing.tenantId),
            eq(activitiesTable.leadId,   existing.leadId),
            eq(activitiesTable.tipo,     "reuniao"),
            like(activitiesTable.descricao, `%[agendamento:${existing.id}]%`),
          ),
        );
    } catch (actErr) {
      req.log.warn({ err: actErr }, "agendamento: activity cancel on delete failed (non-fatal)");
    }
  }

  // Async Google Calendar delete
  if (existing.agendaId && existing.googleEventId) {
    try {
      const [agenda] = await db
        .select({ googleRefreshToken: agendasTable.googleRefreshToken })
        .from(agendasTable)
        .where(eq(agendasTable.id, existing.agendaId));

      if (agenda?.googleRefreshToken) {
        await deleteGoogleEvent(existing.agendaId, existing.googleEventId);
      }
    } catch (err) {
      req.log.warn({ err }, "Google Calendar sync failed on delete");
    }
  }
});

export default router;
