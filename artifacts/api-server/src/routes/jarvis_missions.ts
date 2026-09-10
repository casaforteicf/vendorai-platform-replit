import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, jarvisDecisionsTable, jarvisMissionsTable } from "@workspace/db";

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
  return typeof req.user?.id === "string" ? req.user.id : null;
}

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

  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.status === "completed") patch.completedAt = new Date();
  if (parsed.data.status && parsed.data.status !== "completed") patch.completedAt = null;

  const [mission] = await db.update(jarvisMissionsTable).set(patch)
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

export default router;
