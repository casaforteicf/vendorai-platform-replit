import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const lpRoot = path.join(outDir, "lp");

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

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (entry.isFile() && entry.name === "index.html") results.push(full);
  }
  return results;
}

function inferContext(filePath) {
  const rel = path.relative(lpRoot, path.dirname(filePath)).split(path.sep).filter(Boolean);
  const slug = rel[0] || "empresa";
  const intent = rel[1] || "crm";
  const label = slug.replace(/-/g, " ");
  const intentLabel = intent.replace(/-/g, " ");
  return { label, intentLabel };
}

function buildSection(filePath) {
  const { label, intentLabel } = inferContext(filePath);
  const links = strategicLinks.map(([labelText, href]) => `<a href="${href}">${labelText}</a>`).join("\n");
  return `\n<section data-static-lp-seo="true" aria-label="Soluções VendorAI relacionadas">\n  <h2>Como o VendorAI conecta CRM, atendimento e crescimento para ${label}</h2>\n  <p>Esta página apresenta uma aplicação de ${intentLabel} para ${label}. O VendorAI conecta captação, atendimento, CRM, follow-up, pipeline, propostas, pós-venda e inteligência de receita em uma única operação. Em vez de trabalhar com ferramentas isoladas, cada interação alimenta o histórico do cliente e ajuda a definir a próxima ação comercial.</p>\n  <p>Os agentes de IA podem apoiar recepção, qualificação, acompanhamento e fechamento, enquanto o Revenue Scout procura novas oportunidades na própria carteira, como recompra, reativação, upsell e cross-sell. A integração com WhatsApp mantém conversas, tarefas e oportunidades ligadas ao mesmo contexto comercial.</p>\n  <p>Para avaliar a solução completa, explore os módulos e guias relacionados abaixo. Esses links ajudam a entender como marketing, vendas e pós-venda trabalham juntos dentro do VendorAI e também reforçam a navegação entre as páginas mais importantes do site.</p>\n  <nav aria-label="Links internos estratégicos">\n    ${links}\n  </nav>\n</section>\n`;
}

let enriched = 0;
for (const filePath of walk(lpRoot)) {
  let html = fs.readFileSync(filePath, "utf8");
  if (html.includes('data-static-lp-seo="true"')) continue;
  const section = buildSection(filePath);
  if (html.includes("</main>")) html = html.replace("</main>", `${section}</main>`);
  else if (html.includes("</body>")) html = html.replace("</body>", `${section}</body>`);
  else html += section;
  fs.writeFileSync(filePath, html);
  enriched += 1;
}

console.log(`[lp-static-seo] enriched ${enriched} LP pages with static context and strategic internal links`);
