import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  commissionEventsTable,
  commissionRulesTable,
  arqdorOriginCommissionRulesTable,
  arqdorOriginCommissionEventsTable,
  db,
  insertCommissionRuleSchema,
  updateCommissionRuleSchema,
  insertArqdorOriginCommissionRuleSchema,
  updateArqdorOriginCommissionRuleSchema,
} from "@workspace/db";
import { evaluateCommission, reverseOriginTenantParticipation } from "../services/commission-engine.js";

const router: IRouter = Router();

type CommissionRuleInsert = typeof commissionRulesTable.$inferInsert;
type CommissionRuleUpdate = Partial<typeof commissionRulesTable.$inferInsert>;

function canAccess(req: Express.Request, tenantId: string) {
  return (req as any).user?.platformRole === "super_admin" || (req as any).user?.tenantId === tenantId;
}

function isAdmin(req: Express.Request) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || role === "tenant_admin";
}

router.get("/tenants/:tenantId/commission-engine/rules", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });
  const rows = await db.select().from(commissionRulesTable).where(eq(commissionRulesTable.tenantId, tenantId)).orderBy(asc(commissionRulesTable.priority), asc(commissionRulesTable.name));
  res.json(rows);
});

router.get("/tenants/:tenantId/commission-engine/origin-share-rules", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });
  const rows = await db.select()
    .from(arqdorOriginCommissionRulesTable)
    .where(eq(arqdorOriginCommissionRulesTable.originTenantId, tenantId))
    .orderBy(asc(arqdorOriginCommissionRulesTable.priority), asc(arqdorOriginCommissionRulesTable.createdAt));
  res.json({
    defaultSharePercent: 25,
    rules: rows,
  });
});

router.post("/tenants/:tenantId/commission-engine/origin-share-rules", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || !isAdmin(req)) return void res.status(403).json({ error: "FORBIDDEN" });
  const parsed = insertArqdorOriginCommissionRuleSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "INVALID_ORIGIN_SHARE_RULE", issues: parsed.error.issues });
  const [row] = await db.insert(arqdorOriginCommissionRulesTable)
    .values({ ...parsed.data, originTenantId: tenantId })
    .returning();
  res.status(201).json(row);
});

router.patch("/tenants/:tenantId/commission-engine/origin-share-rules/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || !isAdmin(req)) return void res.status(403).json({ error: "FORBIDDEN" });
  const parsed = updateArqdorOriginCommissionRuleSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "INVALID_ORIGIN_SHARE_RULE", issues: parsed.error.issues });
  const [row] = await db.update(arqdorOriginCommissionRulesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(arqdorOriginCommissionRulesTable.id, String(req.params.id)),
      eq(arqdorOriginCommissionRulesTable.originTenantId, tenantId),
    ))
    .returning();
  if (!row) return void res.status(404).json({ error: "NOT_FOUND" });
  res.json(row);
});

router.get("/tenants/:tenantId/commission-engine/origin-share-events", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const rows = await db.select()
    .from(arqdorOriginCommissionEventsTable)
    .where(eq(arqdorOriginCommissionEventsTable.originTenantId, tenantId))
    .orderBy(desc(arqdorOriginCommissionEventsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

router.get("/tenants/:tenantId/commission-engine/participation-presets", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });

  res.json({
    terminology: {
      program: "Rede de Parceiros VendorAI",
      specification: "Participação de Especificação",
      acquisition: "Participação de Aquisição",
    },
    specification: {
      suggestedParticipationPercent: 10,
      suggestedPlatformFeePercent: 1,
      requiresMutualAcceptance: true,
      attributionWindowDays: 90,
    },
    acquisition: {
      suggestedSetupParticipationPercent: 30,
      recurringParticipationPercent: null,
      recurringParticipationConfigurable: true,
      attributionWindowDays: 90,
    },
  });
});

router.post("/tenants/:tenantId/commission-engine/rules", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || !isAdmin(req)) return void res.status(403).json({ error: "FORBIDDEN" });
  const parsed = insertCommissionRuleSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return void res.status(422).json({ error: "INVALID_RULE", issues: parsed.error.issues });
  const [row] = await db.insert(commissionRulesTable).values(parsed.data as CommissionRuleInsert).returning();
  res.status(201).json(row);
});

router.patch("/tenants/:tenantId/commission-engine/rules/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || !isAdmin(req)) return void res.status(403).json({ error: "FORBIDDEN" });
  const parsed = updateCommissionRuleSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "INVALID_RULE", issues: parsed.error.issues });
  const updates: CommissionRuleUpdate = { ...(parsed.data as CommissionRuleUpdate), updatedAt: new Date() };
  const [row] = await db.update(commissionRulesTable).set(updates).where(and(eq(commissionRulesTable.id, String(req.params.id)), eq(commissionRulesTable.tenantId, tenantId))).returning();
  if (!row) return void res.status(404).json({ error: "NOT_FOUND" });
  res.json(row);
});

router.get("/tenants/:tenantId/commission-engine/events", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const rows = await db.select().from(commissionEventsTable).where(eq(commissionEventsTable.tenantId, tenantId)).orderBy(desc(commissionEventsTable.createdAt)).limit(limit);
  res.json(rows);
});

router.get("/tenants/:tenantId/commission-engine/summary", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });
  const [row] = await db.select({
    total: sql<number>`count(*)`,
    forecast: sql<number>`count(*) filter (where ${commissionEventsTable.status} = 'forecast')`,
    validation: sql<number>`count(*) filter (where ${commissionEventsTable.status} = 'validation')`,
    released: sql<number>`count(*) filter (where ${commissionEventsTable.status} = 'released')`,
    paid: sql<number>`count(*) filter (where ${commissionEventsTable.status} = 'paid')`,
    reversed: sql<number>`count(*) filter (where ${commissionEventsTable.status} = 'reversed')`,
    participationCents: sql<number>`coalesce(sum(${commissionEventsTable.commissionCents}),0)`,
    platformFeeCents: sql<number>`coalesce(sum(${commissionEventsTable.platformFeeCents}),0)`,
    baseCents: sql<number>`coalesce(sum(${commissionEventsTable.baseAmountCents}),0)`,
  }).from(commissionEventsTable).where(eq(commissionEventsTable.tenantId, tenantId));
  const total = Number(row?.total ?? 0);
  const pct = (value: number) => total ? Number(((value / total) * 100).toFixed(1)) : 0;
  const base = Number(row?.baseCents ?? 0);
  const participationCents = Number(row?.participationCents ?? 0);
  res.json({
    total,
    forecastPercent: pct(Number(row?.forecast ?? 0)),
    validationPercent: pct(Number(row?.validation ?? 0)),
    releasedPercent: pct(Number(row?.released ?? 0)),
    paidPercent: pct(Number(row?.paid ?? 0)),
    reversedPercent: pct(Number(row?.reversed ?? 0)),
    participationCents,
    platformFeeCents: Number(row?.platformFeeCents ?? 0),
    participationToRevenuePercent: base ? Number(((participationCents / base) * 100).toFixed(2)) : 0,
    // Backwards-compatible alias for clients not yet migrated.
    commissionToRevenuePercent: base ? Number(((participationCents / base) * 100).toFixed(2)) : 0,
  });
});

const evaluateBody = z.object({
  trigger: z.enum(["sale_created", "proposal_approved", "contract_signed", "payment_received", "payment_reconciled", "target_reached"]),
  dealId: z.string().optional().nullable(),
  sellerUserId: z.string().optional().nullable(),
  actorType: z.enum(["seller", "manager", "representative", "partner", "affiliate", "influencer", "distributor", "architect_creator"]).optional(),
  actorId: z.string().optional().nullable(),
  participationType: z.enum(["sales", "specification", "acquisition"]).optional(),
  projectId: z.string().optional().nullable(),
  agreementAccepted: z.boolean().optional(),
  sourceType: z.string().optional().nullable(),
  sourceId: z.string().optional().nullable(),
  baseAmountCents: z.number().int().min(0).default(0),
  receiptPercent: z.number().min(0).max(100).optional(),
  marginPercent: z.number().optional().nullable(),
  discountPercent: z.number().optional().nullable(),
  productId: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  channel: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  correlationId: z.string().min(4).max(180),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

router.post("/tenants/:tenantId/commission-engine/evaluate", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "FORBIDDEN" });
  const parsed = evaluateBody.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "INVALID_EVALUATION", issues: parsed.error.issues });
  const result = await evaluateCommission({ tenantId, ...parsed.data });
  res.status(result.idempotent ? 200 : 201).json(result);
});

router.post("/tenants/:tenantId/commission-engine/events/:id/reverse", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || !isAdmin(req)) return void res.status(403).json({ error: "FORBIDDEN" });
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "Estorno administrativo";
  const [row] = await db.update(commissionEventsTable).set({ status: "reversed", reason, reversedAt: new Date(), updatedAt: new Date() }).where(and(eq(commissionEventsTable.id, String(req.params.id)), eq(commissionEventsTable.tenantId, tenantId))).returning();
  if (!row) return void res.status(404).json({ error: "NOT_FOUND" });
  const originReversals = await reverseOriginTenantParticipation(row.id, tenantId, reason);
  res.json({ event: row, originReversals });
});

export default router;
