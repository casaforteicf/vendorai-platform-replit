import { describe, expect, it } from "vitest";
import { detectAiAssistant, normalizePageKey, percentDelta } from "./ai-visibility.js";

describe("AI visibility helpers", () => {
  it("identifies supported AI assistant referrals without classifying ordinary search as AI", () => {
    expect(detectAiAssistant({ referrer: "https://chatgpt.com/c/abc" })).toBe("ChatGPT");
    expect(detectAiAssistant({ source: "perplexity" })).toBe("Perplexity");
    expect(detectAiAssistant({ referrer: "https://copilot.microsoft.com/" })).toBe("Microsoft Copilot");
    expect(detectAiAssistant({ sourceLabel: "Google Gemini" })).toBe("Gemini");
    expect(detectAiAssistant({ referrer: "https://claude.ai/new" })).toBe("Claude");
    expect(detectAiAssistant({ referrer: "https://www.google.com/search?q=vendorai" })).toBeNull();
    expect(detectAiAssistant({ referrer: "https://www.bing.com/search?q=vendorai" })).toBeNull();
  });

  it("normalizes absolute and relative page URLs for Search Console correlation", () => {
    expect(normalizePageKey("https://appvendorai.com/seo/ia/?utm_source=x")).toBe("/seo/ia?utm_source=x");
    expect(normalizePageKey("/seo/ia/")).toBe("/seo/ia");
    expect(normalizePageKey("https://appvendorai.com/")).toBe("/");
  });

  it("calculates snapshot variation", () => {
    expect(percentDelta(120, 100)).toBe(20);
    expect(percentDelta(80, 100)).toBe(-20);
    expect(percentDelta(10, 0)).toBe(100);
    expect(percentDelta(0, 0)).toBeNull();
  });
});
