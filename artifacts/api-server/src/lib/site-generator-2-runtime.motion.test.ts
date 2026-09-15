import { describe, expect, it } from "vitest";
import { enhanceSiteGenerator2Html } from "./site-generator-2-runtime.js";
import type { SitePageSpec } from "@workspace/vendor-brain/site-generator-2";

const pageSpec: SitePageSpec = {
  schemaVersion: "2.0",
  surface: "landing",
  director: {
    style: "technical",
    density: "balanced",
    motionLevel: "dynamic",
    typographyMood: "technical",
    imageStrategy: "real-first",
    heroStrategy: "split",
    rationale: ["test"],
  },
  sections: [
    { id: "hero-1", kind: "hero", componentId: "hero-split-01", motion: "fade-up" },
    { id: "process-2", kind: "process", componentId: "process-timeline-01", motion: "stagger-children" },
    { id: "solution-3", kind: "solution", componentId: "solution-split-01", motion: "image-reveal" },
    { id: "video-4", kind: "video", componentId: "video-feature-01", motion: "image-reveal" },
    { id: "cta-5", kind: "cta", componentId: "cta-whatsapp-01", motion: "fade-up" },
  ],
  mediaRefs: ["https://example.com/dashboard.png"],
  seo: { automatic: true, draftIndexing: "noindex", publishedIndexing: "index" },
  refinement: { mode: "chat-on-current-version", automaticVariants: false, preserveUnaffectedSections: true },
};

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>VendorAI Demo</title><meta name="description" content="Demo do produto VendorAI"><meta name="robots" content="noindex,nofollow"></head><body><main>
<section><h1>Tecnologia para vendas</h1><p>Veja o sistema.</p><a href="#demo">Ver demo</a><img src="https://example.com/hero.png" alt="Hero"></section>
<section><h2>Como funciona</h2><article>Lead</article><article>Contexto</article><article>Próximo passo</article></section>
<section><h2>Painel e CRM na prática</h2><div class="metric">Pipeline</div><img src="https://example.com/dashboard.png" alt="Dashboard"></section>
<section><h2>Veja a demonstração</h2><video src="https://example.com/demo.mp4"></video></section>
<section><h2>Pronto para avançar?</h2><a href="https://wa.me/5500000000000">Falar no WhatsApp</a></section>
</main></body></html>`;

describe("Site Generator 2 tech motion pack", () => {
  it("assigns intent-aware motion presets and keeps accessibility fallback", () => {
    const result = enhanceSiteGenerator2Html({
      html,
      pageSpec,
      config: {
        type: "landing",
        name: "VendorAI",
        headline: "Tecnologia para vendas",
        desc: "Demonstração do produto VendorAI",
        cta: "Falar no WhatsApp",
        images: ["https://example.com/dashboard.png"],
        videos: ["https://example.com/demo.mp4"],
      } as any,
      published: false,
    });

    expect(result.html).toContain('data-motion="hero-reveal"');
    expect(result.html).toContain('data-motion="workflow-sequence"');
    expect(result.html).toContain('data-motion="interface-reveal"');
    expect(result.html).toContain('data-motion="demo-video-frame"');
    expect(result.html).toContain('data-motion="cta-glow"');
    expect(result.html).toContain("prefers-reduced-motion:reduce");
    expect(result.html).toContain("vFeaturePulse");
    expect(result.html).toContain('data-motion-level="dynamic"');
  });
});
