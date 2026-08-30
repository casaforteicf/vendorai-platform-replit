import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, mediaPlansTable } from "@workspace/db";
import { generateMediaPlan, MediaPlanError } from "../services/media-plan.js";

const router: IRouter = Router();

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.post("/tenants/:tenantId/media-plan/gerar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  try {
    const { plan } = await generateMediaPlan(tenantId, req.user?.sub ?? null);
    res.status(201).json(plan);
  } catch (err) {
    if (err instanceof MediaPlanError) {
      res.status(422).json({ error: err.message });
      return;
    }
    req.log.error({ err, tenantId }, "media-plan: falha ao gerar plano");
    res.status(500).json({ error: "Falha ao gerar o plano de mídia. Tente novamente." });
  }
});

router.get("/tenants/:tenantId/media-plan", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const [latest] = await db
    .select()
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.tenantId, tenantId))
    .orderBy(desc(mediaPlansTable.createdAt))
    .limit(1);
  res.json(latest ?? null);
});

router.get("/tenants/:tenantId/media-plan/historico", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const rows = await db
    .select({ id: mediaPlansTable.id, createdAt: mediaPlansTable.createdAt })
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.tenantId, tenantId))
    .orderBy(desc(mediaPlansTable.createdAt))
    .limit(20);
  res.json(rows);
});

export default router;
