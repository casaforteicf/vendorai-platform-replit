import { Router, type IRouter } from "express";
import { and, eq, sql, count, sum, desc, gte, lte } from "drizzle-orm";
import {
  db,
  customerIntelligenceTable,
  insertCustomerIntelligenceSchema,
  updateCustomerIntelligenceSchema,
  intelligenceAnalysisLogTable,
  leadsTable,
  tenantsTable,
  churnActionsTable,
  customerIntelligenceSourcesTable,
  customerIntelligenceFactsTable,
  customerIntelligenceEventsTable,
  customerIntelligenceSnapshotsTable,
  leadStageDynamicQuestionsTable,
} from "@workspace/db";
import {
  analyzeLeadIntelligence,
  AnalysisAlreadyInFlightError,
  ANALYSIS_COOLDOWN_MINUTES,
  MAX_ANALYSES_PER_TENANT_PER_HOUR,
} from "../lib/analyze-intelligence.js";
import { suggestDynamicStageQuestions } from "../services/stage-question-intelligence.js";

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
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const messages = Object.entries(fieldErrors)
      .map(([field, errs]) => `${field}: ${(errs ?? []).join(", ")}`)
      .join("; ");
    res.status(400).json({ error: messages || "Invalid request body" });
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

  // Verify leadId actually belongs to this tenant (prevents cross-tenant CI slot poisoning)
  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.id, parsed.data.leadId),
        eq(leadsTable.tenantId, parsed.data.tenantId)
      )
    );

  if (!lead) {
    res.status(404).json({ error: "Lead not found in this tenant" });
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

    // Verify leadId belongs to this tenant before upserting (prevents cross-tenant slot poisoning)
    const [leadCheck] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    if (!leadCheck) {
      res.status(404).json({ error: "Lead not found in this tenant" });
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

router.get(
  "/tenants/:tenantId/leads/:leadId/intelligence/full",
  async (req, res) => {
    // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant or super_admin before tenant-scoped access
    const tenantId = String(req.params.tenantId);
    const leadId = String(req.params.leadId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found in this tenant" });
      return;
    }

    const [profile, facts, events, snapshots, sources, dynamicQuestions] = await Promise.all([
      db.select().from(customerIntelligenceTable)
        .where(and(eq(customerIntelligenceTable.tenantId, tenantId), eq(customerIntelligenceTable.leadId, leadId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db.select().from(customerIntelligenceFactsTable)
        .where(and(eq(customerIntelligenceFactsTable.tenantId, tenantId), eq(customerIntelligenceFactsTable.leadId, leadId)))
        .orderBy(desc(customerIntelligenceFactsTable.createdAt))
        .limit(250),
      db.select().from(customerIntelligenceEventsTable)
        .where(and(eq(customerIntelligenceEventsTable.tenantId, tenantId), eq(customerIntelligenceEventsTable.leadId, leadId)))
        .orderBy(desc(customerIntelligenceEventsTable.occurredAt))
        .limit(250),
      db.select().from(customerIntelligenceSnapshotsTable)
        .where(and(eq(customerIntelligenceSnapshotsTable.tenantId, tenantId), eq(customerIntelligenceSnapshotsTable.leadId, leadId)))
        .orderBy(desc(customerIntelligenceSnapshotsTable.createdAt))
        .limit(100),
      db.select().from(customerIntelligenceSourcesTable)
        .where(and(eq(customerIntelligenceSourcesTable.tenantId, tenantId), eq(customerIntelligenceSourcesTable.leadId, leadId)))
        .orderBy(desc(customerIntelligenceSourcesTable.capturedAt))
        .limit(250),
      db.select().from(leadStageDynamicQuestionsTable)
        .where(and(eq(leadStageDynamicQuestionsTable.tenantId, tenantId), eq(leadStageDynamicQuestionsTable.leadId, leadId)))
        .orderBy(desc(leadStageDynamicQuestionsTable.createdAt))
        .limit(100),
    ]);

    res.json({
      profile,
      health: profile ? {
        score: profile.healthScore,
        status: profile.healthStatus,
        riskType: profile.riskType,
        riskLevel: profile.riskLevel,
        trend: profile.riskTrend,
        confidence: profile.analysisConfidence,
        dimensions: profile.healthDimensions ?? {},
        positiveSignals: profile.positiveSignals ?? [],
        negativeSignals: profile.negativeSignals ?? [],
        riskFactors: profile.riskFactors ?? [],
        riskEvents: profile.riskEvents ?? [],
        nextBestAction: profile.nextBestAction,
        nextBestActionReason: profile.nextBestActionReason,
        outreachPlan: profile.outreachPlan,
      } : null,
      facts,
      events,
      snapshots,
      sources,
      dynamicQuestions,
    });
  }
);

router.post(
  "/tenants/:tenantId/leads/:leadId/deals/:dealId/intelligence/suggest-stage-questions",
  async (req, res) => {
    // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant or super_admin before tenant-scoped access
    const tenantId = String(req.params.tenantId);
    const leadId = String(req.params.leadId);
    const dealId = String(req.params.dealId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    try {
      const questions = await suggestDynamicStageQuestions({
        tenantId,
        leadId,
        dealId,
        log: req.log,
      });
      res.json({ questions });
    } catch (err) {
      req.log.warn({ err, tenantId, leadId, dealId }, "customer-intelligence: suggest-stage-questions failed");
      res.status(502).json({ error: "Não foi possível sugerir perguntas adicionais agora." });
    }
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
    res.status(422).json({ error: messages || "Invalid request body" });
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
 * GET /tenants/:tenantId/intelligence-analysis-log/export
 *
 * Returns a CSV file of all intelligence_analysis_log entries for the tenant,
 * optionally filtered by date range (from, to query params in ISO 8601).
 * Accessible by super_admin only — intended for billing reconciliation.
 */
router.get("/tenants/:tenantId/intelligence-analysis-log/export", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin") {
    res.status(403).json({ error: "Access denied: super_admin only" });
    return;
  }

  const fromRaw = req.query.from ? String(req.query.from) : undefined;
  const toRaw   = req.query.to   ? String(req.query.to)   : undefined;

  const fromDate = fromRaw ? new Date(fromRaw) : undefined;
  const toDate   = toRaw   ? new Date(toRaw)   : undefined;

  if (fromDate && isNaN(fromDate.getTime())) {
    res.status(400).json({ error: "Invalid 'from' date" });
    return;
  }
  if (toDate && isNaN(toDate.getTime())) {
    res.status(400).json({ error: "Invalid 'to' date" });
    return;
  }

  const conditions = [eq(intelligenceAnalysisLogTable.tenantId, tenantId)];
  if (fromDate) conditions.push(gte(intelligenceAnalysisLogTable.createdAt, fromDate));
  if (toDate)   conditions.push(lte(intelligenceAnalysisLogTable.createdAt, toDate));

  const rows = await db
    .select()
    .from(intelligenceAnalysisLogTable)
    .where(and(...conditions))
    .orderBy(desc(intelligenceAnalysisLogTable.createdAt));

  const csvHeader = "id,tenantId,leadId,tokensUsed,churnRisk,triggeredBy,createdAt\n";
  const csvRows = rows.map((r) => [
    r.id,
    r.tenantId,
    r.leadId,
    r.tokensUsed,
    r.churnRisk ?? "",
    r.triggeredBy,
    r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

  const filename = `analysis-log-${tenantId}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvHeader + csvRows);
});

/**
 * GET /tenants/:tenantId/intelligence-analysis-log
 *
 * Returns paginated AI analysis log entries for a tenant with aggregate stats.
 * Accessible by super_admin or users belonging to the tenant.
 */
router.get("/tenants/:tenantId/intelligence-analysis-log", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const offset = (page - 1) * limit;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [items, totalsRow, byTrigger, hourlyRow, tenantRow] = await Promise.all([
    db
      .select()
      .from(intelligenceAnalysisLogTable)
      .where(eq(intelligenceAnalysisLogTable.tenantId, tenantId))
      .orderBy(desc(intelligenceAnalysisLogTable.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({
        totalCalls:  count(),
        totalTokens: sum(intelligenceAnalysisLogTable.tokensUsed),
      })
      .from(intelligenceAnalysisLogTable)
      .where(eq(intelligenceAnalysisLogTable.tenantId, tenantId))
      .then((rows) => rows[0] ?? { totalCalls: 0, totalTokens: "0" }),

    db
      .select({
        triggeredBy: intelligenceAnalysisLogTable.triggeredBy,
        calls:       count(),
        tokens:      sum(intelligenceAnalysisLogTable.tokensUsed),
      })
      .from(intelligenceAnalysisLogTable)
      .where(eq(intelligenceAnalysisLogTable.tenantId, tenantId))
      .groupBy(intelligenceAnalysisLogTable.triggeredBy),

    db
      .select({ recentCount: count() })
      .from(intelligenceAnalysisLogTable)
      .where(
        and(
          eq(intelligenceAnalysisLogTable.tenantId, tenantId),
          gte(intelligenceAnalysisLogTable.createdAt, oneHourAgo)
        )
      )
      .then((rows) => rows[0] ?? { recentCount: 0 }),

    db
      .select({ maxAnalysesPerHour: tenantsTable.maxAnalysesPerHour })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .then((rows) => rows[0] ?? { maxAnalysesPerHour: null }),
  ]);

  const effectiveHourlyLimit = tenantRow.maxAnalysesPerHour ?? MAX_ANALYSES_PER_TENANT_PER_HOUR;

  const byTriggeredBy: Record<string, { calls: number; tokens: number }> = {};
  for (const row of byTrigger) {
    byTriggeredBy[row.triggeredBy] = {
      calls:  Number(row.calls),
      tokens: Number(row.tokens ?? 0),
    };
  }

  res.json({
    items,
    total: Number(totalsRow.totalCalls),
    page,
    limit,
    stats: {
      totalCalls:  Number(totalsRow.totalCalls),
      totalTokens: Number(totalsRow.totalTokens ?? 0),
      byTriggeredBy,
      rollingHourCount: Number(hourlyRow.recentCount),
      hourlyLimit: effectiveHourlyLimit,
    },
  });
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

    // Tenant hourly rate limit: count analyses in the rolling last hour and reject if over the cap
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [[hourlyRow], [tenantRow]] = await Promise.all([
      db
        .select({ recentCount: count() })
        .from(intelligenceAnalysisLogTable)
        .where(
          and(
            eq(intelligenceAnalysisLogTable.tenantId, tenantId),
            gte(intelligenceAnalysisLogTable.createdAt, oneHourAgo)
          )
        ),
      db
        .select({ maxAnalysesPerHour: tenantsTable.maxAnalysesPerHour })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId)),
    ]);

    const effectiveHourlyLimit = tenantRow?.maxAnalysesPerHour ?? MAX_ANALYSES_PER_TENANT_PER_HOUR;
    const recentCount = Number(hourlyRow?.recentCount ?? 0);
    if (recentCount >= effectiveHourlyLimit) {
      req.log.warn(
        { tenantId, recentCount, limit: effectiveHourlyLimit },
        "intelligence/analyze: tenant hourly rate limit exceeded"
      );
      res.status(429).json({
        error: `Your tenant has exceeded the maximum of ${effectiveHourlyLimit} AI analyses per hour. Please wait before running more analyses.`,
        retryAfterSeconds: 3600,
        limit: effectiveHourlyLimit,
        recentCount,
      });
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
      if (err instanceof AnalysisAlreadyInFlightError) {
        res.status(409).json({ error: "An analysis is already running for this lead. Please try again shortly." });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("classificado como não-lead")) {
        res.status(422).json({ error: message });
        return;
      }
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

// ── POST /tenants/:tenantId/leads/:leadId/mark-churned ───────────────────────
// Marks a lead as confirmed churned: sets is_churned=true + churned_at on leads,
// and optionally updates the latest churn action as unsuccessful.
router.post(
  "/tenants/:tenantId/leads/:leadId/mark-churned",
  async (req, res) => {
    const { tenantId, leadId } = req.params;

    const [lead] = await db
      .select({ id: leadsTable.id, isChurned: leadsTable.isChurned })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
      .limit(1);

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    if (lead.isChurned) {
      res.json({ ok: true, alreadyChurned: true });
      return;
    }

    await db
      .update(leadsTable)
      .set({ isChurned: true, churnedAt: new Date(), updatedAt: new Date() })
      .where(eq(leadsTable.id, leadId));

    // Mark latest pending churn action as unsuccessful (feedback loop)
    const [latestAction] = await db
      .select({ id: churnActionsTable.id })
      .from(churnActionsTable)
      .where(
        and(
          eq(churnActionsTable.tenantId, tenantId),
          eq(churnActionsTable.leadId, leadId),
        )
      )
      .orderBy(desc(churnActionsTable.executedAt))
      .limit(1);

    if (latestAction && latestAction.id) {
      await db
        .update(churnActionsTable)
        .set({ actionSuccessful: false })
        .where(eq(churnActionsTable.id, latestAction.id));
    }

    req.log.info({ tenantId, leadId }, "churn: lead marked as churned");
    res.json({ ok: true, churnedAt: new Date().toISOString() });
  }
);

// ── POST /tenants/:tenantId/churn-actions/:actionId/result ───────────────────
// Records whether a churn-prevention action was successful.
router.post(
  "/tenants/:tenantId/churn-actions/:actionId/result",
  async (req, res) => {
    const { tenantId, actionId } = req.params;
    const { successful } = req.body as { successful: boolean };

    if (typeof successful !== "boolean") {
      res.status(400).json({ error: "successful (boolean) is required" });
      return;
    }

    const [action] = await db
      .select({ id: churnActionsTable.id, tenantId: churnActionsTable.tenantId })
      .from(churnActionsTable)
      .where(and(eq(churnActionsTable.id, actionId), eq(churnActionsTable.tenantId, tenantId)))
      .limit(1);

    if (!action) {
      res.status(404).json({ error: "Churn action not found" });
      return;
    }

    await db
      .update(churnActionsTable)
      .set({ actionSuccessful: successful })
      .where(eq(churnActionsTable.id, actionId));

    req.log.info({ tenantId, actionId, successful }, "churn: action result recorded");
    res.json({ ok: true });
  }
);

export default router;
