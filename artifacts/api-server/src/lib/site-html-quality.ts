export const SITE_GENERATOR_SYSTEM_PROMPT = `Você é um diretor de criação, UX writer e engenheiro front-end sênior. Sua única saída é um documento HTML comercial completo, autocontido e pronto para apresentação.

REQUISITOS INEGOCIÁVEIS
- Entregue <!DOCTYPE html>, <html lang="pt-BR">, <head> com charset e viewport, <title>, CSS dentro de <style> e <body> completo, semanticamente válido.
- Todo conteúdo deve ser específico, convincente e natural em português brasileiro. Não use lorem ipsum, seções vazias, cartões vazios, depoimentos ou números inventados.
- Crie um design system coerente com tokens CSS de cor, tipografia, espaçamento, raio, sombra e largura de container. Reutilize esses tokens em todo o documento.
- Garanta contraste WCAG AA: texto normal >= 4.5:1 e texto grande >= 3:1. Nunca use texto branco/claro em cartões ou fundos brancos/claros, nem texto escuro em fundos escuros.
- Adote CSS mobile-first. O layout deve funcionar sem overflow em 360px, 768px e 1440px, com breakpoints explícitos para tablet e desktop.
- Estilize completamente navegação, links, botões, formulários e estados hover/focus-visible. Nenhum controle pode parecer o padrão do navegador.
- Imagens devem ter src válido, alt descritivo, width/height ou aspect-ratio e object-fit: cover/contain; nunca distorça imagens. A logo deve ter presença legível (mínimo visual de 48px de altura quando fornecida).
- Hero deve ter composição profissional, enquadramento responsivo e contraste robusto; quando houver imagem de fundo, use overlay suficiente.
- Use grids responsivos, composição visual, SVGs inline acessíveis e imagens reais fornecidas. Não invente URLs nem dependa de bibliotecas de ícones.
- Não use alturas fixas excessivas, min-height acima de 100svh, espaçamento vertical acima de 128px, cartões esticados sem conteúdo, elementos vazios ou conteúdo posicionado fora da viewport.
- Não use scripts externos, javascript: URLs, meta refresh, frames arbitrários, CSS @import, position:fixed em contêineres grandes ou overflow-x que esconda um layout quebrado.
- O resultado deve parecer trabalho de uma agência brasileira premium e estar pronto para uma apresentação comercial.

Antes de responder, revise mentalmente contraste, hierarquia, densidade, alinhamento, responsividade e completude. Retorne somente o HTML, sem markdown ou comentários externos.`;

export type SiteQualityCode =
  | "incomplete-html"
  | "dangerous-markup"
  | "missing-responsive-meta"
  | "missing-css"
  | "unstyled-controls"
  | "invalid-contrast"
  | "invisible-text"
  | "oversized-empty-element"
  | "horizontal-overflow"
  | "broken-image"
  | "empty-section";

export interface SiteQualityIssue {
  code: SiteQualityCode;
  message: string;
  repairable: boolean;
}

export interface SiteQualityResult {
  valid: boolean;
  issues: SiteQualityIssue[];
}

export function extractHtmlDocument(text: string): string {
  let cleaned = text
    .replace(/```html\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const starts = [
    cleaned.search(/<!doctype/i),
    cleaned.search(/<html/i),
  ].filter((index) => index >= 0);
  if (starts.length) cleaned = cleaned.slice(Math.min(...starts));
  const closings = [...cleaned.matchAll(/<\/html\s*>/gi)];
  const last = closings.at(-1);
  if (last?.index !== undefined)
    cleaned = cleaned.slice(0, last.index + last[0].length);
  return cleaned.trim();
}

const SAFE_BASE_CSS = `
/* VendorAI quality baseline — deterministic safety defaults */
:root{--vai-bg:#fff;--vai-surface:#f6f7f9;--vai-text:#172033;--vai-muted:#526077;--vai-primary:#175cd3;--vai-on-primary:#fff;--vai-border:#d7dce4;--vai-radius:16px;--vai-shadow:0 12px 32px rgba(15,23,42,.10);--vai-container:1180px}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;min-width:0;background:var(--bg,var(--vai-bg));color:var(--text,var(--vai-text));font-family:var(--font-body,Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:16px;line-height:1.65;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{margin:0 0 .65em;color:inherit;font-family:var(--font-display,var(--font-body,Inter,ui-sans-serif,system-ui,sans-serif));line-height:1.12;text-wrap:balance}
h1{font-size:clamp(2.25rem,7vw,5rem)}h2{font-size:clamp(1.8rem,4.5vw,3.25rem)}h3{font-size:clamp(1.2rem,2.4vw,1.6rem)}
p{max-width:72ch;margin:0 0 1rem;color:inherit}a{color:inherit;text-underline-offset:.18em}img,svg,video,canvas{display:block;max-width:100%}img{height:auto;object-fit:cover}iframe{max-width:100%;border:0}
button,input,textarea,select{font:inherit}button,.btn,[class*="btn"],a[class*="button"],[role="button"]{display:inline-flex;min-height:44px;align-items:center;justify-content:center;gap:.55rem;padding:.75rem 1.25rem;border:1px solid transparent;border-radius:999px;background:var(--primary,var(--vai-primary));color:var(--btn-text,var(--vai-on-primary));font-weight:700;line-height:1.2;text-decoration:none;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
button:hover,.btn:hover,[class*="btn"]:hover,a[class*="button"]:hover,[role="button"]:hover{transform:translateY(-1px);filter:brightness(.94);box-shadow:0 8px 20px rgba(15,23,42,.16)}
:focus-visible{outline:3px solid #f5b700;outline-offset:3px}
.container,[class*="container"],section>div[class*="wrap"]{width:min(100% - 2rem,var(--vai-container));margin-inline:auto}
section{position:relative;padding-block:clamp(3.5rem,7vw,7rem)}section:empty,article:empty,[class*="card"]:empty{display:none!important}
.grid,[class*="-grid"],[class*=" grid"]{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(1rem,2.5vw,2rem)}
.card,[class*="card"]{min-width:0;height:auto;min-height:0;padding:clamp(1.25rem,2.5vw,2rem);border:1px solid var(--border,var(--vai-border));border-radius:var(--radius,var(--vai-radius));background:var(--card-bg,var(--bg,var(--vai-bg)));color:var(--card-text,var(--text,var(--vai-text)));box-shadow:var(--shadow,var(--vai-shadow))}
.hero,[id*="hero"],[class*="hero"]{min-height:min(86svh,780px);display:grid;align-items:center;overflow:hidden}.hero img,[id*="hero"] img,[class*="hero"] img{width:100%;max-height:720px;aspect-ratio:4/3;object-fit:cover;object-position:center}
header img,nav img,.logo img,img.logo,[class*="logo"] img{width:auto!important;height:clamp(48px,5vw,72px)!important;max-width:min(220px,48vw)!important;object-fit:contain!important}
@media(min-width:48rem){.grid,[class*="-grid"],[class*=" grid"]{grid-template-columns:repeat(2,minmax(0,1fr))}.hero,[id*="hero"],[class*="hero"]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:64rem){.grid,[class*="-grid"],[class*=" grid"]{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}}
@media(max-width:47.99rem){section{padding-block:clamp(3rem,12vw,4.5rem)}nav ul{flex-wrap:wrap}.hero,[id*="hero"],[class*="hero"]{min-height:auto}.hero img,[id*="hero"] img,[class*="hero"] img{aspect-ratio:4/3}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

const QUALITY_GUARD_SCRIPT = `<script id="__vai_quality_guard__">(()=>{const ready=()=>{const lum=c=>{const m=c.match(/[\\d.]+/g);if(!m||m.length<3)return null;const v=m.slice(0,3).map(Number).map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]},ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);document.querySelectorAll('body *').forEach(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),text=(el.textContent||'').trim();if(!text&&r.height>320&&!el.querySelector('img,video,iframe,svg')){el.style.minHeight='0';el.style.height='auto'}if(text&&el.children.length===0){const fg=lum(s.color),bg=lum(s.backgroundColor);if(fg!==null&&bg!==null&&ratio(fg,bg)<3){el.style.color=bg>.5?'#172033':'#ffffff'}}if(r.right>document.documentElement.clientWidth+2){el.style.maxWidth='100%';el.style.minWidth='0'}});document.querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{img.hidden=true;img.setAttribute('data-vai-broken','true')},{once:true})})};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ready):ready()})()</script>`;

function colorToRgb(value: string): [number, number, number] | null {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((x) => x + x)
            .join("")
        : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((part) => {
    const channel = part / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

export function validateSiteHtml(html: string): SiteQualityResult {
  const issues: SiteQualityIssue[] = [];
  const add = (code: SiteQualityCode, message: string, repairable: boolean) => {
    if (!issues.some((issue) => issue.code === code))
      issues.push({ code, message, repairable });
  };
  if (
    !/^\s*<!doctype html>/i.test(html) ||
    !/<html\b[^>]*lang=["']pt-BR["']/i.test(html) ||
    !/<head\b/i.test(html) ||
    !/<\/head>/i.test(html) ||
    !/<body\b/i.test(html) ||
    !/<\/body>/i.test(html) ||
    !/<\/html>\s*$/i.test(html)
  )
    add(
      "incomplete-html",
      "Documento HTML incompleto ou sem lang pt-BR.",
      false,
    );
  if (
    /<script\b[^>]+src\s*=|javascript\s*:|<meta\b[^>]+http-equiv\s*=\s*["']?refresh|<object\b|<embed\b|@import\s+/i.test(
      html,
    )
  )
    add(
      "dangerous-markup",
      "HTML contém dependência ou marcação perigosa.",
      false,
    );
  if (!/<meta\b[^>]+name=["']viewport["']/i.test(html))
    add("missing-responsive-meta", "Meta viewport ausente.", true);
  if (!/<style\b[^>]*>[\s\S]{200,}<\/style>/i.test(html))
    add("missing-css", "CSS autocontido ausente ou insuficiente.", true);
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");
  if (
    !/(button|\.btn|\[role=["']?button)/i.test(styles) ||
    !/(a\s*\{|a:|nav\s+a)/i.test(styles)
  )
    add(
      "unstyled-controls",
      "Botões ou links não têm estilos explícitos.",
      true,
    );
  if (
    /(?:width|min-width)\s*:\s*(?:[4-9]\d{2}|\d{4,})px/i.test(styles) ||
    /100vw/i.test(styles)
  )
    add(
      "horizontal-overflow",
      "CSS contém largura propensa a overflow horizontal.",
      true,
    );
  if (
    /(?:height|min-height)\s*:\s*(?:[8-9]\d{2}|\d{4,})px/i.test(styles) ||
    /min-height\s*:\s*(?:1[1-9]\d|[2-9]\d{2})vh/i.test(styles)
  )
    add("oversized-empty-element", "CSS contém altura excessiva.", true);
  if (
    /<(?:section|article|div)\b[^>]*(?:style=["'][^"']*(?:height|min-height)\s*:\s*(?:[4-9]\d{2}|\d{4,})px[^"']*["'])[^>]*>\s*<\/(?:section|article|div)>/i.test(
      html,
    )
  )
    add("oversized-empty-element", "Elemento vazio com altura grande.", true);
  if (
    /<(?:section|article)\b[^>]*>\s*(?:<!--.*?-->\s*)?<\/(?:section|article)>/is.test(
      html,
    )
  )
    add("empty-section", "Seção vazia encontrada.", true);
  if (
    /<img\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html) ||
    /<img\b[^>]*\bsrc\s*=\s*["']\s*["']/i.test(html)
  )
    add("broken-image", "Imagem sem origem válida.", true);
  for (const tag of html.matchAll(/<[^>]+style=["']([^"']+)["'][^>]*>/gi)) {
    const style = tag[1];
    const fg = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
    const bg = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
    const fgRgb = fg && colorToRgb(fg);
    const bgRgb = bg && colorToRgb(bg);
    if (fgRgb && bgRgb && contrast(fgRgb, bgRgb) < 3)
      add(
        "invalid-contrast",
        "Cor de texto e fundo têm contraste claramente inválido.",
        true,
      );
    if (
      /opacity\s*:\s*0(?:\D|$)|color\s*:\s*transparent|font-size\s*:\s*0(?:\D|$)/i.test(
        style,
      )
    )
      add("invisible-text", "Texto potencialmente invisível.", true);
  }
  return { valid: issues.length === 0, issues };
}

export function sanitizeSiteHtml(html: string): string {
  return html
    .replace(/<script\b[^>]+src\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, "")
    .replace(/<meta\b[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    .replace(/<(?:object|embed)\b[^>]*>[\s\S]*?<\/(?:object|embed)>/gi, "")
    .replace(/<(?:object|embed)\b[^>]*\/?\s*>/gi, "")
    .replace(
      /\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi,
      ' href="#"',
    )
    .replace(/@import\s+(?:url\()?[^;]+;/gi, "")
    .replace(/<img\b(?![^>]*\bsrc\s*=)[^>]*>/gi, "")
    .replace(/<img\b[^>]*\bsrc\s*=\s*(["'])\s*\1[^>]*>/gi, "")
    .replace(/<(section|article)\b[^>]*>\s*(?:<!--.*?-->\s*)?<\/\1>/gis, "");
}

export function applySiteSafetyDefaults(html: string): string {
  let result = sanitizeSiteHtml(html);
  if (!/<meta\b[^>]+name=["']viewport["']/i.test(result))
    result = result.replace(
      /<head\b[^>]*>/i,
      '$&\n<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
  result = result.replace(
    /<style\b[^>]*id=["']__vai_quality_base__["'][^>]*>[\s\S]*?<\/style>/gi,
    "",
  );
  result = result.replace(
    /<script\b[^>]*id=["']__vai_quality_guard__["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  result = result.replace(
    /<\/head>/i,
    `<style id="__vai_quality_base__">${SAFE_BASE_CSS}</style>\n</head>`,
  );
  result = result.replace(/<\/body>/i, `${QUALITY_GUARD_SCRIPT}\n</body>`);
  return result.trim();
}

export function prepareSiteHtml(html: string): {
  html: string;
  validation: SiteQualityResult;
  repaired: boolean;
} {
  const initial = validateSiteHtml(html);
  if (initial.issues.some((issue) => !issue.repairable))
    return { html, validation: initial, repaired: false };
  const repairedHtml = applySiteSafetyDefaults(html);
  const validation = validateSiteHtml(repairedHtml);
  return { html: repairedHtml, validation, repaired: repairedHtml !== html };
}
