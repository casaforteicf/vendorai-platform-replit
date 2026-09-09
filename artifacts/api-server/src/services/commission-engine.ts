import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  commissionEventsTable,
  commissionRulesTable,
  db,
  dealsTable,
  propostasTable,
  sellerCommissionsTable,
  type CommissionActorType,
  type CommissionTrigger,
} from "@workspace/db";

export type CommissionEvaluationInput = {
  tenantId: string;
  trigger: CommissionTrigger;
  dealId?: string | null;
  sellerUserId?: string | null;
  actorType?: CommissionActorType;
  actorId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  baseAmountCents?: number;
  receiptPercent?: number;
  marginPercent?: number | null;
  discountPercent?: number | null;
  productId?: string | null;
  category?: string | null;
  channel?: string | null;
  region?: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
};

function clampPercent(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function matchesOptional(ruleValue: string | null, inputValue: string | null | undefined) {
  return !ruleValue || ruleValue === inputValue;
}

function ruleMatches(rule: typeof commissionRulesTable.$inferSelect, input: CommissionEvaluationInput) {
  if (!rule.active || rule.trigger !== input.trigger) return false;
  if (!matchesOptional(rule.productId, input.productId)) return false;
  if (!matchesOptional(rule.category, input.category)) return false;
  if (!matchesOptional(rule.channel, input.channel)) return false;
  if (!matchesOptional(rule.region, input.region)) return false;
  if (rule.minMarginPercent != null && Number(input.marginPercent ?? -Infinity) < Number(rule.minMarginPercent)) return false;
  if (rule.maxDiscountPercent != null && Number(input.discountPercent ?? Infinity) > Number(rule.maxDiscountPercent)) return false;
  return true;
}

export async function resolveDealIdFromFinancialOrigin(tenantId: string, origemTipo?: string | null, origemId?: string | null) {
  if (!origemId) return null;
  if (origemTipo === "deal" || origemTipo === "negocio") {
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.id, origemId))).limit(1);
    return deal?.id ?? null;
  }
  if (origemTipo === "proposta" || origemTipo === "proposal") {
    const [proposal] = await db.select({ dealId: propostasTable.dealId }).from(propostasTable).where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.id, origemId))).limit(1);
    return proposal?.dealId ?? null;
  }
  return null;
}

async function syncLegacySellerCommission(tenantId: string, dealId: string, sellerUserId: string, reason: string) {
  const [aggregate] = await db
    .select({
      commissionCents: sql<number>`COALESCE(SUM(${commissionEventsTable.commissionCents}), 0)`,
      weightedBaseCents: sql<number>`COALESCE(SUM(${commissionEventsTable.baseAmountCents}), 0)`,
    })
    .from(commissionEventsTable)
    .where(and(
      eq(commissionEventsTable.tenantId, tenantId),
      eq(commissionEventsTable.dealId, dealId),
      eq(commissionEventsTable.sellerUserId, sellerUserId),
      ne(commissionEventsTable.status, "reversed"),
      sql`${commissionEventsTable.status} IN ('released', 'paid')`,
    ));

  const totalCommissionCents = Number(aggregate?.commissionCents ?? 0);
  const totalBaseCents = Number(aggregate?.weightedBaseCents ?? 0);
  const effectivePercent = totalBaseCents > 0 ? (totalCommissionCents / totalBaseCents) * 100 : 0;

  await db.update(sellerCommissionsTable).set({
    status: totalCommissionCents > 0 ? "aprovado" : "pendente",
    percentual: String(effectivePercent),
    valorComissaoCents: totalCommissionCents,
    observacoes: reason,
    updatedAt: new Date(),
  }).where(and(
    eq(sellerCommissionsTable.tenantId, tenantId),
    eq(sellerCommissionsTable.dealId, dealId),
    eq(sellerCommissionsTable.sellerUserId, sellerUserId),
  ));
}

export async function evaluateCommission(input: CommissionEvaluationInput) {
  const [existing] = await db
    .select()
    .from(commissionEventsTable)
    .where(and(eq(commissionEventsTable.tenantId, input.tenantId), eq(commissionEventsTable.correlationId, input.correlationId)))
    .limit(1);
  if (existing) return { event: existing, idempotent: true };

  const rules = await db
    .select()
    .from(commissionRulesTable)
    .where(and(eq(commissionRulesTable.tenantId, input.tenantId), eq(commissionRulesTable.active, true)))
    .orderBy(asc(commissionRulesTable.priority));

  const rule = rules.find((candidate) => ruleMatches(candidate, input)) ?? null;
  const baseAmountCents = Math.max(0, Math.round(Number(input.baseAmountCents ?? 0)));
  const receiptPercent = clampPercent(input.receiptPercent ?? (input.trigger === "payment_reconciled" ? 100 : 0));
  const rawCommissionPercent = clampPercent(rule ? Number(rule.commissionPercent) : 0);
  const commissionPercent = rule?.capPercent != null ? Math.min(rawCommissionPercent, clampPercent(Number(rule.capPercent))) : rawCommissionPercent;
  const eligiblePercent = rule?.proportionalByReceipt === false ? (receiptPercent > 0 ? 100 : 0) : receiptPercent;
  const commissionCents = Math.round(baseAmountCents * (commissionPercent / 100) * (eligiblePercent / 100));
  const status = !rule ? "validation" : "released";
  const reason = !rule
    ? "Nenhuma regra de comissão compatível; revisão necessária."
    : `Regra ${rule.name} aplicada pelo gatilho ${input.trigger}.`;

  const actorType = input.actorType ?? rule?.actorType ?? "seller";
  const actorId = input.actorId ?? input.sellerUserId ?? null;

  const [event] = await db.insert(commissionEventsTable).values({
    tenantId: input.tenantId,
    ruleId: rule?.id ?? null,
    dealId: input.dealId ?? null,
    sellerUserId: input.sellerUserId ?? null,
    actorType,
    actorId,
    trigger: input.trigger,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    baseAmountCents,
    eligiblePercent: String(eligiblePercent),
    commissionPercent: String(commissionPercent),
    commissionCents,
    status,
    reason,
    correlationId: input.correlationId,
    metadata: input.metadata ?? {},
    releasedAt: status === "released" ? new Date() : null,
    updatedAt: new Date(),
  }).returning();

  if (event?.dealId && event.sellerUserId && status === "released") {
    await syncLegacySellerCommission(input.tenantId, event.dealId, event.sellerUserId, reason);
  }

  return { event, rule, idempotent: false };
}
