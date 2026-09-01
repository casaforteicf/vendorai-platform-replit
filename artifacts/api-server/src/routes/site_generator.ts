import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, generatedSitesTable, siteGenerationJobsTable, businessProfilesTable, tenantsTable, produtosCatalogoTable, inventoryItemsTable } from "@workspace/db";
import type { SiteGeneratorConfig, SiteGeneratorProduct } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { SITE_GENERATOR_SYSTEM_PROMPT, extractHtmlDocument, prepareSiteHtml, validateSiteHtml } from "../lib/site-html-quality.js";
import { computeSiteSeoScore } from "../lib/site-seo-analysis.js";

// Prefer Anthropic when available; fallback to OpenAI
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const useAnthropic = !!anthropicApiKey;
const anthropic = useAnthropic ? new Anthropic({ apiKey: anthropicApiKey }) : null;

const AI_PROVIDER = useAnthropic ? "anthropic" : "openai";
const AI_MODEL = useAnthropic ? "claude-sonnet-4-6" : "gpt-4o-mini";

// ─── Marketing tags por tenant (Google Ads / Meta Pixel) ──────────────────────
// Cada tenant pode colar o próprio ID de conversão nas Configurações
// (tenants.google_ads_conversion_id / meta_pixel_id). Injetado direto no
// HTML gerado antes de servir, pra não precisar regenerar o site quando o
// tenant configura ou troca o ID.
function injectTenantMarketingTags(
  html: string,
  ids: { googleAdsConversionId?: string | null; metaPixelId?: string | null },
): string {
  if (!ids.googleAdsConversionId && !ids.metaPixelId) return html;

  const scripts: string[] = [];
  if (ids.googleAdsConversionId) {
    scripts.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${ids.googleAdsConversionId}"></script>` +
        `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
        `gtag('js',new Date());gtag('config','${ids.googleAdsConversionId}');</script>`,
    );
  }
  if (ids.metaPixelId) {
    scripts.push(
      `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
        `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
        `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
        `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
        `(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
        `fbq('init','${ids.metaPixelId}');fbq('track','PageView');</script>`,
    );
  }

  const tagsBlock = scripts.join("");
  return html.includes("</head>")
    ? html.replace("</head>", `${tagsBlock}</head>`)
    : tagsBlock + html;
}

// The database is the source of truth. This set only prevents the same API
// process from resuming one pending job more than once concurrently.
type GenerationJob =
  | { status: "pending"; createdAt: number }
  | { status: "done"; result: Record<string, unknown>; createdAt: number }
  | { status: "error"; error: string; createdAt: number };

const activeGenerationJobs = new Set<string>();

async function persistGenerationJob(jobId: string, job: GenerationJob) {
  await db
    .update(siteGenerationJobsTable)
    .set({
      status: job.status,
      result: job.status === "done" ? job.result : null,
      error: job.status === "error" ? job.error : null,
      updatedAt: new Date(),
    })
    .where(eq(siteGenerationJobsTable.id, jobId));
}

// ─── Public router (no auth) — serves generated HTML sites ───────────────────
export const publicSiteGeneratorRouter: IRouter = Router();

// GET /sites/:siteSlug — serve published site by unique subdomain slug
publicSiteGeneratorRouter.get("/sites/:siteSlug", async (req, res) => {
  const { siteSlug } = req.params;

  const [site] = await db
    .select({
      html: generatedSitesTable.html,
      published: generatedSitesTable.published,
      name: generatedSitesTable.name,
      tenantId: generatedSitesTable.tenantId,
    })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.siteSlug, siteSlug))
    .limit(1);

  if (!site) {
    res.status(404).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Site não encontrado</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;}div{text-align:center;}</style></head><body><div><p style="font-size:3rem">🌐</p><h1 style="color:#1e293b">Site não encontrado</h1><p style="color:#64748b">O endereço <strong>${siteSlug}.appvendorai.com</strong> não existe ou ainda não foi publicado.</p></div></body></html>`);
    return;
  }

  if (!site.published) {
    res.status(403).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Site não publicado</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;}div{text-align:center;}</style></head><body><div><p style="font-size:3rem">🔒</p><h1 style="color:#1e293b">${site.name}</h1><p style="color:#64748b">Este site ainda não foi publicado pelo proprietário.</p></div></body></html>`);
    return;
  }

  const [siteTenant] = await db
    .select({ googleAdsConversionId: tenantsTable.googleAdsConversionId, metaPixelId: tenantsTable.metaPixelId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, site.tenantId))
    .limit(1);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.send(injectTenantMarketingTags(site.html, siteTenant ?? {}));
});

publicSiteGeneratorRouter.get("/public/:tenantSlug/site-html", async (req, res) => {
  const { tenantSlug } = req.params;

  // 1) Try resolving as a specific generated site's own slug first
  //    (e.g. "windoor-representacoes-lp") — each generated site now gets
  //    its own subdomain, so this is the primary lookup, and it lets a
  //    tenant have several sites live at the same time, each with its
  //    own working address.
  const [siteBySlug] = await db
    .select({
      html: generatedSitesTable.html,
      published: generatedSitesTable.published,
      name: generatedSitesTable.name,
      tenantId: generatedSitesTable.tenantId,
    })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.siteSlug, tenantSlug))
    .limit(1);

  if (siteBySlug) {
    if (!siteBySlug.published) {
      res.status(403).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Site não publicado</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;}div{text-align:center;}</style></head><body><div><p style="font-size:3rem">🔒</p><h1 style="color:#1e293b">${siteBySlug.name}</h1><p style="color:#64748b">Este site ainda não foi publicado pelo proprietário.</p></div></body></html>`);
      return;
    }
    const [tenantForSlug] = await db
      .select({ googleAdsConversionId: tenantsTable.googleAdsConversionId, metaPixelId: tenantsTable.metaPixelId })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, siteBySlug.tenantId))
      .limit(1);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.send(injectTenantMarketingTags(siteBySlug.html, tenantForSlug ?? {}));
    return;
  }

  // 2) Fallback: legacy tenant-level lookup — most recently published
  //    site for this tenant, addressed by the tenant's own subdomain
  //    (kept for sites created before per-site slugs became routable).
  const [tenant] = await db
    .select({ id: tenantsTable.id, googleAdsConversionId: tenantsTable.googleAdsConversionId, metaPixelId: tenantsTable.metaPixelId })
    .from(tenantsTable)
    .where(or(eq(tenantsTable.slug, tenantSlug), eq(tenantsTable.subdomainSlug, tenantSlug)));

  if (!tenant) {
    res.status(404).send("<!DOCTYPE html><html><body><h1>Site não encontrado</h1></body></html>");
    return;
  }

  const [site] = await db
    .select({ html: generatedSitesTable.html })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.tenantId, tenant.id), eq(generatedSitesTable.published, true)))
    .orderBy(desc(generatedSitesTable.updatedAt))
    .limit(1);

  if (!site) {
    res.status(404).send("<!DOCTYPE html><html><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0'><div style='text-align:center'><p style='font-size:3rem'>🌐</p><h1 style='color:#374151'>Site não publicado</h1><p style='color:#6b7280'>Este site ainda não foi publicado pelo proprietário.</p></div></body></html>");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.send(injectTenantMarketingTags(site.html, tenant));
});

const router: IRouter = Router();

const TYPE_LABELS: Record<string, string> = {
  landing: "landing page de marketing/vendas",
  ecommerce: "e-commerce com produtos e carrinho",
  institutional: "site institucional (sobre, serviços, contato)",
  product: "landing page focada em um único produto",
};

const TONE_LABELS: Record<string, string> = {
  profissional: "profissional e confiável",
  amigavel: "amigável e próximo",
  urgente: "urgente e direto ao ponto",
  premium: "premium e sofisticado",
  descontraido: "descontraído e criativo",
};

// ── Slug generation ────────────────────────────────────────────────────────────

function toSlugBase(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9\s-]/g, "")      // keep alphanum, space, hyphen
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 36);
}

const SITE_TYPE_SUFFIX: Record<string, string> = {
  ecommerce: "-loja",
  landing: "-lp",
  institutional: "",
  product: "",
};

async function generateUniqueSiteSlug(name: string, type: string): Promise<string> {
  const base = toSlugBase(name) + (SITE_TYPE_SUFFIX[type] ?? "");
  // Check for conflict; if taken, append 4 random hex chars
  const [existing] = await db
    .select({ id: generatedSitesTable.id })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.siteSlug, base))
    .limit(1);
  if (!existing) return base;
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${base}-${suffix}`;
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function isDark(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function buildGeneratePrompt(config: SiteGeneratorConfig): string {
  const { type, name, sector, desc, pain, tone, color, cta, logoUrl, products = [], whatsapp, instagram, images = [], videos = [], servicos, headline, nicheName, productNames = [] } = config;
  const waNumber = whatsapp?.replace(/\D/g, "") || "5511999999999";

  // Instagram: normaliza handle (remove @ e espaços), monta URL e bloco HTML do ícone
  const igHandle = instagram?.replace(/^@/, "").replace(/\s/g, "") || "";
  const igUrl = igHandle ? `https://instagram.com/${igHandle}` : "";
  const igIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`;
  const igHtml = igHandle
    ? `<a href="${igUrl}" target="_blank" rel="noopener" aria-label="Instagram @${igHandle}" style="display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;opacity:0.75;transition:opacity 0.2s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'">${igIconSvg}<span style="font-size:0.85rem">@${igHandle}</span></a>`
    : "";

  // Logo HTML block: real image if available, fallback to initial-in-circle
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${name}" style="height:40px;width:auto;max-width:160px;object-fit:contain;display:block">`
    : `<span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--primary);color:var(--btn-text);font-weight:800;font-size:1.1rem">${name.charAt(0).toUpperCase()}</span>`;
  const ctaText = cta || "Entre em contato";
  const rgb = hexToRgb(color);
  const dark = isDark(color);
  const btnTextColor = dark ? "#ffffff" : "#0f0f0f";

  const FONT_PAIRS: Record<string, { display: string; body: string; googleUrl: string }> = {
    profissional: {
      display: "'Playfair Display', serif",
      body: "'Inter', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap",
    },
    amigavel: {
      display: "'Plus Jakarta Sans', sans-serif",
      body: "'Plus Jakarta Sans', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
    },
    urgente: {
      display: "'Barlow Condensed', sans-serif",
      body: "'Barlow', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Barlow:wght@400;500;600&display=swap",
    },
    premium: {
      display: "'Cormorant Garamond', serif",
      body: "'DM Sans', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap",
    },
    descontraido: {
      display: "'Nunito', sans-serif",
      body: "'Nunito', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap",
    },
    // Opções extras — o modelo escolhe a que melhor caracteriza o
    // negócio específico, não fica preso ao mapeamento 1-tom-1-par.
    tecnico: {
      display: "'Space Grotesk', sans-serif",
      body: "'IBM Plex Sans', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
    },
    editorial: {
      display: "'Fraunces', serif",
      body: "'Source Sans 3', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600&display=swap",
    },
    industrial: {
      display: "'Archivo Black', sans-serif",
      body: "'Archivo', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700&display=swap",
    },
    artesanal: {
      display: "'Fraunces', serif",
      body: "'Karla', sans-serif",
      googleUrl: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600;700&display=swap",
    },
  };

  const hasRealImages = products.some((p) => p.imageUrl);
  const imagesBlock = images.length > 0
    ? `\nFOTOS REAIS DA EMPRESA (${images.length} foto${images.length > 1 ? "s" : ""} — USE-AS no site, não invente imagens externas):\n${images.map((url, i) => `- Foto ${i + 1}: ${url}`).join("\n")}\nUse estas fotos nas seções de hero, galeria, serviços ou sobre. Tag: <img src="URL_AQUI" alt="${name}" loading="lazy" style="width:100%;height:240px;object-fit:cover;border-radius:12px">`
    : "";
  // Vídeo — YouTube/Vimeo viram iframe embed (extrai o ID da URL
  // colada), qualquer outra URL é tratada como arquivo direto (.mp4 etc)
  // e vira <video>. O modelo escolhe ONDE encaixar (hero, seção
  // dedicada "veja em ação", depoimento em vídeo) conforme o tipo/tom do
  // negócio — não força posição fixa.
  function videoEmbedHtml(url: string): string {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
    if (yt) return `<div style="position:relative;padding-top:56.25%;border-radius:var(--radius);overflow:hidden"><iframe src="https://www.youtube.com/embed/${yt[1]}" title="Vídeo" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `<div style="position:relative;padding-top:56.25%;border-radius:var(--radius);overflow:hidden"><iframe src="https://player.vimeo.com/video/${vimeo[1]}" title="Vídeo" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
    return `<video src="${url}" controls preload="metadata" style="width:100%;border-radius:var(--radius);display:block" playsinline></video>`;
  }
  const videosBlock = videos.length > 0
    ? `\nVÍDEOS FORNECIDOS PELO CLIENTE (${videos.length} — USE-OS, é conteúdo real, não decorativo):\n${videos.map((url, i) => `- Vídeo ${i + 1}: ${url} → HTML pronto: ${videoEmbedHtml(url)}`).join("\n")}\nDecida ONDE cada vídeo faz mais sentido (hero como demonstração ao vivo, seção "veja em ação", depoimento em vídeo) — cole o HTML pronto acima exatamente como está, sem reescrever a tag.`
    : "";
  const servicosBlock = servicos
    ? `\nServiços/produtos principais: ${servicos}`
    : "";
  const productsBlock =
    type === "ecommerce" && products.length
      ? `\nPRODUTOS DO ESTOQUE (${products.length} itens — use EXATAMENTE estes produtos, na mesma ordem):\n${products.map((p) => {
          const img = p.imageUrl ? ` | imagem: ${p.imageUrl}` : "";
          const desc = p.description ? ` | ${p.description}` : "";
          const marca = p.marca ? ` | Marca: ${p.marca}` : "";
          const sku = p.sku ? ` | SKU: ${p.sku}` : "";
          const stock = p.inStock !== undefined ? (p.inStock ? ` | ✓ em estoque (${p.stockQty ?? ""})` : " | ✗ fora de estoque") : "";
          const feat = p.featured ? " ⭐DESTAQUE" : "";
          return `- ${p.name}${feat} | ${p.price}${desc}${marca}${sku}${stock}${img}`;
        }).join("\n")}`
      : "";

  // Product-focused landing page: describe the single product in depth —
  // this page must sell ONLY it, not the business in general.
  const produtoFocoBlock =
    type === "product" && products.length === 1
      ? (() => {
          const p = products[0] as SiteGeneratorProduct & {
            colecao?: string;
            cor?: string;
            tipoCalculo?: string;
            fechamentoPacote?: string | number;
            quantidadePacote?: string | number;
            precoPacote?: string | number;
            larguraPecaM?: string | number;
          };
          const unidadeArea = p.tipoCalculo === "linear" || p.tipoCalculo === "acabamento_perimetro" ? "m" : "m²";
          const specs = [
            p.marca && `Marca: ${p.marca}`,
            p.sku && `SKU: ${p.sku}`,
            p.colecao && `Coleção: ${p.colecao}`,
            p.cor && `Cor: ${p.cor}`,
            p.larguraPecaM && `Largura da peça: ${p.larguraPecaM} m`,
            p.fechamentoPacote && `Rendimento por pacote: ${p.fechamentoPacote} ${unidadeArea}`,
            p.quantidadePacote && `Peças por pacote: ${p.quantidadePacote}`,
            p.precoPacote && `Preço do pacote: R$ ${p.precoPacote}`,
          ].filter(Boolean).join(" | ");
          return `\nPRODUTO EM FOCO — esta página deve vender EXCLUSIVAMENTE este produto, não a empresa como um todo:\nNome: ${p.name}\nPreço: ${p.price}${p.description ? `\nDescrição: ${p.description}` : ""}${specs ? `\nEspecificações reais (use exatamente estes dados, não invente números): ${specs}` : ""}${p.imageUrl ? `\nImagem real do produto (use-a, não invente outra): ${p.imageUrl}` : ""}`;
        })()
      : "";

  const logoInstruction = logoUrl
    ? `LOGO DO CLIENTE (use EXATAMENTE este HTML nos headers e footers — não substitua por texto nem por inicial): ${logoHtml}`
    : `LOGO: use inicial do nome em círculo colorido (var(--primary)) + nome ao lado`;

  const structureByType: Record<string, string> = {
    landing: `ESTRUTURA DA LANDING PAGE (nesta ordem exata):
1. HEADER fixo — ${logoUrl ? `logo do cliente (HTML exato: ${logoHtml})` : "logo à esquerda (inicial do nome em círculo colorido + nome)"}, nav âncoras à direita, botão CTA no canto, hamburger mobile
2. HERO — título impactante (H1${headline ? `: use exatamente ou uma variação muito próxima de "${headline}"` : ", problema que o cliente já sente"}), subtítulo com a promessa, 2 botões (primário + secundário outline)${images.length > 0 ? `, imagem real da empresa como elemento visual (use a Foto 1 do briefing)` : ", elemento visual decorativo (formas geométricas ou gradiente abstrato em CSS puro — sem imagens externas)"}
3. DORES — seção escura/contrastante com 3-4 cards de dores reais do mercado (ícones SVG inline simples, título curto + descrição)
4. SOLUÇÃO — como o negócio resolve cada dor, 3 pilares com ícone SVG + título + parágrafo
5. BENEFÍCIOS / DIFERENCIAIS — grid 2x3 ou 3x2 de cards com número destacado ou ícone grande
6. NÚMEROS & CONQUISTAS — seção com 3-4 estatísticas marcantes plausíveis para o setor de "${sector || name}" (ex: "500+ clientes atendidos", "10 anos de experiência") — sem inventar nomes de pessoas reais
7. CTA FINAL — seção de fundo escuro/gradiente, headline forte, subtítulo, botão grande com wa.me/${waNumber}
8. FOOTER — ${logoUrl ? `logo do cliente (HTML exato: ${logoHtml})` : "logo"}, links de âncora${igHandle ? `, ícone do Instagram com link para ${igUrl} (use EXATAMENTE este HTML: ${igHtml})` : ""}, copyright`,

    ecommerce: `ESTRUTURA DO E-COMMERCE (nesta ordem exata):
1. HEADER fixo — ${logoUrl ? `logo do cliente (HTML exato: ${logoHtml})` : "logo"}, nav, ícone de carrinho com badge contador, hamburger mobile
2. HERO — headline de oferta, subtítulo, botão "Ver produtos", badge de frete/desconto
3. GRID DE PRODUTOS — cards modernos para cada produto listado no briefing:
   ${hasRealImages
     ? "• USE as imagens reais fornecidas (campo 'imagem'): <img src=\"URL\" alt=\"nome\" loading=\"lazy\" style=\"width:100%;height:220px;object-fit:cover\"> — NÃO use placeholders quando a URL estiver disponível; use placeholder (gradiente CSS + ícone SVG) apenas quando não houver URL"
     : "• imagem placeholder: gradiente colorido com ícone SVG central"}
   • nome do produto, descrição curta, preço em destaque
   • badge de ⭐DESTAQUE para produtos marcados; badge "Esgotado" quando fora de estoque (cursor não-pointer, botão desabilitado)
   • botão "Comprar pelo WhatsApp" (link wa.me/${waNumber} com mensagem pré-preenchida incluindo nome do produto e preço)
4. BENEFÍCIOS — 3 ícones com texto: entrega, pagamento, suporte
5. GARANTIAS & DIFERENCIAIS — 3-4 cards de garantias (ex: satisfação garantida, entrega rápida) — sem inventar nomes de clientes
6. CTA FINAL — urgência, botão WhatsApp wa.me/${waNumber}
7. CARRINHO LATERAL (drawer) — ativado por JS ao clicar nos produtos, lista itens, total, botão finalizar via WhatsApp com resumo do pedido
8. FOOTER${igHandle ? ` — inclua link do Instagram (HTML exato: ${igHtml})` : ""}`,

    institutional: `ESTRUTURA DO SITE INSTITUCIONAL (nesta ordem exata):
1. HEADER fixo — ${logoUrl ? `logo do cliente (HTML exato: ${logoHtml})` : "logo"}, nav âncoras, botão CTA, hamburger mobile
2. HERO — headline sobre a empresa${headline ? ` (H1: use exatamente ou uma variação muito próxima de "${headline}")` : ""}, subtítulo com proposta de valor, 2 botões${images.length > 0 ? `, imagem real da empresa (use a Foto 1 do briefing)` : ", elemento visual"}
3. SOBRE — história/missão em 2 colunas (texto + estatísticas em destaque: anos, clientes, projetos)${images.length > 1 ? " + galeria das fotos reais fornecidas" : ""}
4. SERVIÇOS — grid de 4-6 serviços com ícone SVG, título, descrição curta (baseados nos serviços informados no briefing)
5. PROCESSO — timeline ou steps numerados explicando como funciona
6. DIFERENCIAIS — grid 2×3 ou 3×2 de vantagens competitivas reais do negócio com ícone SVG e texto
7. NÚMEROS & CONQUISTAS — estatísticas do negócio em formato visual (sem inventar nomes de pessoas)
8. CONTATO — formulário (nome, email, telefone, mensagem) + informações de contato laterais, botão WhatsApp wa.me/${waNumber}
9. FOOTER${igHandle ? ` — inclua link do Instagram (HTML exato: ${igHtml})` : ""}`,

    product: `ESTRUTURA DA LANDING PAGE DE PRODUTO (nesta ordem exata) — foco 100% no produto em destaque, NÃO na empresa como um todo:
1. HEADER fixo — ${logoUrl ? `logo do cliente (HTML exato: ${logoHtml})` : "logo à esquerda"}, botão CTA no canto (sem menu extenso — é uma página de conversão de um único produto)
2. HERO DO PRODUTO — nome do produto como H1, benefício principal como subtítulo, preço em destaque, imagem real do produto (use a fornecida no briefing) como elemento visual principal, botão CTA grande "Comprar pelo WhatsApp" (wa.me/${waNumber} com mensagem pré-preenchida citando o nome do produto)
3. ESPECIFICAÇÕES — tabela ou grid com as especificações reais do produto fornecidas no briefing (coleção, cor, dimensões, rendimento por pacote, etc. — use exatamente os dados informados, nunca invente números)
4. POR QUE ESCOLHER — 3-4 diferenciais do produto (qualidade, durabilidade, facilidade de instalação, adequação ao setor "${sector || name}")
5. COMO COMPRAR — passo a passo simples de como adquirir, terminando em CTA de WhatsApp
6. CTA FINAL — urgência, botão grande wa.me/${waNumber} com mensagem citando o produto
7. FOOTER — ${logoUrl ? `logo do cliente (HTML exato: ${logoHtml})` : "logo"}, copyright${igHandle ? `, ícone do Instagram (HTML exato: ${igHtml})` : ""}`,
  };

  void logoInstruction; // referenced via structureByType strings above

  const structure = structureByType[type] || structureByType.landing;

  return `Você é um diretor de design (e copywriter) de um estúdio pequeno conhecido por dar a cada cliente uma identidade visual que não poderia ser confundida com a de mais ninguém. Este cliente já rejeitou propostas que pareciam "templates genéricos" — está pagando por um ponto de vista visual distinto. Gere um site HTML autocontido de QUALIDADE PROFISSIONAL — comparável aos melhores sites de agência — pro negócio abaixo.

═══════════════════════════════════════
BRIEFING DO CLIENTE
═══════════════════════════════════════
Tipo: ${TYPE_LABELS[type] || type}
Negócio: ${name}
Setor: ${sector || "a definir pelo contexto"}
Nicho específico da divulgação: ${nicheName || "a definir pelo contexto"}
Produtos/serviços selecionados para esta peça: ${productNames.length ? productNames.join(", ") : "usar os produtos informados no briefing"}
Sobre o negócio: ${desc}${servicosBlock}
Maior dor do cliente-alvo: ${pain || "ineficiência e falta de resultados"}
Tom de voz: ${TONE_LABELS[tone] || tone}
Cor-âncora escolhida pelo cliente (use como base da paleta, é uma decisão dele — não ignore, mas também não a trate como a única cor do site): ${color} (RGB: ${rgb})
CTA principal: ${ctaText}
WhatsApp de contato: wa.me/${waNumber}${igHandle ? `\nInstagram: ${igUrl} (handle: @${igHandle})` : ""}
${productsBlock}${produtoFocoBlock}${imagesBlock}${videosBlock}

═══════════════════════════════════════
PROCESSO DE DESIGN — FAÇA ISSO NO SEU RACIOCÍNIO ANTES DE ESCREVER O CÓDIGO
═══════════════════════════════════════

Antes de gerar o HTML, monte mentalmente um plano de design compacto específico pra ESTE negócio (não um sistema genérico reaproveitável):

1. PALETA — descreva 4 a 6 cores nomeadas em hex, ancoradas na cor escolhida pelo cliente (${color}) mas expandidas com intenção: uma cor de destaque/acento que conversa com ela, tons de fundo que fazem sentido pro setor "${sector || name}" (nem sempre branco+cinza-claro é a resposta certa — considere se um fundo mais quente, mais escuro ou mais saturado serve melhor a esse negócio específico).
2. TIPOGRAFIA — escolha DENTRE OS PARES ABAIXO (são os únicos com URL do Google Fonts verificada — não invente outro par) o que melhor caracteriza ESTE negócio, não apenas o "tom" genérico:
${Object.entries(FONT_PAIRS).map(([key, f]) => `   - "${key}": display ${f.display} + corpo ${f.body}`).join("\n")}
   Tom sugerido pelo cliente: "${tone}" — mas escolha o par que melhor serve o SETOR e a PERSONALIDADE do negócio, não só o tom em isolado. Justifique mentalmente a escolha antes de seguir.
3. ASSINATURA — qual é o UM elemento visual memorável desse site, específico pro mundo desse negócio (não genérico)? Pode ser a forma do hero, um padrão decorativo, um jeito particular de mostrar números, etc. Gaste sua ousadia nesse UM lugar; mantenha o resto disciplinado.

CALIBRAGEM — evite os 3 padrões que já viraram "cara de site feito por IA" (a menos que o briefing peça explicitamente um deles):
(a) fundo creme quase-branco + serifada de alto contraste + acento terracota/laranja-queimado;
(b) fundo quase-preto + único acento verde-ácido ou vermelho vibrante;
(c) layout estilo jornal com réguas finas, zero border-radius, colunas densas.
Se nenhum eixo do briefing empurrar pra um desses, não gaste a liberdade neles — escolha algo grounded no setor "${sector || name}" especificamente.

Não use marcadores numerados (01/02/03) decorativamente — só se o conteúdo for de fato uma sequência real (processo, linha do tempo).

═══════════════════════════════════════
SISTEMA DE DESIGN — TRADUZA SEU PLANO EM CSS REAL (valores abaixo são o PISO técnico obrigatório, não a paleta em si)
═══════════════════════════════════════

VARIÁVEIS CSS (sempre no :root — preencha com as cores do SEU plano acima, âncora ${color} incluída):
  --primary: (cor âncora ou a mais próxima do seu plano);
  --primary-rgb: ${rgb};
  --primary-dark: (versão mais escura calculada manualmente);
  --primary-light: (versão mais clara, pra backgrounds sutis);
  --accent: (a cor de destaque do seu plano — pode ser diferente de --primary, gera contraste visual real);
  --btn-text: ${btnTextColor};
  --bg: (fundo principal do SEU plano — nem sempre #ffffff);
  --bg-alt: (fundo alternado do SEU plano);
  --bg-dark: (fundo escuro do SEU plano, pra seções de contraste);
  --text: (cor de texto principal coerente com o fundo escolhido);
  --text-muted: (cor de texto secundário);
  --text-light: (cor de texto terciário);
  --border: (cor de borda sutil coerente com a paleta);
  --radius: (raio de borda coerente com a personalidade do plano — pode ser 0 se o plano pedir algo mais reto);
  --radius-sm: (raio menor, proporcional ao --radius);
  --shadow: (sombra sutil coerente com o fundo escolhido);
  --shadow-lg: (sombra mais forte, mesma lógica);

TIPOGRAFIA (Google Fonts do par escolhido no seu plano):
  <link href="URL_GOOGLE_FONTS_DO_PAR_ESCOLHIDO" rel="stylesheet">
  Títulos (h1-h3): font-family do par escolhido; letter-spacing intencional (não sempre -0.02em — decida);
  Corpo: font-family do par escolhido;
  h1: clamp(2.2rem, 5vw, 3.8rem); peso e line-height coerentes com a personalidade escolhida;
  h2: clamp(1.7rem, 3.5vw, 2.6rem);
  h3: 1.25rem;
  p: 1rem; line-height 1.6-1.8; cor --text-muted;

BOTÕES (raio segue --radius do SEU plano -- NÃO force pílula/100px se o plano pediu algo mais reto):
  .btn-primary → background: var(--primary); color: ${btnTextColor}; padding: 14px 28px; border-radius: var(--radius); font-weight: 700; font-size: 0.95rem; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 20px rgba(var(--primary-rgb), 0.35);
  .btn-primary:hover → transform: translateY(-2px); box-shadow: 0 8px 28px rgba(var(--primary-rgb), 0.45);
  .btn-outline → background: transparent; color: var(--text); border: 2px solid var(--border); padding: 12px 26px; border-radius: var(--radius); font-weight: 600; cursor: pointer; transition: all 0.2s;
  .btn-outline:hover → border-color: var(--primary); color: var(--primary);

CARDS:
  background: var(--bg) do SEU plano (ou uma variação sutil dele); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; transition: all 0.25s;
  :hover → border-color: rgba(var(--primary-rgb), 0.3); box-shadow: var(--shadow); transform: translateY(-3px);
  Accent top line (opcional, só se fizer sentido no seu plano): border-top: 3px solid var(--primary);

NAV:
  position: sticky; top: 0; z-index: 100; background: (var(--bg) do SEU plano, com opacidade ~0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);

SEÇÕES:
  padding: 88px 0; (mobile: 56px 0)
  max-width: 1120px; margin: 0 auto; padding-left: 24px; padding-right: 24px;
  Alterne entre var(--bg) e var(--bg-alt) do SEU plano pra criar ritmo visual
  Seções de contraste usam var(--bg-dark) do SEU plano com texto claro

MOVIMENTO — use com intenção, não em tudo por padrão. Efeito de revelar-ao-rolar espalhado em cada elemento é outro tique de "cara de site feito por IA". Escolha ONDE a animação serve o negócio (ex: um momento orquestrado no load do hero, um hover específico no elemento-assinatura) em vez de aplicar a mesma transição genérica em todo card/seção. Utilitário disponível se decidir usar:
  .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .reveal.visible { opacity: 1; transform: translateY(0); }
  JS: IntersectionObserver detecta .reveal e adiciona .visible
  Respeite prefers-reduced-motion: desative transições quando o usuário pedir.

GRADE RESPONSIVA:
  Mobile-first. Em 360px, nenhum bloco pode exigir mais de 100% da viewport. Use minmax(0, 1fr), min-width: 0 e grids que colapsem para uma coluna abaixo de 48rem; só use minmax(280px, 1fr) em contêineres que tenham espaço real. Nunca use width fixa acima de 100%, 100vw, translate horizontal ou overflow-x para esconder um erro.
  Cada seção deve ter uma única função e densidade equilibrada: no máximo 3-4 cards por linha, conteúdo real em cada card, padding vertical entre 48px e 96px e no máximo uma seção hero com altura limitada. Não crie estatísticas, depoimentos, equipes, FAQs ou seções extras apenas para preencher espaço.
  Hamburger menu: toggle classe .open no nav mobile

ÍCONES: Use SVG inline simples (viewBox, stroke ou fill) — não use bibliotecas externas.

═══════════════════════════════════════
${structure}
═══════════════════════════════════════

COPY — OBRIGATÓRIO:
- Método SPIN: Situação (dor reconhecida) → Problema (implicações) → Implicação (custo de não resolver) → Necessidade (sua solução)
- Hero headline: fala do problema/transformação, não do produto. Ex: "Chega de perder cliente por falta de resposta" em vez de "Sistema de atendimento"
- Todas as seções com copy REAL específica para "${name}" no setor "${sector || "este mercado"}" — ZERO Lorem ipsum
- Não invente pessoas reais, nomes de clientes, depoimentos fictícios ou equipes imaginárias
- CTA: verbo de ação + benefício. Ex: "Quero mais clientes", "Começar agora grátis", "Falar com especialista"

QUALIDADE OBRIGATÓRIA:
✓ Visual profissional — equivalente a sites feitos por agências de marketing digital
✓ Imagens externas SOMENTE as fornecidas no briefing; demais elementos decorativos: gradientes CSS, SVGs inline, iniciais em círculo
✓ VÍDEO (quando fornecido no briefing): use o HTML pronto exatamente como está — não decorativo, é conteúdo real do cliente
✓ GALERIA DE FOTOS (quando presente): use SOMENTE as URLs reais fornecidas no briefing, com tags <img>, alt descritivo, loading="lazy", aspect-ratio e object-fit — nunca invente URLs; sem fotos fornecidas, use SVG/CSS decorativo sem fingir que é uma galeria real
✓ 100% responsivo — mobile impecável
✓ Smooth scroll, hover states, animações sutis
✓ Formulário de contato com validação JS básica (campos obrigatórios)
✓ WhatsApp CTA abre wa.me/${waNumber}${igHandle ? `\n✓ Instagram no footer: link clicável para ${igUrl} com ícone SVG inline e @${igHandle}` : ""}
✓ Acessibilidade: alt em imagens, aria-labels, foco visível

REVISÃO FINAL OBRIGATÓRIA ANTES DE RESPONDER:
✓ Verifique cada combinação de texto e fundo, inclusive cards, links, botões, placeholders e seções escuras; texto normal precisa de contraste mínimo 4.5:1.
✓ Verifique que nenhum elemento visível depende de cor herdada sem contraste, opacity 0, visibility hidden, display none ou font-size 0.
✓ Verifique que toda imagem tem URL fornecida e dimensões estáveis; não use placeholder remoto, URL inventada ou imagem sem tratamento de erro.
✓ Verifique que o HTML fecha corretamente e que o mesmo documento funciona no preview e como arquivo baixado, sem scripts/estilos que dependam do editor.
✓ Verifique visualmente as larguras 360px, 768px e 1440px: sem overflow horizontal, cartões gigantes, áreas vazias desproporcionais, links/botões nativos ou títulos que estouram a tela.

RETORNE APENAS o código HTML completo, sem explicações, sem markdown, sem blocos de código.
Comece diretamente com <!DOCTYPE html>`;
}

function buildRefinePrompt(currentHtml: string, userMessage: string): string {
  return `Você é o desenvolvedor web que criou o site abaixo. O cliente quer uma alteração específica.

PEDIDO DO CLIENTE: "${userMessage}"

SITE ATUAL (HTML completo):
${currentHtml}

INSTRUÇÕES:
- Aplique EXATAMENTE o que foi pedido, nada mais
- Mantenha toda a estrutura, estilos e conteúdo inalterados — altere apenas o necessário
- Se for ajuste de cor: atualize as variáveis CSS --primary e as referências diretas
- Se for ajuste de texto/copy: altere apenas aquele trecho
- Se for nova seção: insira no lugar lógico mantendo o padrão visual do site
- Retorne APENAS o HTML completo e atualizado
- Sem explicações, sem markdown, sem blocos de código
Comece diretamente com <!DOCTYPE html>`;
}

function extractHtml(text: string): string {
  return extractHtmlDocument(text);
}

/** Safe wrapper that logs for debugging */
function extractHtmlSafe(text: string, log: { info: (obj: object, msg: string) => void }): string {
  const rawPreview = text.slice(0, 200).replace(/\n/g, "\\n");
  const html = extractHtml(text);
  log.info({ rawLength: text.length, htmlLength: html.length, rawPreview }, "extractHtml debug");
  return html;
}

function isValidHtml(html: string): boolean {
  return html.length >= 500 && !validateSiteHtml(html).issues.some((issue) => !issue.repairable);
}

function htmlChanged(before: string, after: string): boolean {
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
  return normalize(before) !== normalize(after);
}

// Unified AI caller with provider logging
type AiMessage = { role: "user" | "assistant"; content: string };

async function callAI(
  messages: AiMessage[],
  tenantId: string,
  log: { info: (obj: object, msg: string) => void },
  systemPrompt = SITE_GENERATOR_SYSTEM_PROMPT,
): Promise<{ content: string; provider: string; model: string }> {
  if (useAnthropic && anthropic) {
    try {
      log.info({ provider: "anthropic", model: AI_MODEL }, "Calling Anthropic for site generation");
      const userMessages = messages.filter((m) => m.role === "user");
      const stream = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 64000,
        stream: true,
        messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
        system: systemPrompt,
      });
      const chunks: string[] = [];
      let stopReason: string | null = null;
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          chunks.push(event.delta.text);
        }
        if (event.type === "message_stop") {
          stopReason = "end_turn";
        }
        if (event.type === "message_delta" && event.delta?.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      }
      const content = chunks.join("");
      if (stopReason === "max_tokens") {
        const err = new Error(`Anthropic resposta truncada: max_tokens atingido (${content.length} chars gerados). Tente um site mais simples ou aumente o limite.`);
        (err as any).truncated = true;
        (err as any).generatedLength = content.length;
        throw err;
      }
      return { content, provider: "anthropic", model: "claude-sonnet-4-6" };
    } catch (err) {
      // Erro de billing/conta (ex: "credit balance too low") não deve derrubar
      // a geração do site inteira — cai pro OpenAI em vez de propagar o erro.
      // Erros de "resposta truncada" (max_tokens) continuam subindo, porque
      // trocar de provedor não resolveria o problema real (site complexo demais).
      if ((err as any)?.truncated) throw err;
      log.info({ err, provider: "anthropic" }, "Anthropic falhou (provavelmente billing) — caindo pro OpenAI");
    }
  }

  log.info({ provider: "openai", model: AI_MODEL }, "Calling OpenAI for site generation");
  const openai = await getOpenAIForTenant(tenantId);
  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  // gpt-5.6-terra é a geração atual da OpenAI (gpt-4o-mini foi aposentado
  // em fev/2026) -- "terra" é o nível equilibrado (não o "sol", que é modelo
  // de raciocínio pesado, minutos de latência, arriscado demais pra essa
  // troca sem poder testar direto). reasoning_effort baixo porque gerar
  // HTML/CSS é trabalho criativo, não uma cadeia de raciocínio lógico --
  // não faz sentido gastar tempo/token "pensando" fundo nisso.
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 32000,
      reasoning_effort: "low",
      messages: openaiMessages,
    } as any);
    const finishReason = response.choices[0]?.finish_reason;
    const content = response.choices[0]?.message?.content ?? "";
    if (finishReason === "length" && content.length < 500) {
      // Sinal do problema que a doc da OpenAI avisa: tokens todos gastos em
      // raciocínio interno, resposta final vazia/truncada demais pra ser
      // um HTML válido -- cai pro modelo antigo, que não tem esse risco.
      throw new Error(`gpt-5.6-terra: resposta vazia/truncada (finish_reason=length, ${content.length} chars) -- provável esgotamento de tokens em raciocínio interno`);
    }
    return { content, provider: "openai", model: "gpt-5.6-terra" };
  } catch (newModelErr) {
    log.info({ err: newModelErr, provider: "openai" }, "gpt-5.6-terra falhou — caindo pro gpt-4o-mini (modelo anterior, já validado)");
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 16000,
        messages: openaiMessages,
      });
      return {
        content: response.choices[0]?.message?.content ?? "",
        provider: "openai",
        model: "gpt-4o-mini",
      };
    } catch (err) {
      // Anthropic já falhou antes (billing) e o OpenAI também falhou aqui —
      // sem isso, o erro cru do SDK da OpenAI (ex: "429 Rate limit
      // reached...") vazava direto pra tela sem nenhuma tradução.
      log.info({ err, provider: "openai" }, "OpenAI também falhou — nenhum provedor de IA disponível");
      throw new Error("Nenhum provedor de IA disponível no momento (Anthropic e OpenAI falharam). Tente novamente em alguns minutos — se persistir, pode ser limite de uso da conta.");
    }
  }
}

// GET /tenants/:tenantId/site-generator/latest — get most recently updated site
router.get("/tenants/:tenantId/site-generator/latest", async (req, res) => {
  const { tenantId } = req.params;
  const [site] = await db
    .select()
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .orderBy(desc(generatedSitesTable.updatedAt))
    .limit(1);

  if (!site) {
    res.status(404).json({ error: "Nenhum site encontrado" });
    return;
  }
  return res.json(site);
});

// GET /tenants/:tenantId/site-generator — list generated sites
router.get("/tenants/:tenantId/site-generator", async (req, res) => {
  const { tenantId } = req.params;
  const rows = await db
    .select({
      id: generatedSitesTable.id,
      name: generatedSitesTable.name,
      siteType: generatedSitesTable.siteType,
      config: generatedSitesTable.config,
      createdAt: generatedSitesTable.createdAt,
      updatedAt: generatedSitesTable.updatedAt,
    })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .orderBy(desc(generatedSitesTable.createdAt));
  return res.json(rows);
});

// GET /tenants/:tenantId/site-generator/:siteId — get single site with html
router.get("/tenants/:tenantId/site-generator/:siteId", async (req, res) => {
  const { tenantId, siteId } = req.params;
  const [row] = await db
    .select()
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!row || row.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  return res.json(row);
});

// ─── Async generation logic (extracted so it can run without blocking HTTP) ────
async function runGenerateSite(
  jobId: string,
  tenantId: string,
  config: SiteGeneratorConfig,
  baseOrigin: string,
  log: import("pino").Logger,
) {
  try {
    // Fallback to business_profile for missing fields
    const [bp] = await db
      .select({
        nomeFantasia: businessProfilesTable.nomeFantasia,
        razaoSocial: businessProfilesTable.razaoSocial,
        vertical: businessProfilesTable.vertical,
        diferenciais: businessProfilesTable.diferenciais,
        publicoAlvo: businessProfilesTable.publicoAlvo,
        logoUrl: businessProfilesTable.logoUrl,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId));

    const name = config.name || bp?.nomeFantasia || bp?.razaoSocial || "";
    const sector = config.sector || bp?.vertical || "";
    const desc = config.desc || bp?.diferenciais || bp?.publicoAlvo || "";
    const logoUrl = config.logoUrl || bp?.logoUrl || undefined;

    if (!name || !desc) {
      await persistGenerationJob(jobId, { status: "error", error: "name e desc são obrigatórios. Preencha no cadastro da empresa (Configurações) ou no formulário.", createdAt: Date.now() });
      return;
    }

    // For "product" pages: fetch the single selected catalog product,
    // including its m²-calculation fields, instead of business-wide data.
    let focusProduct: (SiteGeneratorProduct & Record<string, unknown>) | null = null;
    if (config.type === "product") {
      const produtoId = (config as unknown as { produtoId?: string }).produtoId;
      if (!produtoId) {
        await persistGenerationJob(jobId, { status: "error", error: "Selecione um produto do catálogo para gerar a página.", createdAt: Date.now() });
        return;
      }

      const [row] = await db
        .select({
          nome:             produtosCatalogoTable.nome,
          precoBase:        produtosCatalogoTable.precoBase,
          descricao:        produtosCatalogoTable.descricao,
          imagemUrl:        produtosCatalogoTable.imagemUrl,
          imagens:          produtosCatalogoTable.imagens,
          sku:              produtosCatalogoTable.sku,
          marca:            produtosCatalogoTable.marca,
          unidade:          produtosCatalogoTable.unidade,
          colecao:          produtosCatalogoTable.colecao,
          cor:              produtosCatalogoTable.cor,
          tipoCalculo:      produtosCatalogoTable.tipoCalculo,
          fechamentoPacote: produtosCatalogoTable.fechamentoPacote,
          quantidadePacote: produtosCatalogoTable.quantidadePacote,
          precoPacote:      produtosCatalogoTable.precoPacote,
          larguraPecaM:     produtosCatalogoTable.larguraPecaM,
        })
        .from(produtosCatalogoTable)
        .where(and(eq(produtosCatalogoTable.id, produtoId), eq(produtosCatalogoTable.tenantId, tenantId)))
        .limit(1);

      if (!row) {
        await persistGenerationJob(jobId, { status: "error", error: "Produto não encontrado no catálogo.", createdAt: Date.now() });
        return;
      }

      const preco = parseFloat(row.precoBase);
      focusProduct = {
        name: row.nome,
        price: `R$ ${preco.toFixed(2).replace(".", ",")}${row.unidade ? `/${row.unidade}` : ""}`,
        description: row.descricao || undefined,
        imageUrl: row.imagens?.[0] || row.imagemUrl || undefined,
        sku: row.sku || undefined,
        marca: row.marca || undefined,
        colecao: row.colecao || undefined,
        cor: row.cor || undefined,
        tipoCalculo: row.tipoCalculo || undefined,
        fechamentoPacote: row.fechamentoPacote || undefined,
        quantidadePacote: row.quantidadePacote || undefined,
        precoPacote: row.precoPacote || undefined,
        larguraPecaM: row.larguraPecaM || undefined,
      };

      log.info({ tenantId, produtoId, produtoNome: row.nome }, "Site generator: single product fetched for product-focused page");
    }

    // For ecommerce: auto-populate products from tenant's catalog + inventory stock
    let catalogProducts: SiteGeneratorProduct[] = [];
    if (config.type === "ecommerce") {
      const rows = await db
        .select({
          nome:             produtosCatalogoTable.nome,
          precoBase:        produtosCatalogoTable.precoBase,
          descricao:        produtosCatalogoTable.descricao,
          imagemUrl:        produtosCatalogoTable.imagemUrl,
          imagens:          produtosCatalogoTable.imagens,
          sku:              produtosCatalogoTable.sku,
          destaque:         produtosCatalogoTable.destaque,
          marca:            produtosCatalogoTable.marca,
          quantidadeAtual:  inventoryItemsTable.quantidadeAtual,
        })
        .from(produtosCatalogoTable)
        .leftJoin(inventoryItemsTable, eq(inventoryItemsTable.produtoId, produtosCatalogoTable.id))
        .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
        .orderBy((desc as any)(produtosCatalogoTable.destaque), produtosCatalogoTable.nome)
        .limit(50);

      catalogProducts = rows.map((r) => {
        const firstImage = r.imagens?.[0] || r.imagemUrl || undefined;
        const qty = r.quantidadeAtual != null ? parseFloat(r.quantidadeAtual) : null;
        const preco = parseFloat(r.precoBase);
        return {
          name: r.nome,
          price: `R$ ${preco.toFixed(2).replace(".", ",")}`,
          description: r.descricao || undefined,
          imageUrl: firstImage,
          sku: r.sku || undefined,
          inStock: qty !== null ? qty > 0 : undefined,
          stockQty: qty !== null ? qty : undefined,
          featured: r.destaque ?? false,
          marca: r.marca || undefined,
        };
      });

      log.info({ tenantId, catalogCount: catalogProducts.length }, "Site generator: catalog products fetched for ecommerce");
    }

    const allProducts = focusProduct
      ? [focusProduct]
      : catalogProducts.length > 0
        ? [...catalogProducts, ...(config.products ?? [])]
        : (config.products ?? []);

    // Normalize all relative URLs → absolute so downloaded HTML files work offline.
    // Object-storage paths are stored as /objects/... and need the /api/storage prefix.
    const toAbsolute = (url?: string) => {
      if (!url) return url;
      if (url.startsWith("/objects/")) return `${baseOrigin}/api/storage${url}`;
      if (url.startsWith("/")) return `${baseOrigin}${url}`;
      return url;
    };

    const absoluteLogoUrl = toAbsolute(logoUrl);
    const absoluteImages = (config.images ?? []).map((url) => toAbsolute(url) ?? url);
    const absoluteVideos = (config.videos ?? []).map((url) => toAbsolute(url) ?? url);
    const absoluteProducts = allProducts.map((p) => ({
      ...p,
      imageUrl: toAbsolute(p.imageUrl) ?? p.imageUrl,
    }));

    const enrichedConfig = { ...config, name, sector, desc, logoUrl: absoluteLogoUrl, products: absoluteProducts, images: absoluteImages, videos: absoluteVideos };
    const prompt = buildGeneratePrompt(enrichedConfig);

    let result;
    try {
      result = await callAI([{ role: "user", content: prompt }], tenantId, log);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao chamar a IA";
      log.error({ error: msg, provider: AI_PROVIDER }, "Site generation failed");
      await persistGenerationJob(jobId, { status: "error", error: `Erro na geração: ${msg}`, createdAt: Date.now() });
      return;
    }

    log.info({ provider: result.provider, model: result.model, tenantId }, "Site generated successfully");

    const rawText = result.content;
    let html = extractHtmlSafe(rawText, log);

    if (!isValidHtml(html)) {
      log.error({ rawLength: rawText.length, htmlLength: html.length, provider: result.provider }, "Site generation returned invalid HTML");
      await persistGenerationJob(jobId, { status: "error", error: "Resposta da IA inválida ou muito curta", createdAt: Date.now() });
      return;
    }

    let prepared = prepareSiteHtml(html);
    if (!prepared.validation.valid) {
      const issueSummary = prepared.validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
      log.info({ tenantId, issues: prepared.validation.issues }, "Site quality validation failed; requesting automatic repair");
      try {
        const repair = await callAI([{ role: "user", content: `Repare integralmente o HTML abaixo. Corrija todos os problemas listados, preserve o conteúdo e as funcionalidades e retorne somente o documento HTML completo.\n\nPROBLEMAS DETECTADOS:\n${issueSummary}\n\nHTML:\n${html}` }], tenantId, log);
        const repairedByAi = extractHtmlSafe(repair.content, log);
        if (isValidHtml(repairedByAi)) prepared = prepareSiteHtml(repairedByAi);
      } catch (repairError) {
        log.info({ repairError, tenantId }, "AI repair failed; retaining deterministic safe fallback");
      }
    }
    if (!prepared.validation.valid) {
      log.error({ tenantId, issues: prepared.validation.issues }, "Site remained invalid after repair and fallbacks");
      await persistGenerationJob(jobId, { status: "error", error: "O site gerado não passou na validação de qualidade. Tente novamente.", createdAt: Date.now() });
      return;
    }
    html = prepared.html;

    // Product pages are addressed and named after the product itself, not
    // the business — that's what makes each product's LP its own distinct,
    // meaningful site when a tenant has several of them live at once.
    const siteDisplayName = focusProduct?.name ?? enrichedConfig.name;
    const siteSlug = await generateUniqueSiteSlug(siteDisplayName, config.type);

    const [site] = await db
      .insert(generatedSitesTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name: siteDisplayName,
        siteType: config.type,
        siteSlug,
        config: enrichedConfig,
        html,
      })
      .returning();

    // D-005: análise de SEO/legibilidade/qualidade -- roda automaticamente
    // pra toda página gerada, sem precisar de ação manual.
    let siteComScore = site;
    try {
      const { score, checklist } = computeSiteSeoScore(html);
      const [updated] = await db
        .update(generatedSitesTable)
        .set({ seoScore: score, seoChecklist: checklist, analisadoEm: new Date() })
        .where(eq(generatedSitesTable.id, site.id))
        .returning();
      if (updated) siteComScore = updated;
    } catch (err) {
      log.warn({ err, siteId: site.id }, "Site generator: falha ao calcular score de SEO (não bloqueia a geração)");
    }

    await persistGenerationJob(jobId, {
      status: "done",
      result: { ...siteComScore, _provider: result.provider, _model: result.model } as Record<string, unknown>,
      createdAt: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    await persistGenerationJob(jobId, { status: "error", error: msg, createdAt: Date.now() });
  } finally {
    activeGenerationJobs.delete(jobId);
  }
}

// POST /tenants/:tenantId/site-generator/generate — start async generation, return jobId immediately
router.post("/tenants/:tenantId/site-generator/generate", async (req, res) => {
  const { tenantId } = req.params;
  const config: SiteGeneratorConfig = req.body;

  if (!config?.type) {
    res.status(400).json({ error: "type é obrigatório" });
    return;
  }

  const jobId = crypto.randomUUID();
  const baseOrigin = `${req.protocol}://${req.get("host")}`;
  await db.insert(siteGenerationJobsTable).values({
    id: jobId,
    tenantId,
    status: "pending",
    config,
    baseOrigin,
  });
  activeGenerationJobs.add(jobId);
  // Fire-and-forget — does not block the HTTP response
  void runGenerateSite(jobId, tenantId, config, baseOrigin, req.log);

  return res.status(202).json({ jobId });
});

// GET /tenants/:tenantId/site-generator/jobs/:jobId — poll generation status
router.get("/tenants/:tenantId/site-generator/jobs/:jobId", async (req, res) => {
  const [job] = await db
    .select()
    .from(siteGenerationJobsTable)
    .where(
      and(
        eq(siteGenerationJobsTable.id, req.params.jobId),
        eq(siteGenerationJobsTable.tenantId, req.params.tenantId),
      ),
    )
    .limit(1);
  if (!job) {
    res.status(404).json({ error: "Job não encontrado ou expirado" });
    return;
  }
  if (job.status === "pending" && !activeGenerationJobs.has(job.id)) {
    activeGenerationJobs.add(job.id);
    void runGenerateSite(job.id, job.tenantId, job.config, job.baseOrigin, req.log);
  }
  return res.json({ status: job.status, result: job.result, error: job.error });
});

// POST /tenants/:tenantId/site-generator/:siteId/refine — refine via chat
router.post("/tenants/:tenantId/site-generator/:siteId/refine", async (req, res) => {
  const { tenantId, siteId } = req.params;
  const { message, history = [] } = req.body as {
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message) {
    res.status(400).json({ error: "message é obrigatório" });
    return;
  }

  const [existing] = await db
    .select({ html: generatedSitesTable.html, tenantId: generatedSitesTable.tenantId })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const refinePrompt = buildRefinePrompt(existing.html ?? "", message);

  const refineMessages: AiMessage[] = [
    { role: "user", content: refinePrompt },
  ];

  let result;
  try {
    result = await callAI(refineMessages, tenantId, req.log);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao chamar a IA";
    req.log.error({ error: msg, provider: AI_PROVIDER }, "Site refinement failed");
    res.status(502).json({ error: `Erro no refinamento: ${msg}` });
    return;
  }

  req.log.info({ provider: result.provider, model: result.model, tenantId, siteId }, "Site refined successfully");

  let rawText = result.content;
  let html = extractHtml(rawText);

  // Alguns modelos ocasionalmente devolvem o HTML sem aplicar o pedido. Não
  // confirme sucesso ao usuário nesse caso: faça uma segunda tentativa explícita.
  if (isValidHtml(html) && !htmlChanged(existing.html ?? "", html)) {
    req.log.info({ tenantId, siteId }, "Site refinement returned unchanged HTML; retrying");
    try {
      result = await callAI([
        { role: "user", content: `${refinePrompt}\n\nATENÇÃO: a tentativa anterior devolveu o site sem nenhuma alteração. O HTML final PRECISA incorporar o pedido do cliente de forma verificável.` },
      ], tenantId, req.log);
      rawText = result.content;
      html = extractHtml(rawText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao chamar a IA";
      res.status(502).json({ error: `Erro no refinamento: ${msg}` });
      return;
    }
  }

  if (!isValidHtml(html)) {
    req.log.error({ rawLength: rawText.length, htmlLength: html.length, provider: result.provider }, "Site refinement returned invalid HTML");
    res.status(502).json({ error: "Resposta da IA inválida" });
    return;
  }

  let prepared = prepareSiteHtml(html);
  if (!prepared.validation.valid) {
    const issues = prepared.validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
    try {
      result = await callAI([{ role: "user", content: `${refinePrompt}\n\nA versão produzida falhou nestes critérios de qualidade:\n${issues}\nCorrija-os também e retorne o HTML completo.` }], tenantId, req.log);
      html = extractHtml(result.content);
      prepared = prepareSiteHtml(html);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao reparar HTML";
      res.status(502).json({ error: `Erro no reparo automático: ${msg}` });
      return;
    }
  }
  if (!prepared.validation.valid) {
    res.status(422).json({ error: "A alteração não passou na validação visual e de segurança." });
    return;
  }
  html = prepared.html;

  if (!htmlChanged(existing.html ?? "", html)) {
    res.status(422).json({ error: "A IA não aplicou nenhuma mudança. Reformule o pedido com mais detalhes." });
    return;
  }

  // D-005: recalcula o score de SEO/qualidade -- o refinamento muda o
  // HTML, o score anterior fica desatualizado se não recalcular.
  const { score: seoScore, checklist: seoChecklist } = computeSiteSeoScore(html);

  await db
    .update(generatedSitesTable)
    .set({ html, seoScore, seoChecklist, analisadoEm: new Date(), updatedAt: new Date() })
    .where(eq(generatedSitesTable.id, siteId));

  return res.json({ html, seoScore, seoChecklist, _provider: result.provider, _model: result.model });
});

// DELETE /tenants/:tenantId/site-generator/:siteId
router.delete("/tenants/:tenantId/site-generator/:siteId", async (req, res) => {
  const { tenantId, siteId } = req.params;

  const [existing] = await db
    .select({ tenantId: generatedSitesTable.tenantId })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  await db.delete(generatedSitesTable).where(eq(generatedSitesTable.id, siteId));
  return res.status(204).send();
});

// POST /tenants/:tenantId/site-generator/:siteId/publish — make site public
router.post("/tenants/:tenantId/site-generator/:siteId/publish", async (req, res) => {
  const { tenantId, siteId } = req.params;
  const user = (req as any).user;
  const isSuperAdmin = user?.platformRole === "super_admin";
  if (!isSuperAdmin && user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [existing] = await db
    .select({ id: generatedSitesTable.id, tenantId: generatedSitesTable.tenantId })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const [updated] = await db
    .update(generatedSitesTable)
    .set({ published: true, updatedAt: new Date() })
    .where(eq(generatedSitesTable.id, siteId))
    .returning({ id: generatedSitesTable.id, published: generatedSitesTable.published });

  req.log.info({ tenantId, siteId }, "Site published");
  return res.json(updated);
});

// GET /tenants/:tenantId/site-generator/latest — load most recent site for a tenant
router.get("/tenants/:tenantId/site-generator/latest", async (req, res) => {
  const { tenantId } = req.params;
  const user = (req as any).user;
  const isSuperAdmin = user?.platformRole === "super_admin";
  if (!isSuperAdmin && user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select()
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .orderBy(desc(generatedSitesTable.updatedAt))
    .limit(1);

  if (!site) {
    res.status(404).json({ error: "No site found" });
    return;
  }

  return res.json(site);
});

// PATCH /tenants/:tenantId/site-generator/:siteId/html — save HTML after direct edits (logo/photo injection)
router.patch("/tenants/:tenantId/site-generator/:siteId/html", async (req, res) => {
  const { tenantId, siteId } = req.params;
  const user = (req as any).user;
  const isSuperAdmin = user?.platformRole === "super_admin";
  if (!isSuperAdmin && user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { html } = req.body as { html: string };
  if (!html || typeof html !== "string") {
    res.status(400).json({ error: "html é obrigatório" });
    return;
  }

  const [existing] = await db
    .select({ id: generatedSitesTable.id, tenantId: generatedSitesTable.tenantId })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const prepared = prepareSiteHtml(extractHtml(html));
  if (!prepared.validation.valid) {
    res.status(422).json({ error: "O HTML editado não passou na validação.", issues: prepared.validation.issues });
    return;
  }

  // D-005: recalcula o score de SEO/qualidade -- edição manual muda o
  // HTML, o score anterior fica desatualizado se não recalcular.
  const { score: seoScore, checklist: seoChecklist } = computeSiteSeoScore(prepared.html);

  const [updated] = await db
    .update(generatedSitesTable)
    .set({ html: prepared.html, seoScore, seoChecklist, analisadoEm: new Date(), updatedAt: new Date() })
    .where(eq(generatedSitesTable.id, siteId))
    .returning({ id: generatedSitesTable.id });

  return res.json({ ...updated, html: prepared.html, seoScore, seoChecklist });
});

// PATCH /tenants/:tenantId/site-generator/:siteId/name — rename a generated site (switcher "Meus sites")
router.patch("/tenants/:tenantId/site-generator/:siteId/name", async (req, res) => {
  const { tenantId, siteId } = req.params;
  const user = (req as any).user;
  const isSuperAdmin = user?.platformRole === "super_admin";
  if (!isSuperAdmin && user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { name } = req.body as { name: string };
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name é obrigatório" });
    return;
  }

  const [existing] = await db
    .select({ id: generatedSitesTable.id, tenantId: generatedSitesTable.tenantId })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.id, siteId));

  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const [updated] = await db
    .update(generatedSitesTable)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(generatedSitesTable.id, siteId))
    .returning({ id: generatedSitesTable.id, name: generatedSitesTable.name });

  req.log.info({ tenantId, siteId }, "Site renamed");
  return res.json(updated);
});

export default router;
