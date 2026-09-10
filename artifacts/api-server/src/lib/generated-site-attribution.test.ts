import { describe, expect, it } from "vitest";
import { injectGeneratedSiteTouchpointTracking } from "./generated-site-attribution.js";

describe("generated site commerce injection", () => {
  it("injects tracking and commerce checkout before body close", () => {
    const html = "<!doctype html><html><body><a href=\"#checkout\">Começar agora</a></body></html>";
    const result = injectGeneratedSiteTouchpointTracking(html, "construtora-setembro");
    expect(result).toContain('data-vai-generated-touchpoints="v3"');
    expect(result).toContain('data-vai-commerce-checkout="v1"');
    expect(result).toContain("construtora-setembro");
    expect(result.indexOf('data-vai-commerce-checkout="v1"')).toBeLessThan(result.indexOf("</body>"));
  });

  it("replaces persisted older collectors instead of duplicating them", () => {
    const html = '<html><body><script data-vai-generated-touchpoints="v2">old()</script><p>LP</p></body></html>';
    const result = injectGeneratedSiteTouchpointTracking(html, "lp-x");
    expect(result).not.toContain("old()");
    expect(result.match(/data-vai-generated-touchpoints=/g)).toHaveLength(1);
    expect(result.match(/data-vai-commerce-checkout=/g)).toHaveLength(1);
  });
});
