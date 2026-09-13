import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const routeByPath = new Map((manifest.routes || []).map((route) => [route.pathname, route]));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nav(items, label) {
  return `<nav aria-label="${escapeHtml(label)}"><ul>${items
    .map(({ href, label: itemLabel }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(itemLabel)}</a></li>`)
    .join("")}</ul></nav>`;
}

const clusters = [
  {
    key: "core-products",
    hub: "/produtos",
    title: "Produtos principais",
    pages: [
      ["/produtos/crm", "CRM com IA"],
      ["/produtos/agentes-ia", "Agentes de IA"],
      ["/produtos/prospeccao", "Prospecção com IA"],
      ["/produtos/revenue-scout", "Revenue Scout"],
      ["/produtos/marketing", "Marketing com IA"],
    ],
  },
  {
    key: "sales-solutions",
    hub: "/solucoes",
    title: "Soluções comerciais",
    pages: [
      ["/solucoes/crm-whatsapp", "CRM para WhatsApp"],
      ["/solucoes/agentes-ia-vendas", "Agentes de IA para vendas"],
      ["/solucoes/automatizar-follow-up", "Follow-up automático"],
      ["/solucoes/qualificar-leads-com-ia", "Qualificação de leads com IA"],
      ["/solucoes/prospeccao-b2b-ia", "Prospecção B2B com IA"],
      ["/solucoes/priorizar-oportunidades", "Priorização de oportunidades"],
      ["/solucoes/next-best-action-vendas", "Next Best Action para vendas"],
      ["/solucoes/revenue-intelligence", "Revenue Intelligence"],
      ["/solucoes/recuperar-leads-parados", "Recuperar leads parados"],
      ["/solucoes/reativar-clientes", "Reativar clientes"],
      ["/solucoes/aumentar-recompra", "Aumentar recompra"],
    ],
  },
  {
    key: "segments",
    hub: "/segmentos",
    title: "Segmentos",
    pages: [
      ["/segmentos/distributors", "Distribuidoras e atacado"],
      ["/segmentos/clinics", "Clínicas"],
      ["/segmentos/dealerships", "Concessionárias"],
      ["/segmentos/retail", "Varejo"],
      ["/segmentos/industries", "Indústrias"],
      ["/segmentos/services", "Empresas de serviços"],
    ],
  },
  {
    key: "commercial-lps",
    hub: "/segmentos/distributors",
    title: "Soluções por nicho",
    pages: [
      ["/lp/distribuidora-materiais-construcao", "Distribuidora de materiais de construção"],
      ["/lp/distribuidora-autopecas", "Distribuidora de autopeças"],
      ["/lp/industria-materiais-construcao", "Indústria de materiais de construção"],
      ["/lp/tecnologia-ti-software", "Tecnologia, TI e software"],
    ],
  },
  {
    key: "guides-comparisons",
    hub: "/blog",
    title: "Guias e comparações",
    pages: [
      ["/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona", "CRM integrado ao WhatsApp: guia"],
      ["/comparar/crm-whatsapp-vs-planilha", "CRM para WhatsApp vs. planilha"],
      ["/comparar/crm-com-ia-vs-crm-tradicional", "CRM com IA vs. CRM tradicional"],
    ],
  },
];

const existingPages = new Set();
for (const cluster of clusters) {
  cluster.pages = cluster.pages
    .filter(([pathname]) => routeByPath.has(pathname))
    .map(([href, label]) => ({ href, label }));
  for (const page of cluster.pages) existingPages.add(page.href);
}

const home = routeByPath.get("/");
if (home?.staticHtml) {
  const hubLinks = clusters
    .map((cluster) => ({ href: routeByPath.has(cluster.hub) ? cluster.hub : cluster.pages[0]?.href, label: cluster.title }))
    .filter((item) => item.href);

  home.staticHtml += `<section data-vendorai-indexing-priority-map="home"><h2>Encontre a solução certa para vender mais com IA</h2><p>Explore produtos, soluções, segmentos, guias e páginas especializadas do VendorAI.</p>${nav(hubLinks, "Mapa de soluções VendorAI")}</section>`;
}

for (const cluster of clusters) {
  if (!cluster.pages.length) continue;

  const hub = routeByPath.get(cluster.hub);
  if (hub?.staticHtml) {
    hub.staticHtml += `<section data-vendorai-indexing-priority-map="${escapeHtml(cluster.key)}"><h2>${escapeHtml(cluster.title)}</h2><p>Conteúdos e soluções relacionados para continuar a jornada.</p>${nav(cluster.pages, cluster.title)}</section>`;
  }

  for (const current of cluster.pages) {
    const route = routeByPath.get(current.href);
    if (!route?.staticHtml) continue;

    const siblings = cluster.pages.filter((item) => item.href !== current.href).slice(0, 6);
    const commonLinks = [
      { href: "/", label: "VendorAI" },
      ...(routeByPath.has(cluster.hub) && cluster.hub !== current.href
        ? [{ href: cluster.hub, label: cluster.title }]
        : []),
      ...siblings,
    ];

    route.staticHtml += `<section data-vendorai-indexing-priority-map="route"><h3>Veja também</h3>${nav(commonLinks, "Conteúdos relacionados")}</section>`;
  }
}

const missingTrackedRoutes = [
  "/segmentos/retail",
  "/solucoes/agentes-ia-vendas",
  "/segmentos/dealerships",
  "/produtos/prospeccao",
  "/segmentos/industries",
  "/segmentos/distributors",
  "/segmentos/clinics",
  "/segmentos/services",
  "/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona",
  "/produtos/marketing",
  "/comparar/crm-whatsapp-vs-planilha",
  "/solucoes/recuperar-leads-parados",
  "/solucoes/aumentar-recompra",
  "/solucoes/priorizar-oportunidades",
  "/solucoes/qualificar-leads-com-ia",
  "/lp/tecnologia-ti-software",
  "/produtos/crm",
  "/produtos/agentes-ia",
  "/solucoes/prospeccao-b2b-ia",
  "/lp/industria-materiais-construcao",
  "/lp/distribuidora-autopecas",
  "/solucoes/reativar-clientes",
  "/solucoes/next-best-action-vendas",
  "/comparar/crm-com-ia-vs-crm-tradicional",
  "/solucoes/crm-whatsapp",
  "/lp/distribuidora-materiais-construcao",
  "/solucoes/automatizar-follow-up",
  "/solucoes/revenue-intelligence",
  "/produtos/revenue-scout",
].filter((pathname) => !routeByPath.has(pathname));

if (missingTrackedRoutes.length) {
  throw new Error(`[indexing-priority-map] tracked routes missing from SEO manifest: ${missingTrackedRoutes.join(", ")}`);
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[indexing-priority-map] reinforced ${existingPages.size} priority pages across ${clusters.length} clusters`);
