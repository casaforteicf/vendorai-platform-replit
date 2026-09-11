import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const outDir = path.resolve(siteRoot, "dist/public");
const manifestPath = path.join(outDir, "seo-manifest.json");
const sitemapPath = path.join(outDir, "sitemap.xml");
const baseUrl = "https://appvendorai.com";

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const source = fs.readFileSync(path.resolve(repoRoot, "lib/vendor-brain/src/marketing-verticals.ts"), "utf8");
const macrosegments = new Set(manifest.macrosegments || []);
const parsedVerticals = {};

for (const block of source.split("v({").slice(1)) {
  const macrosegment = block.match(/macrosegment\s*:\s*['"]([^'"]+)['"]/)?.[1];
  const name = block.match(/name\s*:\s*['"]([^'"]+)['"]/)?.[1];
  const slug = block.match(/slug\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (!macrosegment || !name || !slug) continue;
  parsedVerticals[slug] = {
    slug,
    title: name,
    description: `VendorAI para ${name}: marketing, prospecção, atendimento, CRM, vendas, pós-venda e inteligência de receita em uma operação conectada.`,
    macrosegment,
  };
  macrosegments.add(macrosegment);
}

manifest.verticals = { ...(manifest.verticals || {}), ...parsedVerticals };
manifest.macrosegments = [...macrosegments];

for (const [slug, vertical] of Object.entries(parsedVerticals)) {
  const pathname = `/lp/${slug}`;
  if (!manifest.routes.some((route) => route.pathname === pathname)) {
    manifest.routes.push({
      pathname,
      title: `VendorAI para ${vertical.title} — CRM, Vendas e IA`,
      description: vertical.description,
      type: "vertical",
      name: vertical.title,
      priority: 0.8,
    });
  }
}

for (const macrosegment of macrosegments) {
  const pathname = `/segmentos/${macrosegment}`;
  if (!manifest.routes.some((route) => route.pathname === pathname)) {
    const name = String(macrosegment).split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
    manifest.routes.push({
      pathname,
      title: `VendorAI para ${name} — Soluções por Segmento`,
      description: `Veja soluções VendorAI para empresas de ${name} com CRM, marketing, prospecção, atendimento e inteligência de receita.`,
      type: "segment",
      name,
      priority: 0.72,
    });
  }
}

const NOINDEX_PATHS = new Set(["/demo", "/privacy", "/terms", "/cadastro-praca"]);
manifest.routes = manifest.routes.map((route) => ({
  ...route,
  indexable: NOINDEX_PATHS.has(route.pathname) ? false : route.indexable !== false,
}));

const routePaths = manifest.routes.map((route) => route.pathname);
const duplicates = routePaths.filter((pathname, index) => routePaths.indexOf(pathname) !== index);
const emptyMeta = manifest.routes.filter((route) => !route.title?.trim() || !route.description?.trim());
const productCount = Object.keys(manifest.products || {}).length;
const verticalCount = Object.keys(manifest.verticals || {}).length;

if (duplicates.length) throw new Error(`[seo] duplicate routes: ${[...new Set(duplicates)].join(", ")}`);
if (emptyMeta.length) throw new Error(`[seo] routes without title/description: ${emptyMeta.map((route) => route.pathname).join(", ")}`);
if (productCount < 26) throw new Error(`[seo] expected at least 26 products, found ${productCount}`);
if (verticalCount !== 50) throw new Error(`[seo] expected exactly 50 official verticals, found ${verticalCount}`);
if (manifest.macrosegments.length !== 6) throw new Error(`[seo] expected 6 macrosegments, found ${manifest.macrosegments.length}`);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const hreflangs = [
  ["pt-BR", null],
  ["es-PY", "PY"],
  ["es-AR", "AR"],
  ["es-UY", "UY"],
  ["es-CL", "CL"],
];
const xmlEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const today = new Date().toISOString().slice(0, 10);
const sitemapEntries = manifest.routes
  .filter((route) => route.indexable !== false)
  .map((route) => {
    const loc = `${baseUrl}${route.pathname}`;
    const alternates = hreflangs.map(([lang, country]) => {
      const href = country ? `${loc}?country=${country}` : loc;
      return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(href)}" />`;
    }).join("\n");
    return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${route.type === "blog" ? "weekly" : "monthly"}</changefreq>\n    <priority>${route.priority ?? 0.7}</priority>\n${alternates}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(loc)}" />\n  </url>`;
  }).join("\n");

fs.writeFileSync(
  sitemapPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapEntries}\n</urlset>\n`,
);

const sitemapUrlCount = (fs.readFileSync(sitemapPath, "utf8").match(/<url>/g) || []).length;
console.log(`[seo-verify] OK: ${manifest.routes.length} routes, ${productCount} products, ${verticalCount} verticals, ${manifest.macrosegments.length} macrosegments, ${sitemapUrlCount} sitemap URLs`);
