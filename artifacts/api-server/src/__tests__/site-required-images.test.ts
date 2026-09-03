import { describe, expect, it } from "vitest";
import {
  ensureRequiredImagesInHtml,
  findMissingRequiredImages,
  normalizeRequiredImageUrls,
} from "../lib/site-required-images.js";

describe("site required images", () => {
  it("normalizes and deduplicates attached image URLs", () => {
    expect(normalizeRequiredImageUrls([" https://cdn.test/a.jpg ", "https://cdn.test/a.jpg", "", "https://cdn.test/b.jpg"]))
      .toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
  });

  it("accepts URLs encoded with HTML ampersands", () => {
    const url = "https://cdn.test/a.jpg?x=1&y=2";
    const html = '<html><body><img src="https://cdn.test/a.jpg?x=1&amp;y=2"></body></html>';
    expect(findMissingRequiredImages(html, [url])).toEqual([]);
  });

  it("injects every omitted attachment as visible site content", () => {
    const first = "https://cdn.test/a.jpg";
    const second = "https://cdn.test/b.jpg";
    const html = `<html><body><main><img src="${first}" alt="A"></main></body></html>`;

    const result = ensureRequiredImagesInHtml(html, [first, second], "Vendor Teste");

    expect(result.injected).toEqual([second]);
    expect(result.html).toContain(first);
    expect(result.html).toContain(second);
    expect(result.html).toContain('data-vendorai-required-images="true"');
    expect(result.html).toContain("Imagens fornecidas pelo cliente");
  });

  it("does not alter HTML when all attachments are already used", () => {
    const url = "https://cdn.test/a.jpg";
    const html = `<html><body><img src="${url}" alt="A"></body></html>`;
    expect(ensureRequiredImagesInHtml(html, [url], "Vendor Teste")).toEqual({ html, injected: [] });
  });
});
