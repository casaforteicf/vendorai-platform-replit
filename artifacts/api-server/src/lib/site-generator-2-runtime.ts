import {
  buildSitePageSpec,
  scoreSiteGenerator2Html,
  type SitePageSpec,
  type SiteQaScorecard,
} from "@workspace/vendor-brain/site-generator-2";
import type { SiteGeneratorConfig } from "@workspace/db";
import { computeSiteSeoScore } from "./site-seo-analysis.js";

const RUNTIME_STYLE_ID = "vendorai-site-generator-2-style";
const RUNTIME_SCRIPT_ID = "vendorai-site-generator-2-runtime";
const SPEC_SCRIPT_ID = "vendorai-site-generator-2-spec";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function stripRuntime(html: string): string {
  return html
    .replace(new RegExp(`<style\\s+id=["']${RUNTIME_STYLE_ID}["'][\\s\\S]*?<\\/style>`, "gi"), "")
    .replace(new RegExp(`<script\\s+id=["']${RUNTIME_SCRIPT_ID}["'][\\s\\S]*?<\\/script>`, "gi"), "")
    .replace(new RegExp(`<script\\s+id=["']${SPEC_SCRIPT_ID}["'][\\s\\S]*?<\\/script>`, "gi"), "");
}

function replaceOrInsertHeadTag(html: string, matcher: RegExp, tag: string): string {
  if (matcher.test(html)) return html.replace(matcher, tag);
  return html.includes("</head>") ? html.replace("</head>", `${tag}\n</head>`) : `${tag}\n${html}`;
}

function normalizePublicUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

function classifySection(block: string, fallback: string): string {
  const explicit = block.match(/data-vendor-section=["']([^"']+)["']/i)?.[1];
  if (explicit) return explicit;
  const haystack = block
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLocaleLowerCase("pt-BR");
  if (/hero|comece|transforme|descubra|solução principal|oferta/.test(haystack)) return "hero";
  if (/dor|problema|desafio/.test(haystack)) return "problem";
  if (/solução|como resolvemos|como funciona/.test(haystack)) return "solution";
  if (/benefício|beneficio|vantagem|diferencial/.test(haystack)) return "benefits";
  if (/produto|catálogo|catalogo|coleção|colecao/.test(haystack)) return "products";
  if (/galeria|projeto|portfólio|portfolio|ambiente/.test(haystack)) return "gallery";
  if (/depoimento|resultado|clientes|números|numeros|prova/.test(haystack)) return "proof";
  if (/passo|processo|etapa|como trabalhamos/.test(haystack)) return "process";
  if (/preço|preco|plano|investimento/.test(haystack)) return "pricing";
  if (/compare|comparação|comparacao/.test(haystack)) return "comparison";
  if (/perguntas|faq|dúvida|duvida/.test(haystack)) return "faq";
  if (/formulário|formulario|contato|fale conosco/.test(haystack)) return "form";
  if (/agende|orçamento|orcamento|whatsapp|chamada para ação|cta/.test(haystack)) return "cta";
  if (/serviço|servico/.test(haystack)) return "services";
  return fallback;
}

function markSections(html: string, spec: SitePageSpec): string {
  let sectionIndex = 0;
  return html.replace(/<section\b([^>]*)>/gi, (whole, attrs: string) => {
    const planned = spec.sections[Math.min(sectionIndex, Math.max(0, spec.sections.length - 1))];
    const sampleEnd = html.indexOf("</section>", (arguments as unknown as { index?: number }).index ?? 0);
    void sampleEnd;
    const fallbackKind = planned?.kind ?? "content";
    const kindMatch = attrs.match(/data-vendor-section=["']([^"']+)["']/i)?.[1];
    const kind = kindMatch ?? fallbackKind;
    const matchingPlan = spec.sections.find((section) => section.kind === kind) ?? planned;
    const componentId = attrs.match(/data-vendor-component=["']([^"']+)["']/i)?.[1] ?? matchingPlan?.componentId ?? `content-${sectionIndex + 1}`;
    const motion = attrs.match(/data-motion=["']([^"']+)["']/i)?.[1] ?? matchingPlan?.motion ?? "fade-up";
    sectionIndex += 1;

    let nextAttrs = attrs;
    if (!/data-vendor-section=/i.test(nextAttrs)) nextAttrs += ` data-vendor-section="${escapeHtml(kind)}"`;
    if (!/data-vendor-component=/i.test(nextAttrs)) nextAttrs += ` data-vendor-component="${escapeHtml(componentId)}"`;
    if (!/data-motion=/i.test(nextAttrs)) nextAttrs += ` data-motion="${escapeHtml(motion)}"`;
    return `<section${nextAttrs}>`;
  });
}

function ensureSemanticMarkers(html: string, spec: SitePageSpec): string {
  let result = markSections(html, spec);
  if (!/<main\b/i.test(result) && /<body\b[^>]*>/i.test(result)) {
    result = result.replace(/<body\b([^>]*)>/i, "<body$1><main id=\"main-content\">")
      .replace(/<\/body>/i, "</main></body>");
  }
  if (!/data-vendor-component=/i.test(result)) {
    result = result.replace(/<main\b([^>]*)>/i, '<main$1 data-vendor-component="page-shell-01">');
  }
  return result;
}

function ensureMediaPerformance(html: string, businessName: string): string {
  let firstImage = true;
  let result = html.replace(/<img\b([^>]*)>/gi, (whole, attrs: string) => {
    let next = attrs;
    if (!/\balt=/i.test(next)) next += ` alt="${escapeHtml(businessName)}"`;
    if (!/\bdecoding=/i.test(next)) next += ' decoding="async"';
    if (firstImage) {
      if (!/\bfetchpriority=/i.test(next)) next += ' fetchpriority="high"';
      firstImage = false;
    } else if (!/\bloading=/i.test(next)) {
      next += ' loading="lazy"';
    }
    return `<img${next}>`;
  });
  result = result.replace(/<video\b([^>]*)>/gi, (whole, attrs: string) => {
    let next = attrs;
    if (!/\bpreload=/i.test(next)) next += ' preload="metadata"';
    if (!/\bplaysinline/i.test(next)) next += " playsinline";
    return `<video${next}>`;
  });
  return result;
}

function buildMotionStyle(): string {
  return `<style id="${RUNTIME_STYLE_ID}">
:root{--v-motion-duration:.62s;--v-motion-ease:cubic-bezier(.2,.75,.25,1)}
[data-motion]{--v-delay:0ms}
.v-motion-ready[data-motion]:not([data-motion="none"]){opacity:0;transform:translate3d(0,20px,0);transition:opacity var(--v-motion-duration) var(--v-motion-ease) var(--v-delay),transform var(--v-motion-duration) var(--v-motion-ease) var(--v-delay)}
.v-motion-ready[data-motion].is-visible{opacity:1;transform:none}
[data-motion="image-reveal"], [data-motion="mask-scroll-reveal"], [data-motion="hero-cinematic-reveal"]{overflow:clip}
.v-motion-ready[data-motion="image-reveal"] img,.v-motion-ready[data-motion="mask-scroll-reveal"] img,.v-motion-ready[data-motion="hero-cinematic-reveal"] img{transform:scale(1.035);transition:transform 1.05s var(--v-motion-ease)}
.v-motion-ready[data-motion="image-reveal"].is-visible img,.v-motion-ready[data-motion="mask-scroll-reveal"].is-visible img,.v-motion-ready[data-motion="hero-cinematic-reveal"].is-visible img{transform:scale(1)}
[data-motion="hover-lift"]{transition:transform .24s ease,box-shadow .24s ease}
@media(hover:hover){[data-motion="hover-lift"]:hover{transform:translateY(-4px)}}
[data-motion="stagger-children"]>*{transition-delay:calc(var(--v-child-index,0)*70ms)}
[data-motion="marquee-soft"]{overflow:hidden}
[data-motion="page-transition-soft"]{animation:vPageIn .45s ease both}
@keyframes vPageIn{from{opacity:.01}to{opacity:1}}
@media(max-width:640px){:root{--v-motion-duration:.42s}.v-motion-ready[data-motion="parallax-soft"],.v-motion-ready[data-motion="sticky-story"],.v-motion-ready[data-motion="mask-scroll-reveal"],.v-motion-ready[data-motion="hero-cinematic-reveal"]{transform:translate3d(0,14px,0)}}
@media(prefers-reduced-motion:reduce){html:focus-within{scroll-behavior:auto!important}*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}.v-motion-ready[data-motion]{opacity:1!important;transform:none!important}.v-motion-ready[data-motion] img{transform:none!important}}
</style>`;
}

function buildMotionScript(): string {
  return `<script id="${RUNTIME_SCRIPT_ID}">(function(){
if(window.__vendorSite2)return;window.__vendorSite2=true;
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var nodes=[].slice.call(document.querySelectorAll('[data-motion]'));
nodes.forEach(function(el){var kids=[].slice.call(el.children||[]);kids.forEach(function(k,i){k.style.setProperty('--v-child-index',String(i))});if(el.getAttribute('data-motion')!=='none')el.classList.add('v-motion-ready')});
if(reduce){nodes.forEach(function(el){el.classList.add('is-visible')});return}
var io='IntersectionObserver'in window?new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}})},{rootMargin:'0px 0px -7% 0px',threshold:.08}):null;
nodes.forEach(function(el){if(io)io.observe(el);else el.classList.add('is-visible')});
var counters=[].slice.call(document.querySelectorAll('[data-motion="counter-reveal"] [data-count]'));counters.forEach(function(el){var target=Number(el.getAttribute('data-count'));if(!isFinite(target))return;var started=false;var cio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting||started)return;started=true;var start=performance.now(),duration=900;function tick(now){var p=Math.min(1,(now-start)/duration);el.textContent=String(Math.round(target*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(tick)}requestAnimationFrame(tick);cio.disconnect()})},{threshold:.25});cio.observe(el)});
var parallax=[].slice.call(document.querySelectorAll('[data-motion="parallax-soft"]'));if(parallax.length&&window.innerWidth>700){var ticking=false;function paint(){ticking=false;var vh=window.innerHeight;parallax.forEach(function(el){var r=el.getBoundingClientRect();var p=(r.top+r.height/2-vh/2)/vh;var media=el.querySelector('img,video');if(media)media.style.transform='translate3d(0,'+(p*-12).toFixed(2)+'px,0) scale(1.02)'})}window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(paint)}},{passive:true});paint()}
})();</script>`;
}

function ensureSeo(html: string, input: { config: SiteGeneratorConfig; published: boolean; canonicalUrl?: string | null }): string {
  let result = html;
  const title = `${input.config.headline || input.config.name || "Site"}`.trim().slice(0, 64);
  const description = `${input.config.desc || input.config.servicos || input.config.name || ""}`.replace(/\s+/g, " ").trim().slice(0, 158);
  const robots = input.published ? "index,follow,max-image-preview:large" : "noindex,nofollow";
  const canonical = input.canonicalUrl?.trim() || null;

  result = replaceOrInsertHeadTag(result, /<meta[^>]+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${robots}">`);
  if (!/<title>[^<]*<\/title>/i.test(result)) result = replaceOrInsertHeadTag(result, /$^/, `<title>${escapeHtml(title)}</title>`);
  if (!/<meta[^>]+name=["']description["']/i.test(result)) result = replaceOrInsertHeadTag(result, /$^/, `<meta name="description" content="${escapeHtml(description)}">`);
  if (canonical) result = replaceOrInsertHeadTag(result, /<link[^>]+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
  if (!/<meta[^>]+property=["']og:title["']/i.test(result)) result = replaceOrInsertHeadTag(result, /$^/, `<meta property="og:title" content="${escapeHtml(title)}">`);
  if (!/<meta[^>]+property=["']og:description["']/i.test(result)) result = replaceOrInsertHeadTag(result, /$^/, `<meta property="og:description" content="${escapeHtml(description)}">`);
  if (canonical && !/<meta[^>]+property=["']og:url["']/i.test(result)) result = replaceOrInsertHeadTag(result, /$^/, `<meta property="og:url" content="${escapeHtml(canonical)}">`);
  if (!/<meta[^>]+name=["']twitter:card["']/i.test(result)) result = replaceOrInsertHeadTag(result, /$^/, `<meta name="twitter:card" content="summary_large_image">`);

  if (!/application\/ld\+json/i.test(result)) {
    const schema = {
      "@context": "https://schema.org",
      "@type": input.config.type === "product" ? "Product" : "WebSite",
      name: input.config.name,
      ...(canonical ? { url: canonical } : {}),
      ...(description ? { description } : {}),
    };
    result = result.includes("</head>")
      ? result.replace("</head>", `<script type="application/ld+json">${escapeJsonForHtml(schema)}</script>\n</head>`)
      : result;
  }
  return result;
}

export function resolveCanonicalSiteUrl(siteSlug?: string | null): string | null {
  if (!siteSlug) return null;
  return `https://${siteSlug}.appvendorai.com/`;
}

export function enhanceSiteGenerator2Html(input: {
  html: string;
  config: SiteGeneratorConfig;
  pageSpec?: SitePageSpec | null;
  published?: boolean;
  siteSlug?: string | null;
}): { html: string; pageSpec: SitePageSpec; qa: SiteQaScorecard; seoScore: number; seoChecklist: ReturnType<typeof computeSiteSeoScore>["checklist"] } {
  const mediaRefs = [
    ...(input.config.images ?? []),
    ...(input.config.videos ?? []),
    ...((input.config.products ?? []).map((product) => product.imageUrl).filter(Boolean) as string[]),
  ].map(normalizePublicUrl);
  const pageSpec = input.pageSpec ?? buildSitePageSpec({
    surface: input.config.type,
    sector: input.config.sector,
    tone: input.config.tone,
    objective: input.config.cta,
    visualDirection: typeof input.config.creativeRuntimeContext === "string" ? input.config.creativeRuntimeContext.slice(0, 800) : null,
    hasProducts: Boolean(input.config.products?.length),
    hasRealMedia: mediaRefs.length > 0,
    requestedMotion: input.config.motionLevel,
    mediaRefs,
  });

  let html = stripRuntime(input.html);
  html = ensureSemanticMarkers(html, pageSpec);
  html = ensureMediaPerformance(html, input.config.name || "Site");
  html = ensureSeo(html, {
    config: input.config,
    published: Boolean(input.published),
    canonicalUrl: resolveCanonicalSiteUrl(input.siteSlug),
  });
  html = html.includes("</head>") ? html.replace("</head>", `${buildMotionStyle()}\n<script id="${SPEC_SCRIPT_ID}" type="application/json">${escapeJsonForHtml(pageSpec)}</script>\n</head>`) : html;
  html = html.includes("</body>") ? html.replace("</body>", `${buildMotionScript()}\n</body>`) : `${html}${buildMotionScript()}`;

  const { score: seoScore, checklist: seoChecklist } = computeSiteSeoScore(html);
  const qa = scoreSiteGenerator2Html({
    html,
    seoScore,
    requiredMediaCount: mediaRefs.length,
    published: Boolean(input.published),
  });
  return { html, pageSpec, qa, seoScore, seoChecklist };
}

export function buildSiteGenerator2Config(input: {
  config: SiteGeneratorConfig;
  pageSpec: SitePageSpec;
  qa?: SiteQaScorecard | null;
  autoMedia?: { imageCount: number; videoCount: number };
}): SiteGeneratorConfig {
  return {
    ...input.config,
    generatorVersion: "2.0",
    generationMode: "single-initial-version",
    refinementMode: "chat-on-current-version",
    motionLevel: input.config.motionLevel ?? "auto",
    resolvedMotionLevel: input.pageSpec.director.motionLevel,
    componentIds: input.pageSpec.sections.map((section) => section.componentId),
    seoAutoEnabled: true,
    preserveUnaffectedSections: true,
    pageSpec: input.pageSpec,
    creativeDirector: input.pageSpec.director,
    qaScorecard: input.qa ?? undefined,
    mediaAutoSelected: input.autoMedia ?? input.config.mediaAutoSelected,
  } as SiteGeneratorConfig;
}
