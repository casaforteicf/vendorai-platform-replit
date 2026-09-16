import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const sitemapPath = path.join(outDir, "sitemap.xml");
const xml = fs.readFileSync(sitemapPath, "utf8");
const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];

if (!urlBlocks.length) throw new Error("[sitemap-index] sitemap.xml has no <url> entries");

// Crawl-focus strategy: keep the full site live/indexable, but submit only the
// strongest commercial/content nucleus while Google is still establishing crawl trust.
// Expand this list progressively as the priority set gets crawled/indexed.
const priorityPaths = new Set([
  "/",
  "/produtos",
  "/funcionalidades",
  "/solucoes",
  "/blog",
  "/precos",
  "/sobre",
  "/contato",

  "/produtos/crm",
  "/produtos/agentes-ia",
  "/produtos/prospeccao",
  "/produtos/revenue-scout",
  "/produtos/omnichannel",
  "/produtos/marketing",
  "/produtos/agenda-inteligente",
  "/produtos/sites-lp-ecommerce",

  "/solucoes/crm-whatsapp",
  "/solucoes/agentes-ia-vendas",
  "/solucoes/automatizar-follow-up",
  "/solucoes/recuperar-leads-parados",
  "/solucoes/prospeccao-b2b-ia",
  "/solucoes/revenue-intelligence",
  "/solucoes/qualificar-leads-com-ia",
  "/solucoes/pipeline-vendas-com-ia",
  "/solucoes/multiatendimento-whatsapp",
  "/solucoes/automacao-comercial",

  "/segmentos/retail",
  "/segmentos/clinics",
  "/segmentos/dealerships",
  "/segmentos/distributors",
  "/segmentos/services",
  "/segmentos/industries",

  "/agentes-virtuais-inteligentes",
  "/agentes-virtuais-inteligentes/recepcao",
  "/agentes-virtuais-inteligentes/sdr",
  "/agentes-virtuais-inteligentes/closer",
  "/agentes-virtuais-inteligentes/follow-up",
  "/agentes-virtuais-inteligentes/agendamento",
  "/agentes-virtuais-inteligentes/suporte",
  "/agentes-virtuais-inteligentes/pos-venda",
  "/agentes-virtuais-inteligentes/revenue-scout",

  "/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona",
  "/blog/como-aumentar-recompra-produtividade-comercial-distribuidoras",
  "/comparar/crm-com-ia-vs-crm-tradicional",
]);

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
const selected = [];
for (const block of urlBlocks) {
  const loc = locFromBlock(block);
  if (seen.has(loc)) throw new Error(`[sitemap-index] duplicate URL: ${loc}`);
  seen.add(loc);
  const pathname = new URL(loc).pathname;
  if (!priorityPaths.has(pathname)) continue;
  selected.push(block);
  groups[groupFor(loc)].push(block);
}

if (selected.length < 30 || selected.length > 50) {
  throw new Error(`[sitemap-index] priority nucleus must stay between 30 and 50 URLs; selected=${selected.length}`);
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
const writtenChildren = [];
for (const [key, filename] of childFiles) {
  const blocks = groups[key];
  if (!blocks.length) continue;
  fs.writeFileSync(path.join(outDir, filename), `${header}${blocks.join("\n")}${footer}`);
  written += blocks.length;
  writtenChildren.push([key, filename]);
}

if (written !== selected.length) {
  throw new Error(`[sitemap-index] priority preservation failed: selected=${selected.length}, written=${written}`);
}

const baseUrl = "https://appvendorai.com";
const today = new Date().toISOString().slice(0, 10);
const indexEntries = writtenChildren.map(([, filename]) => `  <sitemap>\n    <loc>${baseUrl}/${filename}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join("\n");
const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEntries}\n</sitemapindex>\n`;
fs.writeFileSync(sitemapPath, sitemapIndex);

const groupSummary = writtenChildren.map(([key]) => `${key}=${groups[key].length}`).join(", ");
console.log(`[sitemap-index] priority nucleus ${selected.length}/${urlBlocks.length} URLs; ${groupSummary}; deferred=${urlBlocks.length - selected.length}`);
