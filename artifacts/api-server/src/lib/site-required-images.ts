function decodeComparableHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeRequiredImageUrls(images: readonly string[] | null | undefined): string[] {
  return [...new Set(
    (images ?? [])
      .map((url) => url.trim())
      .filter(Boolean),
  )];
}

export function findMissingRequiredImages(
  html: string,
  images: readonly string[] | null | undefined,
): string[] {
  const comparableHtml = decodeComparableHtml(html);
  return normalizeRequiredImageUrls(images).filter((url) => !comparableHtml.includes(url));
}

export function ensureRequiredImagesInHtml(
  html: string,
  images: readonly string[] | null | undefined,
  businessName = "Empresa",
): { html: string; injected: string[] } {
  const missing = findMissingRequiredImages(html, images);
  if (missing.length === 0) return { html, injected: [] };

  const safeBusinessName = escapeHtmlAttribute(businessName || "Empresa");
  const gallery = `\n<section data-vendorai-required-images="true" aria-label="Imagens fornecidas pelo cliente" style="padding:56px 24px;background:var(--bg-alt,#f8fafc)">\n  <div style="max-width:1120px;margin:0 auto">\n    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:18px">\n      ${missing.map((url, index) => `<figure style="margin:0;overflow:hidden;border-radius:var(--radius,12px);background:var(--bg,#fff)"><img src="${escapeHtmlAttribute(url)}" alt="${safeBusinessName} — imagem ${index + 1}" loading="lazy" style="display:block;width:100%;height:280px;object-fit:cover"></figure>`).join("\n      ")}\n    </div>\n  </div>\n</section>\n`;

  if (/<\/body>/i.test(html)) {
    return {
      html: html.replace(/<\/body>/i, `${gallery}</body>`),
      injected: missing,
    };
  }

  return { html: `${html}${gallery}`, injected: missing };
}
