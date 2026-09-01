import { describe, expect, it } from "vitest";
import { attributionFromReferer } from "./intake.js";

describe("public intake attribution", () => {
  it("recovers campaign, click ids and landing page slug from appvendorai URL", () => {
    const result = attributionFromReferer(
      "https://clinica-odonto-lp.appvendorai.com/questionario?v=1&utm_source=meta&utm_medium=paid_social&utm_campaign=vai_ab12cd34ef&utm_content=video-a&utm_term=implante&fbclid=FB123&gclid=G123",
    );

    expect(result).toMatchObject({
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "vai_ab12cd34ef",
      utmContent: "video-a",
      utmTerm: "implante",
      fbclid: "FB123",
      gclid: "G123",
      landingPageSlug: "clinica-odonto-lp",
    });
  });

  it("does not infer a VendorAI landing slug for external domains", () => {
    const result = attributionFromReferer(
      "https://example.com/form?utm_campaign=vai_1234567890&utm_source=google",
    );

    expect(result.utmCampaign).toBe("vai_1234567890");
    expect(result.utmSource).toBe("google");
    expect(result.landingPageSlug).toBeUndefined();
  });

  it("handles an invalid referrer without throwing", () => {
    expect(attributionFromReferer("not-a-url")).toEqual({ pageUrl: "not-a-url" });
  });
});