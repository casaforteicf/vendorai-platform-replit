import { and, desc, eq } from "drizzle-orm";
import { db, jarvisDecisionsTable, jarvisMissionsTable } from "@workspace/db";

export type JarvisMissionHealthLevel = "critical" | "attention" | "healthy" | "unknown";

export type JarvisMissionHealthItem = {
  id: string;
  title: string;
  priority: number;
  level: JarvisMissionHealthLevel;
  reasons: string[];
  deadlineAt: Date | null;
  lastReviewedAt: Date | null;
  hasBaseline: boolean;
  hasTarget: boolean;
  hasCurrentState: boolean;
  pendingDecisionReviews: number;
  overdueDecisionReviews: number;
  nextReviewAt: Date | null;
};

const DAY = 24 * 60 * 60 * 1000;
const STALE_REVIEW_DAYS = 7;
const DUE_SOON_DAYS = 7;

function minDate(values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}

export function evaluateJarvisMissionHealth(input: {
  id: string;
  title: string;
  priority: number;
  deadlineAt: Date | null;
  lastReviewedAt: Date | null;
  baseline: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
  currentState: Record<string, unknown> | null;
  successMetric: string | null;
  decisionReviews: Array<{ reviewAt: Date | null; resultStatus: string }>;
}, now = new Date()): JarvisMissionHealthItem {
  const reasons: string[] = [];
  const overdueReviews = input.decisionReviews.filter((decision) =>
    decision.resultStatus === "pending" && decision.reviewAt && decision.reviewAt.getTime() < now.getTime(),
  );
  const pendingReviews = input.decisionReviews.filter((decision) => decision.resultStatus === "pending");
  const futureReviews = pendingReviews
    .map((decision) => decision.reviewAt)
    .filter((date): date is Date => Boolean(date) && date!.getTime() >= now.getTime());

  const deadlineMs = input.deadlineAt?.getTime() ?? null;
  const daysToDeadline = deadlineMs == null ? null : Math.ceil((deadlineMs - now.getTime()) / DAY);
  const reviewAgeDays = input.lastReviewedAt
    ? Math.floor((now.getTime() - input.lastReviewedAt.getTime()) / DAY)
    : null;

  if (daysToDeadline != null && daysToDeadline < 0) reasons.push(`prazo vencido há ${Math.abs(daysToDeadline)} dia(s)`);
  else if (daysToDeadline != null && daysToDeadline <= DUE_SOON_DAYS) reasons.push(`prazo em ${daysToDeadline} dia(s)`);

  if (overdueReviews.length) reasons.push(`${overdueReviews.length} decisão(ões) com revisão vencida`);
  if (!input.baseline) reasons.push("baseline não registrado");
  if (!input.target) reasons.push("meta mensurável não registrada");
  if (!input.currentState) reasons.push("estado atual/progresso ainda não registrado");
  if (!input.lastReviewedAt) reasons.push("missão ainda não revisada");
  else if (reviewAgeDays != null && reviewAgeDays >= STALE_REVIEW_DAYS) reasons.push(`sem revisão há ${reviewAgeDays} dia(s)`);

  let level: JarvisMissionHealthLevel = "healthy";
  if ((daysToDeadline != null && daysToDeadline < 0) || overdueReviews.length > 0) level = "critical";
  else if (
    (daysToDeadline != null && daysToDeadline <= DUE_SOON_DAYS) ||
    !input.baseline ||
    !input.target ||
    !input.currentState ||
    !input.lastReviewedAt ||
    (reviewAgeDays != null && reviewAgeDays >= STALE_REVIEW_DAYS)
  ) level = "attention";
  else if (!input.deadlineAt && !input.target && !input.successMetric) level = "unknown";

  return {
    id: input.id,
    title: input.title,
    priority: input.priority,
    level,
    reasons,
    deadlineAt: input.deadlineAt,
    lastReviewedAt: input.lastReviewedAt,
    hasBaseline: Boolean(input.baseline),
    hasTarget: Boolean(input.target),
    hasCurrentState: Boolean(input.currentState),
    pendingDecisionReviews: pendingReviews.length,
    overdueDecisionReviews: overdueReviews.length,
    nextReviewAt: minDate(futureReviews),
  };
}

export async function loadJarvisMissionHealth(tenantId: string, now = new Date()) {
  const [missions, decisions] = await Promise.all([
    db.select({
      id: jarvisMissionsTable.id,
      title: jarvisMissionsTable.title,
      priority: jarvisMissionsTable.priority,
      deadlineAt: jarvisMissionsTable.deadlineAt,
      lastReviewedAt: jarvisMissionsTable.lastReviewedAt,
      baseline: jarvisMissionsTable.baseline,
      target: jarvisMissionsTable.target,
      currentState: jarvisMissionsTable.currentState,
      successMetric: jarvisMissionsTable.successMetric,
    }).from(jarvisMissionsTable)
      .where(and(eq(jarvisMissionsTable.tenantId, tenantId), eq(jarvisMissionsTable.status, "active")))
      .orderBy(desc(jarvisMissionsTable.priority), desc(jarvisMissionsTable.updatedAt))
      .limit(30),
    db.select({
      missionId: jarvisDecisionsTable.missionId,
      reviewAt: jarvisDecisionsTable.reviewAt,
      resultStatus: jarvisDecisionsTable.resultStatus,
    }).from(jarvisDecisionsTable)
      .where(eq(jarvisDecisionsTable.tenantId, tenantId))
      .orderBy(desc(jarvisDecisionsTable.createdAt))
      .limit(200),
  ]);

  const items = missions.map((mission) => evaluateJarvisMissionHealth({
    ...mission,
    decisionReviews: decisions.filter((decision) => decision.missionId === mission.id),
  }, now));

  const weight = { critical: 3, attention: 2, unknown: 1, healthy: 0 } as const;
  items.sort((a, b) => weight[b.level] - weight[a.level] || b.priority - a.priority);

  return {
    generatedAt: now,
    summary: {
      active: items.length,
      critical: items.filter((item) => item.level === "critical").length,
      attention: items.filter((item) => item.level === "attention").length,
      healthy: items.filter((item) => item.level === "healthy").length,
      unknown: items.filter((item) => item.level === "unknown").length,
      overdueDecisionReviews: items.reduce((sum, item) => sum + item.overdueDecisionReviews, 0),
    },
    items,
  };
}
