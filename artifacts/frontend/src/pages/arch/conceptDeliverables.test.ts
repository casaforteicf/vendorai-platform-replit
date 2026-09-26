import { describe, expect, it } from "vitest";
import { buildConceptReadiness } from "../pages/arch/conceptDeliverables";

describe("Arqdor concept deliverables readiness", () => {
  it("marca apresentação do cliente como pronta quando os principais entregáveis existem", () => {
    const result = buildConceptReadiness({
      roomCount: 9,
      floors: 1,
      hasBrief: true,
      hasSitePlacement: true,
      hasNorth: true,
      hasWallModel: true,
      hasDimensions: true,
      hasFacade: true,
      has3d: true,
      hasRender: true,
      renderFidelityApproved: true,
      regulatoryStatus: "verificado",
      hasRegulatoryChecks: true,
      hasArchitectureDNA: true,
      roofConfigured: true,
    });
    expect(result.presentation.status).toBe("ready");
    expect(result.presentation.score).toBeGreaterThanOrEqual(78);
  });

  it("bloqueia apresentação quando o render foi reprovado pelo Fidelity Gate", () => {
    const result = buildConceptReadiness({
      roomCount: 9,
      floors: 1,
      hasBrief: true,
      hasSitePlacement: true,
      hasNorth: true,
      hasWallModel: true,
      hasDimensions: true,
      hasFacade: true,
      has3d: true,
      hasRender: true,
      renderFidelityApproved: false,
      regulatoryStatus: "preliminar",
      hasRegulatoryChecks: true,
      hasArchitectureDNA: true,
      roofConfigured: true,
    });
    expect(result.presentation.status).toBe("blocked");
    expect(result.presentation.blockers).toContain("Renders fotorealistas");
  });

  it("não declara viabilidade legal pronta sem fonte verificada", () => {
    const result = buildConceptReadiness({
      roomCount: 8,
      floors: 2,
      hasBrief: true,
      hasSitePlacement: true,
      hasNorth: false,
      hasWallModel: true,
      hasDimensions: true,
      hasFacade: true,
      has3d: true,
      hasRender: false,
      renderFidelityApproved: null,
      regulatoryStatus: "preliminar",
      hasRegulatoryChecks: true,
      hasArchitectureDNA: true,
      roofConfigured: true,
    });
    const viability = result.deliverables.find((item) => item.id === "feasibility");
    const solar = result.deliverables.find((item) => item.id === "solar");
    expect(viability?.status).toBe("partial");
    expect(solar?.status).toBe("pending");
    expect(result.professional.status).toBe("warning");
  });
});
