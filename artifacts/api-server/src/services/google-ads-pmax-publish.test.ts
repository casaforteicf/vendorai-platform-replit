import { describe, expect, it } from "vitest";
import { validatePmaxCreative } from "./google-ads-pmax-publish.js";

describe("Performance Max creative requirements", () => {
  it("normalizes a valid minimum creative set", () => {
    const result = validatePmaxCreative({
      headlines: ["Título A", "Título B", "Título C"],
      descriptions: ["Descrição curta para conversão", "Descrição mais completa para a campanha Performance Max"],
      images: ["https://example.com/image.jpg"],
    });
    expect(result.headlines).toHaveLength(3);
    expect(result.descriptions.length).toBeGreaterThanOrEqual(2);
    expect(result.descriptions.some((value) => value.length <= 60)).toBe(true);
    expect(result.longHeadline.length).toBeLessThanOrEqual(90);
  });

  it("blocks incomplete PMax assets before any Google Ads write", () => {
    expect(() => validatePmaxCreative({
      headlines: ["Só um título"],
      descriptions: ["Uma descrição"],
      images: [],
    })).toThrow(/3 títulos/);
  });
});
