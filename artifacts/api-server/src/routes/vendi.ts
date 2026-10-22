import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  vendiMissionEventsTable,
  vendiMissionsTable,
} from "@workspace/db";
import { listVendiToolDomains, listVendiTools } from "../services/vendi-tool-registry.js";
import { executeVendiMission } from "../services/vendi-mission-supervisor.js";
import { withVendiTenantContext } from "../services/vendi-db-context.js";
import { getPostgresDiagnostic } from "./vendi-db-errors.js";

import { summarizeMissionEvents } from "../services/vendi-mission-summary.js";

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
    const created = await withVendiTenantContext(tenantId, async (tx) => {
      const [inserted] = await tx
        .insert(vendiMissionsTable)
        .values({
          tenantId,
          source: parsed.data.source,
          sourceRefId: parsed.data.sourceRefId ?? null,
          objective: parsed.data.objective,
          priority: parsed.data.priority,
          riskPolicy: parsed.data.riskPolicy,
          context: parsed.data.context ?? null,
          createdByUserId: req.user?.sub ?? null,
          status: parsed.data.autoExecute ? "queued" : "planning",
        })
        .returning();
      if (!inserted) throw new Error("MISSION_INSERT_RETURNED_EMPTY");

      if (parsed.data.autoExecute) {
        await tx.insert(vendiMissionEventsTable).values({
          tenantId,
          missionId: inserted.id,
          sequence: 1,
          type: "queued",
          status: "pending",
          output: { reason: "automatic_execution_requested" },
        });
      }
      return inserted;
    });
    mission = created;
  } catch (error: unknown) {
    const diagnostic = getPostgresDiagnostic(error);
    // Never log Drizzle's wrapper message: it includes SQL and bound values.
    console.error("[vendi] mission_create_failed", {
      requestId: typeof req.id === "string" || typeof req.id === "number"
        ? String(req.id).slice(0, 64)
        : undefined,
      code: diagnostic.code ?? "UNKNOWN",
      errorTypes: diagnostic.errorTypes,
      schema: diagnostic.schema,
      table: diagnostic.table,
      column: diagnostic.column,
      constraint: diagnostic.constraint,
    });
    const schemaMissing = diagnostic.code === "42P01" || diagnostic.code === "42703";
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
  res.status(202).json({ missionId: mission.id, status: "queued" });
});

router.post("/vendi/missions/:id/run", async (req, res) => {
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
  const rows = await withVendiTenantContext(tenantId, (tx) => tx
    .select()
    .from(vendiMissionsTable)
    .where(eq(vendiMissionsTable.tenantId, tenantId))
    .orderBy(desc(vendiMissionsTable.createdAt))
    .limit(100));
  res.json(rows);
});

router.get("/vendi/missions/:id", async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) {
    res.status(401).json({ error: "Tenant não resolvido" });
    return;
  }
  const { mission, events } = await withVendiTenantContext(tenantId, async (tx) => {
    const [mission] = await tx
      .select()
      .from(vendiMissionsTable)
      .where(and(
        eq(vendiMissionsTable.id, String(req.params.id)),
        eq(vendiMissionsTable.tenantId, tenantId),
      ))
      .limit(1);
    if (!mission) return { mission: undefined, events: [] };
    const events = await tx
      .select()
      .from(vendiMissionEventsTable)
      .where(and(
        eq(vendiMissionEventsTable.missionId, mission.id),
        eq(vendiMissionEventsTable.tenantId, tenantId),
      ))
      .orderBy(asc(vendiMissionEventsTable.sequence));
    return { mission, events };
  });
  if (!mission) {
    res.status(404).json({ error: "Missão não encontrada" });
    return;
  }
  // Also expose evidence-based summaries for missions completed before this release.
  const summary = mission.status === "completed" ? summarizeMissionEvents(events) : [];
  res.json({ mission, events, summary });
});

export default router;
