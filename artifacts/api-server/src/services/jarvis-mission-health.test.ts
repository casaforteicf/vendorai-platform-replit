import { describe, expect, it } from "vitest";
import { evaluateJarvisMissionHealth } from "./jarvis-mission-health.js";

const now = new Date("2026-09-10T12:00:00.000Z");

function base(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    title: "Aumentar conversão",
    priority: 80,
    deadlineAt: new Date("2026-10-10T12:00:00.000Z"),
    lastReviewedAt: new Date("2026-09-09T12:00:00.000Z"),
    baseline: { value: 10 },
    target: { value: 20 },
    currentState: { value: 12 },
    successMetric: "Conversão %",
    decisionReviews: [],
    ...overrides,
  };
}

describe("Jarvis Mission Health", () => {
  it("marca saudável quando a missão tem cobertura e revisão recente", () => {
    expect(evaluateJarvisMissionHealth(base() as any, now).level).toBe("healthy");
  });

  it("marca crítica quando o prazo venceu", () => {
    const result = evaluateJarvisMissionHealth(base({ deadlineAt: new Date("2026-09-01T12:00:00.000Z") }) as any, now);
    expect(result.level).toBe("critical");
    expect(result.reasons.some((reason) => reason.includes("prazo vencido"))).toBe(true);
  });

  it("marca crítica quando existe decisão pendente com revisão vencida", () => {
    const result = evaluateJarvisMissionHealth(base({
      decisionReviews: [{ reviewAt: new Date("2026-09-09T12:00:00.000Z"), resultStatus: "pending" }],
    }) as any, now);
    expect(result.level).toBe("critical");
    expect(result.overdueDecisionReviews).toBe(1);
  });

  it("pede atenção quando falta baseline, meta ou estado atual", () => {
    const result = evaluateJarvisMissionHealth(base({ baseline: null, target: null, currentState: null }) as any, now);
    expect(result.level).toBe("attention");
    expect(result.reasons).toContain("baseline não registrado");
    expect(result.reasons).toContain("meta mensurável não registrada");
    expect(result.reasons).toContain("estado atual/progresso ainda não registrado");
  });
});
