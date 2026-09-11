const RAILWAY_ORIGIN = "https://vendorai-platform-replit-production.up.railway.app";
const PUBLIC_ORIGIN = "https://appvendorai.com";
const OG_IMAGE = `${PUBLIC_ORIGIN}/opengraph.jpg`;
const MARKET_LOCALES = { BR: "pt-BR", PY: "es-PY", AR: "es-AR", UY: "es-UY", CL: "es-CL" };
let manifestCache = null;

async function proxyApi(request) {
  const incomingUrl = new URL(request.url);
  const target = new URL(incomingUrl.pathname + incomingUrl.search, RAILWAY_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

  const upstream = await fetch(new Request(target.toString(), init));
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

async function getManifest(env, origin) {
  if (manifestCache) return manifestCache;
  const response = await env.ASSETS.fetch(new Request(new URL("/seo-manifest.json", origin)));
  if (!response.ok) return null;
  manifestCache = await response.json();
  return manifestCache;
}

function humanize(slug = "") {
  return slug.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

const STATIC_ES = {
  "/": ["VendorAI — Plataforma de Ventas, CRM, Marketing y Agentes de IA", "VendorAI conecta marketing, prospección, atención, CRM, seguimiento, posventa e inteligencia para convertir oportunidades en ingresos continuos."],
  "/produtos": ["Productos VendorAI — CRM, IA, Marketing, Prospección y Gestión", "Conoce las soluciones VendorAI para ventas, atención, prospección, marketing, gestión, automatización, contenido e inteligencia de ingresos."],
  "/funcionalidades": ["Funciones VendorAI — Automatización Comercial e IA", "Conoce las funciones de VendorAI para demanda, atención, CRM, automatización, contenido, sitios, medios e inteligencia comercial."],
  "/precos": ["Precios VendorAI Growth — Plataforma Completa", "Conoce VendorAI Growth con acceso al ecosistema completo de CRM, IA, marketing, prospección y gestión."],
  "/sobre": ["Sobre VendorAI — Inteligencia Comercial y Operación de Ingresos", "Conoce VendorAI, la plataforma que conecta datos, IA y ejecución en marketing, ventas, atención, retención y crecimiento."],
  "/contato": ["Habla con VendorAI — Ventas y Demostración", "Habla con el equipo VendorAI para evaluar tu operación y aplicar IA a la generación y expansión de ingresos."],
  "/demo": ["Prueba VendorAI durante 5 días gratis", "Prueba VendorAI con tu propia operación y conoce CRM, agentes de IA, prospección, marketing y Revenue Scout."],
  "/baixar-app": ["Descargar App VendorAI — CRM e Inteligencia Comercial", "Accede a VendorAI desde el móvil para acompañar leads, conversaciones, agenda, oportunidades e indicadores."],
  "/blog": ["Blog VendorAI — Ventas, CRM, Marketing e IA", "Contenido práctico sobre CRM, inteligencia artificial, ventas, marketing, prospección, automatización, retención e ingresos."],
  "/parceiros": ["Socios VendorAI — Red Comercial y Ecosistema", "Conoce el programa de socios VendorAI y las oportunidades comerciales del ecosistema."],
};

function localizeMeta(meta, pathname, country) {
  if (country === "BR") return meta;
  const staticEs = STATIC_ES[pathname];
  if (staticEs) return { ...meta, title: staticEs[0], description: staticEs[1] };
  if (meta.type === "product") {
    return { ...meta, title: `${meta.name || "Producto VendorAI"} — IA y automatización para empresas | VendorAI`, description: `Conoce ${meta.name || "esta solución"} de VendorAI: tecnología, oportunidades, automatización e inteligencia conectadas a la operación comercial.` };
  }
  if (meta.type === "agent") {
    return { ...meta, title: `${meta.name || "Agente de IA"} | VendorAI`, description: `Conoce ${meta.name || "este agente"} de VendorAI y cómo automatiza etapas de atención, ventas y relación con clientes.` };
  }
  if (meta.type === "feature") {
    return { ...meta, title: `${meta.name || "Función"} | VendorAI`, description: `Conoce ${meta.name || "esta función"} dentro del ecosistema VendorAI para automatización, marketing e inteligencia comercial.` };
  }
  if (meta.type === "vertical" || meta.type === "segment") {
    return { ...meta, title: `VendorAI para ${meta.name || humanize(pathname.split("/").pop())} — CRM, Ventas e IA`, description: `VendorAI para ${meta.name || "este segmento"}: marketing, prospección, atención, CRM, ventas e inteligencia de ingresos en una operación conectada.` };
  }
  return meta;
}

function resolveMeta(manifest, url) {
  const pathname = normalizePath(url.pathname);
  const route = manifest?.routes?.find((item) => item.pathname === pathname);
  let meta = route || null;

  if (!meta && pathname.startsWith("/blog/") && pathname.split("/").filter(Boolean).length === 2) {
    const slug = pathname.split("/").pop();
    meta = {
      pathname,
      title: `${humanize(slug)} | Blog VendorAI`,
      description: "Conteúdo VendorAI sobre vendas, CRM, marketing, inteligência artificial, automação e crescimento de receita.",
      type: "article",
      name: humanize(slug),
    };
  }

  if (!meta && pathname.startsWith("/verticais/")) {
    const slug = pathname.split("/").pop();
    const vertical = manifest?.verticals?.[slug];
    meta = {
      pathname,
      title: `VendorAI para ${vertical?.title || humanize(slug)} — CRM, Vendas e IA`,
      description: vertical?.description || `Conheça como o VendorAI atende ${humanize(slug)} com CRM, automação e inteligência artificial.`,
      type: "vertical",
      name: vertical?.title || humanize(slug),
    };
  }

  if (!meta) return null;
  const rawCountry = (url.searchParams.get("country") || "BR").toUpperCase();
  const country = MARKET_LOCALES[rawCountry] ? rawCountry : "BR";
  return { ...localizeMeta(meta, pathname, country), pathname, country, locale: MARKET_LOCALES[country] };
}

function canonicalFor(meta) {
  const base = `${PUBLIC_ORIGIN}${meta.pathname}`;
  return meta.country === "BR" ? base : `${base}?country=${meta.country}`;
}

function breadcrumbSchema(meta, canonical) {
  if (meta.pathname === "/") return null;
  const parts = meta.pathname.split("/").filter(Boolean);
  const items = [{ "@type": "ListItem", position: 1, name: "VendorAI", item: `${PUBLIC_ORIGIN}/` }];
  if (parts.length > 1) {
    const section = parts[0];
    const sectionNames = { produtos: "Produtos", funcionalidades: "Funcionalidades", agentes: "Agentes", lp: "Segmentos", segmentos: "Segmentos", blog: "Blog", verticais: "Verticais" };
    items.push({ "@type": "ListItem", position: 2, name: sectionNames[section] || humanize(section), item: `${PUBLIC_ORIGIN}/${section}` });
  }
  items.push({ "@type": "ListItem", position: items.length + 1, name: meta.name || meta.title.replace(/\s*\|.*$/, ""), item: canonical });
  return { "@type": "BreadcrumbList", itemListElement: items };
}

function buildSchema(meta, canonical) {
  const graph = [];
  const org = {
    "@type": "Organization",
    "@id": `${PUBLIC_ORIGIN}/#organization`,
    name: "VendorAI",
    url: `${PUBLIC_ORIGIN}/`,
    logo: `${PUBLIC_ORIGIN}/apple-touch-icon.png`,
  };

  if (meta.pathname === "/") {
    graph.push(org);
    graph.push({ "@type": "WebSite", "@id": `${PUBLIC_ORIGIN}/#website`, url: `${PUBLIC_ORIGIN}/`, name: "VendorAI", publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, inLanguage: meta.locale });
    graph.push({ "@type": "SoftwareApplication", name: "VendorAI", applicationCategory: "BusinessApplication", operatingSystem: "Web, Android, iOS", url: `${PUBLIC_ORIGIN}/`, description: meta.description, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` } });
  } else if (meta.type === "product") {
    const app = { "@type": "SoftwareApplication", name: meta.name, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: canonical, description: meta.description, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` } };
    if (meta.price) app.offers = { "@type": "Offer", priceCurrency: "BRL", price: Number(meta.price).toFixed(2), availability: "https://schema.org/InStock", url: canonical };
    graph.push(org, app);
  } else if (meta.type === "article") {
    graph.push({ "@type": "Article", headline: meta.name || meta.title, description: meta.description, url: canonical, publisher: org, inLanguage: meta.locale });
  } else if (meta.type === "collection") {
    graph.push({ "@type": "CollectionPage", name: meta.title, description: meta.description, url: canonical, inLanguage: meta.locale });
  } else {
    graph.push({ "@type": "WebPage", name: meta.title, description: meta.description, url: canonical, inLanguage: meta.locale });
  }

  const breadcrumb = breadcrumbSchema(meta, canonical);
  if (breadcrumb) graph.push(breadcrumb);
  return { "@context": "https://schema.org", "@graph": graph };
}

function buildHead(meta) {
  const canonical = canonicalFor(meta);
  const alternates = Object.entries(MARKET_LOCALES).map(([country, locale]) => {
    const href = country === "BR" ? `${PUBLIC_ORIGIN}${meta.pathname}` : `${PUBLIC_ORIGIN}${meta.pathname}?country=${country}`;
    return `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(href)}">`;
  }).join("\n");
  const schema = buildSchema(meta, canonical);

  return `
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<link rel="canonical" href="${escapeHtml(canonical)}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${PUBLIC_ORIGIN}${meta.pathname}`)}">
<meta property="og:type" content="${meta.type === "article" ? "article" : "website"}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${meta.locale.replace("-", "_")}">
<meta property="og:site_name" content="VendorAI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<script type="application/ld+json" data-vendorai-seo="edge">${safeJson(schema)}</script>`;
}

function transformHtml(response, meta) {
  const head = buildHead(meta);
  return new HTMLRewriter()
    .on("html", { element(element) { element.setAttribute("lang", meta.locale); } })
    .on("title", { element(element) { element.remove(); } })
    .on('meta[name="description"]', { element(element) { element.remove(); } })
    .on('meta[name="robots"]', { element(element) { element.remove(); } })
    .on('meta[name="keywords"]', { element(element) { element.remove(); } })
    .on('link[rel="canonical"]', { element(element) { element.remove(); } })
    .on('link[rel="alternate"][hreflang]', { element(element) { element.remove(); } })
    .on('meta[property^="og:"]', { element(element) { element.remove(); } })
    .on('meta[name^="twitter:"]', { element(element) { element.remove(); } })
    .on('script[type="application/ld+json"][data-vendorai-seo]', { element(element) { element.remove(); } })
    .on("head", { element(element) { element.append(head, { html: true }); } })
    .transform(response);
}

async function serveWebsite(request, env) {
  const url = new URL(request.url);
  let response = await env.ASSETS.fetch(request);
  const acceptsHtml = request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");

  if (response.status === 404 && acceptsHtml) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const manifest = contentType.includes("text/html") && acceptsHtml ? await getManifest(env, url.origin) : null;
  const meta = manifest ? resolveMeta(manifest, url) : null;
  let result = meta ? transformHtml(response, meta) : new Response(response.body, response);

  if (url.pathname.startsWith("/assets/")) {
    result.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (contentType.includes("text/html") || url.pathname === "/" || !url.pathname.includes(".")) {
    result.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  }
  result.headers.set("X-Robots-Tag", meta ? "index, follow" : result.headers.get("X-Robots-Tag") || "index, follow");
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www.appvendorai.com") {
      url.hostname = "appvendorai.com";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxyApi(request);
    return serveWebsite(request, env);
  },
};
