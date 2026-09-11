import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "../dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const overrides = new Map([
  ["/solucoes/reativar-clientes", "Reativação de Clientes com IA | VendorAI"],
  ["/solucoes/revenue-intelligence", "Revenue Intelligence com IA | VendorAI"],
  ["/comparar/crm-com-ia-vs-crm-tradicional", "CRM com IA vs Tradicional | VendorAI"],
]);

for (const route of manifest.routes || []) {
  const title = overrides.get(route.pathname);
  if (title) route.title = title;
}
for (const page of manifest.growthPages || []) {
  const title = overrides.get(page.path);
  if (title && page.pt) page.pt.seoTitle = title;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[seo-title] normalized ${overrides.size} priority titles`);
