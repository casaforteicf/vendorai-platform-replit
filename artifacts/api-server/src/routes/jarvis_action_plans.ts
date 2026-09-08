import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, jarvisCasesTable } from "@workspace/db";
import {
  createJarvisActionPlan,
  readJarvisActionPlan,
  updateJarvisActionPlanStep,
} from "../services/jarvis-action-plan-intelligence.js";

const router: IRouter = Router();

const stepUpdateSchema = z.object({
  status: z.enum(["WAITING", "READY", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"]),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  taskId: z.string().trim().min(1).nullable().optional(),
});

router.get("/jarvis/action-plans", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      title: jarvisCasesTable.title,
      category: jarvisCasesTable.category,
      severity: jarvisCasesTable.severity,
      status: jarvisCasesTable.status,
      evidence: jarvisCasesTable.evidence,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(eq(jarvisCasesTable.tenantId, tenantId))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(100);

  const items = rows
    .map((item) => ({
      caseId: item.id,
      caseTitle: item.title,
      category: item.category,
      severity: item.severity,
      caseStatus: item.status,
      plan: readJarvisActionPlan(item.evidence),
      updatedAt: item.updatedAt,
    }))
    .filter((item) => item.plan !== null);

  return res.json({
    generatedAt: new Date(),
    summary: {
      plans: items.length,
      running: items.filter((item) => item.plan?.status === "RUNNING").length,
      pending: items.filter((item) => item.plan?.status === "PENDING").length,
      completed: items.filter((item) => item.plan?.status === "COMPLETED").length,
      failed: items.filter((item) => item.plan?.status === "FAILED").length,
    },
    items,
  });
});

router.get("/jarvis/cases/:id/action-plan", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const caseId = String(req.params.id ?? "").trim();
  const [current] = await db
    .select({ evidence: jarvisCasesTable.evidence })
    .from(jarvisCasesTable)
    .where(and(eq(jarvisCasesTable.id, caseId), eq(jarvisCasesTable.tenantId, tenantId)))
    .limit(1);

  if (!current) return res.status(404).json({ error: "Caso Vendor não encontrado" });
  return res.json({ plan: readJarvisActionPlan(current.evidence) });
});

router.post("/jarvis/cases/:id/action-plan", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const caseId = String(req.params.id ?? "").trim();
  if (!caseId) return res.status(400).json({ error: "Caso Vendor obrigatório" });

  const result = await createJarvisActionPlan(tenantId, caseId);
  if (!result) return res.status(404).json({ error: "Caso Vendor não encontrado" });

  return res.status(result.created ? 201 : 200).json({
    ...result,
    guardrail: "O plano organiza e acompanha o trabalho, mas não transforma uma etapa em execução real sem contexto, executor e autorização compatíveis.",
  });
});

router.patch("/jarvis/cases/:id/action-plan/steps/:stepId", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const parsed = stepUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const result = await updateJarvisActionPlanStep({
    tenantId,
    caseId: String(req.params.id ?? "").trim(),
    stepId: String(req.params.stepId ?? "").trim(),
    status: parsed.data.status,
    result: parsed.data.result,
    taskId: parsed.data.taskId,
  });

  if (!result) return res.status(404).json({ error: "Caso Vendor não encontrado" });
  if ("error" in result) {
    return res.status(404).json({
      error: result.error === "plan_not_found" ? "Plano de ação não encontrado" : "Etapa do plano não encontrada",
    });
  }

  return res.json(result);
});

export default router;
