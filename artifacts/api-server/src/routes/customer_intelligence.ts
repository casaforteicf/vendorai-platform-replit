import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  customerIntelligenceTable,
  insertCustomerIntelligenceSchema,
  updateCustomerIntelligenceSchema,
} from "@workspace/db";
import {
  analyzeLeadIntelligence,
  ANALYSIS_COOLDOWN_MINUTES,
} from "../lib/analyze-intelligence.js";

const router: IRouter = Router();

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}


router.post("/customer-intelligence", async (req, res) => {
  const parsed = insertCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // Enforce tenant scope: body tenantId must match the requester's tenant
  if (
    req.user?.platformRole !== "super_admin" &&
    req.user?.tenantId !== parsed.data.tenantId
  ) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const [record] = await db
      .insert(customerIntelligenceTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(record);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "A customer intelligence record already exists for this lead" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/customer-intelligence", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const records = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.tenantId, tenantId))
    .orderBy(customerIntelligenceTable.createdAt);

  res.json(records);
});

router.get(
  "/tenants/:tenantId/leads/:leadId/intelligence",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);
    const leadId   = String(req.params.leadId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    // Concurrency-safe upsert: insert-or-do-nothing on leadId unique constraint, then select
    await db
      .insert(customerIntelligenceTable)
      .values({ tenantId, leadId })
      .onConflictDoNothing({ target: customerIntelligenceTable.leadId });

    const [record] = await db
      .select()
      .from(customerIntelligenceTable)
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, tenantId),
          eq(customerIntelligenceTable.leadId, leadId)
        )
      );

    if (!record) {
      res.status(404).json({ error: "Customer intelligence record not found" });
      return;
    }

    res.json(record);
  }
);

router.get("/customer-intelligence/:id", async (req, res) => {
  const [record] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!record) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && record.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(record);
});

router.patch("/customer-intelligence/:id", async (req, res) => {
  const parsed = updateCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const messages = Object.entries(fieldErrors)
      .map(([field, errs]) => `${field}: ${(errs ?? []).join(", ")}`)
      .join("; ");
    res.status(400).json({ error: messages || "Invalid request body" });
    return;
  }

  const [existing] = await db
    .select({ id: customerIntelligenceTable.id, tenantId: customerIntelligenceTable.tenantId })
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [record] = await db
    .update(customerIntelligenceTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(customerIntelligenceTable.id, existing.id))
    .returning();

  res.json(record);
});

router.delete("/customer-intelligence/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: customerIntelligenceTable.id, tenantId: customerIntelligenceTable.tenantId })
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db
    .delete(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, existing.id));

  res.status(204).send();
});

/**
 * POST /tenants/:tenantId/leads/:leadId/intelligence/analyze
 *
 * Calls GPT-4o-mini to analyze the lead's data, conversation history, and
 * recent activities, then writes back all Customer Intelligence fields.
 * Fires the churn_risk_alto rules engine trigger if churnRisk >= 60.
 *
 * The core analysis logic lives in src/lib/analyze-intelligence.ts and is
 * shared with the automatic re-analysis trigger in messages.ts.
 */
router.post(
  "/tenants/:tenantId/leads/:leadId/intelligence/analyze",
  async (req, res): Promise<void> => {
    const tenantId = String(req.params.tenantId);
    const leadId   = String(req.params.leadId);

    // Tenant scope guard — requester must belong to this tenant (super_admin bypasses)
    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    // Per-lead cooldown: reject if last analysis was within ANALYSIS_COOLDOWN_MINUTES
    const [ciRecord] = await db
      .select({ lastAnalyzedAt: customerIntelligenceTable.lastAnalyzedAt })
      .from(customerIntelligenceTable)
      .where(
        and(
          eq(customerIntelligenceTable.leadId, leadId),
          eq(customerIntelligenceTable.tenantId, tenantId)
        )
      );

    if (ciRecord?.lastAnalyzedAt) {
      const cooldownMs   = ANALYSIS_COOLDOWN_MINUTES * 60 * 1000;
      const elapsedMs    = Date.now() - new Date(ciRecord.lastAnalyzedAt).getTime();
      const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);

      if (elapsedMs < cooldownMs) {
        req.log.info(
          { leadId, tenantId, lastAnalyzedAt: ciRecord.lastAnalyzedAt, remainingSec },
          "intelligence/analyze: rate-limited (cooldown active)"
        );
        res.status(429).json({
          error: `This lead was analyzed recently. Please wait ${remainingSec} second${remainingSec !== 1 ? "s" : ""} before re-analyzing.`,
          retryAfterSeconds: remainingSec,
        });
        return;
      }
    }

    try {
      const result = await analyzeLeadIntelligence({ tenantId, leadId, log: req.log, triggeredBy: "manual" });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found")) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }
      if (message.includes("AI service unavailable")) {
        res.status(502).json({ error: "AI service unavailable. Please try again later." });
        return;
      }
      if (message.includes("unexpected response format")) {
        res.status(502).json({ error: "AI returned an unexpected response format." });
        return;
      }
      throw err;
    }
  }
);

export default router;
