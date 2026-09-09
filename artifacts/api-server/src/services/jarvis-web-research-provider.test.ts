import { describe, expect, it } from "vitest";
import { shouldUseJarvisWebResearch } from "./jarvis-web-research-provider.js";

describe("Jarvis web research routing", () => {
  it("usa web para domínios regulados e atuais", () => {
    expect(shouldUseJarvisWebResearch("tax")).toBe(true);
    expect(shouldUseJarvisWebResearch("legal_regulatory")).toBe(true);
    expect(shouldUseJarvisWebResearch("trade")).toBe(true);
    expect(shouldUseJarvisWebResearch("credit")).toBe(true);
  });

  it("usa web para recomendações e como fallback de mercado", () => {
    expect(shouldUseJarvisWebResearch("recommendations_lifestyle")).toBe(true);
    expect(shouldUseJarvisWebResearch("market_data")).toBe(true);
    expect(shouldUseJarvisWebResearch("vendorai_business")).toBe(false);
  });
});
