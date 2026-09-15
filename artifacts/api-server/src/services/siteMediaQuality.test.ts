import { describe, expect, it } from 'vitest';
import { inspectSiteMediaQuality } from './siteMediaQuality';

describe('inspectSiteMediaQuality', () => {
  it('flags generic media, destructive crops and non-adaptive galleries', () => {
    const html = `
      <html><head><style>
        .gallery{display:grid;grid-template-columns:repeat(4,1fr)}
        .gallery img{object-fit:cover}
      </style></head><body>
        <section class="gallery">
          <img src="https://example.com/a.jpg" alt="">
          <img src="https://example.com/b.jpg">
          <img src="https://example.com/c.jpg">
          <img src="https://example.com/d.jpg">
        </section>
      </body></html>`;

    const result = inspectSiteMediaQuality(html);
    expect(result.brokenOrPlaceholderCount).toBe(4);
    expect(result.destructiveCropRiskCount).toBeGreaterThanOrEqual(4);
    expect(result.hasAdaptiveGrid).toBe(false);
    expect(result.severeIssues.length).toBeGreaterThanOrEqual(3);
    expect(result.score).toBeLessThan(60);
  });

  it('accepts stable contextual media with adaptive sizing', () => {
    const html = `
      <html><head><style>
        .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
        .gallery img{aspect-ratio:4/3;object-fit:contain;object-position:center}
      </style></head><body>
        <section class="gallery">
          <img src="/api/storage/objects/a.jpg" alt="Dashboard comercial do CRM VendorAI">
          <img src="/api/storage/objects/b.jpg" alt="Funil de vendas do VendorAI">
          <img src="/api/storage/objects/c.jpg" alt="Tela de automação de follow-up">
        </section>
      </body></html>`;

    const result = inspectSiteMediaQuality(html);
    expect(result.brokenOrPlaceholderCount).toBe(0);
    expect(result.hasAdaptiveGrid).toBe(true);
    expect(result.hasStableMediaSizing).toBe(true);
    expect(result.severeIssues).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});
