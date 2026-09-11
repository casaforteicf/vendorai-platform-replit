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

manifest.growthPages = pages;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Marca a versão realmente publicada para o smoke esperar o deploy correto no edge.
const deploymentVersion = process.env.GITHUB_SHA || "local";
fs.writeFileSync(path.resolve(outDir, "deployment-version.txt"), `${deploymentVersion}\n`);

console.log(`[seo-growth] appended ${pages.length} commercial-intent pages`);
console.log(`[deploy] version ${deploymentVersion}`);
