import { describe, expect, it } from "vitest";
import { buildJourneySteps, deriveJourneyPhase } from "./marketingJourney";

const base = { ready: 0, pending: 0, review: 0, approved: 0, published: 0 };

describe("deriveJourneyPhase", () => {
  it("prioriza produção quando há itens a produzir", () => {
    expect(deriveJourneyPhase({ ...base, ready: 2, review: 5 })).toBe(0);
    expect(deriveJourneyPhase({ ...base, pending: 1 })).toBe(0);
  });

  it("vai para revisão quando nada falta produzir", () => {
    expect(deriveJourneyPhase({ ...base, review: 9, approved: 1 })).toBe(1);
  });

  it("vai para publicação quando não há revisão pendente", () => {
    expect(deriveJourneyPhase({ ...base, approved: 3 })).toBe(2);
  });

  it("vai para resultados quando tudo foi publicado", () => {
    expect(deriveJourneyPhase({ ...base, published: 4 })).toBe(3);
  });

  it("sem itens, começa na produção", () => {
    expect(deriveJourneyPhase(base)).toBe(0);
  });
});

describe("buildJourneySteps", () => {
  it("marca etapas concluídas e a ativa", () => {
    const steps = buildJourneySteps(1);
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "active", "pending", "pending"]);
  });

  it("fecha revisão e publicação quando está em resultados", () => {
    const steps = buildJourneySteps(3);
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "done", "active"]);
  });
});
