import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const matrixPath = path.resolve(siteRoot, "src/data/seoGrowthMatrix.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

for (const page of matrix.pages || []) {
  if (!page?.path || !page?.pt?.seoTitle || !page?.pt?.seoDescription) continue;
  const route = {
    pathname: page.path,
    title: page.pt.seoTitle,
    description: page.pt.seoDescription,
    // WebPage schema + Spanish fallback already supported by the edge/runtime feature localizer.
    type: "feature",
    name: (page.es?.seoTitle || page.pt.seoTitle).replace(/\s*\|.*$/, ""),
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

manifest.growthPages = matrix.pages || [];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[seo-growth] appended ${(matrix.pages || []).length} commercial-intent pages`);
