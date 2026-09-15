import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routeByPath = new Map((manifest.routes || []).map((route) => [route.pathname, route]));

const targets = [
  ["/segmentos/distributors", "VendorAI para distribuidoras"],
];

function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
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
  hub.staticHtml += `<section data-vendorai-google-unknown-current="hub"><h2>VendorAI para distribuidoras</h2><p>Conheça como o VendorAI apoia distribuidoras com CRM, prospecção B2B, automação comercial, follow-up e inteligência de vendas.</p>${nav(targetLinks, "VendorAI para distribuidoras")}</section>`;
}

for (const [pathname, label] of targets) {
  const route = routeByPath.get(pathname);
  if (!route?.staticHtml || route.staticHtml.includes('data-vendorai-google-unknown-current="route"')) continue;
  const related = [
    ["/", "VendorAI"],
    ["/produtos", "Produtos"],
    ["/solucoes", "Soluções"],
    ["/produtos/crm", "CRM com IA"],
    ["/produtos/prospeccao", "Prospecção com IA"],
    ["/produtos/revenue-scout", "Revenue Scout"],
    ["/solucoes/prospeccao-b2b-ia", "Prospecção B2B com IA"],
    ["/solucoes/automatizar-follow-up", "Follow-up automático"],
    ["/segmentos/industries", "VendorAI para indústrias"],
    ["/blog", "Blog e guias"],
  ];
  route.staticHtml += `<section data-vendorai-google-unknown-current="route"><h2>CRM e automação para distribuidoras</h2><p>${esc(label)} conecta prospecção B2B, CRM, follow-up, inteligência comercial e automação de vendas em um único fluxo. Explore também produtos, soluções e conteúdos relacionados para equipes de distribuição e vendas externas.</p>${nav(related, "Conteúdos relacionados para distribuidoras")}</section>`;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[google-unknown-current] reinforced ${targets.length} current Google-unknown route across ${hubs.length} hubs`);
