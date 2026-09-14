import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(here, "../dist/public/seo-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const strategicLinks = [
  ["CRM com IA", "/produtos/crm"],
  ["CRM integrado ao WhatsApp", "/solucoes/crm-whatsapp"],
  ["Agentes de IA para vendas", "/produtos/agentes-ia"],
  ["Follow-up automático", "/solucoes/automatizar-follow-up"],
  ["Revenue Scout", "/produtos/revenue-scout"],
  ["Revenue Intelligence", "/solucoes/revenue-intelligence"],
  ["Todas as soluções", "/solucoes"],
  ["Conteúdo e guias", "/blog"],
];

function esc(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inferContext(pathname = "") {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[1] || "empresa";
  const intent = parts[2] || "crm";
  return {
    label: slug.replace(/-/g, " "),
    intentLabel: intent.replace(/-/g, " "),
  };
}

function buildSection(route) {
  const { label, intentLabel } = inferContext(route.pathname);
  const links = strategicLinks
    .map(([labelText, href]) => `<li><a href="${esc(href)}">${esc(labelText)}</a></li>`)
    .join("");

  return `<section data-static-lp-seo="true" aria-label="Soluções VendorAI relacionadas">
<h2>Como o VendorAI conecta CRM, atendimento e crescimento para ${esc(label)}</h2>
<p>Esta página apresenta uma aplicação de ${esc(intentLabel)} para ${esc(label)}. O VendorAI conecta captação, atendimento, CRM, follow-up, pipeline, propostas, pós-venda e inteligência de receita em uma única operação. Em vez de trabalhar com ferramentas isoladas, cada interação alimenta o histórico do cliente e ajuda a definir a próxima ação comercial.</p>
<p>Os agentes de IA podem apoiar recepção, qualificação, acompanhamento e fechamento, enquanto o Revenue Scout procura novas oportunidades na própria carteira, como recompra, reativação, upsell e cross-sell. A integração com WhatsApp mantém conversas, tarefas e oportunidades ligadas ao mesmo contexto comercial.</p>
<p>Para avaliar a solução completa, explore os módulos e guias relacionados abaixo. Esses links ajudam a entender como marketing, vendas e pós-venda trabalham juntos dentro do VendorAI e reforçam a navegação entre as páginas mais importantes do site.</p>
<nav aria-label="Links internos estratégicos"><ul>${links}</ul></nav>
</section>`;
}

let enriched = 0;
for (const route of manifest.routes || []) {
  if (!route.pathname?.startsWith("/lp/")) continue;
  if (!route.staticHtml) continue;
  if (route.staticHtml.includes('data-static-lp-seo="true"')) continue;

  const section = buildSection(route);
  route.staticHtml += section;
  route.esStaticHtml = route.esStaticHtml || route.staticHtml;
  enriched += 1;
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

if (enriched === 0) {
  throw new Error("[lp-static-seo] no LP routes were enriched; check seo-manifest structure");
}

console.log(`[lp-static-seo] enriched ${enriched} LP routes in seo-manifest with static context and strategic internal links`);
