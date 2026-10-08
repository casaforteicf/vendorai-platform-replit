/**
 * AI Agent routes — 7 agents completos.
 *
 * POST /tenants/:tenantId/agents/sdr/process          — qualificação consultiva
 * POST /tenants/:tenantId/agents/closer/process        — fechamento / objeções
 * POST /tenants/:tenantId/agents/followup/process      — reativação suave de leads parados
 * POST /tenants/:tenantId/agents/reactivation/process  — reativação de alto churnRisk / inatividade severa
 * POST /tenants/:tenantId/agents/scheduler/process     — agendamento de reuniões
 * POST /tenants/:tenantId/agents/service/process       — suporte pós-venda
 * POST /tenants/:tenantId/agents/onboarding/process    — boas-vindas a novo cliente
 *
 * Shared engine logic lives in lib/agent-engine.ts.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, agentConfigsTable, agendamentosTable, agendasTable, leadsTable } from "@workspace/db";
import type { Agendamento } from "@workspace/db";
import { createGoogleEvent } from "../lib/google-calendar.js";
import { detectMeetingIntent } from "../lib/detect-meeting-intent.js";
import { prepareSupportAiIntake } from "../services/support-ai-intake.js";
import { resolverContextoNegocio } from "../services/resolvedorContextoNegocio.js";
import { formatCloserWinningResponsesPrompt, loadCloserWinningResponses } from "../lib/closer-winning-response-memory.js";
import {
  loadContext,
  computeLimits,
  callOpenAI,
  updateCounters,
  insertAndRun,
  msgToOpenAI,
  buildSdrPrompt,
  buildCloserPrompt,
  buildFollowupPrompt,
  buildReactivationPrompt,
  buildSchedulerPrompt,
  buildServicePrompt,
  buildOnboardingPrompt,
  getAgentConfig,
  AGENT_NAME_TO_KEY,
  classifyBusinessActivity,
  type AgentName,
  type PromptBuilder,
} from "../lib/agent-engine.js";
import { checkAgentPlan } from "../middlewares/plan-guard.js";
import { buildUserFunctionFilter } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── Shared body schema ────────────────────────────────────────────────────────
const processBodySchema = z.object({
  leadId:   z.string().min(1, "leadId is required"),
  mensagem: z.string().min(1, "mensagem is required"),
});

// ── Scheduler body extends with optional agendamento ─────────────────────────
const schedulerBodySchema = processBodySchema.extend({
  agendamento: z.object({
    tipo:           z.enum(["reuniao", "visita", "consulta", "instalacao"]).default("reuniao"),
    titulo:         z.string().optional(),
    dataHoraInicio: z.coerce.date(),
    dataHoraFim:    z.coerce.date(),
    local:          z.string().optional(),
    observacoes:    z.string().optional(),
    agendaId:       z.string().optional(),
    gerarMeet:      z.boolean().optional(),
  }).optional(),
});

// ═════════════════════════════════════════════════════════════════════════════
//  CORE HANDLER (genérico para 6 dos 7 agentes)
// ═════════════════════════════════════════════════════════════════════════════

async function handleAgentProcess(
  req:         Request,
  res:         Response,
  agentName:   AgentName,
  buildPrompt: PromptBuilder
): Promise<void> {
  const { tenantId } = req.params as { tenantId: string };

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = processBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const { leadId, mensagem } = parsed.data;

  const leadAccessConditions = [
    eq(leadsTable.id, leadId),
    eq(leadsTable.tenantId, tenantId),
    ...buildUserFunctionFilter(req, leadsTable),
  ];
  const [accessibleLead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(...leadAccessConditions))
    .limit(1);

  if (!accessibleLead) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) { res.status(400).json({ error: "Agente não configurado", code: "AGENT_NOT_CONFIGURED" }); return; }

  // Check plan authorization
  const planCheck = await checkAgentPlan(tenantId, agentName, req.log, leadId);
  if (!planCheck.allowed) {
    res.status(403).json({ error: planCheck.reason });
    return;
  }

  const agentCfg = config.agents?.[agentName];
  if (!agentCfg?.enabled) { res.status(422).json({ error: `Agent "${agentName}" is not enabled for this tenant` }); return; }

  const limits = computeLimits(config);
  if (!limits.ok) { res.status(limits.httpStatus).json(limits.body); return; }

  const ctx = await loadContext(tenantId, leadId);
  if (!ctx) { res.status(404).json({ error: `Lead "${leadId}" not found in this tenant` }); return; }

  // Business Intelligence Core: resolve only the knowledge relevant to this
  // lead/message instead of relying on a single static tenant briefing.
  let contextoNegocioDinamico = "";
  try {
    const contextoNegocioResolvido = await resolverContextoNegocio({
      tenantId,
      role: agentName,
      query: [
        mensagem,
        ctx.lead.objetivo,
        ctx.lead.dorPrincipal,
        ctx.ci?.intentAnalysis,
        ctx.ci?.goalAnalysis,
        ctx.ci?.nextBestAction,
      ].filter(Boolean).join(" | "),
    });
    contextoNegocioDinamico = contextoNegocioResolvido.blocoPrompt;
    req.log.debug(
      {
        tenantId,
        leadId,
        quantidadeFontes: contextoNegocioResolvido.fontes.length,
        idsFontes: contextoNegocioResolvido.fontes.slice(0, 12).map((fonte) => fonte.id),
      },
      "agents: contexto dinâmico de inteligência do negócio resolvido",
    );
  } catch (err) {
    req.log.warn({ err, tenantId, leadId }, "agents: resolvedor de inteligência do negócio indisponível (não fatal)");
  }

  // ── SDR: classificar atividade do negócio (não-bloqueante, 1 vez por lead) ─
  if (agentName === "sdr") {
    void classifyBusinessActivity(tenantId, ctx.lead, req.log);
  }

  // Resolve DB-driven system prompt (falls back to hardcoded if not found)
  const agentKey = AGENT_NAME_TO_KEY[agentName];
  let resolvedSystemPrompt: string | null = null;
  if (agentKey) {
    try {
      const resolved = await getAgentConfig(tenantId, agentKey);
      resolvedSystemPrompt = resolved?.systemPrompt ?? null;
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { code?: string }).code === "AGENT_NOT_CONFIGURED") {
        res.status(400).json({ error: "Agente não configurado", code: "AGENT_NOT_CONFIGURED" });
        return;
      }
      req.log.warn({ err, agentName, tenantId }, "agents: getAgentConfig failed, using hardcoded fallback");
    }
  }

  // ── Closer: detect scheduling intent → auto-schedule via Google Calendar ───
  // When a lead asks for a meeting link and no agendamento exists yet, create one
  // automatically (next business day 10:00 BRT) and get a real Google Meet link
  // before the LLM generates its response — so the link appears in the first reply.
  let closerEnrichedScenario: Record<string, unknown> | undefined;
  if (agentName === "service") {
    try {
      const supportIntake = await prepareSupportAiIntake({
        tenantId,
        lead: ctx.lead,
        recentMessages: ctx.recentMessages,
        currentMessage: mensagem,
        log: req.log,
      });
      if (supportIntake.state !== "none") {
        closerEnrichedScenario = {
          ...(closerEnrichedScenario ?? {}),
          supportIntake,
        };
        req.log.info(
          { tenantId, leadId, supportIntakeState: supportIntake.state, code: supportIntake.code },
          "service: support AI intake prepared",
        );
      }
    } catch (err) {
      req.log.error(
        { err, tenantId, leadId },
        "service: support AI intake failed (non-fatal)",
      );
    }
  }

  if (agentName === "closer") {
    if (detectMeetingIntent(mensagem)) {
      try {
        // Check for existing agendamento first
        const [existingAg] = await db
          .select({ meetLink: agendamentosTable.meetLink, dataHoraInicio: agendamentosTable.dataHoraInicio })
          .from(agendamentosTable)
          .where(and(
            eq(agendamentosTable.tenantId, tenantId),
            eq(agendamentosTable.leadId, leadId),
            eq(agendamentosTable.status, "agendado"),
          ))
          .orderBy(desc(agendamentosTable.dataHoraInicio))
          .limit(1);

        if (existingAg) {
          if (existingAg.meetLink) {
            closerEnrichedScenario = { meetLink: existingAg.meetLink, dataHoraInicio: existingAg.dataHoraInicio };
            req.log.info({ leadId, meetLink: existingAg.meetLink }, "closer: existing agendamento with meetLink injected");
          } else {
            // Agendamento exists but no Google Meet link yet — signal prompt to confirm link is coming
            closerEnrichedScenario = { meetingRequested: true, dataHoraInicio: existingAg.dataHoraInicio };
            req.log.info({ leadId }, "closer: existing agendamento without meetLink — using meetingRequested fallback");
          }
        } else {
          // Auto-schedule: find agenda with OAuth token
          const agendaResult = await db.execute(
            sql`SELECT id FROM agendas WHERE tenant_id = ${tenantId} AND google_refresh_token IS NOT NULL ORDER BY is_default DESC LIMIT 1`
          );
          const agendaId = (agendaResult.rows[0] as { id?: string } | undefined)?.id;

          if (agendaId) {
            // Next business day at 10:00 BRT (UTC-3)
            const now = new Date();
            const brtOffset = -3 * 60;
            const candidate = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60_000);
            candidate.setDate(candidate.getDate() + 1);
            candidate.setHours(10, 0, 0, 0);
            while (candidate.getDay() === 0 || candidate.getDay() === 6) {
              candidate.setDate(candidate.getDate() + 1);
            }
            const dataHoraInicio = new Date(candidate.getTime() - (brtOffset - now.getTimezoneOffset()) * 60_000);
            const dataHoraFim    = new Date(dataHoraInicio.getTime() + 60 * 60_000);
            const agendamentoId  = crypto.randomUUID();
            const leadNome       = ctx.lead.nome ?? "Lead";
            const titulo         = `Reunião com ${leadNome}`;

            await db.execute(
              sql`INSERT INTO agendamentos (id,tenant_id,lead_id,tipo,titulo,data_hora_inicio,data_hora_fim,status,agenda_id,gerar_meet,criado_por,created_at,updated_at)
               VALUES (${agendamentoId},${tenantId},${leadId},'reuniao',${titulo},${dataHoraInicio.toISOString()},${dataHoraFim.toISOString()},'agendado',${agendaId},true,'closer_auto',NOW(),NOW())`
            );

            req.log.info({ agendamentoId, agendaId, dataHoraInicio }, "closer: auto-agendamento created, calling Google Calendar");

            try {
              const { googleEventId, meetLink } = await createGoogleEvent(
                agendaId,
                { id: agendamentoId, tenantId, titulo, dataHoraInicio, dataHoraFim, gerarMeet: true },
                leadNome,
                undefined,
                true
              );

              if (meetLink || googleEventId) {
                await db.execute(
                  sql`UPDATE agendamentos SET meet_link=${meetLink ?? null}, google_event_id=${googleEventId ?? null}, updated_at=NOW() WHERE id=${agendamentoId}`
                );
                closerEnrichedScenario = { meetLink, dataHoraInicio, autoScheduled: true };
                req.log.info({ agendamentoId, meetLink }, "closer: Meet link generated via Google Calendar");
              } else {
                req.log.warn({ agendamentoId }, "closer: Google Calendar returned no meetLink — falling back to meetingRequested");
                closerEnrichedScenario = { meetingRequested: true };
              }
            } catch (gcalErr) {
              req.log.warn({ err: gcalErr }, "closer: Google Calendar failed — falling back to meetingRequested");
              closerEnrichedScenario = { meetingRequested: true };
            }
          } else {
            req.log.info({ tenantId }, "closer: scheduling intent detected but no connected Google Calendar — using meetingRequested fallback");
            closerEnrichedScenario = { meetingRequested: true };
          }
        }
      } catch (err) {
        req.log.warn({ err }, "closer: auto-schedule failed (non-fatal), using meetingRequested fallback");
        closerEnrichedScenario = { meetingRequested: true };
      }
    }
  }

  if (agentName === "closer") {
    try {
      const learnedResponses = await loadCloserWinningResponses({
        tenantId,
        segmento: ctx.lead.mercadoSegmento,
        incomingMessage: mensagem,
      });
      const learnedPrompt = formatCloserWinningResponsesPrompt(learnedResponses);
      if (learnedPrompt) {
        closerEnrichedScenario = {
          ...(closerEnrichedScenario ?? {}),
          closerWinningResponsesPrompt: learnedPrompt,
        };
        req.log.debug(
          { tenantId, leadId, learnedResponses: learnedResponses.length },
          "closer: tenant winning-response memory injected",
        );
      }
    } catch (err) {
      req.log.warn(
        { err, tenantId, leadId },
        "closer: winning-response memory unavailable (non-fatal)",
      );
    }
  }

  const basePrompt = buildPrompt(agentCfg.prompt, ctx, closerEnrichedScenario, resolvedSystemPrompt);
  const promptSistemaComInteligenciaNegocio = contextoNegocioDinamico
    ? `${basePrompt}\n\n---\n\n${contextoNegocioDinamico}`
    : basePrompt;

  const openaiMessages = [
    { role: "system" as const, content: promptSistemaComInteligenciaNegocio },
    ...ctx.recentMessages.map(msgToOpenAI),
    { role: "user" as const, content: mensagem },
  ];

  let resposta: string;
  let tokensUsed: number;
  try {
    ({ resposta, tokensUsed } = await callOpenAI(openaiMessages, tenantId, agentName, req.log));
    req.log.info({ leadId, agentName, tokensUsed }, `${agentName}: openai call succeeded`);
  } catch (err) {
    req.log.error({ err, leadId, agentName }, `${agentName}: openai call failed`);
    res.status(502).json({ error: "AI service unavailable. Please try again later." });
    return;
  }

  const now = new Date();
  await updateCounters(config, limits, tokensUsed, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  const finalTask    = await insertAndRun({ tenantId, leadId, agentName, actionType: "enviar_whatsapp", resposta, isAutonomous, now, log: req.log });

  req.log.info({ taskId: finalTask.id, status: finalTask.status, leadId, agentName, tokensUsed, isAutonomous }, `${agentName}: process complete`);
  res.status(201).json({ task: finalTask, resposta, tokensUsed, isAutonomous });
}

// ═════════════════════════════════════════════════════════════════════════════
//  SCHEDULER — handler especializado (cria agendamento se dados forem enviados)
// ═════════════════════════════════════════════════════════════════════════════

async function handleSchedulerProcess(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params as { tenantId: string };

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = schedulerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const { leadId, mensagem, agendamento: agendamentoInput } = parsed.data;

  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) { res.status(400).json({ error: "Agente não configurado", code: "AGENT_NOT_CONFIGURED" }); return; }

  const agentCfg = config.agents?.scheduler;
  if (!agentCfg?.enabled) { res.status(422).json({ error: "Agent \"scheduler\" is not enabled for this tenant" }); return; }

  // Resolve DB-driven system prompt for scheduler (agentKey = "agendamento")
  let schedulerSystemPrompt: string | null = null;
  try {
    const resolved = await getAgentConfig(tenantId, "agendamento");
    schedulerSystemPrompt = resolved?.systemPrompt ?? null;
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "AGENT_NOT_CONFIGURED") {
      res.status(400).json({ error: "Agente não configurado", code: "AGENT_NOT_CONFIGURED" });
      return;
    }
    req.log.warn({ err, tenantId }, "scheduler: getAgentConfig failed, using hardcoded fallback");
  }

  const limits = computeLimits(config);
  if (!limits.ok) { res.status(limits.httpStatus).json(limits.body); return; }

  const ctx = await loadContext(tenantId, leadId);
  if (!ctx) { res.status(404).json({ error: `Lead "${leadId}" not found in this tenant` }); return; }

  let agendamentoCriado: Agendamento | null = null;
  let meetLinkGerado: string | null = null;

  if (agendamentoInput) {
    if (agendamentoInput.dataHoraInicio <= new Date()) {
      res.status(400).json({ error: "Nao e possivel agendar para uma data/horario no passado." });
      return;
    }

    // Auto-resolve agendaId: if not supplied by the caller (common in AI-driven
    // flows where the frontend omits the field), fall back to the first Google
    // Calendar-connected agenda for this tenant so the Meet link is always
    // generated when the tenant has a valid OAuth connection.
    let resolvedAgendaId = agendamentoInput.agendaId ?? null;
    if (!resolvedAgendaId) {
      try {
        const [connectedAgenda] = await db
          .select({ id: agendasTable.id })
          .from(agendasTable)
          .where(and(eq(agendasTable.tenantId, tenantId), isNotNull(agendasTable.googleRefreshToken)))
          .limit(1);
        if (connectedAgenda) {
          resolvedAgendaId = connectedAgenda.id;
          req.log.info({ resolvedAgendaId }, "scheduler: auto-resolved agendaId from connected Google Calendar agenda");
        }
      } catch (err) {
        req.log.warn({ err }, "scheduler: agendaId auto-resolution failed (non-fatal)");
      }
    }

    const titulo = agendamentoInput.titulo ?? `Reunião com ${ctx.lead.nome}`;
    const [ag] = await db
      .insert(agendamentosTable)
      .values({
        tenantId,
        leadId,
        tipo:           agendamentoInput.tipo,
        titulo,
        dataHoraInicio: agendamentoInput.dataHoraInicio,
        dataHoraFim:    agendamentoInput.dataHoraFim,
        local:          agendamentoInput.local,
        observacoes:    agendamentoInput.observacoes,
        agendaId:       resolvedAgendaId,
        gerarMeet:      agendamentoInput.gerarMeet ?? false,
        status:         "agendado",
      })
      .returning();
    agendamentoCriado = ag;
    req.log.info({ agendamentoId: ag.id, leadId, agendaId: resolvedAgendaId }, "scheduler: agendamento created");

    // Sync to Google Calendar + optionally generate Meet link
    if (resolvedAgendaId) {
      try {
        const [agenda] = await db
          .select({ googleRefreshToken: agendasTable.googleRefreshToken })
          .from(agendasTable)
          .where(eq(agendasTable.id, resolvedAgendaId));

        if (agenda?.googleRefreshToken) {
          const { googleEventId, meetLink } = await createGoogleEvent(
            resolvedAgendaId,
            {
              id: ag.id,
              tenantId: ag.tenantId,
              titulo: ag.titulo,
              dataHoraInicio: ag.dataHoraInicio,
              dataHoraFim: ag.dataHoraFim,
              observacoes: ag.observacoes,
              local: ag.local,
              gerarMeet: agendamentoInput.gerarMeet ?? false,
            },
            ctx.lead.nome,
            ctx.lead.email ?? undefined,
            agendamentoInput.gerarMeet ?? false
          );
          if (googleEventId || meetLink) {
            await db
              .update(agendamentosTable)
              .set({
                ...(googleEventId ? { googleEventId } : {}),
                ...(meetLink ? { meetLink } : {}),
                updatedAt: new Date(),
              })
              .where(eq(agendamentosTable.id, ag.id));
          }
          meetLinkGerado = meetLink ?? null;
          if (meetLinkGerado) {
            req.log.info({ agendamentoId: ag.id, meetLink: meetLinkGerado }, "scheduler: Meet link generated");
          }
        }
      } catch (err) {
        req.log.warn({ err }, "scheduler: Google Calendar sync failed");
      }
    }
  }

  const systemPrompt = buildSchedulerPrompt(
    agentCfg.prompt,
    ctx,
    agendamentoInput
      ? {
          tipo:           agendamentoInput.tipo,
          dataHoraInicio: agendamentoInput.dataHoraInicio,
          dataHoraFim:    agendamentoInput.dataHoraFim,
          local:          agendamentoInput.local,
          meetLink:       meetLinkGerado,
        }
      : undefined,
    schedulerSystemPrompt
  );

  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...ctx.recentMessages.map(msgToOpenAI),
    { role: "user" as const, content: mensagem },
  ];

  let resposta: string;
  let tokensUsed: number;
  try {
    ({ resposta, tokensUsed } = await callOpenAI(openaiMessages, tenantId, "scheduler", req.log));
    req.log.info({ leadId, tokensUsed }, "scheduler: openai call succeeded");
  } catch (err) {
    req.log.error({ err, leadId }, "scheduler: openai call failed");
    res.status(502).json({ error: "AI service unavailable. Please try again later." });
    return;
  }

  const now = new Date();
  await updateCounters(config, limits, tokensUsed, now);

  // Scheduler is always manually triggered by the user via the UI — send immediately
  // regardless of the autonomy setting (which only controls background automation).
  const isAutonomous = true;
  const finalTask    = await insertAndRun({
    tenantId, leadId, agentName: "scheduler", actionType: "enviar_whatsapp", resposta, isAutonomous, now, log: req.log,
    ...(agendamentoCriado && { extraPayload: { agendamentoId: agendamentoCriado.id } }),
  });

  req.log.info({ taskId: finalTask.id, status: finalTask.status, leadId, tokensUsed }, "scheduler: process complete");
  res.status(201).json({ task: finalTask, resposta, tokensUsed, isAutonomous, agendamento: agendamentoCriado ?? undefined });
}

// ═════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═════════════════════════════════════════════════════════════════════════════

router.post("/tenants/:tenantId/agents/sdr/process",          (req, res) => handleAgentProcess(req, res, "sdr",         buildSdrPrompt));
router.post("/tenants/:tenantId/agents/closer/process",       (req, res) => handleAgentProcess(req, res, "closer",      buildCloserPrompt));
router.post("/tenants/:tenantId/agents/followup/process",     (req, res) => handleAgentProcess(req, res, "followup",    buildFollowupPrompt));
router.post("/tenants/:tenantId/agents/reactivation/process", (req, res) => handleAgentProcess(req, res, "reactivation",buildReactivationPrompt));
router.post("/tenants/:tenantId/agents/service/process",      (req, res) => handleAgentProcess(req, res, "service",     buildServicePrompt));
router.post("/tenants/:tenantId/agents/onboarding/process",   (req, res) => handleAgentProcess(req, res, "onboarding",  buildOnboardingPrompt));
router.post("/tenants/:tenantId/agents/scheduler/process",    handleSchedulerProcess);

export default router;
