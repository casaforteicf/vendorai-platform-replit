import { describe, expect, it } from "vitest";
import {
  SITE_GENERATOR_SYSTEM_PROMPT,
  applySiteSafetyDefaults,
  extractHtmlDocument,
  prepareSiteHtml,
  sanitizeSiteHtml,
  validateSiteHtml,
} from "../lib/site-html-quality.js";

const completeHtml = (
  body: string,
  css = "body{color:#172033;background:#fff}a{color:#175cd3;text-decoration:underline}.btn,button{padding:12px 20px;border:0;background:#175cd3;color:#fff}",
) => `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Casa Forte</title><style>${css.repeat(3)}</style></head><body>${body}</body></html>`;

describe("SITE_GENERATOR_SYSTEM_PROMPT", () => {
  it("requires the commercial, responsive and accessibility quality contract", () => {
    expect(SITE_GENERATOR_SYSTEM_PROMPT).toContain("WCAG AA");
    expect(SITE_GENERATOR_SYSTEM_PROMPT).toContain("mobile-first");
    expect(SITE_GENERATOR_SYSTEM_PROMPT).toContain("português brasileiro");
    expect(SITE_GENERATOR_SYSTEM_PROMPT).toContain("seções vazias");
    expect(SITE_GENERATOR_SYSTEM_PROMPT).toContain("pronto para apresentação");
  });
});

describe("validateSiteHtml", () => {
  it("rejects incomplete and dangerous documents", () => {
    const result = validateSiteHtml(
      "<html><body><script src='https://bad.test/x.js'></script></body></html>",
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["incomplete-html", "dangerous-markup"]),
    );
  });

  it("detects visible quality regressions", () => {
    const html = completeHtml(
      `<section></section><div style="height:900px"></div><p style="color:#fff;background:#fff">Invisível</p><img src="">`,
      "body{width:1200px}",
    );
    const codes = validateSiteHtml(html).issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "invalid-contrast",
        "oversized-empty-element",
        "horizontal-overflow",
        "broken-image",
        "empty-section",
      ]),
    );
  });
});

describe("extractHtmlDocument", () => {
  it("removes prose and markdown fences without truncating an internal string", () => {
    const html = completeHtml(
      `<script>const example = "</html>"</script><main>Casa Forte</main>`,
    );
    const extracted = extractHtmlDocument(
      `Aqui está:\n\`\`\`html\n${html}\n\`\`\`\ntexto final`,
    );
    expect(extracted).toBe(html);
  });
});

describe("site HTML preparation", () => {
  it("removes unsafe markup while preserving inline interaction scripts", () => {
    const html = completeHtml(
      `<a href="javascript:alert(1)">Contato</a><script src="https://bad.test/x.js"></script><script>window.menuReady=true</script>`,
    );
    const sanitized = sanitizeSiteHtml(html);
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("bad.test");
    expect(sanitized).toContain("window.menuReady=true");
  });

  it("injects safe defaults once and returns the exact final document", () => {
    const source = completeHtml(
      `<main><section><h1>Esquadrias que valorizam cada projeto</h1><p>Precisão, conforto e acabamento premium.</p><a class="btn" href="#contato">Solicitar orçamento</a></section></main>`,
    );
    const first = applySiteSafetyDefaults(source);
    const second = applySiteSafetyDefaults(first);
    expect(second.match(/id="__vai_quality_base__"/g)).toHaveLength(1);
    expect(second.match(/id="__vai_quality_guard__"/g)).toHaveLength(1);
    expect(second).toContain("@media(min-width:48rem)");
    expect(second).toContain(":focus-visible");

    const prepared = prepareSiteHtml(source);
    expect(prepared.validation.valid).toBe(true);
    expect(prepared.html).toBe(first);
  });

  it("repairs the downloaded-site regression using the effective ancestor background", () => {
    const source = completeHtml(
      `<section class="dores"><article class="card"><h3>Falta de Confiabilidade</h3><p>Materiais de baixa qualidade prejudicam a durabilidade.</p><button>Saber Mais</button></article></section>`,
      `.dores{background:#292929;color:#fff}.dores .card{height:520px;background:#fff;color:#fff}`,
    );
    const prepared = prepareSiteHtml(source);

    expect(prepared.html).toContain("effectiveBg=el");
    expect(prepared.html).toContain("data-vai-contrast-repaired");
    expect(prepared.html).toContain("button,.btn");
    expect(prepared.validation.valid).toBe(true);
  });
});
