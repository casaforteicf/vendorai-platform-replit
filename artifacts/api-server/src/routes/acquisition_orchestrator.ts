import { Router } from "express";
import { z } from "zod/v4";
import { authenticate, requireRole } from "../middlewares/auth.js";
import {
  approveAcquisitionMasterPlan,
  generateAcquisitionMasterPlan,
  getAcquisitionOrchestratorConfig,
  updateAcquisitionOrchestratorConfig,
} from "../services/acquisitionBudgetOrchestrator.js";

const router = Router();

const configSchema = z.object({
  totalBudget: z.coerce.number().min(0),
  period: z.enum(["daily", "weekly", "monthly", "campaign"]).optional(),
  autonomy: z.enum(["recommend_only", "approval_required", "autonomous"]).optional(),
  active: z.boolean().optional(),
  guardrails: z.object({
    minimumEvidenceStarts: z.coerce.number().int().min(1).max(1000).optional(),
    maxShiftPercentPerCycle: z.coerce.number().min(0).max(100).optional(),
    reservePercent: z.coerce.number().min(0).max(80).optional(),
    minAllocationPercentPerBucket: z.coerce.number().min(0).max(50).optional(),
    maxAllocationPercentPerBucket: z.coerce.number().min(1).max(100).optional(),
  }).optional(),
});

router.get(
  "/api/admin/commerce/acquisition-orchestrator",
  authenticate,
  requireRole("super_admin"),
  async (_req, res, next) => {
    try {
      res.json({ config: await getAcquisitionOrchestratorConfig() });
    } catch (err) { next(err); }
  },
);

router.put(
  "/api/admin/commerce/acquisition-orchestrator",
  authenticate,
  requireRole("super_admin"),
  async (req, res, next) => {
    try {
      const parsed = configSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
      res.json({ config: await updateAcquisitionOrchestratorConfig(parsed.data) });
    } catch (err) { next(err); }
  },
);

router.post(
  "/api/admin/commerce/acquisition-orchestrator/plan",
  authenticate,
  requireRole("super_admin"),
  async (_req, res, next) => {
    try {
      res.json(await generateAcquisitionMasterPlan());
    } catch (err) { next(err); }
  },
);

router.post(
  "/api/admin/commerce/acquisition-orchestrator/approve",
  authenticate,
  requireRole("super_admin"),
  async (_req, res, next) => {
    try {
      res.json({ config: await approveAcquisitionMasterPlan() });
    } catch (err) { next(err); }
  },
);

export default router;
