import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const sitemapPath = path.join(outDir, "sitemap.xml");
const xml = fs.readFileSync(sitemapPath, "utf8");
const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];

if (!urlBlocks.length) throw new Error("[sitemap-index] sitemap.xml has no <url> entries");

const groups = {
  core: [],
  products: [],
  solutions: [],
  segments: [],
  content: [],
};

function locFromBlock(block) {
  const match = block.match(/<loc>(.*?)<\/loc>/);
  if (!match) throw new Error("[sitemap-index] URL block missing <loc>");
  return match[1].replace(/&amp;/g, "&");
}

function groupFor(url) {
  const pathname = new URL(url).pathname;
  if (pathname.startsWith("/produtos") || pathname.startsWith("/agentes") || pathname.startsWith("/funcionalidades")) return "products";
  if (pathname.startsWith("/solucoes") || pathname.startsWith("/comparar")) return "solutions";
  if (pathname.startsWith("/segmentos") || pathname.startsWith("/lp/")) return "segments";
  if (pathname === "/blog" || pathname.startsWith("/blog/")) return "content";
  return "core";
}

const seen = new Set();
for (const block of urlBlocks) {
  const loc = locFromBlock(block);
  if (seen.has(loc)) throw new Error(`[sitemap-index] duplicate URL: ${loc}`);
  seen.add(loc);
  groups[groupFor(loc)].push(block);
}

const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
const footer = '\n</urlset>\n';
const childFiles = [
  ["core", "sitemap-core.xml"],
  ["products", "sitemap-products.xml"],
  ["solutions", "sitemap-solutions.xml"],
  ["segments", "sitemap-segments.xml"],
  ["content", "sitemap-content.xml"],
];

let written = 0;
for (const [key, filename] of childFiles) {
  const blocks = groups[key];
  if (!blocks.length) throw new Error(`[sitemap-index] empty group: ${key}`);
  fs.writeFileSync(path.join(outDir, filename), `${header}${blocks.join("\n")}${footer}`);
  written += blocks.length;
}

if (written !== urlBlocks.length || seen.size !== urlBlocks.length) {
  throw new Error(`[sitemap-index] preservation failed: source=${urlBlocks.length}, written=${written}, unique=${seen.size}`);
}

const baseUrl = "https://appvendorai.com";
const today = new Date().toISOString().slice(0, 10);
const indexEntries = childFiles.map(([, filename]) => `  <sitemap>\n    <loc>${baseUrl}/${filename}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join("\n");
const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEntries}\n</sitemapindex>\n`;
fs.writeFileSync(sitemapPath, sitemapIndex);

console.log(`[sitemap-index] ${urlBlocks.length} URLs split into core=${groups.core.length}, products=${groups.products.length}, solutions=${groups.solutions.length}, segments=${groups.segments.length}, content=${groups.content.length}`);
