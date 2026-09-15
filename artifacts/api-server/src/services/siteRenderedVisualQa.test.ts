import { describe, expect, it } from "vitest";
import {
  inspectRenderedSiteVisualQuality,
  scoreRenderedViewportMetrics,
  type SiteVisualViewport,
} from "./siteRenderedVisualQa";

const mobile: SiteVisualViewport = { key: "mobile-360", width: 360, height: 800 };

describe("scoreRenderedViewportMetrics", () => {
  it("blocks clipped and occluded CTAs", () => {
    const result = scoreRenderedViewportMetrics(mobile, {
      horizontalOverflowPx: 42,
      clippedElementCount: 5,
      clippedTextCount: 2,
      clippedActionCount: 1,
      occludedActionCount: 1,
      hiddenActionCount: 0,
      emptySectionCount: 0,
      oversizedEmptySectionCount: 0,
      hugeGapCount: 0,
      visibleContentCount: 8,
    }, 20_000);

    expect(result.score).toBeLessThan(70);
    expect(result.severeIssues.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts a stable rendered viewport", () => {
    const result = scoreRenderedViewportMetrics(mobile, {
      horizontalOverflowPx: 0,
      clippedElementCount: 0,
      clippedTextCount: 0,
      clippedActionCount: 0,
      occludedActionCount: 0,
      hiddenActionCount: 0,
      emptySectionCount: 0,
      oversizedEmptySectionCount: 0,
      hugeGapCount: 0,
      visibleContentCount: 12,
    }, 30_000);

    expect(result.score).toBe(100);
    expect(result.severeIssues).toHaveLength(0);
  });
});

const browserIt = process.env["VISUAL_QA_BROWSER_TEST"] === "1" ? it : it.skip;

describe("inspectRenderedSiteVisualQuality browser", () => {
  browserIt("renders 360, 390, tablet and desktop and catches mobile overflow", async () => {
    const html = `<!doctype html>
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body{margin:0;font-family:Arial,sans-serif}.hero{padding:40px}.wide{width:720px}.cta{display:inline-flex;min-height:44px;padding:12px 20px}
        @media(min-width:768px){.wide{width:auto}}
      </style></head><body>
        <main><section class="hero"><h1>Teste visual</h1><p class="wide">Conteúdo propositalmente largo no celular.</p><a class="cta" href="#ok">Continuar</a></section></main>
      </body></html>`;

    const result = await inspectRenderedSiteVisualQuality(html);
    expect(result.rendered).toBe(true);
    expect(result.viewports).toHaveLength(4);
    expect(result.viewports.map((entry) => entry.viewport.key)).toEqual(["mobile-360", "mobile-390", "tablet", "desktop"]);
    expect(result.viewports.find((entry) => entry.viewport.key === "mobile-360")?.horizontalOverflowPx).toBeGreaterThan(0);
    expect(result.approved).toBe(false);
  }, 30_000);
});
