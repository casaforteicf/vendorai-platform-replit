import { and, desc, eq } from "drizzle-orm";
import { db, jarvisDecisionsTable, jarvisMissionsTable } from "@workspace/db";

export type MissionHealthStatus = "on_track" | "attention" | "at_risk" | "insufficient_data";

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumericRecordValue(record: Record<string, unknown> | null): number | null {
  if (!record) return null;
  for (const value of Object.values(record)) {
    const parsed = numericValue(value);
    if (parsed != null) return parsed;
  }
  return null;
}

export function calculateMissionProgress(input: {
  baseline: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
  currentState: Record<string, unknown> | null;
}) {
  const baseline = firstNumericRecordValue(input.baseline);
  const target = firstNumericRecordValue(input.target);
  const current = firstNumericRecordValue(input.currentState);
  if (baseline == null || target == null || current == null || target === baseline) {
    return { progressPercent: null as number | null, baseline, target, current };
  }
  const raw = ((current - baseline) / (target - baseline)) * 100;
  return {
    progressPercent: Math.round(Math.max(-100, Math.min(200, raw))),
    baseline,
    target,
    current,
  };
}

export async function loadJarvisMissionHealth(tenantId: string) {
  const now = new Date();
  const [missions, pendingDecisions] = await Promise.all([
    db.select({
      id: jarvisMissionsTable.id,
      title: jarvisMissionsTable.title,
      objective: jarvisMissionsTable.objective,
      priority: jarvisMissionsTable.priority,
      successMetric: jarvisMissionsTable.successMetric,
      baseline: jarvisMissionsTable.baseline,
      target: jarvisMissionsTable.target,
      currentState: jarvisMissionsTable.currentState,
      deadlineAt: jarvisMissionsTable.deadlineAt,
      lastReviewedAt: jarvisMissionsTable.lastReviewedAt,
      updatedAt: jarvisMissionsTable.updatedAt,
    }).from(jarvisMissionsTable)
      .where(and(eq(jarvisMissionsTable.tenantId, tenantId), eq(jarvisMissionsTable.status, "active")))
      .orderBy(desc(jarvisMissionsTable.priority), desc(jarvisMissionsTable.updatedAt))
      .limit(20),
    db.select({
      id: jarvisDecisionsTable.id,
      missionId: jarvisDecisionsTable.missionId,
      title: jarvisDecisionsTable.title,
      decision: jarvisDecisionsTable.decision,
      expectedOutcome: jarvisDecisionsTable.expectedOutcome,
      successMetric: jarvisDecisionsTable.successMetric,
      reviewAt: jarvisDecisionsTable.reviewAt,
      resultStatus: jarvisDecisionsTable.resultStatus,
      actualOutcome: jarvisDecisionsTable.actualOutcome,
    }).from(jarvisDecisionsTable)
      .where(and(eq(jarvisDecisionsTable.tenantId, tenantId), eq(jarvisDecisionsTable.resultStatus, "pending")))
      .orderBy(desc(jarvisDecisionsTable.createdAt))
      .limit(50),
  ]);

  const items = missions.map((mission) => {
    const progress = calculateMissionProgress({ baseline: mission.baseline, target: mission.target, currentState: mission.currentState });
    const daysRemaining = mission.deadlineAt ? Math.ceil((mission.deadlineAt.getTime() - now.getTime()) / 86_400_000) : null;
    const staleDays = Math.floor((now.getTime() - (mission.lastReviewedAt ?? mission.updatedAt).getTime()) / 86_400_000);
    const dueDecisions = pendingDecisions.filter((decision) => decision.missionId === mission.id && decision.reviewAt && decision.reviewAt.getTime() <= now.getTime());
    let health: MissionHealthStatus = "on_track";
    const reasons: string[] = [];
    if (progress.progressPercent == null) { health = "insufficient_data"; reasons.push("baseline/meta/estado atual não permitem medir progresso numericamente"); }
    if (daysRemaining != null && daysRemaining < 0) { health = "at_risk"; reasons.push(`prazo vencido há ${Math.abs(daysRemaining)} dia(s)`); }
    else if (daysRemaining != null && daysRemaining <= 14 && (progress.progressPercent == null || progress.progressPercent < 80)) { health = "at_risk"; reasons.push(`faltam ${daysRemaining} dia(s) e o progresso medido está abaixo do necessário`); }
    else if (daysRemaining != null && daysRemaining <= 30 && progress.progressPercent != null && progress.progressPercent < 60) { health = "attention"; reasons.push(`faltam ${daysRemaining} dia(s) e o progresso está em ${progress.progressPercent}%`); }
    if (staleDays >= 14 && health === "on_track") { health = "attention"; reasons.push(`missão sem revisão há ${staleDays} dia(s)`); }
    if (dueDecisions.length && health !== "at_risk") { health = "attention"; reasons.push(`${dueDecisions.length} decisão(ões) aguardando revisão de resultado`); }
    return { ...mission, ...progress, daysRemaining, staleDays, dueDecisionCount: dueDecisions.length, dueDecisions, health, reasons };
  });

  const overdueDecisions = pendingDecisions.filter((decision) => decision.reviewAt && decision.reviewAt.getTime() <= now.getTime());
  return {
    generatedAt: now,
    summary: {
      activeMissions: items.length,
      atRisk: items.filter((item) => item.health === "at_risk").length,
      attention: items.filter((item) => item.health === "attention").length,
      insufficientData: items.filter((item) => item.health === "insufficient_data").length,
      overdueDecisionReviews: overdueDecisions.length,
    },
    missions: items,
    overdueDecisions,
  };
}
