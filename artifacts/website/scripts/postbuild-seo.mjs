import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(siteRoot, "../..");
const outDir = path.resolve(siteRoot, "dist/public");
const baseUrl = "https://appvendorai.com";
const ogImage = `${baseUrl}/opengraph.jpg`;

function read(relative) {
  return fs.readFileSync(path.resolve(siteRoot, relative), "utf8");
}

function readRepo(relative) {
  return fs.readFileSync(path.resolve(repoRoot, relative), "utf8");
}

function decodeString(value = "") {
  return value.replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\s+/g, " ").trim();
}

function humanize(slug) {
  return slug.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

function parseEntities(source, titleKeys, descriptionKeys) {
  const slugMatches = [...source.matchAll(/slug:\s*["']([^"']+)["']/g)];
  const entities = {};
  for (let i = 0; i < slugMatches.length; i += 1) {
    const match = slugMatches[i];
    const slug = match[1];
    const start = match.index ?? 0;
    const end = slugMatches[i + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    let title = "";
    let description = "";
    for (const key of titleKeys) {
      const found = block.match(new RegExp(`${key}:\\s*["']([^"']+)["']`));
      if (found) { title = decodeString(found[1]); break; }
    }
    for (const key of descriptionKeys) {
      const found = block.match(new RegExp(`${key}:\\s*(?:\\n\\s*)?["']([^"']+)["']`));
      if (found) { description = decodeString(found[1]); break; }
    }
    if (!entities[slug]) entities[slug] = { slug, title: title || humanize(slug), description };
  }
  return entities;
}

function mergeEntities(...groups) {
  return Object.assign({}, ...groups);
}

const products = mergeEntities(
  parseEntities(read("src/data/products.ts"), ["name"], ["summary", "description"]),
  parseEntities(read("src/data/allProducts.ts"), ["name"], ["summary", "description"]),
);
const features = parseEntities(read("src/data/features.ts"), ["title"], ["subtitle"]);
const agents = parseEntities(read("src/data/agents.ts"), ["title"], ["subtitle"]);

const verticalSource = readRepo("lib/vendor-brain/src/marketing-verticals.ts");
const verticals = {};
const macrosegments = new Set();
for (const match of verticalSource.matchAll(/v\(\{\s*id:'[^']+',\s*macrosegment:'([^']+)',\s*name:'([^']+)',\s*slug:'([^']+)'/g)) {
  const [, macrosegment, name, slug] = match;
  verticals[slug] = {
    slug,
    title: name,
    description: `VendorAI para ${name}: marketing, prospecção, atendimento, CRM, vendas, pós-venda e inteligência de receita em uma operação conectada.`,
    macrosegment,
  };
  macrosegments.add(macrosegment);
}

const staticPages = {
  "/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona": {
    title: "CRM integrado ao WhatsApp: o que é e como funciona | VendorAI",
    description: "Entenda como conectar WhatsApp ao CRM para organizar leads, conversas, responsáveis, histórico, tarefas, follow-up e métricas de conversão.",
    type: "article",
  },
  "/": {
    title: "VendorAI — Plataforma de Vendas, CRM, Marketing e Agentes de IA",
    description: "VendorAI conecta marketing, prospecção, atendimento, CRM, follow-up, pós-venda e inteligência para transformar oportunidades em receita contínua.",
    type: "home",
  },
  "/produtos": {
    title: "Produtos VendorAI — CRM, IA, Marketing, Prospecção e Gestão",
    description: "Conheça as soluções VendorAI para vendas, atendimento, prospecção, marketing, gestão, automação, conteúdo e inteligência de receita.",
    type: "collection",
  },
  "/funcionalidades": {
    title: "Funcionalidades VendorAI — Automação Comercial e IA para Empresas",
    description: "Veja as funcionalidades do VendorAI para geração de demanda, atendimento, CRM, automações, conteúdo, sites, mídia e inteligência comercial.",
    type: "collection",
  },
  "/precos": {
    title: "Como contratar o VendorAI — CRM, Produtos e Growth",
    description: "Conheça as formas de acesso ao VendorAI. As condições comerciais de cada campanha são apresentadas nas landing pages correspondentes.",
    type: "webpage",
  },
  "/sobre": {
    title: "Sobre o VendorAI — Inteligência Comercial e Operação de Receita",
    description: "Conheça o VendorAI, plataforma que conecta dados, IA e execução em marketing, vendas, atendimento, retenção e crescimento.",
    type: "webpage",
  },
  "/contato": {
    title: "Fale com o VendorAI — Vendas, Demonstração e Suporte Comercial",
    description: "Converse com o time VendorAI para avaliar sua operação, conhecer as soluções e entender como aplicar IA à geração e expansão de receita.",
    type: "webpage",
  },
  "/demo": {
    title: "Teste o VendorAI por 5 Dias Grátis",
    description: "Teste o VendorAI com sua própria operação por 5 dias grátis e conheça CRM, agentes de IA, prospecção, marketing e Revenue Scout.",
    type: "webpage",
  },
  "/baixar-app": {
    title: "Baixar App VendorAI — CRM e Inteligência Comercial no Celular",
    description: "Acesse o VendorAI no celular para acompanhar leads, conversas, agenda, oportunidades e indicadores da sua operação comercial.",
    type: "webpage",
  },
  "/blog": {
    title: "Blog VendorAI — Vendas, CRM, Marketing, IA e Receita",
    description: "Conteúdo prático sobre CRM, inteligência artificial, vendas, marketing, prospecção, automação, retenção e crescimento de receita.",
    type: "blog",
  },
  "/parceiros": {
    title: "Parceiros VendorAI — Rede Comercial e Ecossistema",
    description: "Conheça o programa de parceiros VendorAI e as oportunidades comerciais do ecossistema de inteligência, automação e receita.",
    type: "webpage",
  },
  "/cadastro-praca": {
    title: "Cadastro Praça.ai — Marketplace Conectado ao VendorAI",
    description: "Cadastre sua empresa no Praça.ai e conecte catálogo, pedidos, pagamentos, reputação, logística e atendimento ao ecossistema VendorAI.",
    type: "webpage",
  },
  "/privacy": { title: "Política de Privacidade | VendorAI", description: "Política de privacidade e tratamento de dados do VendorAI.", type: "legal" },
  "/terms": { title: "Termos de Uso | VendorAI", description: "Termos de uso e condições aplicáveis aos serviços VendorAI.", type: "legal" },
};

const seoOverrides = {
  crm: ["CRM com IA para WhatsApp, Vendas e Follow-up | VendorAI", "CRM com IA para organizar leads, pipeline, histórico, tarefas, propostas e próxima melhor ação. Integre WhatsApp, atendimento e vendas em uma operação única."],
  jarvis: ["JARVIS — Inteligência Executiva com IA para Empresas | VendorAI", "Consulte, compare e acompanhe sua empresa com IA. O JARVIS cruza CRM, marketing, financeiro, agenda e Revenue Scout para destacar prioridades, riscos e oportunidades."],
  "agentes-ia": ["Agentes de IA para Vendas, Atendimento e Pós-venda | VendorAI", "Equipe de agentes de IA para recepção, SDR, fechamento, follow-up, suporte, agendamento, cobrança e pós-venda trabalhando com o contexto real da empresa."],
  prospeccao: ["Prospecção B2B com IA e Leads Qualificados | VendorAI", "Encontre empresas por segmento e região, enriqueça dados, identifique sinais de compra e envie prospects priorizados diretamente para o CRM."],
  "revenue-scout": ["Revenue Scout — Recompra, Upsell e Reativação com IA | VendorAI", "Encontre oportunidades na base de clientes: recompra, upsell, cross-sell, reativação, renovação e sinais de expansão priorizados por IA."],
  omnichannel: ["Omnichannel com IA — WhatsApp, Instagram e Atendimento | VendorAI", "Unifique WhatsApp, Instagram e outros canais com histórico por cliente, roteamento, equipe humana e agentes de IA trabalhando no mesmo contexto."],
  marketing: ["Marketing com IA — Conteúdo, Campanhas e Mídia | VendorAI", "Planeje, produza e acompanhe conteúdo e campanhas com IA, conectado ao CRM e às oportunidades comerciais para ligar marketing a receita."],
  "agenda-inteligente": ["Agenda Inteligente com IA e Google Calendar | VendorAI", "Agende reuniões, visitas, retornos, tarefas e follow-ups ligados ao CRM, com disponibilidade real, lembretes e automação por IA."],
  "catalogo-propostas": ["Catálogo e Propostas Comerciais com IA | VendorAI", "Centralize produtos, preços, fornecedores, comissões e propostas comerciais conectadas ao CRM para vender com mais velocidade e consistência."],
  financeiro: ["Financeiro e ERP Integrado ao CRM | VendorAI", "Conecte vendas, cobranças, comissões, conciliação e indicadores financeiros à operação comercial sem duplicar informações entre sistemas."],
  "sites-lp-ecommerce": ["Sites, Landing Pages e E-commerce com IA | VendorAI", "Crie sites, landing pages e experiências de venda conectadas ao CRM, campanhas e origem dos leads para transformar tráfego em oportunidades."],
  "knowledge-hub": ["Knowledge Hub — Base de Conhecimento para IA | VendorAI", "Centralize documentos, regras, políticas e conhecimento para agentes de IA, vendas, atendimento e suporte responderem com contexto confiável."],
  analytics: ["BI e Analytics de Vendas, Marketing e Receita | VendorAI", "Dashboards e indicadores para acompanhar vendas, conversão, marketing, operação, produtividade e impacto da IA em uma visão executiva."],
  automacoes: ["Automações e Integrações para CRM e Vendas | VendorAI", "Conecte VendorAI a APIs, webhooks, n8n, Typebot, ERPs e ferramentas externas para automatizar rotinas e sincronizar dados."],
  "arqdor-ai": ["Arqdor.ai — Render, Projetos e Orçamentos com IA", "Plataforma para arquitetura e interiores com projetos, ambientes, renderização por IA, materiais, orçamento e portal do cliente conectados ao VendorAI."],
  growth: ["VendorAI Growth — CRM, IA, Marketing e Receita em um Único Plano", "Acesso completo ao ecossistema VendorAI sem limite de usuários: CRM, agentes de IA, marketing, prospecção, atendimento, gestão e inteligência de receita."],
  "content-planner": ["Content Planner com IA — Calendário e Estratégia | VendorAI", "Planeje temas, canais, frequência e campanhas em um calendário editorial conectado ao CRM, marketing e objetivos comerciais."],
  "content-studio": ["Content Studio com IA — Textos, Copies e Roteiros | VendorAI", "Crie posts, legendas, copies, roteiros, carrosséis e conteúdos de campanha usando contexto da empresa, objetivos e identidade da marca."],
  "creative-studio": ["Creative Studio com IA — Imagens e Vídeos para Marketing | VendorAI", "Produza imagens, vídeos, voz, dublagem, mockups e criativos para campanhas, produtos e redes sociais dentro do ecossistema VendorAI."],
  ads: ["Vendor Ads — Google e Meta Ads com IA | VendorAI", "Planeje campanhas, públicos, orçamento, copies e criativos para mídia paga conectados ao CRM e aos objetivos comerciais."],
  gestao: ["Vendor Gestão — ERP, Financeiro, Estoque e Compras | VendorAI", "Conecte vendas à gestão operacional com financeiro, estoque, compras, fornecedores, documentos e indicadores no mesmo ecossistema."],
  "praca-ai": ["Praça.ai — Marketplace, Pagamentos e Logística | VendorAI", "Marketplace conectado ao VendorAI com vitrine, pedidos, pagamentos, reputação, afiliados, logística, rastreio e atendimento."],
  "app-builder": ["Vendor App Builder — Criação de Aplicativos com IA", "Crie aplicativos conectados ao VendorAI com templates, configuração por empresa, identidade visual, integrações, preview e publicação."],
  reputation: ["Vendor Reputation — Avaliações e Experiência do Cliente", "Monitore avaliações, satisfação, reputação e sinais de experiência para identificar problemas, retenção e oportunidades de melhoria."],
  "app-personalizado": ["App Personalizado VendorAI — Aplicativo White-label", "Aplicativo personalizado com marca, nome, ícone, splash e configuração da empresa, conectado aos dados e módulos do VendorAI."],
  implantacao: ["Implantação VendorAI — Configuração Assistida", "Serviço opcional de implantação humana para configuração inicial, integrações, usuários, parametrização e treinamento da equipe VendorAI."],
};

for (const [slug, product] of Object.entries(products)) {
  const override = seoOverrides[slug];
  product.seoTitle = override?.[0] ?? `${product.title} | VendorAI`;
  product.seoDescription = override?.[1] ?? (product.description || `Conheça ${product.title} no ecossistema VendorAI.`);
  product.price = null;
}

const featurePages = {};
for (const [slug, feature] of Object.entries(features)) {
  featurePages[slug] = {
    ...feature,
    seoTitle: `${feature.title} | Funcionalidade VendorAI`,
    seoDescription: feature.description || `Conheça ${feature.title}, funcionalidade do VendorAI para automação, marketing e inteligência comercial.`,
  };
}

const agentPages = {};
for (const [slug, agent] of Object.entries(agents)) {
  agentPages[slug] = {
    ...agent,
    seoTitle: `${agent.title} | Agente de IA VendorAI`,
    seoDescription: agent.description || `Agente de IA ${agent.title} para automação e execução no VendorAI.`,
  };
}

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);
}

function routePriority(pathname) {
  if (pathname === "/") return 1;
  if (pathname === "/produtos" || pathname === "/funcionalidades") return 0.9;
  if (pathname.startsWith("/produtos/")) return 0.85;
  if (pathname.startsWith("/funcionalidades/")) return 0.8;
  return 0.7;
}

const routes = [];
for (const [pathname, meta] of Object.entries(staticPages)) routes.push({ pathname, ...meta, priority: pathname === "/" ? 1 : 0.75 });
for (const [slug, product] of Object.entries(products)) routes.push({ pathname: `/produtos/${slug}`, title: product.seoTitle, description: product.seoDescription, type: "product", name: product.title, price: product.price, priority: 0.9 });
for (const [slug, feature] of Object.entries(featurePages)) routes.push({ pathname: `/funcionalidades/${slug}`, title: feature.seoTitle, description: feature.seoDescription, type: "feature", name: feature.title, priority: 0.78 });
for (const [slug, agent] of Object.entries(agentPages)) routes.push({ pathname: `/agentes/${slug}`, title: agent.seoTitle, description: agent.seoDescription, type: "agent", name: agent.title, priority: 0.76 });
for (const [slug, vertical] of Object.entries(verticals)) routes.push({ pathname: `/verticais/${slug}`, title: `VendorAI para ${vertical.title}`, description: vertical.description, type: "vertical", name: vertical.title, priority: 0.82 });
for (const macrosegment of macrosegments) routes.push({ pathname: `/segmentos/${macrosegment}`, title: `VendorAI para ${humanize(macrosegment)}`, description: `Soluções VendorAI para ${humanize(macrosegment).toLowerCase()}, com CRM, IA, marketing, atendimento, automação e inteligência comercial.`, type: "collection", priority: 0.7 });

const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  ogImage,
  staticPages,
  products,
  features: featurePages,
  agents: agentPages,
  verticals,
  macrosegments: [...macrosegments],
  routes,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "seo-manifest.json"), JSON.stringify(manifest, null, 2));

function socialMeta(title, description, canonical) {
  return [
    `<meta property="og:title" content="${escapeXml(title)}">`,
    `<meta property="og:description" content="${escapeXml(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta property="og:type" content="website">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeXml(title)}">`,
    `<meta name="twitter:description" content="${escapeXml(description)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join("\n    ");
}

function jsonLdFor(route, canonical) {
  const graph = [
    {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "VendorAI",
      url: baseUrl,
      logo: `${baseUrl}/logo-full-light.svg`,
    },
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: route.title,
      description: route.description,
      isPartOf: { "@id": `${baseUrl}/#website` },
      about: { "@id": `${baseUrl}/#organization` },
    },
  ];

  if (route.type === "product") {
    const product = {
      "@type": "SoftwareApplication",
      name: route.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: route.description,
      url: canonical,
      provider: { "@id": `${baseUrl}/#organization` },
    };
    graph.push(product);
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");
}

function renderRouteHtml(shell, route) {
  const canonical = `${baseUrl}${route.pathname === "/" ? "/" : route.pathname}`;
  let html = shell
    .replace(/<title>.*?<\/title>/s, `<title>${escapeXml(route.title)}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeXml(route.description)}">`);

  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, "");
  html = html.replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, "");
  html = html.replace(/<meta\s+name="twitter:[^"]+"[^>]*>/gi, "");
  html = html.replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");

  const injection = `\n    <link rel="canonical" href="${canonical}">\n    ${socialMeta(route.title, route.description, canonical)}\n    <script type="application/ld+json">${jsonLdFor(route, canonical)}</script>`;
  html = html.replace("</head>", `${injection}\n  </head>`);
  return html;
}

function writeRoute(route, html) {
  const target = route.pathname === "/"
    ? path.resolve(outDir, "index.html")
    : path.resolve(outDir, `.${route.pathname}/index.html`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}

const shellPath = path.resolve(outDir, "index.html");
if (!fs.existsSync(shellPath)) {
  console.error("[postbuild-seo] dist/public/index.html not found");
  process.exit(1);
}
const shell = fs.readFileSync(shellPath, "utf8");

for (const route of routes) writeRoute(route, renderRouteHtml(shell, route));

const today = new Date().toISOString().slice(0, 10);
const sitemapEntries = routes
  .filter((route) => !["/demo", "/contato", "/privacy", "/terms", "/cadastro-praca"].includes(route.pathname))
  .map((route) => {
    const loc = `${baseUrl}${route.pathname === "/" ? "/" : route.pathname}`;
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${routePriority(route.pathname).toFixed(1)}</priority>\n    <xhtml:link rel="alternate" hreflang="pt-BR" href="${escapeXml(loc)}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(loc)}" />\n  </url>`;
  }).join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapEntries}\n</urlset>\n`;
fs.writeFileSync(path.resolve(outDir, "sitemap.xml"), sitemap);

const robots = `User-agent: *\nAllow: /\n\nDisallow: /login\nDisallow: /app\nDisallow: /admin\nDisallow: /crm\nDisallow: /tenants\nDisallow: /settings\nDisallow: /api\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
fs.writeFileSync(path.resolve(outDir, "robots.txt"), robots);

console.log(`[postbuild-seo] rendered ${routes.length} route(s) with canonical/meta/JSON-LD + manifest + sitemap`);
