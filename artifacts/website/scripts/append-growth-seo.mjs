import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const outDir = path.resolve(siteRoot, "dist/public");
const manifestPath = path.resolve(outDir, "seo-manifest.json");
const matrixPath = path.resolve(siteRoot, "src/data/seoGrowthMatrix.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const pages = matrix.pages || [];

if (pages.length !== 11) {
  throw new Error(`[seo-growth] expected exactly 11 wave-1 pages, found ${pages.length}`);
}

const paths = pages.map((page) => page.path);
const duplicates = paths.filter((pathname, index) => paths.indexOf(pathname) !== index);
if (duplicates.length) {
  throw new Error(`[seo-growth] duplicate paths: ${[...new Set(duplicates)].join(", ")}`);
}

for (const page of pages) {
  if (!page?.path || !page?.pt?.seoTitle || !page?.pt?.seoDescription) {
    throw new Error(`[seo-growth] invalid page definition for ${page?.path || "unknown"}`);
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
    esTitle: page.es?.seoTitle || null,
    esDescription: page.es?.seoDescription || null,
  };
  const index = manifest.routes.findIndex((item) => item.pathname === page.path);
  if (index >= 0) manifest.routes[index] = { ...manifest.routes[index], ...route };
  else manifest.routes.push(route);
}

const hubs = [
  {
    pathname: "/solucoes",
    title: "Soluções para CRM, Vendas e Receita com IA | VendorAI",
    description: "Encontre soluções VendorAI por problema: CRM e WhatsApp, follow-up, recuperação de leads, reativação, recompra, prospecção e inteligência de receita.",
    esTitle: "Soluciones para CRM, Ventas e Ingresos con IA | VendorAI",
    esDescription: "Encuentra soluciones VendorAI por problema: CRM y WhatsApp, seguimiento, recuperación de leads, reactivación, recompra, prospección e inteligencia de ingresos.",
    type: "collection",
    name: "Soluções por problema",
    priority: 0.91,
  },
  {
    pathname: "/comparar",
    title: "Comparações de CRM, Follow-up e Prospecção com IA | VendorAI",
    description: "Compare CRM com IA, follow-up automático e prospecção assistida por IA com abordagens tradicionais antes de escolher sua operação comercial.",
    esTitle: "Comparaciones de CRM, Seguimiento y Prospección con IA | VendorAI",
    esDescription: "Compara CRM con IA, seguimiento automático y prospección asistida por IA con enfoques tradicionales antes de elegir tu operación comercial.",
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
manifest.growthHubs = hubs;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Marca a versão realmente publicada para o smoke esperar o deploy correto no edge.
const deploymentVersion = process.env.GITHUB_SHA || "local";
fs.writeFileSync(path.resolve(outDir, "deployment-version.txt"), `${deploymentVersion}\n`);

console.log(`[seo-growth] appended ${pages.length} commercial-intent pages and ${hubs.length} hubs`);
console.log(`[deploy] version ${deploymentVersion}`);
