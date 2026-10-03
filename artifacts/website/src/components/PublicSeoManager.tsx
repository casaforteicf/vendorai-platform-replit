import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PUBLIC_COUNTRIES, type PublicCountryCode, usePublicCountry } from "@/lib/publicCountry";

type SeoRoute = {
  pathname: string;
  title: string;
  description: string;
  type?: string;
  name?: string;
  price?: number | null;
  esTitle?: string | null;
  esDescription?: string | null;
};

type SeoManifest = {
  baseUrl: string;
  ogImage: string;
  routes: SeoRoute[];
  verticals?: Record<string, { title: string; description: string }>;
};

let manifestPromise: Promise<SeoManifest | null> | null = null;
function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/seo-manifest.json", { cache: "no-cache" })
      .then((response) => response.ok ? response.json() as Promise<SeoManifest> : null)
      .catch(() => null);
  }
  return manifestPromise;
}

function humanize(slug: string) {
  return slug.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

const STATIC_ES: Record<string, [string, string]> = {
  "/": ["VendorAI — Plataforma de Ventas, CRM, Marketing y Agentes de IA", "VendorAI conecta marketing, prospección, atención, CRM, seguimiento, posventa e inteligencia para convertir oportunidades en ingresos continuos."],
  "/produtos": ["Productos VendorAI — CRM, IA, Marketing, Prospección y Gestión", "Conoce las soluciones VendorAI para ventas, atención, prospección, marketing, gestión, automatización, contenido e inteligencia de ingresos."],
  "/funcionalidades": ["Funciones VendorAI — Automatización Comercial e IA", "Conoce las funciones de VendorAI para demanda, atención, CRM, automatización, contenido, sitios, medios e inteligencia comercial."],
  "/precos": ["Precios VendorAI Growth — Plataforma Completa", "Conoce VendorAI Growth con acceso al ecosistema completo de CRM, IA, marketing, prospección y gestión."],
  "/sobre": ["Sobre VendorAI — Inteligencia Comercial y Operación de Ingresos", "Conoce VendorAI, la plataforma que conecta datos, IA y ejecución en marketing, ventas, atención, retención y crecimiento."],
  "/contato": ["Habla con VendorAI — Ventas y Demostración", "Habla con el equipo VendorAI para evaluar tu operación y aplicar IA a la generación y expansión de ingresos."],
  "/demo": ["Prueba VendorAI durante 5 días gratis", "Prueba VendorAI con tu propia operación y conoce CRM, agentes de IA, prospección, marketing y Revenue Scout."],
  "/baixar-app": ["Descargar App VendorAI — CRM e Inteligencia Comercial", "Accede a VendorAI desde el móvil para acompañar leads, conversaciones, agenda, oportunidades e indicadores."],
  "/blog": ["Blog VendorAI — Ventas, CRM, Marketing e IA", "Contenido práctico sobre CRM, inteligencia artificial, ventas, marketing, prospección, automatización, retención e ingresos."],
};

function localizeMeta(meta: SeoRoute, countryCode: PublicCountryCode): SeoRoute {
  if (countryCode === "BR") return meta;
  if (meta.esTitle || meta.esDescription) {
    return { ...meta, title: meta.esTitle ?? meta.title, description: meta.esDescription ?? meta.description };
  }
  const staticEs = STATIC_ES[meta.pathname];
  if (staticEs) return { ...meta, title: staticEs[0], description: staticEs[1] };
  if (meta.type === "product") return { ...meta, title: `${meta.name ?? "Producto VendorAI"} — IA y automatización para empresas | VendorAI`, description: `Conoce ${meta.name ?? "esta solución"} de VendorAI: tecnología, oportunidades, automatización e inteligencia conectadas a la operación comercial.` };
  if (meta.type === "agent") return { ...meta, title: `${meta.name ?? "Agente de IA"} | VendorAI`, description: `Conoce ${meta.name ?? "este agente"} de VendorAI y cómo automatiza etapas de atención, ventas y relación con clientes.` };
  if (meta.type === "feature") return { ...meta, title: `${meta.name ?? "Función"} | VendorAI`, description: `Conoce ${meta.name ?? "esta función"} dentro del ecosistema VendorAI para automatización, marketing e inteligencia comercial.` };
  if (meta.type === "vertical" || meta.type === "segment") return { ...meta, title: `VendorAI para ${meta.name ?? humanize(meta.pathname.split("/").pop() ?? "empresas")} — CRM, Ventas e IA`, description: `VendorAI para ${meta.name ?? "este segmento"}: marketing, prospección, atención, CRM, ventas e inteligencia de ingresos en una operación conectada.` };
  return meta;
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attrs).forEach(([key, value]) => element!.setAttribute(key, value));
}

function upsertLink(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement("link");
    document.head.appendChild(element);
  }
  Object.entries(attrs).forEach(([key, value]) => element!.setAttribute(key, value));
}

function schemaFor(meta: SeoRoute, canonical: string, locale: string) {
  const graph: Record<string, unknown>[] = [];
  if (meta.pathname === "/") {
    graph.push({ "@type": "Organization", "@id": "https://appvendorai.com/#organization", name: "VendorAI", url: "https://appvendorai.com/", logo: "https://appvendorai.com/apple-touch-icon.png" });
    graph.push({ "@type": "WebSite", url: "https://appvendorai.com/", name: "VendorAI", inLanguage: locale });
    graph.push({ "@type": "SoftwareApplication", name: "VendorAI", applicationCategory: "BusinessApplication", operatingSystem: "Web, Android, iOS", url: canonical, description: meta.description });
  } else if (meta.type === "product") {
    const app: Record<string, unknown> = { "@type": "SoftwareApplication", name: meta.name, applicationCategory: "BusinessApplication", operatingSystem: "Web", url: canonical, description: meta.description };
    if (meta.price) app.offers = { "@type": "Offer", priceCurrency: "BRL", price: Number(meta.price).toFixed(2), url: canonical, availability: "https://schema.org/InStock" };
    graph.push(app);
  } else if (meta.type === "article") {
    graph.push({ "@type": "Article", headline: meta.name ?? meta.title, description: meta.description, url: canonical, inLanguage: locale });
  } else {
    graph.push({ "@type": meta.type === "collection" ? "CollectionPage" : "WebPage", name: meta.title, description: meta.description, url: canonical, inLanguage: locale });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export default function PublicSeoManager() {
  const [location] = useLocation();
  const { countryCode, setCountryCode, country } = usePublicCountry();
  const [manifest, setManifest] = useState<SeoManifest | null>(null);
  const pathname = useMemo(() => normalizePath(location.split("?")[0]), [location]);

  useEffect(() => {
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    let cancelled = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const load = () => {
      void loadManifest().then((value) => {
        if (!cancelled) setManifest(value);
      });
    };
    const schedule = () => {
      if (idleWindow.requestIdleCallback) idleId = idleWindow.requestIdleCallback(load, { timeout: 1800 });
      else timeoutId = window.setTimeout(load, 900);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleId != null) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("country")?.toUpperCase() as PublicCountryCode | undefined;
    if (requested && requested in PUBLIC_COUNTRIES && requested !== countryCode) setCountryCode(requested);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (countryCode === "BR") url.searchParams.delete("country");
    else url.searchParams.set("country", countryCode);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [countryCode, pathname]);

  useEffect(() => {
    if (!manifest) return;
    let baseMeta = manifest.routes.find((item) => item.pathname === pathname);
    if (!baseMeta && pathname.startsWith("/blog/")) {
      const slug = pathname.split("/").pop() ?? "artigo";
      baseMeta = { pathname, title: `${humanize(slug)} | Blog VendorAI`, description: "Conteúdo VendorAI sobre vendas, CRM, marketing, inteligência artificial, automação e crescimento de receita.", type: "article", name: humanize(slug) };
    }
    if (!baseMeta && pathname.startsWith("/verticais/")) {
      const slug = pathname.split("/").pop() ?? "empresas";
      const vertical = manifest.verticals?.[slug];
      baseMeta = { pathname, title: `VendorAI para ${vertical?.title ?? humanize(slug)} — CRM, Vendas e IA`, description: vertical?.description ?? `Conheça o VendorAI para ${humanize(slug)}.`, type: "vertical", name: vertical?.title ?? humanize(slug) };
    }
    if (!baseMeta) return;

    const meta = localizeMeta(baseMeta, countryCode);
    const canonical = countryCode === "BR" ? `${manifest.baseUrl}${pathname}` : `${manifest.baseUrl}${pathname}?country=${countryCode}`;
    document.title = meta.title;
    document.documentElement.lang = country.locale;
    upsertMeta('meta[name="description"]', { name: "description", content: meta.description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" });
    upsertLink('link[rel="canonical"]', { rel: "canonical", href: canonical });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: meta.type === "article" ? "article" : "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: meta.title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: meta.description });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: manifest.ogImage });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: country.locale.replace("-", "_") });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "VendorAI" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: meta.title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: meta.description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: manifest.ogImage });

    document.head.querySelectorAll('link[rel="alternate"][data-vendorai-hreflang="true"]').forEach((node) => node.remove());
    (Object.entries(PUBLIC_COUNTRIES) as [PublicCountryCode, (typeof PUBLIC_COUNTRIES)[PublicCountryCode]][]).forEach(([code, market]) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = market.locale;
      link.href = code === "BR" ? `${manifest.baseUrl}${pathname}` : `${manifest.baseUrl}${pathname}?country=${code}`;
      link.dataset.vendoraiHreflang = "true";
      document.head.appendChild(link);
    });
    const xDefault = document.createElement("link");
    xDefault.rel = "alternate";
    xDefault.hreflang = "x-default";
    xDefault.href = `${manifest.baseUrl}${pathname}`;
    xDefault.dataset.vendoraiHreflang = "true";
    document.head.appendChild(xDefault);

    // O Cloudflare injeta no HTML inicial o schema mais rico (edge). Em uma carga
    // direta, não adicionamos uma segunda versão simplificada durante a hidratação.
    // O fallback runtime permanece apenas para navegação SPA/ambientes sem edge.
    document.head.querySelectorAll('script[type="application/ld+json"][data-vendorai-seo="runtime"]').forEach((node) => node.remove());
    const edgeSchema = document.head.querySelector('script[type="application/ld+json"][data-vendorai-seo="edge"]');
    if (!edgeSchema) {
      const schema = document.createElement("script");
      schema.type = "application/ld+json";
      schema.dataset.vendoraiSeo = "runtime";
      schema.textContent = JSON.stringify(schemaFor(meta, canonical, country.locale));
      document.head.appendChild(schema);
    }
  }, [manifest, pathname, countryCode, country.locale]);

  return null;
}
