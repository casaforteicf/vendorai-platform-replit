import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "site-generator-2-runtime.ts"), "utf8");

describe("Site Generator 2 tech motion pack", () => {
  it("contains intent-aware base and tech motion presets", () => {
    expect(source).toContain('"hero-reveal"');
    expect(source).toContain('"stagger-cards"');
    expect(source).toContain('"hover-lift"');
    expect(source).toContain('"interface-reveal"');
    expect(source).toContain('"feature-highlight"');
    expect(source).toContain('"workflow-sequence"');
    expect(source).toContain('"demo-video-frame"');
    expect(source).toContain('"cta-glow"');
    expect(source).toContain("function resolveRuntimeMotion");
  });

  it("keeps mobile reduction and reduced-motion accessibility", () => {
    expect(source).toContain("@media(max-width:700px)");
    expect(source).toContain("prefers-reduced-motion:reduce");
    expect(source).toContain("vFeaturePulse");
    expect(source).toContain("data-motion-level");
    expect(source).toContain("window.matchMedia");
  });

  it("routes product demos, flows and CTAs to specialized motion", () => {
    expect(source).toContain('if (kind === "hero")');
    expect(source).toContain('if (kind === "process")');
    expect(source).toContain('level === "subtle" ? "stagger-cards" : "workflow-sequence"');
    expect(source).toContain('return "demo-video-frame"');
    expect(source).toContain('return level === "subtle" ? "image-reveal" : "interface-reveal"');
    expect(source).toContain('if (kind === "cta") return "cta-glow"');
  });
});
