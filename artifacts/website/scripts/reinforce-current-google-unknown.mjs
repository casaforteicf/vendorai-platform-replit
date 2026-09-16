import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const outDir = path.resolve(siteRoot, "dist/public");
const manifestPath = path.resolve(outDir, "seo-manifest.json");
const sitemapPath = path.resolve(outDir, "sitemap.xml");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const routeByPath = new Map((manifest.routes || []).map((route) => [route.pathname, route]));

const targets = [
  ["/segmentos/distributors", "VendorAI para distribuidoras"],
];

const editorialPath = "/blog/como-aumentar-recompra-produtividade-comercial-distribuidoras";
const editorialTitle = "Como aumentar recompra e produtividade comercial em distribuidoras";
const editorialDescription = "Guia prático para distribuidoras aumentarem recompra, produtividade comercial, cobertura de carteira e previsibilidade com CRM, automação e IA.";

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

if (!routeByPath.has(editorialPath)) {
  const staticHtml = `<article data-vendorai-distributor-editorial="true"><header><h1>${esc(editorialTitle)}</h1><p>${esc(editorialDescription)}</p></header><section><h2>Recompra precisa virar processo comercial</h2><p>Distribuidoras podem transformar frequência de compra, ticket, mix, território, vendedor e última interação em sinais comerciais claros. O objetivo é detectar clientes que reduziram volume, atrasaram recompra ou possuem potencial de expansão antes que a oportunidade seja perdida.</p><h2>Prioridade para o vendedor</h2><p>CRM e inteligência comercial organizam a carteira para mostrar quem precisa de contato agora, quais produtos podem complementar o mix e quais clientes merecem reativação.</p><p>Conheça a estrutura completa em <a href="/segmentos/distributors">VendorAI para distribuidoras</a>.</p>${nav([["/produtos/crm","CRM com IA"],["/produtos/prospeccao","Prospecção com IA"],["/produtos/revenue-scout","Revenue Scout"],["/solucoes/aumentar-recompra","Aumentar recompra"],["/segmentos/distributors","Solução para distribuidoras"]], "Conteúdos relacionados para distribuidoras")}</section></article>`;
  const editorialRoute = {
    pathname: editorialPath,
    title: `${editorialTitle} | VendorAI`,
    description: editorialDescription,
    type: "article",
    priority: 0.9,
    staticHtml,
  };
  manifest.routes.push(editorialRoute);
  routeByPath.set(editorialPath, editorialRoute);
}

const hubs = ["/", "/produtos", "/solucoes", "/blog", "/funcionalidades"]
  .map((pathname) => routeByPath.get(pathname))
  .filter((route) => route?.staticHtml);

const targetLinks = [
  ...targets.map(([href, label]) => [href, label]),
  [editorialPath, "Guia: recompra e produtividade em distribuidoras"],
];
for (const hub of hubs) {
  if (hub.staticHtml.includes('data-vendorai-google-unknown-current="hub"')) continue;
  hub.staticHtml += `<section data-vendorai-google-unknown-current="hub"><h2>VendorAI para distribuidoras</h2><p>Conheça como o VendorAI apoia distribuidoras com CRM, prospecção B2B, automação comercial, follow-up e inteligência de vendas.</p>${nav(targetLinks, "VendorAI para distribuidoras")}</section>`;
}

for (const [pathname, label] of targets) {
  const route = routeByPath.get(pathname);
  if (!route?.staticHtml || route.staticHtml.includes('data-vendorai-google-unknown-current="route"')) continue;
  const related = [
    [editorialPath, "Como aumentar recompra em distribuidoras"],
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

const contextualSources = [
  "/segmentos/industries",
  "/segmentos/retail",
  "/produtos/crm",
  "/produtos/prospeccao",
  "/produtos/revenue-scout",
  "/solucoes/revenue-intelligence",
  "/solucoes/prospeccao-b2b-ia",
  "/solucoes/automatizar-follow-up",
].map((pathname) => routeByPath.get(pathname)).filter((route) => route?.staticHtml);

for (const source of contextualSources) {
  if (source.staticHtml.includes('data-vendorai-distributor-context-link="true"')) continue;
  source.staticHtml += `<aside data-vendorai-distributor-context-link="true"><h2>Conteúdo para operações de distribuição</h2><p>Veja como organizar carteira, recompra, mix, vendedores e prospecção em uma operação comercial conectada.</p>${nav([["/segmentos/distributors","VendorAI para distribuidoras"],[editorialPath,"Guia de recompra e produtividade"]], "Distribuidoras")}</aside>`;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, "utf8");
  const loc = `https://appvendorai.com${editorialPath}`;
  if (!sitemap.includes(`<loc>${loc}</loc>`)) {
    const today = new Date().toISOString().slice(0, 10);
    const block = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n    <xhtml:link rel="alternate" hreflang="pt-BR" href="${loc}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />\n  </url>\n`;
    sitemap = sitemap.replace("</urlset>", `${block}</urlset>`);
    fs.writeFileSync(sitemapPath, sitemap);
  }
}

console.log(`[google-unknown-current] reinforced ${targets.length} current Google-unknown route across ${hubs.length} hubs; distributor editorial route added; ${contextualSources.length} contextual sources linked`);
