import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, jarvisDecisionsTable, jarvisMissionsTable } from "@workspace/db";
import {
  missionTitleFromObjective,
  normalizeJarvisMissionText,
  resolveJarvisMissionNaturalIntent,
} from "../services/jarvis-mission-natural-intent.js";
import jarvisPresenceRouter from "./jarvis_presence.js";

const router: IRouter = Router();

const missionStatusSchema = z.enum(["active", "paused", "completed", "cancelled"]);
const decisionResultSchema = z.enum(["pending", "success", "partial", "failure", "unknown"]);

const createMissionSchema = z.object({
  title: z.string().trim().min(3).max(180),
  objective: z.string().trim().min(3).max(1200),
  priority: z.number().int().min(0).max(100).optional(),
  successMetric: z.string().trim().max(400).nullable().optional(),
  target: z.record(z.string(), z.unknown()).nullable().optional(),
  baseline: z.record(z.string(), z.unknown()).nullable().optional(),
  currentState: z.record(z.string(), z.unknown()).nullable().optional(),
  strategy: z.record(z.string(), z.unknown()).nullable().optional(),
  ownerUserId: z.string().trim().min(1).nullable().optional(),
  deadlineAt: z.coerce.date().nullable().optional(),
});

const updateMissionSchema = createMissionSchema.partial().extend({
  status: missionStatusSchema.optional(),
});

const createDecisionSchema = z.object({
  missionId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(3).max(180),
  question: z.string().trim().max(1200).nullable().optional(),
  decision: z.string().trim().min(3).max(2000),
  rationale: z.string().trim().max(3000).nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  alternatives: z.array(z.record(z.string(), z.unknown())).max(3).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
  expectedOutcome: z.string().trim().max(1200).nullable().optional(),
  successMetric: z.string().trim().max(400).nullable().optional(),
  reviewAt: z.coerce.date().nullable().optional(),
});

const reviewDecisionSchema = z.object({
  actualOutcome: z.string().trim().min(1).max(2000),
  resultStatus: decisionResultSchema,
});

function tenantIdOf(req: any): string | null {
  return typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
}

function userIdOf(req: any): string | null {
  return typeof req.user?.sub === "string" ? req.user.sub : null;
}

function lastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const messages = Reflect.get(body, "messages");
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object" || Reflect.get(message, "role") !== "user") continue;
    const content = Reflect.get(message, "content");
    return typeof content === "string" ? content.trim() : null;
  }
  return null;
}

function writeSse(res: any, content: string, extra: Record<string, unknown> = {}) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true, ...extra })}\n\n`);
  res.end();
}

async function resolveMissionReference(tenantId: string, reference: string) {
  const missions = await db.select().from(jarvisMissionsTable)
    .where(eq(jarvisMissionsTable.tenantId, tenantId))
    .orderBy(desc(jarvisMissionsTable.updatedAt))
    .limit(50);
  const wanted = normalizeJarvisMissionText(reference);
  const exact = missions.find((item) => normalizeJarvisMissionText(item.title) === wanted);
  if (exact) return { mission: exact, ambiguous: false };
  const candidates = missions.filter((item) => {
    const title = normalizeJarvisMissionText(item.title);
    const objective = normalizeJarvisMissionText(item.objective);
    return title.includes(wanted) || wanted.includes(title) || objective.includes(wanted);
  });
  return candidates.length === 1
    ? { mission: candidates[0]!, ambiguous: false }
    : { mission: null, ambiguous: candidates.length > 1 };
}

// Mission Engine v2: intercepta somente comandos naturais explícitos.
// Conversa comum continua no JARVIS/LLM, usando o contexto persistente das Missões.
router.post("/support/chat", async (req, res, next) => {
  const tenantId = tenantIdOf(req);
  const text = lastUserMessage(req.body);
  if (!tenantId || !text) return next();

  const intent = resolveJarvisMissionNaturalIntent(text);
  if (!intent) return next();

  try {
    if (intent.type === "create_mission") {
      const title = missionTitleFromObjective(intent.objective);
      const [mission] = await db.insert(jarvisMissionsTable).values({
        tenantId,
        title,
        objective: intent.objective,
        priority: 70,
        status: "active",
        createdByUserId: userIdOf(req),
      }).returning();
      writeSse(res, `Missão registrada e ativa: “${mission?.title ?? title}”. Vou considerar esse objetivo nas próximas conversas e decisões.`, {
        jarvisMissionAction: "created",
        missionId: mission?.id ?? null,
      });
      return;
    }

    if (intent.type === "list_missions") {
      const missions = await db.select().from(jarvisMissionsTable)
        .where(eq(jarvisMissionsTable.tenantId, tenantId))
        .orderBy(desc(jarvisMissionsTable.updatedAt))
        .limit(20);
      const active = missions.filter((item) => item.status === "active");
      const paused = missions.filter((item) => item.status === "paused");
      const content = missions.length
        ? `Você tem ${active.length} missão(ões) ativa(s) e ${paused.length} pausada(s). ${missions.slice(0, 6).map((item, index) => `${index + 1}. ${item.title} [${item.status}]`).join(" ")}`
        : "Ainda não há Missões registradas neste negócio. Você pode dizer, por exemplo: “Nossa missão é aumentar a conversão em 20% nos próximos 90 dias”.";
      writeSse(res, content, { jarvisMissionAction: "listed", missionCount: missions.length });
      return;
    }

    if (intent.type === "record_decision") {
      const activeMissions = await db.select().from(jarvisMissionsTable)
        .where(and(eq(jarvisMissionsTable.tenantId, tenantId), eq(jarvisMissionsTable.status, "active")))
        .orderBy(desc(jarvisMissionsTable.updatedAt))
        .limit(2);
      const missionId = activeMissions.length === 1 ? activeMissions[0]!.id : null;
      const [decision] = await db.insert(jarvisDecisionsTable).values({
        tenantId,
        missionId,
        title: missionTitleFromObjective(intent.decision),
        decision: intent.decision,
        resultStatus: "pending",
        decidedByUserId: userIdOf(req),
      }).returning();
      const linkText = missionId ? " e vinculada à missão ativa" : "";
      writeSse(res, `Decisão registrada${linkText}: “${decision?.title ?? intent.decision}”. Ela ficará disponível para revisão de resultado depois.`, {
        jarvisMissionAction: "decision_recorded",
        decisionId: decision?.id ?? null,
        missionId,
      });
      return;
    }

    const resolution = await resolveMissionReference(tenantId, intent.reference);
    if (resolution.ambiguous) {
      writeSse(res, "Encontrei mais de uma missão compatível e não alterei nenhuma. Diga o nome da missão de forma mais específica.", {
        jarvisMissionAction: "ambiguous",
      });
      return;
    }
    if (!resolution.mission) {
      writeSse(res, "Não encontrei uma missão compatível neste negócio. Diga “quais são nossas missões?” para eu listar as registradas.", {
        jarvisMissionAction: "not_found",
      });
      return;
    }

    const mission = resolution.mission;
    const now = new Date();
    if (intent.type === "update_mission") {
      const previous = mission.currentState && typeof mission.currentState === "object" ? mission.currentState : {};
      const [updated] = await db.update(jarvisMissionsTable).set({
        currentState: {
          ...previous,
          note: intent.note,
          updatedAt: now.toISOString(),
          source: "jarvis_natural_command",
        },
        lastReviewedAt: now,
        updatedAt: now,
      }).where(and(eq(jarvisMissionsTable.id, mission.id), eq(jarvisMissionsTable.tenantId, tenantId))).returning();
      writeSse(res, `Progresso atualizado na missão “${mission.title}”: ${intent.note}`, {
        jarvisMissionAction: "progress_updated",
        missionId: updated?.id ?? mission.id,
      });
      return;
    }

    const nextStatus = intent.type === "pause_mission"
      ? "paused"
      : intent.type === "resume_mission"
        ? "active"
        : "completed";
    const [updated] = await db.update(jarvisMissionsTable).set({
      status: nextStatus,
      completedAt: nextStatus === "completed" ? now : null,
      lastReviewedAt: now,
      updatedAt: now,
    }).where(and(eq(jarvisMissionsTable.id, mission.id), eq(jarvisMissionsTable.tenantId, tenantId))).returning();
    const label = nextStatus === "paused" ? "pausada" : nextStatus === "active" ? "reativada" : "concluída";
    writeSse(res, `Missão “${mission.title}” ${label}.`, {
      jarvisMissionAction: nextStatus,
      missionId: updated?.id ?? mission.id,
    });
  } catch (err) {
    req.log?.warn({ err, tenantId, intentType: intent.type }, "jarvis: falha no Mission Engine natural");
    return next();
  }
});

router.get("/jarvis/missions", async (req, res) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const missions = await db.select().from(jarvisMissionsTable)
    .where(eq(jarvisMissionsTable.tenantId, tenantId))
    .orderBy(desc(jarvisMissionsTable.updatedAt));
  return res.json({ missions });
});

router.post("/jarvis/missions", async (req, res) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const parsed = createMissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [mission] = await db.insert(jarvisMissionsTable).values({
    tenantId,
    ...parsed.data,
    createdByUserId: userIdOf(req),
  }).returning();
  return res.status(201).json({ mission });
});

router.patch("/jarvis/missions/:id", async (req, res) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const parsed = updateMissionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date(), lastReviewedAt: new Date() };
  if (parsed.data.status === "completed") patch.completedAt = new Date();
  if (parsed.data.status && parsed.data.status !== "completed") patch.completedAt = null;

  const [mission] = await db.update(jarvisMissionsTable).set(patch as any)
    .where(and(eq(jarvisMissionsTable.id, String(req.params.id)), eq(jarvisMissionsTable.tenantId, tenantId)))
    .returning();
  if (!mission) return res.status(404).json({ error: "Missão não encontrada" });
  return res.json({ mission });
});

router.get("/jarvis/decisions", async (req, res) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const decisions = await db.select().from(jarvisDecisionsTable)
    .where(eq(jarvisDecisionsTable.tenantId, tenantId))
    .orderBy(desc(jarvisDecisionsTable.createdAt))
    .limit(100);
  return res.json({ decisions });
});

router.post("/jarvis/decisions", async (req, res) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const parsed = createDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  if (parsed.data.missionId) {
    const [mission] = await db.select({ id: jarvisMissionsTable.id }).from(jarvisMissionsTable)
      .where(and(eq(jarvisMissionsTable.id, parsed.data.missionId), eq(jarvisMissionsTable.tenantId, tenantId)))
      .limit(1);
    if (!mission) return res.status(404).json({ error: "Missão não encontrada neste tenant" });
  }

  const [decision] = await db.insert(jarvisDecisionsTable).values({
    tenantId,
    ...parsed.data,
    decidedByUserId: userIdOf(req),
  }).returning();
  return res.status(201).json({ decision });
});

router.patch("/jarvis/decisions/:id/outcome", async (req, res) => {
  const tenantId = tenantIdOf(req);
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const parsed = reviewDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [decision] = await db.update(jarvisDecisionsTable).set({
    ...parsed.data,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(jarvisDecisionsTable.id, String(req.params.id)), eq(jarvisDecisionsTable.tenantId, tenantId)))
    .returning();
  if (!decision) return res.status(404).json({ error: "Decisão não encontrada" });
  return res.json({ decision });
});

// Presence Layer é a última rota normal antes do suporte: ações controladas,
// aprovações e Missões já tiveram prioridade; apenas incidentes explícitos seguem adiante.
router.use(jarvisPresenceRouter);

export default router;
