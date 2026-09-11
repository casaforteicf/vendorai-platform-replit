import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const outDir = path.resolve(siteRoot, "dist/public");
const manifestPath = path.resolve(outDir, "seo-manifest.json");
const wave1Path = path.resolve(siteRoot, "src/data/seoGrowthMatrix.json");
const wave2Path = path.resolve(siteRoot, "src/data/seoGrowthMatrixWave2.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const wave1 = JSON.parse(fs.readFileSync(wave1Path, "utf8"));
const wave2 = JSON.parse(fs.readFileSync(wave2Path, "utf8"));
const wave1Pages = wave1.pages || [];
const wave2Pages = wave2.pages || [];
const pages = [...wave1Pages, ...wave2Pages];

if (wave1Pages.length !== 11) {
  throw new Error(`[seo-growth] expected exactly 11 wave-1 pages, found ${wave1Pages.length}`);
}
if (wave2Pages.length !== 16) {
  throw new Error(`[seo-growth] expected exactly 16 wave-2 pages, found ${wave2Pages.length}`);
}
if (pages.length !== 27) {
  throw new Error(`[seo-growth] expected exactly 27 commercial-intent pages, found ${pages.length}`);
}

const paths = pages.map((page) => page.path);
const duplicates = paths.filter((pathname, index) => paths.indexOf(pathname) !== index);
if (duplicates.length) {
  throw new Error(`[seo-growth] duplicate paths: ${[...new Set(duplicates)].join(", ")}`);
}

for (const page of pages) {
  if (!page?.path || !page?.pt?.seoTitle || !page?.pt?.seoDescription || !page?.es?.seoTitle || !page?.es?.seoDescription) {
    throw new Error(`[seo-growth] invalid PT/ES page definition for ${page?.path || "unknown"}`);
  }
  if (!Array.isArray(page.products) || page.products.length === 0 || !Array.isArray(page.secondaryKeywords) || page.secondaryKeywords.length === 0) {
    throw new Error(`[seo-growth] incomplete commercial data for ${page.path}`);
  }
  const route = {
    pathname: page.path,
    title: page.pt.seoTitle,
    description: page.pt.seoDescription,
    type: "feature",
    name: page.pt.seoTitle.replace(/\s*\|.*$/, ""),
    priority: page.priority ?? 0.85,
    cluster: page.cluster,
    intent: page.intent,
    funnel: page.funnel,
    primaryKeyword: page.primaryKeyword,
    secondaryKeywords: page.secondaryKeywords || [],
    esTitle: page.es.seoTitle,
    esDescription: page.es.seoDescription,
  };
  const index = manifest.routes.findIndex((item) => item.pathname === page.path);
  if (index >= 0) manifest.routes[index] = { ...manifest.routes[index], ...route };
  else manifest.routes.push(route);
}

const hubs = [
  {
    pathname: "/solucoes",
    title: "Soluções para CRM, Vendas, Retenção e Receita com IA | VendorAI",
    description: "Encontre soluções VendorAI por problema: CRM e WhatsApp, velocidade de resposta, qualificação, follow-up, pipeline, retenção, recompra, automação e inteligência de receita.",
    esTitle: "Soluciones para CRM, Ventas, Retención e Ingresos con IA | VendorAI",
    esDescription: "Encuentra soluciones VendorAI por problema: CRM y WhatsApp, velocidad de respuesta, calificación, seguimiento, pipeline, retención, recompra, automatización e inteligencia de ingresos.",
    type: "collection",
    name: "Soluções por problema",
    priority: 0.91,
  },
  {
    pathname: "/comparar",
    title: "Comparações de CRM, IA e Operação Comercial | VendorAI",
    description: "Compare CRM, WhatsApp, IA, automação, Revenue Intelligence e modelos operacionais para escolher uma arquitetura comercial com menos fragmentação.",
    esTitle: "Comparaciones de CRM, IA y Operación Comercial | VendorAI",
    esDescription: "Compara CRM, WhatsApp, IA, automatización, Revenue Intelligence y modelos operativos para elegir una arquitectura comercial con menos fragmentación.",
    type: "collection",
    name: "Comparações comerciais",
    priority: 0.86,
  },
];

for (const hub of hubs) {
  const index = manifest.routes.findIndex((item) => item.pathname === hub.pathname);
  if (index >= 0) manifest.routes[index] = { ...manifest.routes[index], ...hub };
  else manifest.routes.push(hub);
}

manifest.growthPages = pages;
manifest.growthWaves = { wave1: wave1Pages.length, wave2: wave2Pages.length, total: pages.length };
manifest.growthHubs = hubs;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const deploymentVersion = process.env.GITHUB_SHA || "local";
fs.writeFileSync(path.resolve(outDir, "deployment-version.txt"), `${deploymentVersion}\n`);

console.log(`[seo-growth] appended ${pages.length} commercial-intent pages (${wave1Pages.length} wave 1 + ${wave2Pages.length} wave 2) and ${hubs.length} hubs`);
console.log(`[deploy] version ${deploymentVersion}`);
