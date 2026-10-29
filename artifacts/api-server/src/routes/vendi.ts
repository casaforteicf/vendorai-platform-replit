import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  vendiMissionsTable,
  vendiMissionEventsTable,
} from "@workspace/db";
import { listVendiToolDomains, listVendiTools } from "../services/vendi-tool-registry.js";
import { executeVendiMission } from "../services/vendi-mission-supervisor.js";
import { getVendiPostgresErrorCode } from "../lib/vendi-db-error.js";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

const createMissionSchema = z.object({
  objective: z.string().min(3).max(4000),
  source: z.enum(["user", "jarvis", "system", "agent", "module"]).default("user"),
  sourceRefId: z.string().max(200).optional(),
  priority: z.number().int().min(0).max(100).default(50),
  riskPolicy: z.enum(["read_only", "standard", "strict"]).default("standard"),
  context: z.record(z.string(), z.unknown()).optional(),
  autoExecute: z.boolean().default(true),
});

const approveSchema = z.object({
  toolIds: z.array(z.string().min(1)).min(1).max(20),
});

function resolveTenant(req: any) {
  return req.user?.tenantId;
}

router.get("/vendi/tools", (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  res.json({
    tools: listVendiTools(),
    domains: listVendiToolDomains(),
  });
});

const customizationRequestSchema = z.object({
  objective: z.string().trim().min(3).max(3800),
}).strict();

// Intake-only: the server fixes tenant, context, risk and execution policy.
// Never accept permissions or tenant identifiers supplied by the browser.
router.post("/vendi/customization-requests", requireRole("tenant_admin", "super_admin"), async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  const parsed = customizationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [mission] = await db.insert(vendiMissionsTable).values({
      tenantId,
      source: "module",
      objective: `Solicitação de personalização do meu sistema (não executar automaticamente): ${parsed.data.objective}`,
      priority: 50,
      riskPolicy: "strict",
      context: { requestType: "tenant_customization", stage: "intake_only", executionAuthorized: false },
      createdByUserId: req.user?.id ?? null,
      status: "planning",
    }).returning();
    if (!mission) throw new Error("MISSION_INSERT_RETURNED_EMPTY");
    res.status(201).json({ mission });
  } catch (error: unknown) {
    const code = getVendiPostgresErrorCode(error);
    console.error("[vendi] customization_request_create_failed", { tenantId, code: code ?? "UNKNOWN" });
    res.status(503).json({ error: "Não foi possível registrar a solicitação.", code: "VENDI_CUSTOMIZATION_REQUEST_FAILED" });
  }
});

router.post("/vendi/missions", async (req, res) => {
  const parsed = createMissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  let mission: typeof vendiMissionsTable.$inferSelect;
  try {
    const [created] = await db.insert(vendiMissionsTable).values({
      tenantId,
      source: parsed.data.source,
      sourceRefId: parsed.data.sourceRefId ?? null,
      objective: parsed.data.objective,
      priority: parsed.data.priority,
      riskPolicy: parsed.data.riskPolicy,
      context: parsed.data.context ?? null,
      createdByUserId: req.user?.id ?? null,
      status: "planning",
    }).returning();
    if (!created) throw new Error("MISSION_INSERT_RETURNED_EMPTY");
    mission = created;
  } catch (error: unknown) {
    const dbErrorCode = getVendiPostgresErrorCode(error);
    // The wrapped Drizzle message contains SQL and bound mission data; never log it.
    console.error("[vendi] mission_create_failed", {
      tenantId,
      code: dbErrorCode ?? "UNKNOWN",
    });
    const schemaMissing = dbErrorCode === "42P01" || dbErrorCode === "42703";
    res.status(503).json({
      error: schemaMissing
        ? "A estrutura de missões não está disponível. Contate o administrador para revisar as migrations."
        : "Não foi possível salvar a missão. Tente novamente ou contate o suporte.",
      code: schemaMissing ? "VENDI_MISSIONS_SCHEMA_UNAVAILABLE" : "VENDI_MISSION_CREATE_FAILED",
    });
    return;
  }

  if (!parsed.data.autoExecute) {
    res.status(201).json({ mission });
    return;
  }

  try {
    const execution = await executeVendiMission({
      tenantId,
      missionId: mission.id,
    });
    res.status(execution.status === "paused_approval" ? 202 : 201).json({
      missionId: mission.id,
      execution,
    });
  } catch (error: any) {
    await db.update(vendiMissionsTable)
      .set({
        status: "failed",
        lastError: error?.message ?? "VENDI_MISSION_FAILED",
        updatedAt: new Date(),
      })
      .where(and(
        eq(vendiMissionsTable.id, mission.id),
        eq(vendiMissionsTable.tenantId, tenantId),
      ));
    res.status(500).json({ missionId: mission.id, error: error?.message ?? "VENDI_MISSION_FAILED" });
  }
});

async function rejectIntakeExecution(req: any, res: any): Promise<boolean> {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return true;
  }
  const [mission] = await db.select({ context: vendiMissionsTable.context })
    .from(vendiMissionsTable)
    .where(and(eq(vendiMissionsTable.id, String(req.params.id)), eq(vendiMissionsTable.tenantId, tenantId)))
    .limit(1);
  if (!mission) {
    res.status(404).json({ error: "Missão não encontrada" });
    return true;
  }
  const context = mission.context as Record<string, unknown> | null;
  if (context?.requestType === "tenant_customization") {
    res.status(403).json({ error: "Solicitações de personalização exigem revisão e não podem ser executadas diretamente." });
    return true;
  }
  return false;
}

router.post("/vendi/missions/:id/run", async (req, res) => {
  if (await rejectIntakeExecution(req, res)) return;
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  try {
    const execution = await executeVendiMission({
      tenantId,
      missionId: String(req.params.id),
    });
    res.status(execution.status === "paused_approval" ? 202 : 200).json(execution);
  } catch (error: any) {
    res.status(409).json({ error: error?.message ?? "VENDI_MISSION_RUN_FAILED" });
  }
});

router.post("/vendi/missions/:id/approve", async (req, res) => {
  if (await rejectIntakeExecution(req, res)) return;
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten() });
    return;
  }
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }

  try {
    const execution = await executeVendiMission({
      tenantId,
      missionId: String(req.params.id),
      approvedToolIds: parsed.data.toolIds,
    });
    res.json(execution);
  } catch (error: any) {
    res.status(409).json({ error: error?.message ?? "VENDI_MISSION_APPROVAL_FAILED" });
  }
});

router.get("/vendi/missions", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  const rows = await db
    .select()
    .from(vendiMissionsTable)
    .where(eq(vendiMissionsTable.tenantId, tenantId))
    .orderBy(desc(vendiMissionsTable.createdAt))
    .limit(100);
  res.json(rows);
});

router.get("/vendi/missions/:id", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  const [mission] = await db
    .select()
    .from(vendiMissionsTable)
    .where(and(
      eq(vendiMissionsTable.id, String(req.params.id)),
      eq(vendiMissionsTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!mission) {
    res.status(404).json({ error: "Missão não encontrada" });
    return;
  }
  const events = await db
    .select()
    .from(vendiMissionEventsTable)
    .where(and(
      eq(vendiMissionEventsTable.missionId, mission.id),
      eq(vendiMissionEventsTable.tenantId, tenantId),
    ))
    .orderBy(asc(vendiMissionEventsTable.sequence));
  res.json({ mission, events });
});

export default router;
