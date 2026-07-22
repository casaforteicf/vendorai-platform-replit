import { describe, expect, it } from "vitest";
import {
  buildDistributorCandidate,
  DISTRIBUTOR_REVENUE_CONFIG,
  isDistributorVertical,
} from "../services/distributorRevenueEngine.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

describe("Distributor Revenue Scout", () => {
  it("recognizes only the supported distributor verticals", () => {
    expect(isDistributorVertical("Distribuidora de Alimentos")).toBe(true);
    expect(isDistributorVertical("Seguros Corporativos")).toBe(false);
  });

  it.each(Object.entries(DISTRIBUTOR_REVENUE_CONFIG))(
    "creates segment-specific reorder opportunities for %s",
    (vertical, config) => {
      const candidate = buildDistributorCandidate(vertical as keyof typeof DISTRIBUTOR_REVENUE_CONFIG, {
        leadId: "lead-1",
        leadName: "Cliente Teste",
        dates: [daysAgo(config.reorderDays + 1)],
        totals: [1000, 500],
        itemNames: ["Produto A", "Produto A", "Produto B"],
      }, now);

      expect(candidate?.tipo).toBe("recompra");
      expect(candidate?.estimatedValue).toBe(750);
      expect(candidate?.explanation.autonomy.automaticContact).toBe(false);
      expect(candidate?.explanation.facts.recentProducts).toEqual(["Produto A", "Produto B"]);
    },
  );

  it("promotes overdue food customers to reactivation", () => {
    const candidate = buildDistributorCandidate("Distribuidora de Alimentos", {
      leadId: "lead-2",
      dates: [daysAgo(60)],
      totals: [250],
      itemNames: ["Congelados"],
    }, now);

    expect(candidate?.tipo).toBe("reativacao");
    expect(candidate?.score).toBeGreaterThanOrEqual(60);
  });

  it("does not create an opportunity before the segment reorder cycle", () => {
    const candidate = buildDistributorCandidate("Distribuidora de Máquinas e Insumos", {
      leadId: "lead-3",
      dates: [daysAgo(30)],
      totals: [5000],
      itemNames: ["Compressor"],
    }, now);

    expect(candidate).toBeNull();
  });
});
