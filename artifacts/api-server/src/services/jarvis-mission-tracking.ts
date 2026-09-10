export type MissionHealthInput = {
  id: string;
  title: string;
  priority: number;
  deadlineAt: Date | null;
  lastReviewedAt: Date | null;
  createdAt: Date;
  baseline: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
  currentState: Record<string, unknown> | null;
};

export type DecisionReviewInput = {
  id: string;
  title: string;
  missionId: string | null;
  reviewAt: Date | null;
  resultStatus: string;
  actualOutcome: string | null;
};

export type MissionTrackingSignal = {
  type: "mission_overdue" | "mission_review_stale" | "mission_measurement_gap" | "decision_review_due";
  severity: "critical" | "high" | "medium";
  missionId: string | null;
  decisionId: string | null;
  title: string;
  detail: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

function hasUsefulMeasurement(value: Record<string, unknown> | null) {
  if (!value) return false;
  return Object.entries(value).some(([key, item]) => key !== "updatedAt" && key !== "source" && key !== "note" && item != null && item !== "");
}

export function buildJarvisMissionTrackingSignals(
  missions: MissionHealthInput[],
  decisions: DecisionReviewInput[],
  now = new Date(),
): MissionTrackingSignal[] {
  const signals: MissionTrackingSignal[] = [];

  for (const mission of missions) {
    if (mission.deadlineAt && mission.deadlineAt.getTime() < now.getTime()) {
      const overdueDays = Math.max(1, daysBetween(now, mission.deadlineAt));
      signals.push({
        type: "mission_overdue",
        severity: mission.priority >= 80 || overdueDays >= 14 ? "critical" : "high",
        missionId: mission.id,
        decisionId: null,
        title: `Missão fora do prazo: ${mission.title}`,
        detail: `Prazo venceu há ${overdueDays} dia(s). O status ainda está ativo; é necessário revisar progresso, prazo ou conclusão.`,
      });
    }

    const reference = mission.lastReviewedAt ?? mission.createdAt;
    const staleDays = daysBetween(now, reference);
    if (staleDays >= 14) {
      signals.push({
        type: "mission_review_stale",
        severity: mission.priority >= 80 || staleDays >= 30 ? "high" : "medium",
        missionId: mission.id,
        decisionId: null,
        title: `Missão sem revisão recente: ${mission.title}`,
        detail: `Última revisão há ${staleDays} dia(s). Reavaliar progresso, obstáculos e próxima ação.`,
      });
    }

    const hasBaseline = hasUsefulMeasurement(mission.baseline);
    const hasTarget = hasUsefulMeasurement(mission.target);
    const hasCurrent = hasUsefulMeasurement(mission.currentState);
    if (!hasBaseline || !hasTarget || !hasCurrent) {
      const missing = [!hasBaseline ? "baseline" : null, !hasTarget ? "meta" : null, !hasCurrent ? "estado atual mensurável" : null]
        .filter(Boolean)
        .join(", ");
      signals.push({
        type: "mission_measurement_gap",
        severity: mission.priority >= 80 ? "high" : "medium",
        missionId: mission.id,
        decisionId: null,
        title: `Missão com lacuna de medição: ${mission.title}`,
        detail: `Faltam ${missing}. Sem esses dados o JARVIS não deve afirmar avanço percentual nem chance de sucesso.`,
      });
    }
  }

  for (const decision of decisions) {
    if (decision.resultStatus !== "pending" || !decision.reviewAt) continue;
    if (decision.reviewAt.getTime() > now.getTime()) continue;
    const overdueDays = Math.max(0, daysBetween(now, decision.reviewAt));
    signals.push({
      type: "decision_review_due",
      severity: overdueDays >= 14 ? "high" : "medium",
      missionId: decision.missionId,
      decisionId: decision.id,
      title: `Decisão aguardando revisão: ${decision.title}`,
      detail: overdueDays === 0
        ? "A data de revisão chegou e o resultado observado ainda não foi registrado."
        : `Revisão vencida há ${overdueDays} dia(s) e o resultado observado ainda não foi registrado.`,
    });
  }

  const severityRank = { critical: 3, high: 2, medium: 1 } as const;
  return signals.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
}
