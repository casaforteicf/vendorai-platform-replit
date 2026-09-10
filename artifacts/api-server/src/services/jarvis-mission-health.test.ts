import { describe, expect, it } from "vitest";
import { calculateMissionProgress } from "./jarvis-mission-health.js";

describe("Jarvis Mission Health", () => {
  it("calcula progresso crescente", () => {
    expect(calculateMissionProgress({
      baseline: { value: 10 },
      target: { value: 20 },
      currentState: { value: 15 },
    }).progressPercent).toBe(50);
  });

  it("calcula progresso para meta decrescente", () => {
    expect(calculateMissionProgress({
      baseline: { value: 20 },
      target: { value: 10 },
      currentState: { value: 15 },
    }).progressPercent).toBe(50);
  });

  it("não inventa progresso quando faltam dados comparáveis", () => {
    expect(calculateMissionProgress({
      baseline: null,
      target: { value: 20 },
      currentState: { note: "melhorando" },
    }).progressPercent).toBeNull();
  });
});
