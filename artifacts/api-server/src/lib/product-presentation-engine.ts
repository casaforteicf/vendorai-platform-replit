/**
 * Product presentation engine — generates HTML product presentations
 * Reuses proposal-engine branding (generateTheme, renderProposalHtml pattern)
 */
import { callProposalAI, generateTheme, AI_PROVIDER, type AiMessage } from "./proposal-engine.js";
import { logger } from "./logger.js";

export interface ProductPresentationContext {
  productName: string;
  productDescription?: string | null;
  productFeatures: string[];
  productPrice?: string | null;
  productImageUrl?: string | null;
  productBrand?: string | null;
  webSources?: { url: string; title: string; snippet: string }[];
  leadName: string;
  leadEmpresa?: string | null;
  leadSegmento?: string | null;
  leadBriefing?: string | null;
  leadIntelligence?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantLogoUrl?: string | null;
  logoUrl?: string | null;
  corDestaque?: string | null;
}

export interface ProductPresentationJson {
  hero: {
    tagline: string;
    headline: string;
    subheadline: string;
    ctaPrimary: string;
  };
  product: {
    name: string;
    description: string;
    features: { icon: string; title: string; text: string }[];
    price: string;
    priceNote?: string;
  };
  benefits: {
    title: string;
    subtitle: string;
    items: { title: string; text: string }[];
  };
  cta: {
    title: string;
    subtitle: string;
    button: string;
    whatsappUrl: string;
  };
  meta: {
    clientName: string;
    whatsappUrl: string;
  };
}

export function buildProductPresentationPrompt(ctx: ProductPresentationContext): string {
  const webFeatures = ctx.webSources?.length
    ? `\nCaracterísticas da pesquisa web (com fontes):\n${ctx.productFeatures.map((f, i) => {
      const source = ctx.webSources?.[i % (ctx.webSources?.length || 1)];
      return `- ${f}${source ? ` [fonte: ${source.url}]` : ""}`;
    }).join("\n")}`
    : "";

  const leadProfile = `
## Perfil do lead
- Nome: ${ctx.leadName}
- Empresa: ${ctx.leadEmpresa || "Não informado"}
- Segmento: ${ctx.leadSegmento || "Não informado"}
${ctx.leadBriefing ? `\nBriefing:\n${ctx.leadBriefing}` : ""}
${ctx.leadIntelligence ? `\nInteligência:\n${ctx.leadIntelligence}` : ""}
`;

  const tenantLabel = ctx.tenantName ? `da empresa "${ctx.tenantName}"` : "da empresa fornecedora";
  return `Você é um redator comercial sênior ${tenantLabel}. Gere uma apresentação de produto em HTML (via JSON) para o lead abaixo.

## Produto
- Nome: ${ctx.productName}
- Marca: ${ctx.productBrand || "Não informado"}
- Descrição: ${ctx.productDescription || "Não informado"}
- Preço: ${ctx.productPrice || "Consultar"}
- Características:\n${ctx.productFeatures.map((f) => `- ${f}`).join("\n")}
${webFeatures}

${leadProfile}

## Instruções OBRIGATÓRIAS
1. Retorne APENAS um JSON válido, sem markdown, sem explicações.
2. O JSON deve seguir EXATAMENTE esta estrutura:
{
  "hero": {
    "tagline": "string curta (segmento do lead)",
    "headline": "string de impacto — título da apresentação",
    "subheadline": "string — parágrafo explicando o valor do produto",
    "ctaPrimary": "string"
  },
  "product": {
    "name": "string",
    "description": "string",
    "features": [
      { "icon": "string (emoji simples)", "title": "string", "text": "string" }
    ],
    "price": "string",
    "priceNote": "string opcional"
  },
  "benefits": {
    "title": "string",
    "subtitle": "string",
    "items": [
      { "title": "string", "text": "string" }
    ]
  },
  "cta": {
    "title": "string",
    "subtitle": "string",
    "button": "string",
    "whatsappUrl": "string"
  },
  "meta": {
    "clientName": "string",
    "whatsappUrl": "string"
  }
}
3. Organize as vantagens priorizando o que importa pro perfil/segmento do lead.
4. NUNCA invente características sem fonte (catálogo ou web).
5. O preço deve ser o do catálogo, nunca inventado.
6. O CTA deve convidar a continuar a conversa no WhatsApp.
`;
}

export function renderProductPresentationHtml(
  json: ProductPresentationJson,
  theme: ReturnType<typeof generateTheme>,
  logoUrl?: string | null,
  clientName?: string,
  tenantName?: string,
  webSources?: { url: string; title: string; snippet: string }[],
  tenantLogoUrl?: string | null
): string {
  const d = json;
  const hero = d.hero || {};
  const product = d.product || {};
  const benefits = d.benefits || {};
  const cta = d.cta || {};
  const meta = d.meta || {};

  const features = (product.features || []).map((f: any) =>
    `<div class="feature reveal"><span class="ficon">${f.icon || "✓"}</span><h4>${f.title}</h4><p>${f.text}</p></div>`
  ).join("");

  const benefitItems = (benefits.items || []).map((b: any) =>
    `<div class="benefit reveal"><h4>${b.title}</h4><p>${b.text}</p></div>`
  ).join("");

  const sourceNote = webSources?.length
    ? `<div class="sources"><p><strong>Fontes da pesquisa:</strong></p>${webSources.map((s) =>
      `<a href="${s.url}" target="_blank" rel="noopener">${s.title || s.url}</a>`
    ).join("<br/>")}</div>`
    : "";

  const navName = tenantName || "Apresentação Comercial";

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${navName}" style="height:34px;object-fit:contain;max-width:160px;" onerror="this.style.display='none'" />`
    : `<div class="badge" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20"><defs><linearGradient id="g1" x1="0" y1="0" x2="20" y2="20"><stop offset="0%" stop-color="${theme.accentSoft}"/><stop offset="100%" stop-color="${theme.secondary}"/></linearGradient></defs><circle cx="10" cy="10" r="3.1" fill="url(#g1)"/><circle cx="3" cy="4" r="1.5" fill="url(#g1)" opacity="0.85"/><circle cx="17" cy="4" r="1.5" fill="url(#g1)" opacity="0.85"/><circle cx="3" cy="16" r="1.5" fill="url(#g1)" opacity="0.85"/><circle cx="17" cy="16" r="1.5" fill="url(#g1)" opacity="0.85"/><g stroke="url(#g1)" stroke-width="0.8" opacity="0.7"><line x1="3" y1="4" x2="10" y2="10"/><line x1="17" y1="4" x2="10" y2="10"/><line x1="3" y1="16" x2="10" y2="10"/><line x1="17" y1="16" x2="10" y2="10"/></g></svg></div>`;

  const wordmark = `<div class="wordmark" style="font-family:var(--body);font-weight:700;font-size:1.1rem;">${navName}</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Apresentação — ${product.name || meta.clientName || "Produto"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --cream:${theme.cream};
    --cream-2:${theme.cream2};
    --ink:${theme.ink};
    --navy-deep:${theme.navyDeep};
    --navy-mid:${theme.navyMid};
    --indigo:${theme.accent};
    --indigo-soft:${theme.accentSoft};
    --cyan:${theme.secondary};
    --cyan-soft:${theme.secondarySoft};
    --concrete:${theme.concrete};
    --concrete-line:${theme.concreteLine};
    --ok:${theme.ok};
    --warn:${theme.warn};
    --display:"Instrument Serif",serif;
    --body:"Inter",sans-serif;
    --mono:"JetBrains Mono",monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--cream);color:var(--ink);font-family:var(--body);line-height:1.5;-webkit-font-smoothing:antialiased}
  ::selection{background:var(--indigo-soft);color:var(--navy-deep)}
  .grad-text{background:linear-gradient(90deg,var(--indigo),var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent}
  .logo{display:flex;align-items:center;gap:10px}
  .badge{width:34px;height:34px;border-radius:9px;background:linear-gradient(160deg,var(--navy-mid),var(--navy-deep));display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .wordmark{font-family:var(--display);font-size:1.25rem;letter-spacing:0.01em;color:var(--ink)}
  .wordmark .ai{font-style:italic}
  .nav{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:16px 6vw;background:rgba(250,248,244,0.86);backdrop-filter:blur(10px);border-bottom:1px solid var(--concrete-line)}
  .btn{font-family:var(--body);font-weight:600;font-size:0.85rem;padding:10px 18px;border-radius:100px;border:none;cursor:pointer;text-decoration:none;display:inline-block}
  .btn-primary{background:linear-gradient(90deg,var(--indigo),var(--cyan));color:var(--navy-deep)}
  section{padding:96px 6vw}
  .container{max-width:1080px;margin:0 auto}
  .cod{font-family:var(--mono);font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--navy-mid);background:var(--cream-2);border:1px solid var(--concrete-line);padding:5px 11px;border-radius:5px;display:inline-block}
  .eyebrow-row{display:flex;align-items:center;gap:12px;margin-bottom:22px}
  .eyebrow-line{flex:1;height:1px;background:var(--concrete-line);display:none}
  @media(min-width:760px){.eyebrow-line{display:block}}
  h1,h2,h3{font-family:var(--display);font-weight:400;letter-spacing:-0.02em;line-height:1.1}
  h1{font-size:clamp(2.2rem,4.5vw,3.6rem)}
  h2{font-size:clamp(1.8rem,3.5vw,2.8rem)}
  p.lead{font-size:clamp(1.05rem,1.6vw,1.25rem);color:var(--navy-mid);max-width:640px}
  .hero{min-height:70vh;display:flex;align-items:center;position:relative;overflow:hidden}
  .hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 70% 30%,var(--indigo-soft),transparent 60%),radial-gradient(ellipse at 30% 80%,var(--cyan-soft),transparent 50%);opacity:0.5;pointer-events:none}
  .hero-ctas{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}
  .feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:28px}
  .feature{background:var(--cream-2);border:1px solid var(--concrete-line);border-radius:14px;padding:22px}
  .feature .ficon{font-size:1.5rem;margin-bottom:10px;display:block}
  .feature h4{font-family:var(--body);font-weight:700;font-size:1rem;margin-bottom:6px}
  .feature p{font-size:0.9rem;color:var(--navy-mid)}
  .product-card{background:linear-gradient(160deg,var(--navy-mid),var(--navy-deep));color:var(--cream);border-radius:18px;padding:40px;margin-top:28px;position:relative;overflow:hidden}
  .product-card .price{font-family:var(--display);font-size:clamp(2rem,4vw,3.5rem);margin-top:16px}
  .product-card .price-note{font-size:0.85rem;opacity:0.7}
  .benefits{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}
  .benefit{background:var(--cream-2);border:1px solid var(--concrete-line);border-radius:12px;padding:18px}
  .benefit h4{font-family:var(--body);font-weight:700;font-size:0.95rem;margin-bottom:6px}
  .benefit p{font-size:0.85rem;color:var(--navy-mid)}
  .cta-final{background:linear-gradient(160deg,var(--indigo-soft),var(--cyan-soft));position:relative}
  .sources{font-size:0.8rem;color:var(--navy-mid);margin-top:20px}
  .sources a{color:var(--indigo);text-decoration:underline}
  footer{padding:40px 6vw;text-align:center;font-size:0.8rem;color:var(--navy-mid);border-top:1px solid var(--concrete-line)}
  .reveal{opacity:0;transform:translateY(18px);transition:opacity 0.6s ease,transform 0.6s ease}
  .reveal.in{opacity:1;transform:translateY(0)}
</style>
</head>
<body>

<nav class="nav">
  <div class="logo">${logoHtml}${wordmark}</div>
  <a class="btn btn-primary" href="${meta.whatsappUrl || "#"}" target="_blank" rel="noopener">Falar no WhatsApp</a>
</nav>

<main>
  <section class="hero" id="top">
    <div class="hero-bg"></div>
    <div class="container" style="position:relative;z-index:1">
      <div class="eyebrow-row"><span class="cod">${hero.tagline || ""}</span><div class="eyebrow-line"></div></div>
      <h1 class="reveal">${hero.headline || ""}</h1>
      <p class="lead reveal">${hero.subheadline || ""}</p>
      <div class="hero-ctas">
        <a class="btn btn-primary" href="${meta.whatsappUrl || "#"}" target="_blank" rel="noopener">${hero.ctaPrimary || "Falar no WhatsApp"}</a>
      </div>
    </div>
  </section>

  <section id="produto">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">O Produto</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${product.name || ""}</h2>
      <p class="lead reveal">${product.description || ""}</p>
      <div class="product-card reveal">
        <div class="price">${product.price || ""}</div>
        ${product.priceNote ? `<div class="price-note">${product.priceNote}</div>` : ""}
      </div>
      <div class="feature-grid">${features}</div>
      ${sourceNote}
    </div>
  </section>

  <section id="vantagens">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Vantagens</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${benefits.title || ""}</h2>
      <p class="lead reveal">${benefits.subtitle || ""}</p>
      <div class="benefits">${benefitItems}</div>
    </div>
  </section>

  <section class="cta-final" id="contato">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Próximo passo</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${cta.title || ""}</h2>
      <p class="lead reveal">${cta.subtitle || ""}</p>
      <div class="hero-ctas">
        <a class="btn btn-primary" href="${meta.whatsappUrl || "#"}" target="_blank" rel="noopener">${cta.button || "Falar no WhatsApp"}</a>
      </div>
    </div>
  </section>
</main>

<footer>
  <span>${navName} — Apresentação preparada para ${clientName || meta.clientName || "Cliente"}</span>
</footer>

<script>
  const els=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:0.12});
    els.forEach(el=>io.observe(el));
  }else{els.forEach(el=>el.classList.add('in'))}
</script>
</body>
</html>`;
}

export async function generateProductPresentation(
  ctx: ProductPresentationContext,
  tenantId: string,
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<{ json: ProductPresentationJson; html: string; sources: { url: string; title: string; snippet: string }[] }> {
  const prompt = buildProductPresentationPrompt(ctx);

  const result = await callProposalAI(
    [{ role: "user", content: prompt }],
    tenantId,
    log
  );

  let json: ProductPresentationJson;
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      json = JSON.parse(jsonMatch[0]);
    } else {
      json = JSON.parse(result.content);
    }
  } catch (err) {
    log.error({ content: result.content.slice(0, 500) }, "Failed to parse product presentation JSON");
    throw new Error("Falha ao parsear JSON da apresentação");
  }

  const theme = generateTheme(ctx.corDestaque || "#6366F1");
  const html = renderProductPresentationHtml(
    json,
    theme,
    ctx.tenantLogoUrl,
    ctx.leadName,
    ctx.tenantName ?? undefined,
    ctx.webSources,
    ctx.tenantLogoUrl
  );

  return { json, html, sources: ctx.webSources || [] };
}
