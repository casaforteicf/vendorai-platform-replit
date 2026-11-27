import { describe, expect, it } from "vitest";
import { normalizeMarketingCopy } from "./marketingCopyGenerator.js";

describe("normalizeMarketingCopy", () => {
  it("trima e limita os campos", () => {
    const copy = normalizeMarketingCopy({
      headline: `  ${"H".repeat(120)}  `,
      supportingText: `  ${"S".repeat(200)}  `,
      cta: "  Reserve agora  ",
    });
    expect(copy?.headline.length).toBe(80);
    expect(copy?.supportingText.length).toBe(140);
    expect(copy?.cta).toBe("Reserve agora");
  });

  it("exige headline e CTA", () => {
    expect(normalizeMarketingCopy({ headline: "Só headline" })).toBeNull();
    expect(normalizeMarketingCopy({ headline: "  ", cta: "Reserve" })).toBeNull();
    expect(normalizeMarketingCopy({ headline: "Ok", cta: "  " })).toBeNull();
  });
});
