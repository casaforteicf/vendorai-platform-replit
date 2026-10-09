import { describe, expect, it } from "vitest";
import { calculateOriginShareCents } from "../services/commission-engine.js";

describe("Arqdor origin commission sharing", () => {
  it("returns 25% of the commission, not 25% of the sale", () => {
    // Sale example: R$ 100.000; commission = R$ 10.000.
    // Origin share must be R$ 2.500 = 25% of the commission.
    expect(calculateOriginShareCents(1_000_000, 25)).toBe(250_000);
  });

  it("supports configurable percentages and clamps invalid percentages", () => {
    expect(calculateOriginShareCents(1_000_000, 15)).toBe(150_000);
    expect(calculateOriginShareCents(1_000_000, 120)).toBe(1_000_000);
    expect(calculateOriginShareCents(1_000_000, -5)).toBe(0);
  });

  it("never creates a negative share", () => {
    expect(calculateOriginShareCents(-5000, 25)).toBe(0);
  });
});
