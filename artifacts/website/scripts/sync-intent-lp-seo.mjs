import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const manifestPath = path.join(outDir, "seo-manifest.json");
const sitemapPath = path.join(outDir, "sitemap.xml");
const baseUrl = "https://appvendorai.com";

const segments = [
  { slug:"academias-studios", name:"Academias e Studios", dor:"CRM para Academia: reduza perdas de leads e matrículas | VendorAI", marketing:"Marketing para Academias com IA, Meta e Google | VendorAI", crm:"CRM com IA para Academias e Studios | VendorAI", description:"VendorAI conecta marketing, WhatsApp, CRM, agenda, follow-up, retenção e reativação para academias e studios." },
  { slug:"concessionarias-lojas-veiculos", name:"Concessionárias e Lojas de Veículos", dor:"Como evitar perda de leads em concessionárias | VendorAI", marketing:"Marketing para Concessionárias com IA e CRM | VendorAI", crm:"CRM com IA para Concessionárias e Lojas de Veículos | VendorAI", description:"VendorAI organiza leads, veículo de interesse, troca, financiamento, test-drive, proposta, vendedor e follow-up em concessionárias." },
  { slug:"clinicas-odontologicas-esteticas", name:"Clínicas Odontológicas e Estéticas", dor:"Reduza no-show e orçamentos esquecidos em clínicas | VendorAI", marketing:"Marketing para Clínicas Odontológicas e Estéticas | VendorAI", crm:"CRM com IA para Clínicas Odontológicas e Estéticas | VendorAI", description:"VendorAI conecta campanhas, WhatsApp, agenda, avaliação, orçamento, follow-up, Revenue Scout e reativação para clínicas." },
  { slug:"imobiliarias-corretores", name:"Imobiliárias e Corretores", dor:"Como parar de perder leads imobiliários antes da visita | VendorAI", marketing:"Marketing para Imobiliárias com Meta, Google e IA | VendorAI", crm:"CRM com IA para Imobiliárias e Corretores | VendorAI", description:"VendorAI organiza leads, preferência de imóvel, corretores, visitas, propostas, WhatsApp, follow-up e inteligência comercial para imobiliárias." },
  { slug:"construtora-residencial", name:"Construtoras Residenciais", dor:"Como evitar perda de leads e orçamentos em construtoras | VendorAI", marketing:"Marketing para Construtoras com Meta, Google e IA | VendorAI", crm:"CRM com IA para Construtoras Residenciais | VendorAI", description:"VendorAI conecta marketing, WhatsApp, qualificação, visitas, orçamentos, follow-up, agentes de IA e Revenue Scout para construtoras residenciais." },
  { slug:"esquadrias-portas-janelas", name:"Esquadrias, Portas e Janelas", dor:"Como evitar perda de orçamentos em empresas de esquadrias | VendorAI", marketing:"Marketing para Esquadrias com Meta, Google e IA | VendorAI", crm:"CRM com IA para Esquadrias, Portas e Janelas | VendorAI", description:"VendorAI conecta marketing, WhatsApp, projetos, medições, orçamentos, arquitetos, construtoras, follow-up e Revenue Scout para empresas de esquadrias." },
  { slug:"piscinas", name:"Piscinas e Lazer Residencial", dor:"Como evitar perda de orçamentos em empresas de piscinas | VendorAI", marketing:"Marketing para Piscinas com Meta, Google e IA | VendorAI", crm:"CRM com IA para Empresas de Piscinas e Lazer | VendorAI", description:"VendorAI conecta marketing, WhatsApp, visitas técnicas, projetos, orçamentos, instalação, manutenção, pós-venda e Revenue Scout para empresas de piscinas." },
  { slug:"arquitetura-interiores", name:"Arquitetura e Design de Interiores", dor:"Como evitar perda de projetos e propostas em escritórios de arquitetura | VendorAI", marketing:"Marketing para Arquitetura e Interiores com IA | VendorAI", crm:"CRM com IA para Arquitetura e Design de Interiores | VendorAI", description:"VendorAI conecta marketing, WhatsApp, briefing, reuniões, propostas, projetos, parceiros, follow-up e Revenue Scout para escritórios de arquitetura e interiores." },
  { slug:"distribuidora-autopecas", name:"Distribuidoras de Autopeças", dor:"Como recuperar vendas e recompra em distribuidoras de autopeças | VendorAI", marketing:"Marketing para Distribuidoras de Autopeças com IA | VendorAI", crm:"CRM com IA para Distribuidoras de Autopeças | VendorAI", description:"VendorAI conecta carteira B2B, vendedores, WhatsApp, cotações, recompra, mix, campanhas e Revenue Scout para distribuidoras de autopeças." },
  { slug:"distribuidora-materiais-construcao", name:"Distribuidoras de Materiais de Construção", dor:"Como recuperar vendas em distribuidoras de materiais de construção | VendorAI", marketing:"Marketing para Distribuidoras de Materiais de Construção com IA | VendorAI", crm:"CRM com IA para Distribuidoras de Materiais de Construção | VendorAI", description:"VendorAI conecta carteira B2B, vendedores, regiões, orçamentos, mix, WhatsApp, campanhas e Revenue Scout para distribuidoras de materiais de construção." },
  { slug:"distribuidora-alimentos-bebidas", name:"Distribuidoras de Alimentos", dor:"Como recuperar frequência e recompra em distribuidoras de alimentos | VendorAI", marketing:"Marketing para Distribuidoras de Alimentos com IA | VendorAI", crm:"CRM com IA para Distribuidoras de Alimentos | VendorAI", description:"VendorAI conecta carteira B2B, frequência, mix, vendedores, WhatsApp, pedidos, campanhas, recompra e Revenue Scout para distribuidoras de alimentos." },
  { slug:"maquinas-insumos", name:"Distribuidoras de Máquinas e Insumos", dor:"Como evitar propostas paradas em vendas de máquinas e insumos | VendorAI", marketing:"Marketing B2B para Máquinas e Insumos com IA | VendorAI", crm:"CRM com IA para Máquinas, Equipamentos e Insumos | VendorAI", description:"VendorAI conecta venda técnica, aplicação, propostas, WhatsApp, follow-up, pós-venda, reposição, campanhas e Revenue Scout para máquinas e insumos." },
  { slug:"seguros", name:"Corretoras de Seguros", dor:"Como evitar perda de cotações e renovações em seguros | VendorAI", marketing:"Marketing para Corretoras de Seguros com IA | VendorAI", crm:"CRM com IA para Corretoras de Seguros | VendorAI", description:"VendorAI conecta leads, cotações, propostas, WhatsApp, follow-up, carteira, renovações, campanhas e Revenue Scout para corretoras de seguros." },
  { slug:"farmacias", name:"Farmácias e Drogarias", dor:"Como aumentar recorrência e fidelização em farmácias | VendorAI", marketing:"Marketing para Farmácias e Drogarias com IA | VendorAI", crm:"CRM com IA para Farmácias e Drogarias | VendorAI", description:"VendorAI conecta relacionamento, campanhas, WhatsApp, recorrência, fidelização, reativação e Revenue Scout para farmácias e drogarias." },
];

if (!fs.existsSync(manifestPath) || !fs.existsSync(sitemapPath)) throw new Error("SEO outputs missing before intent LP sync");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.routes ??= [];
const byPath = new Map(manifest.routes.map((route) => [route.pathname, route]));
for (const segment of segments) {
  for (const intent of ["dor","marketing","crm"]) {
    const pathname = `/lp/${segment.slug}/${intent}`;
    byPath.set(pathname, { pathname, title: segment[intent], description: segment.description, type:"intent-lp", name:`${segment.name} — ${intent}`, priority:intent === "crm" ? 0.9 : intent === "marketing" ? 0.87 : 0.86 });
  }
}
manifest.routes = [...byPath.values()];
manifest.intentLpSegments = segments;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

let sitemap = fs.readFileSync(sitemapPath, "utf8");
const today = new Date().toISOString().slice(0,10);
const xmlEscape = (value) => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const additions = [];
for (const segment of segments) {
  for (const intent of ["dor","marketing","crm"]) {
    const loc = `${baseUrl}/lp/${segment.slug}/${intent}`;
    if (sitemap.includes(`<loc>${loc}</loc>`)) continue;
    const priority = intent === "crm" ? 0.9 : intent === "marketing" ? 0.87 : 0.86;
    additions.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n    <xhtml:link rel="alternate" hreflang="pt-BR" href="${xmlEscape(loc)}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(loc)}" />\n  </url>`);
  }
}
if (additions.length) sitemap = sitemap.replace("</urlset>", `${additions.join("\n")}\n</urlset>`);
fs.writeFileSync(sitemapPath, sitemap);
console.log(`[seo] synced ${segments.length * 3} intent LP routes`);
