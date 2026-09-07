import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod/v4";
import { db, jarvisCasesTable } from "@workspace/db";

const router: IRouter = Router();

const outcomeSchema = z.object({
  status: z.enum(["open", "resolved", "dismissed"]),
  resultSummary: z.string().trim().min(3).max(5000).nullable().optional(),
});

function resolveWindowHours(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(24 * 30, Math.trunc(parsed)));
}

// GET /jarvis/changes — leitura determinística do que mudou no tenant.
router.get("/jarvis/changes", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const hours = resolveWindowHours(req.query.hours);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      signalKey: jarvisCasesTable.signalKey,
      source: jarvisCasesTable.source,
      category: jarvisCasesTable.category,
      severity: jarvisCasesTable.severity,
      title: jarvisCasesTable.title,
      detail: jarvisCasesTable.detail,
      metric: jarvisCasesTable.metric,
      confidence: jarvisCasesTable.confidence,
      impact: jarvisCasesTable.impact,
      status: jarvisCasesTable.status,
      recommendedAction: jarvisCasesTable.recommendedAction,
      resultSummary: jarvisCasesTable.resultSummary,
      firstDetectedAt: jarvisCasesTable.firstDetectedAt,
      lastDetectedAt: jarvisCasesTable.lastDetectedAt,
      resolvedAt: jarvisCasesTable.resolvedAt,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(and(
      eq(jarvisCasesTable.tenantId, tenantId),
      gte(jarvisCasesTable.updatedAt, since),
    ))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(100);

  const newCases = rows.filter((item) => item.firstDetectedAt >= since);
  const resolved = rows.filter((item) => item.status === "resolved" && item.resolvedAt && item.resolvedAt >= since);
  const dismissed = rows.filter((item) => item.status === "dismissed");
  const activeUpdates = rows.filter((item) => item.status === "open" && item.firstDetectedAt < since);

  return res.json({
    generatedAt: new Date(),
    windowHours: hours,
    since,
    summary: {
      changed: rows.length,
      new: newCases.length,
      activeUpdates: activeUpdates.length,
      resolved: resolved.length,
      dismissed: dismissed.length,
      risks: rows.filter((item) => item.severity === "risk").length,
      opportunities: rows.filter((item) => item.severity === "opportunity").length,
    },
    items: rows.map((item) => ({
      ...item,
      changeType:
        item.status === "resolved" && item.resolvedAt && item.resolvedAt >= since
          ? "resolved"
          : item.status === "dismissed"
            ? "dismissed"
            : item.firstDetectedAt >= since
              ? "new"
              : "updated",
    })),
  });
});

// PATCH /jarvis/cases/:id/outcome — fecha o ciclo sinal → decisão → resultado.
router.patch("/jarvis/cases/:id/outcome", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const caseId = String(req.params.id ?? "").trim();
  if (!caseId) return res.status(400).json({ error: "Caso Vendor obrigatório" });

  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const now = new Date();
  const status = parsed.data.status;
  const resultSummary = parsed.data.resultSummary ?? null;

  if ((status === "resolved" || status === "dismissed") && !resultSummary) {
    return res.status(422).json({
      error: "Informe o resultado ou motivo antes de encerrar o Caso Vendor.",
    });
  }

  const [updated] = await db
    .update(jarvisCasesTable)
    .set({
      status,
      resultSummary,
      resolvedAt: status === "open" ? null : now,
      updatedAt: now,
    })
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
    .returning();

  if (!updated) return res.status(404).json({ error: "Caso Vendor não encontrado" });

  return res.json(updated);
});

export default router;
