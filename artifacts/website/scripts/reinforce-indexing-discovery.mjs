import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const manifestPath = path.resolve(siteRoot, "dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nav(items = [], label = "Navegação relacionada") {
  return `<nav aria-label="${escapeHtml(label)}"><ul>${items
    .map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`)
    .join("")}</ul></nav>`;
}

const priorityGroups = [
  {
    title: "Produtos e funcionalidades",
    esTitle: "Productos y funcionalidades",
    links: [
      ["/produtos", "Produtos VendorAI", "Productos VendorAI"],
      ["/funcionalidades", "Funcionalidades", "Funcionalidades"],
      ["/produtos/crm", "CRM com IA", "CRM con IA"],
      ["/produtos/agentes-ia", "Agentes de IA", "Agentes de IA"],
      ["/produtos/revenue-scout", "Revenue Scout", "Revenue Scout"],
      ["/produtos/marketing", "Marketing com IA", "Marketing con IA"],
      ["/produtos/prospeccao", "Prospecção com IA", "Prospección con IA"],
    ],
  },
  {
    title: "Soluções comerciais",
    esTitle: "Soluciones comerciales",
    links: [
      ["/solucoes", "Soluções VendorAI", "Soluciones VendorAI"],
      ["/solucoes/crm-whatsapp", "CRM integrado ao WhatsApp", "CRM integrado con WhatsApp"],
      ["/solucoes/automatizar-follow-up", "Automatizar follow-up", "Automatizar seguimiento"],
      ["/solucoes/revenue-intelligence", "Revenue Intelligence", "Revenue Intelligence"],
      ["/solucoes/agentes-ia-vendas", "Agentes de IA para vendas", "Agentes de IA para ventas"],
    ],
  },
  {
    title: "Segmentos",
    esTitle: "Segmentos",
    links: [
      ["/segmentos/dealerships", "Concessionárias e automotivo", "Concesionarias y automotriz"],
      ["/segmentos/distributors", "Distribuidoras e atacado", "Distribuidoras y mayoristas"],
      ["/segmentos/retail", "Lojas e varejo", "Tiendas y retail"],
      ["/segmentos/industries", "Indústrias e B2B", "Industrias y B2B"],
    ],
  },
  {
    title: "Guias e comparações",
    esTitle: "Guías y comparaciones",
    links: [
      ["/comparar/crm-com-ia-vs-crm-tradicional", "CRM com IA vs. CRM tradicional", "CRM con IA vs. CRM tradicional"],
      ["/blog", "Blog VendorAI", "Blog VendorAI"],
      ["/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona", "Guia de CRM integrado ao WhatsApp", "Guía de CRM integrado con WhatsApp"],
    ],
  },
];

const routeByPath = new Map((manifest.routes || []).map((route) => [route.pathname, route]));
const priorityPaths = priorityGroups.flatMap((group) => group.links.map(([href]) => href));
const missing = priorityPaths.filter((pathname) => !routeByPath.has(pathname));
if (missing.length) throw new Error(`[indexing-discovery] missing priority routes: ${missing.join(", ")}`);

const home = routeByPath.get("/");
if (!home?.staticHtml) throw new Error("[indexing-discovery] home route missing static HTML");

function renderHome(spanish = false) {
  return `<section data-vendorai-indexing-discovery="home"><h2>${
    spanish ? "Explora las áreas principales de VendorAI" : "Explore as principais áreas do VendorAI"
  }</h2><p>${
    spanish
      ? "Accede directamente a productos, soluciones, segmentos y guías conectadas al CRM con IA."
      : "Acesse diretamente produtos, soluções, segmentos e guias conectados ao CRM com IA."
  }</p>${priorityGroups
    .map((group) => {
      const links = group.links.map(([href, label, esLabel]) => ({ href, label: spanish ? esLabel : label }));
      return `<h3>${escapeHtml(spanish ? group.esTitle : group.title)}</h3>${nav(
        links,
        spanish ? group.esTitle : group.title,
      )}`;
    })
    .join("")}</section>`;
}

home.staticHtml += renderHome(false);
home.esStaticHtml = (home.esStaticHtml || home.staticHtml) + renderHome(true);

const hubLinksPt = [
  { href: "/produtos", label: "Produtos" },
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/solucoes", label: "Soluções" },
  { href: "/blog", label: "Blog" },
];
const hubLinksEs = [
  { href: "/produtos", label: "Productos" },
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/solucoes", label: "Soluciones" },
  { href: "/blog", label: "Blog" },
];

for (const pathname of priorityPaths) {
  const route = routeByPath.get(pathname);
  if (!route?.staticHtml) throw new Error(`[indexing-discovery] ${pathname} missing static HTML`);

  const ptLinks = hubLinksPt.filter((item) => item.href !== pathname);
  const esLinks = hubLinksEs.filter((item) => item.href !== pathname);
  route.staticHtml += `<section data-vendorai-indexing-discovery="route"><h3>Continue explorando</h3>${nav(
    ptLinks,
    "Áreas relacionadas",
  )}</section>`;
  route.esStaticHtml = (route.esStaticHtml || route.staticHtml) + `<section data-vendorai-indexing-discovery="route"><h3>Continúa explorando</h3>${nav(
    esLinks,
    "Áreas relacionadas",
  )}</section>`;
}

for (const pathname of priorityPaths) {
  if (!home.staticHtml.includes(`href="${pathname}"`)) {
    throw new Error(`[indexing-discovery] home missing direct link to ${pathname}`);
  }
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[indexing-discovery] home links directly to ${priorityPaths.length} priority routes; priority routes cross-link hubs`);
