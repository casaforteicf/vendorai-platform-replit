import { Router, type IRouter } from "express";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  agentConfigsTable,
  agendasTable,
  bugReportsTable,
  businessProfilesTable,
  db,
  instagramConnectionsTable,
  leadsTable,
  onboardingProgressTable,
  produtosCatalogoTable,
  tenantsTable,
  usersTable,
  whatsappConnectionsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import {
  appendImplementationTimeline,
  buildImplementationFollowups,
  buildImplementationPlan,
  buildImplementationReadiness,
  normalizeImplementationState,
  type FollowupDay,
  type ImplementationFacts,
  type OnboardingImplementationState,
} from "../lib/onboarding-implementation.js";

const router: IRouter = Router();
const modeSchema = z.object({ mode: z.enum(["guided", "assisted", "automatic"]) });
const acknowledgeSchema = z.object({ stepId: z.string().min(1).max(80), done: z.boolean() });
const handoffSchema = z.object({
  target: z.enum(["customer_success", "dev"]),
  reason: z.string().trim().max(2000).optional(),
});
const followupDaySchema = z.enum(["1", "3", "7", "15", "30"]);

async function getOrCreateState(tenantId: string) {
  const [progress] = await db
    .select({ implementationState: onboardingProgressTable.implementationState })
    .from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.tenantId, tenantId))
    .limit(1);

  if (progress) return normalizeImplementationState(progress.implementationState);

  const state = normalizeImplementationState(null);
  await db.insert(onboardingProgressTable).values({ tenantId, implementationState: state });
  return state;
}

async function persistState(tenantId: string, state: OnboardingImplementationState) {
  await db
    .insert(onboardingProgressTable)
    .values({ tenantId, implementationState: state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: onboardingProgressTable.tenantId,
      set: { implementationState: state, updatedAt: new Date() },
    });
}

async function readImplementationFacts(tenantId: string) {
  const [
    [tenant],
    [profile],
    [config],
    [activeUsers],
    [leads],
    [catalog],
    [whatsapp],
    [instagram],
    [calendar],
  ] = await Promise.all([
    db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
      onboardingConcluido: tenantsTable.onboardingConcluido,
      setupCompletedAt: tenantsTable.setupCompletedAt,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({ id: businessProfilesTable.id, produtos: businessProfilesTable.produtos })
      .from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      id: agentConfigsTable.id,
      setupCompletedAt: agentConfigsTable.setupCompletedAt,
      autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
      evolutionConnected: agentConfigsTable.evolutionConnected,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
    }).from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId)).limit(1),
    db.select({ value: count() }).from(usersTable)
      .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true))),
    db.select({ value: count() }).from(leadsTable).where(eq(leadsTable.tenantId, tenantId)),
    db.select({ value: count() }).from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId)),
    db.select({ id: whatsappConnectionsTable.id }).from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active"))).limit(1),
    db.select({ id: instagramConnectionsTable.id }).from(instagramConnectionsTable)
      .where(eq(instagramConnectionsTable.tenantId, tenantId)).limit(1),
    db.select({ id: agendasTable.id, googleCalendarId: agendasTable.googleCalendarId }).from(agendasTable)
      .where(eq(agendasTable.tenantId, tenantId)).limit(1),
  ]);

  if (!tenant) return null;

  const profileProducts = Array.isArray(profile?.produtos) ? profile.produtos.length : 0;
  const facts: ImplementationFacts = {
    onboardingComplete: tenant.onboardingConcluido === true || !!tenant.setupCompletedAt,
    profileConfigured: !!profile,
    activeUsers: Number(activeUsers?.value ?? 0),
    whatsappConnected: !!whatsapp || config?.evolutionConnected === true || !!(config?.metaPhoneNumberId && config?.metaAccessToken),
    instagramConnected: !!instagram,
    calendarConnected: !!calendar?.googleCalendarId,
    leadCount: Number(leads?.value ?? 0),
    catalogCount: Number(catalog?.value ?? 0),
    profileProductCount: profileProducts,
    agentsConfigured: !!config?.setupCompletedAt,
    autonomyEnabled: !!config?.autonomyEnabledAt,
  };

  return {
    tenant,
    segment: tenant.vertical ?? tenant.segmento ?? "",
    facts,
  };
}

function safeActionsFor(facts: ImplementationFacts, state: OnboardingImplementationState) {
  if (state.mode === "guided") return [];
  const actions: Array<{ id: string; label: string; description: string }> = [];
  if (facts.profileConfigured) {
    actions.push({
      id: "compile_agent_briefing",
      label: "Atualizar contexto dos agentes",
      description: "Compila novamente o briefing real da empresa para os agentes, sem publicar integrações nem alterar credenciais.",
    });
  }
  return actions;
}

async function runSafeActions(tenantId: string, state: OnboardingImplementationState) {
  const read = await readImplementationFacts(tenantId);
  if (!read) throw new Error("Tenant não encontrado");
  if (state.mode === "guided") return { state, executed: [] as string[] };

  const executed: string[] = [];
  if (read.facts.profileConfigured) {
    const { compileAgentBusinessBriefing } = await import("../lib/agentBriefingCompiler.js");
    await compileAgentBusinessBriefing(tenantId);
    executed.push("compile_agent_briefing");
  }

  if (executed.length === 0) return { state, executed };
  const now = new Date().toISOString();
  let nextState: OnboardingImplementationState = { ...state, safeActionsLastRunAt: now };
  nextState = appendImplementationTimeline(nextState, {
    type: "safe_actions_executed",
    label: "Ações seguras executadas pelo Agente de Implantação",
    at: now,
    metadata: { actions: executed },
  });
  await persistState(tenantId, nextState);
  return { state: nextState, executed };
}

async function buildSnapshot(tenantId: string) {
  const read = await readImplementationFacts(tenantId);
  if (!read) return null;
  const state = await getOrCreateState(tenantId);
  const plan = buildImplementationPlan(read.segment, read.facts, state);
  const readiness = buildImplementationReadiness(plan);
  const completed = plan.filter((step) => step.done).length;
  const nextAction = plan.find((step) => !step.done) ?? null;
  const followups = buildImplementationFollowups(state.goLiveAt, state.followupsCompleted);

  return {
    tenant: { id: read.tenant.id, name: read.tenant.name, segment: read.segment },
    status: state.goLiveAt ? "live" : readiness.ready ? "ready" : "implementing",
    mode: state.mode,
    progress: { completed, total: plan.length, percent: plan.length ? Math.round((completed / plan.length) * 100) : 100 },
    plan,
    nextAction,
    readiness,
    safeActions: safeActionsFor(read.facts, state),
    timeline: state.timeline,
    goLiveAt: state.goLiveAt,
    followups,
    handoffs: state.handoffs,
  };
}

router.get("/onboarding/implementation", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const snapshot = await buildSnapshot(tenantId);
  if (!snapshot) return res.status(404).json({ error: "Tenant não encontrado" });
  return res.json(snapshot);
});

router.patch("/onboarding/implementation/mode", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const parsed = modeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Modo inválido" });

  const previous = await getOrCreateState(tenantId);
  const now = new Date().toISOString();
  let state = appendImplementationTimeline({ ...previous, mode: parsed.data.mode }, {
    type: "mode_changed",
    label: `Modo de implantação alterado para ${parsed.data.mode}`,
    at: now,
  });
  await persistState(tenantId, state);

  if (state.mode === "automatic") {
    const result = await runSafeActions(tenantId, state);
    state = result.state;
  }

  const snapshot = await buildSnapshot(tenantId);
  return res.json(snapshot);
});

router.post("/onboarding/implementation/acknowledge", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const parsed = acknowledgeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Confirmação inválida" });

  const read = await readImplementationFacts(tenantId);
  if (!read) return res.status(404).json({ error: "Tenant não encontrado" });
  const current = await getOrCreateState(tenantId);
  const plan = buildImplementationPlan(read.segment, read.facts, current);
  const step = plan.find((item) => item.id === parsed.data.stepId);
  if (!step) return res.status(404).json({ error: "Etapa não encontrada" });
  if (!step.canAcknowledge) return res.status(409).json({ error: "Esta etapa é validada automaticamente pelo sistema" });

  const now = new Date().toISOString();
  let state: OnboardingImplementationState = {
    ...current,
    manual: { ...current.manual, [step.id]: parsed.data.done },
  };
  state = appendImplementationTimeline(state, {
    type: parsed.data.done ? "step_acknowledged" : "step_reopened",
    label: `${step.title}: ${parsed.data.done ? "confirmado" : "reaberto"}`,
    at: now,
    metadata: { stepId: step.id },
  });
  await persistState(tenantId, state);
  return res.json(await buildSnapshot(tenantId));
});

router.post("/onboarding/implementation/run-safe-actions", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const state = await getOrCreateState(tenantId);
  if (state.mode === "guided") {
    return res.status(409).json({ error: "Ações automáticas ficam disponíveis nos modos Assistido ou Automático" });
  }
  try {
    const result = await runSafeActions(tenantId, state);
    return res.json({ executed: result.executed, snapshot: await buildSnapshot(tenantId) });
  } catch (error) {
    req.log.warn({ err: error, tenantId }, "implementation safe actions failed");
    return res.status(500).json({ error: error instanceof Error ? error.message : "Falha ao executar ações seguras" });
  }
});

router.post("/onboarding/implementation/go-live", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const read = await readImplementationFacts(tenantId);
  if (!read) return res.status(404).json({ error: "Tenant não encontrado" });
  const current = await getOrCreateState(tenantId);
  if (current.goLiveAt) return res.json(await buildSnapshot(tenantId));

  const plan = buildImplementationPlan(read.segment, read.facts, current);
  const readiness = buildImplementationReadiness(plan);
  if (!readiness.ready) {
    return res.status(409).json({ error: "GO_LIVE_BLOCKED", blockers: readiness.blockers, readiness });
  }

  const now = new Date().toISOString();
  let state = appendImplementationTimeline({ ...current, goLiveAt: now }, {
    type: "go_live",
    label: "Operação liberada para go-live",
    at: now,
  });
  await persistState(tenantId, state);
  return res.json(await buildSnapshot(tenantId));
});

router.post("/onboarding/implementation/followups/:day/complete", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const parsedDay = followupDaySchema.safeParse(String(req.params.day));
  if (!parsedDay.success) return res.status(422).json({ error: "Marco de acompanhamento inválido" });
  const current = await getOrCreateState(tenantId);
  if (!current.goLiveAt) return res.status(409).json({ error: "O acompanhamento começa depois do go-live" });

  const day = parsedDay.data as FollowupDay;
  const now = new Date().toISOString();
  let state = appendImplementationTimeline({
    ...current,
    followupsCompleted: { ...current.followupsCompleted, [day]: now },
  }, {
    type: "followup_completed",
    label: `Acompanhamento D+${day} concluído`,
    at: now,
    metadata: { day },
  });
  await persistState(tenantId, state);
  return res.json(await buildSnapshot(tenantId));
});

router.post("/onboarding/implementation/handoff", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant não identificado" });
  const parsed = handoffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Handoff inválido" });
  const current = await getOrCreateState(tenantId);
  const now = new Date().toISOString();
  let state = current;

  if (parsed.data.target === "customer_success") {
    if (!current.handoffs.customerSuccessAt) {
      state = appendImplementationTimeline({
        ...current,
        handoffs: { ...current.handoffs, customerSuccessAt: now },
      }, {
        type: "handoff_customer_success",
        label: "Implantação encaminhada para Customer Success",
        at: now,
        metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
      });
      await persistState(tenantId, state);
    }
  } else if (!current.handoffs.devTicketId) {
    const snapshot = await buildSnapshot(tenantId);
    const [ticket] = await db.insert(bugReportsTable).values({
      tenantId,
      titulo: "Bloqueio técnico identificado pelo Agente de Implantação",
      descricao: [
        parsed.data.reason || "Implantação requer análise técnica.",
        snapshot?.nextAction ? `Próxima ação: ${snapshot.nextAction.title}` : "",
        snapshot?.readiness.blockers.length ? `Bloqueios: ${snapshot.readiness.blockers.map((item) => item.title).join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      categoria: "bug",
      prioridade: "alta",
      rotaAfetada: "/onboarding/implementation",
      respostaSuporte: "Encaminhado automaticamente pelo Agente de Implantação para análise técnica.",
    }).returning({ id: bugReportsTable.id });

    state = appendImplementationTimeline({
      ...current,
      handoffs: { ...current.handoffs, devAt: now, devTicketId: ticket?.id ?? null },
    }, {
      type: "handoff_dev",
      label: "Bloqueio técnico encaminhado para Dev IA",
      at: now,
      metadata: ticket?.id ? { ticketId: ticket.id } : undefined,
    });
    await persistState(tenantId, state);
  }

  return res.json(await buildSnapshot(tenantId));
});

router.get("/superadmin/tenants/:tenantId/implementation", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const snapshot = await buildSnapshot(tenantId);
  if (!snapshot) return res.status(404).json({ error: "Tenant não encontrado" });
  return res.json(snapshot);
});

export default router;
