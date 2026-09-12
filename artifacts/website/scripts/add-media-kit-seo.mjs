import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const manifestPath = path.join(outDir, "seo-manifest.json");
const sitemapPath = path.join(outDir, "sitemap.xml");
const baseUrl = "https://appvendorai.com";

const route = {
  pathname: "/imprensa",
  title: "Informações oficiais para citar o VendorAI | VendorAI",
  description: "Media kit oficial do VendorAI, plataforma operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27: identidade, produtos, ativos e contato.",
  esTitle: "Información oficial para citar a VendorAI | VendorAI",
  esDescription: "Media kit oficial de VendorAI, plataforma operada por Windoor Serviços de Gerenciamento de Obras Ltda, CNPJ 59.623.589/0001-27: identidad, productos, activos y contacto.",
  type: "webpage",
  name: "Imprensa e Media Kit VendorAI",
  priority: 0.72,
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.routes = Array.isArray(manifest.routes) ? manifest.routes : [];
const existingRoute = manifest.routes.findIndex((item) => item.pathname === route.pathname);
if (existingRoute >= 0) manifest.routes[existingRoute] = route;
else manifest.routes.push(route);
manifest.staticPages = manifest.staticPages ?? {};
manifest.staticPages[route.pathname] = {
  title: route.title,
  description: route.description,
  esTitle: route.esTitle,
  esDescription: route.esDescription,
  type: route.type,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

let sitemap = fs.readFileSync(sitemapPath, "utf8");
const loc = `${baseUrl}${route.pathname}`;
if (!sitemap.includes(`<loc>${loc}</loc>`)) {
  const today = new Date().toISOString().slice(0, 10);
  const alternates = [
    ["pt-BR", loc],
    ["es-PY", `${loc}?country=PY`],
    ["es-AR", `${loc}?country=AR`],
    ["es-UY", `${loc}?country=UY`],
    ["es-CL", `${loc}?country=CL`],
    ["x-default", loc],
  ].map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href.replace(/&/g, "&amp;")}" />`).join("\n");
  const block = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${route.priority}</priority>\n${alternates}\n  </url>\n`;
  sitemap = sitemap.replace("</urlset>", `${block}</urlset>`);
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log("[media-kit-seo] /imprensa added to SEO manifest and sitemap with official entity data");
