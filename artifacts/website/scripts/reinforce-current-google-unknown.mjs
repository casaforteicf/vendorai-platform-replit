import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routeByPath = new Map((manifest.routes || []).map((route) => [route.pathname, route]));

const targets = [
  ["/blog", "Blog VendorAI"],
  ["/segmentos/distributors", "VendorAI para distribuidoras"],
  ["/segmentos/industries", "VendorAI para indústrias"],
  ["/funcionalidades", "Funcionalidades de CRM e IA"],
  ["/solucoes", "Soluções VendorAI"],
  ["/comparar/crm-com-ia-vs-crm-tradicional", "CRM com IA vs. CRM tradicional"],
  ["/produtos/prospeccao", "Prospecção com IA"],
  ["/solucoes/agentes-ia-vendas", "Agentes de IA para vendas"],
  ["/solucoes/revenue-intelligence", "Revenue Intelligence"],
];

function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nav(items, aria) {
  return `<nav aria-label="${esc(aria)}"><ul>${items.map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ul></nav>`;
}

const missing = targets.filter(([pathname]) => !routeByPath.has(pathname));
if (missing.length) {
  throw new Error(`[google-unknown-current] missing routes: ${missing.map(([pathname]) => pathname).join(", ")}`);
}

const hubs = ["/", "/produtos", "/solucoes", "/blog", "/funcionalidades"]
  .map((pathname) => routeByPath.get(pathname))
  .filter((route) => route?.staticHtml);

const targetLinks = targets.map(([href, label]) => [href, label]);
for (const hub of hubs) {
  if (hub.staticHtml.includes('data-vendorai-google-unknown-current="hub"')) continue;
  hub.staticHtml += `<section data-vendorai-google-unknown-current="hub"><h2>Páginas estratégicas do VendorAI</h2><p>Explore conteúdos, produtos e soluções prioritários para CRM, prospecção, automação, inteligência de receita, distribuidoras, indústrias e vendas com IA.</p>${nav(targetLinks, "Páginas estratégicas do VendorAI")}</section>`;
}

for (const [pathname, label] of targets) {
  const route = routeByPath.get(pathname);
  if (!route?.staticHtml || route.staticHtml.includes('data-vendorai-google-unknown-current="route"')) continue;
  const related = [
    ["/", "VendorAI"],
    ["/produtos", "Produtos"],
    ["/solucoes", "Soluções"],
    ["/funcionalidades", "Funcionalidades"],
    ["/blog", "Blog e guias"],
    ...targets.filter(([href]) => href !== pathname).slice(0, 5),
  ];
  route.staticHtml += `<section data-vendorai-google-unknown-current="route"><h3>Continue explorando o VendorAI</h3><p>${esc(label)} faz parte do ecossistema comercial do VendorAI. Veja também os principais hubs e conteúdos relacionados para aprofundar CRM, vendas, prospecção e inteligência comercial.</p>${nav(related, "Conteúdos relacionados")}</section>`;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[google-unknown-current] reinforced ${targets.length} current Google-unknown routes across ${hubs.length} hubs`);
