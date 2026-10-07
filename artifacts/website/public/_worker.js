const RAILWAY_ORIGIN = "https://api.appvendorai.com";
const PUBLIC_ORIGIN = "https://appvendorai.com";
const OG_IMAGE = `${PUBLIC_ORIGIN}/opengraph.jpg`;
const MARKET_LOCALES = { BR: "pt-BR", PY: "es-PY", AR: "es-AR", UY: "es-UY", CL: "es-CL" };
let manifestCache = null;
let manifestVersion = null;

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
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function humanize(slug = "") {
  return slug.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

async function getDeploymentVersion(env, origin) {
  const versionUrl = new URL("/deployment-version.txt", origin);
  versionUrl.searchParams.set("ts", Date.now().toString());
  const response = await env.ASSETS.fetch(new Request(versionUrl, { headers: { "Cache-Control": "no-cache" } }));
  if (!response.ok) return "unknown";
  return (await response.text()).trim() || "unknown";
}

async function getManifest(env, origin) {
  const version = await getDeploymentVersion(env, origin);
  if (manifestCache && manifestVersion === version) return manifestCache;

  const manifestUrl = new URL("/seo-manifest.json", origin);
  manifestUrl.searchParams.set("v", version);
  const response = await env.ASSETS.fetch(new Request(manifestUrl, { headers: { "Cache-Control": "no-cache" } }));
  if (!response.ok) return null;

  manifestCache = await response.json();
  manifestVersion = version;
  return manifestCache;
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

const HUB_FALLBACKS = {
  "/solucoes": {
    pathname: "/solucoes",
    title: "Soluções para CRM, Vendas e Receita com IA | VendorAI",
    description: "Encontre soluções VendorAI por problema: CRM e WhatsApp, follow-up, recuperação de leads, reativação, recompra, prospecção e inteligência de receita.",
    esTitle: "Soluciones para CRM, Ventas e Ingresos con IA | VendorAI",
    esDescription: "Encuentra soluciones VendorAI por problema: CRM y WhatsApp, seguimiento, recuperación de leads, reactivación, recompra, prospección e inteligencia de ingresos.",
    type: "collection",
    name: "Soluções por problema",
    indexable: true,
  },
  "/comparar": {
    pathname: "/comparar",
    title: "Comparações de CRM, Follow-up e Prospecção com IA | VendorAI",
    description: "Compare CRM com IA, follow-up automático e prospecção assistida por IA com abordagens tradicionais antes de escolher sua operação comercial.",
    esTitle: "Comparaciones de CRM, Seguimiento y Prospección con IA | VendorAI",
    esDescription: "Compara CRM con IA, seguimiento automático y prospección asistida por IA con enfoques tradicionales antes de elegir tu operación comercial.",
    type: "collection",
    name: "Comparações comerciais",
    indexable: true,
  },
};

function localizeMeta(meta, pathname, country) {
  if (country === "BR") return meta;

  const localizedExtras = {
    faq: Array.isArray(meta.esFaq) ? meta.esFaq : null,
    items: Array.isArray(meta.items)
      ? meta.items.map((item) => ({ ...item, name: item.esName || item.name }))
      : meta.items,
  };

  if (meta.esTitle || meta.esDescription) {
    return {
      ...meta,
      ...localizedExtras,
      title: meta.esTitle || meta.title,
      description: meta.esDescription || meta.description,
    };
  }
  const staticEs = STATIC_ES[pathname];
  if (staticEs) return { ...meta, ...localizedExtras, title: staticEs[0], description: staticEs[1] };
  if (meta.type === "product") return { ...meta, ...localizedExtras, title: `${meta.name || "Producto VendorAI"} — IA y automatización para empresas | VendorAI`, description: `Conoce ${meta.name || "esta solución"} de VendorAI: tecnología, oportunidades, automatización e inteligencia conectadas a la operación comercial.` };
  if (meta.type === "agent") return { ...meta, ...localizedExtras, title: `${meta.name || "Agente de IA"} | VendorAI`, description: `Conoce ${meta.name || "este agente"} de VendorAI y cómo automatiza etapas de atención, ventas y relación con clientes.` };
  if (meta.type === "feature") return { ...meta, ...localizedExtras, title: `${meta.name || "Función"} | VendorAI`, description: `Conoce ${meta.name || "esta función"} dentro del ecosistema VendorAI para automatización, marketing e inteligencia comercial.` };
  if (meta.type === "vertical" || meta.type === "segment") return { ...meta, ...localizedExtras, title: `VendorAI para ${meta.name || humanize(pathname.split("/").pop())} — CRM, Ventas e IA`, description: `VendorAI para ${meta.name || "este segmento"}: marketing, prospección, atención, CRM, ventas e inteligencia de ingresos en una operación conectada.` };
  return { ...meta, ...localizedExtras };
}

async function fetchDynamicBlogMeta(pathname) {
  if (!pathname.startsWith("/blog/") || pathname.split("/").filter(Boolean).length !== 2) return null;
  const slug = pathname.split("/").pop();
  try {
    const response = await fetch(`${RAILWAY_ORIGIN}/api/sites/vendorai/blog-data/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const post = data?.post;
    if (!post?.slug || !post?.titulo) return null;
    return {
      pathname,
      title: `${post.titulo} | Blog VendorAI`,
      description: post.metaDescription || "Conteúdo VendorAI sobre vendas, CRM, marketing, automação e inteligência artificial.",
      type: "article",
      name: post.titulo,
      image: post.imagemCapaUrl || null,
      datePublished: post.publicadoEm || null,
      indexable: true,
    };
  } catch {
    return null;
  }
}

async function resolveMeta(manifest, url) {
  const pathname = normalizePath(url.pathname);
  let meta = manifest?.routes?.find((item) => item.pathname === pathname)
    || manifest?.growthHubs?.find((item) => item.pathname === pathname)
    || HUB_FALLBACKS[pathname]
    || null;

  if (!meta) meta = await fetchDynamicBlogMeta(pathname);

  if (!meta && pathname.startsWith("/verticais/")) {
    const slug = pathname.split("/").pop();
    const vertical = manifest?.verticals?.[slug];
    if (vertical) {
      meta = {
        pathname,
        title: `VendorAI para ${vertical.title} — CRM, Vendas e IA`,
        description: vertical.description,
        type: "vertical",
        name: vertical.title,
        indexable: true,
      };
    }
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
    const sectionNames = { produtos: "Produtos", funcionalidades: "Funcionalidades", agentes: "Agentes", lp: "Segmentos", segmentos: "Segmentos", blog: "Blog", verticais: "Verticais", solucoes: "Soluções", comparar: "Comparações" };
    items.push({ "@type": "ListItem", position: 2, name: sectionNames[section] || humanize(section), item: `${PUBLIC_ORIGIN}/${section}` });
  }
  items.push({ "@type": "ListItem", position: items.length + 1, name: meta.name || meta.title.replace(/\s*\|.*$/, ""), item: canonical });
  return { "@type": "BreadcrumbList", itemListElement: items };
}

function semanticAbout(meta) {
  return [meta.primaryKeyword, ...(Array.isArray(meta.secondaryKeywords) ? meta.secondaryKeywords : [])]
    .filter(Boolean)
    .slice(0, 8)
    .map((name) => ({ "@type": "Thing", name }));
}

function faqSchema(meta, canonical) {
  if (!Array.isArray(meta.faq) || meta.faq.length === 0) return null;
  const mainEntity = meta.faq
    .filter((item) => item?.q && item?.a)
    .map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    }));
  if (!mainEntity.length) return null;
  return { "@type": "FAQPage", "@id": `${canonical}#faq`, url: canonical, inLanguage: meta.locale, mainEntity };
}

function buildSchema(meta, canonical) {
  const graph = [];
  const org = { "@type": "Organization", "@id": `${PUBLIC_ORIGIN}/#organization`, name: "VendorAI", url: `${PUBLIC_ORIGIN}/`, logo: `${PUBLIC_ORIGIN}/apple-touch-icon.png` };
  const website = { "@type": "WebSite", "@id": `${PUBLIC_ORIGIN}/#website`, url: `${PUBLIC_ORIGIN}/`, name: "VendorAI", publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, inLanguage: meta.locale };
  const about = semanticAbout(meta);
  const keywords = [meta.primaryKeyword, ...(Array.isArray(meta.secondaryKeywords) ? meta.secondaryKeywords : [])].filter(Boolean).join(", ") || undefined;
  const relatedLink = Array.isArray(meta.relatedProducts)
    ? meta.relatedProducts.map((product) => `${PUBLIC_ORIGIN}${product.href}`).filter(Boolean)
    : undefined;

  graph.push(org, website);

  if (meta.pathname === "/") {
    graph.push({ "@type": "SoftwareApplication", name: "VendorAI", applicationCategory: "BusinessApplication", operatingSystem: "Web, Android, iOS", url: `${PUBLIC_ORIGIN}/`, description: meta.description, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` } });
  } else if (meta.type === "product") {
    const app = { "@type": "SoftwareApplication", name: meta.name, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: canonical, description: meta.description, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` } };
    if (meta.price) app.offers = { "@type": "Offer", priceCurrency: "BRL", price: Number(meta.price).toFixed(2), availability: "https://schema.org/InStock", url: canonical };
    graph.push(app);
  } else if (meta.type === "article") {
    const article = { "@type": "Article", headline: meta.name || meta.title, description: meta.description, url: canonical, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, isPartOf: { "@id": `${PUBLIC_ORIGIN}/#website` }, inLanguage: meta.locale };
    if (meta.datePublished) article.datePublished = meta.datePublished;
    if (meta.image) article.image = meta.image;
    graph.push(article);
  } else if (meta.type === "collection") {
    const collection = { "@type": "CollectionPage", "@id": `${canonical}#webpage`, name: meta.title, description: meta.description, url: canonical, isPartOf: { "@id": `${PUBLIC_ORIGIN}/#website` }, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, inLanguage: meta.locale };
    if (Array.isArray(meta.items) && meta.items.length) {
      collection.mainEntity = {
        "@type": "ItemList",
        itemListElement: meta.items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          url: `${PUBLIC_ORIGIN}${item.path}`,
        })),
      };
    }
    graph.push(collection);
  } else {
    const page = { "@type": "WebPage", "@id": `${canonical}#webpage`, name: meta.title, description: meta.description, url: canonical, isPartOf: { "@id": `${PUBLIC_ORIGIN}/#website` }, publisher: { "@id": `${PUBLIC_ORIGIN}/#organization` }, inLanguage: meta.locale };
    if (about.length) page.about = about;
    if (keywords) page.keywords = keywords;
    if (relatedLink?.length) page.relatedLink = relatedLink;
    graph.push(page);
  }

  const faq = faqSchema(meta, canonical);
  if (faq) graph.push(faq);

  const breadcrumb = breadcrumbSchema(meta, canonical);
  if (breadcrumb) graph.push(breadcrumb);
  return { "@context": "https://schema.org", "@graph": graph };
}

function buildHead(meta) {
  const canonical = canonicalFor(meta);
  const indexable = meta.indexable !== false;
  const alternates = indexable ? Object.entries(MARKET_LOCALES).map(([country, locale]) => {
    const href = country === "BR" ? `${PUBLIC_ORIGIN}${meta.pathname}` : `${baseHref(meta.pathname)}?country=${country}`;
    return `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(href)}">`;
  }).join("\n") : "";
  const xDefault = indexable ? `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${PUBLIC_ORIGIN}${meta.pathname}`)}">` : "";
  const image = meta.image || OG_IMAGE;
  return `
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<meta name="robots" content="${indexable ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" : "noindex, follow"}">
<link rel="canonical" href="${escapeHtml(canonical)}">
${alternates}
${xDefault}
<meta property="og:type" content="${meta.type === "article" ? "article" : "website"}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${meta.locale.replace("-", "_")}">
<meta property="og:site_name" content="VendorAI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json" data-vendorai-seo="edge">${safeJson(buildSchema(meta, canonical))}</script>`;
}

function baseHref(pathname) {
  return `${PUBLIC_ORIGIN}${pathname}`;
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

function transformUnknownHtml(response) {
  return new HTMLRewriter()
    .on('meta[name="robots"]', { element(element) { element.remove(); } })
    .on('link[rel="canonical"]', { element(element) { element.remove(); } })
    .on('link[rel="alternate"][hreflang]', { element(element) { element.remove(); } })
    .on("head", { element(element) { element.append('<meta name="robots" content="noindex, follow">', { html: true }); } })
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
  const meta = manifest ? await resolveMeta(manifest, url) : null;
  let result = meta ? transformHtml(response, meta) : new Response(response.body, response);

  // Cloudflare Pages pode devolver index.html com HTTP 200 para qualquer rota SPA.
  // Se a rota HTML não existe no manifesto/dados dinâmicos, convertemos para 404 real.
  if (!meta && acceptsHtml && contentType.includes("text/html")) {
    const notFound = new Response(result.body, { status: 404, headers: result.headers });
    notFound.headers.set("X-Robots-Tag", "noindex, follow");
    result = transformUnknownHtml(notFound);
  } else if (meta) {
    result.headers.set("X-Robots-Tag", meta.indexable === false ? "noindex, follow" : "index, follow");
  }

  if (url.pathname.startsWith("/assets/")) result.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  else if (contentType.includes("text/html") || url.pathname === "/" || !url.pathname.includes(".")) result.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
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