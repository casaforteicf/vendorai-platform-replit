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
  title: "Imprensa e Media Kit VendorAI — Informações Oficiais",
  description: "Dados oficiais do VendorAI para imprensa, parceiros, diretórios e publicações: descrição institucional, identidade da empresa, produtos, ativos e contato.",
  esTitle: "Prensa y Media Kit VendorAI — Información Oficial",
  esDescription: "Datos oficiales de VendorAI para prensa, socios, directorios y publicaciones: descripción institucional, identidad de la empresa, productos, activos y contacto.",
  type: "webpage",
  name: "Imprensa e Media Kit VendorAI",
  priority: 0.72,
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.routes = Array.isArray(manifest.routes) ? manifest.routes : [];
if (!manifest.routes.some((item) => item.pathname === route.pathname)) {
  manifest.routes.push(route);
}
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

console.log("[media-kit-seo] /imprensa added to SEO manifest and sitemap");
