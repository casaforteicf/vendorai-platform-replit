import { describe, expect, it } from "vitest";
import {
  buildImplementationFollowups,
  buildImplementationPlan,
  buildImplementationReadiness,
  normalizeImplementationState,
  type ImplementationFacts,
} from "./onboarding-implementation.js";

const readyFacts: ImplementationFacts = {
  onboardingComplete: true,
  profileConfigured: true,
  activeUsers: 1,
  whatsappConnected: true,
  instagramConnected: false,
  calendarConnected: false,
  leadCount: 0,
  catalogCount: 1,
  agentsConfigured: true,
  autonomyEnabled: false,
};

function state(manualTest = false) {
  return normalizeImplementationState({ manual: { test: manualTest } });
}

describe("onboarding implementation lifecycle", () => {
  it("treats catalog as a hard blocker for product-heavy segments", () => {
    const plan = buildImplementationPlan("Distribuidora de peças", { ...readyFacts, catalogCount: 0 }, state(true));
    const catalog = plan.find((step) => step.id === "catalog");
    expect(catalog?.hardBlocker).toBe(true);
    expect(catalog?.done).toBe(false);
    expect(buildImplementationReadiness(plan).ready).toBe(false);
  });

  it("does not synthesize a catalog blocker for service segments", () => {
    const plan = buildImplementationPlan("Consultoria empresarial", { ...readyFacts, catalogCount: 0 }, state(true));
    const catalog = plan.find((step) => step.id === "catalog");
    expect(catalog?.hardBlocker).toBe(false);
    expect(catalog?.done).toBe(false);
    expect(buildImplementationReadiness(plan).blockers.some((item) => item.id === "catalog")).toBe(false);
  });

  it("marks catalog readiness only when the official active catalog has items", () => {
    const emptyPlan = buildImplementationPlan("Consultoria empresarial", { ...readyFacts, catalogCount: 0 }, state(true));
    const readyPlan = buildImplementationPlan("Consultoria empresarial", { ...readyFacts, catalogCount: 3 }, state(true));
    expect(emptyPlan.find((step) => step.id === "catalog")?.done).toBe(false);
    expect(readyPlan.find((step) => step.id === "catalog")?.done).toBe(true);
  });

  it("keeps system-observed steps non-acknowledgeable", () => {
    const plan = buildImplementationPlan("Loja", readyFacts, state(false));
    expect(plan.filter((step) => step.id !== "test").every((step) => step.canAcknowledge === false)).toBe(true);
    expect(plan.find((step) => step.id === "test")?.canAcknowledge).toBe(true);
  });

  it("blocks go-live until every hard step is complete", () => {
    const plan = buildImplementationPlan("Loja de materiais", readyFacts, state(false));
    const readiness = buildImplementationReadiness(plan);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map((item) => item.id)).toContain("test");
  });

  it("becomes ready when hard facts and the operational test are complete", () => {
    const plan = buildImplementationPlan("Loja de materiais", readyFacts, state(true));
    expect(buildImplementationReadiness(plan).ready).toBe(true);
  });

  it("builds deterministic D+1, D+3, D+7, D+15 and D+30 follow-ups", () => {
    const followups = buildImplementationFollowups(
      "2026-09-01T12:00:00.000Z",
      { "3": "2026-09-04T13:00:00.000Z" },
      new Date("2026-09-09T12:00:00.000Z"),
    );
    expect(followups.map((item) => item.label)).toEqual(["D+1", "D+3", "D+7", "D+15", "D+30"]);
    expect(followups[0]?.dueAt).toBe("2026-09-02T12:00:00.000Z");
    expect(followups[1]?.status).toBe("completed");
    expect(followups[2]?.status).toBe("due");
    expect(followups[4]?.status).toBe("upcoming");
  });
});
