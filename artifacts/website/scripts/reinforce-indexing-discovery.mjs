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

const priorityBlogPath = "/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona";
const priorityBlog = routeByPath.get(priorityBlogPath);
if (!priorityBlog?.staticHtml) throw new Error(`[indexing-discovery] ${priorityBlogPath} missing static HTML`);

priorityBlog.title = "CRM com WhatsApp: como funciona | VendorAI";
priorityBlog.esTitle = "CRM con WhatsApp: cómo funciona | VendorAI";
priorityBlog.image = priorityBlog.image || "https://appvendorai.com/opengraph.jpg";
priorityBlog.datePublished = priorityBlog.datePublished || "2026-09-12";
priorityBlog.staticHtml += `<section data-vendorai-priority-blog-depth="crm-whatsapp"><h2>O que muda quando WhatsApp e CRM trabalham juntos</h2><p>Integrar WhatsApp e CRM significa transformar cada conversa em histórico comercial útil. Em vez de o atendimento ficar preso no celular de uma pessoa, o lead passa a ter origem, responsável, etapa, próxima ação e contexto visíveis para a equipe. Isso reduz perda de informação quando o cliente volta dias depois, quando muda de vendedor ou quando a oportunidade precisa de follow-up.</p><p>A integração também permite medir o processo. A empresa consegue acompanhar tempo de primeira resposta, conversas que viraram oportunidades, negócios sem próxima ação, retornos vencidos e conversão por etapa. O ganho não vem apenas de responder dentro do WhatsApp, mas de conectar a conversa ao pipeline e às atividades que precisam acontecer até a venda.</p><h2>Onde a inteligência artificial entra</h2><p>Com o histórico centralizado, agentes de IA podem resumir conversas, identificar intenção, sugerir prioridade, preparar respostas e executar tarefas autorizadas. Um lead que pediu orçamento pode receber acompanhamento no momento certo; uma proposta sem resposta pode voltar para a fila; um cliente recorrente pode ser reativado quando há sinal de queda no relacionamento. A automação funciona melhor quando usa dados do CRM em vez de tratar cada mensagem como uma conversa isolada.</p><p>Para começar, conecte os canais, defina responsáveis e etapas do pipeline e escolha quais ações devem ser apenas sugeridas e quais podem ser automatizadas. Depois, acompanhe métricas de resposta, follow-up e conversão para ajustar o fluxo. Veja também <a href="/solucoes/crm-whatsapp">CRM integrado ao WhatsApp</a>, <a href="/produtos/crm">CRM com IA</a> e <a href="/solucoes/automatizar-follow-up">follow-up automático</a>.</p></section>`;
priorityBlog.esStaticHtml = (priorityBlog.esStaticHtml || priorityBlog.staticHtml) + `<section data-vendorai-priority-blog-depth="crm-whatsapp"><h2>Qué cambia cuando WhatsApp y CRM trabajan juntos</h2><p>Integrar WhatsApp y CRM convierte cada conversación en historial comercial útil. En lugar de dejar la atención aislada en el teléfono de una persona, cada lead mantiene origen, responsable, etapa, próxima acción y contexto visibles para el equipo.</p><p>La integración también permite medir tiempos de respuesta, conversaciones que se convierten en oportunidades, negocios sin próxima acción y conversión por etapa. Con ese contexto, los agentes de IA pueden resumir conversaciones, identificar intención, sugerir prioridades y ejecutar tareas autorizadas sin tratar cada mensaje como una conversación aislada.</p><p>Para empezar, conecta los canales, define responsables y etapas del pipeline y decide qué acciones deben ser sugeridas y cuáles pueden automatizarse. Luego acompaña respuesta, seguimiento y conversión. Consulta también <a href="/solucoes/crm-whatsapp">CRM integrado con WhatsApp</a>, <a href="/produtos/crm">CRM con IA</a> y <a href="/solucoes/automatizar-follow-up">seguimiento automático</a>.</p></section>`;

for (const pathname of priorityPaths) {
  if (!home.staticHtml.includes(`href="${pathname}"`)) {
    throw new Error(`[indexing-discovery] home missing direct link to ${pathname}`);
  }
}

manifest.generatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[indexing-discovery] home links directly to ${priorityPaths.length} priority routes; priority routes cross-link hubs; priority blog enriched`);
