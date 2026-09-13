import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  growthLabPromisesTable,
  growthLabBacklogTable,
} from "@workspace/db";

const router: IRouter = Router();

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/growth-lab/promises", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const items = await db
    .select()
    .from(growthLabPromisesTable)
    .where(eq(growthLabPromisesTable.tenantId, tenantId))
    .orderBy(desc(growthLabPromisesTable.createdAt));

  res.json(items);
});

router.post("/tenants/:tenantId/growth-lab/promises", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = req.body as {
    promise?: string;
    lpName?: string;
    lpPath?: string | null;
    source?: string;
    capabilityIds?: string[];
    coverage?: number;
    status?: string;
    metadata?: Record<string, unknown>;
  };

  const promise = body.promise?.trim();
  if (!promise) {
    res.status(400).json({ error: "promise is required" });
    return;
  }

  const [created] = await db
    .insert(growthLabPromisesTable)
    .values({
      tenantId,
      promise,
      lpName: body.lpName?.trim() || "Nova promessa",
      lpPath: body.lpPath ?? null,
      source: body.source?.trim() || "manual",
      capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : [],
      coverage: Number.isFinite(body.coverage) ? Math.max(0, Math.min(100, Number(body.coverage))) : 0,
      status: body.status?.trim() || "review",
      metadata: body.metadata ?? {},
      updatedAt: new Date(),
    })
    .returning();

  res.status(201).json(created);
});

router.get("/tenants/:tenantId/growth-lab/backlog", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const items = await db
    .select()
    .from(growthLabBacklogTable)
    .where(eq(growthLabBacklogTable.tenantId, tenantId))
    .orderBy(desc(growthLabBacklogTable.priorityScore), desc(growthLabBacklogTable.createdAt));

  res.json(items);
});

router.post("/tenants/:tenantId/growth-lab/backlog/upsert", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = req.body as {
    capabilityId?: string;
    capabilityName?: string;
    module?: string;
    currentStatus?: string;
    affectedPromises?: number;
    priorityScore?: number;
    action?: string;
    state?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.capabilityId?.trim() || !body.capabilityName?.trim() || !body.module?.trim()) {
    res.status(400).json({ error: "capabilityId, capabilityName and module are required" });
    return;
  }

  const [item] = await db
    .insert(growthLabBacklogTable)
    .values({
      tenantId,
      capabilityId: body.capabilityId.trim(),
      capabilityName: body.capabilityName.trim(),
      module: body.module.trim(),
      currentStatus: body.currentStatus?.trim() || "missing",
      affectedPromises: Math.max(0, Number(body.affectedPromises ?? 0)),
      priorityScore: Math.max(0, Math.min(100, Number(body.priorityScore ?? 0))),
      action: body.action?.trim() || "complete_product",
      state: body.state?.trim() || "open",
      metadata: body.metadata ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [growthLabBacklogTable.tenantId, growthLabBacklogTable.capabilityId],
      set: {
        capabilityName: body.capabilityName.trim(),
        module: body.module.trim(),
        currentStatus: body.currentStatus?.trim() || "missing",
        affectedPromises: Math.max(0, Number(body.affectedPromises ?? 0)),
        priorityScore: Math.max(0, Math.min(100, Number(body.priorityScore ?? 0))),
        action: body.action?.trim() || "complete_product",
        state: body.state?.trim() || "open",
        metadata: body.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(item);
});

export default router;
