import { describe, expect, it } from "vitest";
import { buildJarvisMissionTrackingSignals } from "./jarvis-mission-tracking.js";

const now = new Date("2026-09-10T12:00:00.000Z");

function mission(overrides: Partial<Parameters<typeof buildJarvisMissionTrackingSignals>[0][number]> = {}) {
  return {
    id: "m1",
    title: "Aumentar conversão",
    priority: 70,
    deadlineAt: new Date("2026-10-10T12:00:00.000Z"),
    lastReviewedAt: new Date("2026-09-08T12:00:00.000Z"),
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    baseline: { conversion: 10 },
    target: { conversion: 20 },
    currentState: { conversion: 12 },
    ...overrides,
  };
}

describe("Jarvis Mission Tracking", () => {
  it("detecta missão vencida", () => {
    const signals = buildJarvisMissionTrackingSignals([
      mission({ deadlineAt: new Date("2026-09-01T12:00:00.000Z") }),
    ], [], now);
    expect(signals.some((item) => item.type === "mission_overdue")).toBe(true);
  });

  it("detecta revisão vencida de decisão pendente", () => {
    const signals = buildJarvisMissionTrackingSignals([], [{
      id: "d1",
      title: "Priorizar Joinville",
      missionId: "m1",
      reviewAt: new Date("2026-09-01T12:00:00.000Z"),
      resultStatus: "pending",
      actualOutcome: null,
    }], now);
    expect(signals[0]?.type).toBe("decision_review_due");
  });

  it("não sinaliza decisão já revisada", () => {
    const signals = buildJarvisMissionTrackingSignals([], [{
      id: "d1",
      title: "Priorizar Joinville",
      missionId: "m1",
      reviewAt: new Date("2026-09-01T12:00:00.000Z"),
      resultStatus: "success",
      actualOutcome: "Meta atingida",
    }], now);
    expect(signals).toHaveLength(0);
  });

  it("detecta lacuna de medição sem confundir nota textual com estado mensurável", () => {
    const signals = buildJarvisMissionTrackingSignals([
      mission({ currentState: { note: "Estamos avançando", updatedAt: now.toISOString() } }),
    ], [], now);
    expect(signals.some((item) => item.type === "mission_measurement_gap")).toBe(true);
  });

  it("prioriza sinais críticos antes dos médios", () => {
    const signals = buildJarvisMissionTrackingSignals([
      mission({ id: "critical", priority: 90, deadlineAt: new Date("2026-08-01T12:00:00.000Z") }),
      mission({ id: "medium", priority: 40, baseline: null }),
    ], [], now);
    expect(signals[0]?.severity).toBe("critical");
  });
});
