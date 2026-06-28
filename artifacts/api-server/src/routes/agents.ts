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
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, agentConfigsTable, agendamentosTable, agendasTable } from "@workspace/db";
import type { Agendamento } from "@workspace/db";
import { createGoogleEvent } from "../lib/google-calendar.js";
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
  type AgentName,
  type PromptBuilder,
} from "../lib/agent-engine.js";
import { checkAgentPlan } from "../middlewares/plan-guard.js";

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

  const openaiMessages = [
    { role: "system" as const, content: buildPrompt(agentCfg.prompt, ctx) },
    ...ctx.recentMessages.map(msgToOpenAI),
    { role: "user" as const, content: mensagem },
  ];

  let resposta: string;
  let tokensUsed: number;
  try {
    ({ resposta, tokensUsed } = await callOpenAI(openaiMessages, tenantId));
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
        agendaId:       agendamentoInput.agendaId,
        gerarMeet:      agendamentoInput.gerarMeet ?? false,
        status:         "agendado",
      })
      .returning();
    agendamentoCriado = ag;
    req.log.info({ agendamentoId: ag.id, leadId }, "scheduler: agendamento created");

    // Sync to Google Calendar + optionally generate Meet link
    if (agendamentoInput.agendaId) {
      try {
        const [agenda] = await db
          .select({ googleRefreshToken: agendasTable.googleRefreshToken })
          .from(agendasTable)
          .where(eq(agendasTable.id, agendamentoInput.agendaId));

        if (agenda?.googleRefreshToken) {
          const { googleEventId, meetLink } = await createGoogleEvent(
            agendamentoInput.agendaId,
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
      : undefined
  );

  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...ctx.recentMessages.map(msgToOpenAI),
    { role: "user" as const, content: mensagem },
  ];

  let resposta: string;
  let tokensUsed: number;
  try {
    ({ resposta, tokensUsed } = await callOpenAI(openaiMessages, tenantId));
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
