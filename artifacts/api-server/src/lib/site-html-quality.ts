export const SITE_GENERATOR_SYSTEM_PROMPT = `Você é o diretor de criação de um estúdio de design conhecido por dar a cada cliente uma identidade visual distinta, que ninguém confunde com a de outro cliente. Sua única saída é um documento HTML comercial completo, autocontido e pronto para apresentação.

PADRÃO VISUAL GLOBAL VENDORAI — VALE PARA TODOS OS TIPOS DE SITE
O padrão default é CLARO, premium, comercial e leve. Só use tema predominantemente escuro quando o briefing ou a identidade real do cliente exigir explicitamente.
- Base visual preferida: branco, off-white neutro ou cinza muito claro; superfícies claras; texto escuro; cor primária usada principalmente em CTA, links e destaques.
- Não transforme a página em uma sequência de blocos pretos/azul-marinho. Em uma página clara, use no máximo UMA seção escura de assinatura quando ela realmente melhorar a hierarquia.
- Evite "caixa dentro de caixa": não empilhe card dentro de card, painel dentro de painel ou bordas decorativas sem função. Prefira composição, espaço em branco, divisores discretos e grids editoriais.
- Bordas devem ser finas e discretas; sombras suaves e raras. Não use glow, neon, contorno roxo repetido nem sombras pesadas em todos os componentes.
- O hero deve ter uma mensagem principal clara, imagem/produto/elemento visual relevante e no máximo 2 CTAs. Não desperdice a primeira dobra com elementos decorativos vazios.
- Tipografia, espaçamento e alinhamento devem transmitir produto premium: títulos fortes, corpo muito legível, largura de linha confortável e densidade equilibrada.
- A cor de ação deve ter presença, mas não dominar a página inteira. Quando nenhuma identidade real do cliente determinar outra coisa, use um acento índigo/roxo sofisticado próximo de #6366F1.

RESPONSIVIDADE MOBILE — INEGOCIÁVEL
Projete primeiro para 360px e depois expanda.
- Header mobile deve caber em uma linha funcional: logo legível à esquerda e menu/CTA/hamburger à direita. Nunca permita que a palavra de um botão fique uma letra por linha.
- É proibido usar writing-mode vertical, text-orientation vertical, transform rotate em textos de navegação/CTA ou largura tão estreita que quebre palavras caractere por caractere.
- Botões devem manter leitura horizontal, altura natural, largura útil e texto íntegro. Use min-height de toque >= 44px, mas nunca force botão alto/estreito.
- Logo não pode esmagar CTA/menu. Em mobile, limite a largura visual da marca e preserve proporção.
- Não use overflow-x:hidden/clip para mascarar layout quebrado como solução de design; corrija larguras, grids e flex-wrap na origem.
- Cards e seções devem ter altura determinada pelo conteúdo, não por alturas fixas enormes.
- Teste mental obrigatório em 360px, 768px e 1440px antes de finalizar.

REGRAS POR TIPO DE PÁGINA
- Página de produto (product): vende EXCLUSIVAMENTE o único produto recebido como produto em foco. Um produto selecionado = uma página daquele produto. É proibido listar, recomendar, precificar ou criar cards de outros produtos, planos, serviços ou itens do catálogo. Se houver informações institucionais, use-as apenas para confiança/garantia, sem transformar a página em catálogo. Hero deve priorizar imagem real, nome, benefício principal, preço/condição real quando fornecido e CTA contextual.
- Catálogo/vitrine: pode apresentar vários itens reais, organizados por categoria/linha, com cards leves, imagens prioritárias, filtros/navegação simples e CTA por item. Não pareça uma landing de um único produto.
- E-commerce: pode apresentar vários produtos reais, carrinho e jornada de compra, mas com cards claros, hierarquia de preço, imagem, estoque e ação. Carrinho e botões devem funcionar e permanecer legíveis no mobile.
- Landing page: foco em UMA oferta/objetivo principal. Reduza distrações, mantenha CTA forte acima da dobra e repita-o com parcimônia.
- Página de campanha: preserve a promessa, público e oferta da campanha; mantenha continuidade entre anúncio e página; não misture ofertas desconexas.
- Institucional/site completo: apresente empresa, soluções/serviços, diferenciais, processo e contato com composição editorial; não transforme tudo em cards.
- Remodelação: preserve conteúdo, identidade e URLs aprovadas, mas aplique o mesmo padrão de legibilidade, responsividade e qualidade visual desta especificação.

CTA CONTEXTUAL
Não use "Comprar pelo WhatsApp" indiscriminadamente. Escolha CTA coerente com objetivo e produto: "Comprar agora", "Adicionar ao carrinho", "Solicitar orçamento", "Falar com especialista", "Agendar agora", "Quero este produto", "Conhecer a solução" ou equivalente. WhatsApp pode ser canal, não precisa ser o texto de todo botão.

EVITE OS CLICHÊS DE DESIGN GERADO POR IA (o motivo #1 de site parecer "amador" ou "genérico" -- fuja ativamente disso)
Hoje em dia, design gerado por IA se agrupa em torno de alguns padrões reconhecíveis. Evite-os, a menos que o briefing peça exatamente isso:
1. Fundo bege/creme claro (perto de #F4F1EA) com serifada de alto contraste e um acento terracota/argila.
2. Fundo quase preto com um único acento verde-ácido ou vermelho vibrante.
3. Cartões idênticos com o mesmo raio de borda e a mesma sombra cinza suave (rgba(0,0,0,.1)) em tudo, sem hierarquia.
4. Rótulo em CAIXA-ALTA rastreada acima de todo título; textos com "·" separando itens; "PALAVRA — fragmento" com travessão espaçado; "#0B0B0B"/"#111" fazendo de preto; fonte monoespaçada em rótulo pequeno; "→" no fim de todo link/botão.
5. Marcadores numerados (01 / 02 / 03) decorando qualquer lista -- só use numeração se o conteúdo for de verdade uma sequência/processo passo a passo.
6. Destacar só uma palavra do título em itálico/negrito/cor diferente, sem motivo.
7. Fonte padrão Inter/system-ui sem nenhuma escolha deliberada de tipografia pro negócio em questão.
8. Animação de "fade + slide up" em cada seção ao rolar, e as mesmas transições de hover em todo cartão -- é o efeito genérico #1 que entrega "gerado por IA". Se usar movimento, seja um único momento orquestrado (ex: só o hero na carga da página), não um padrão repetido em tudo.

ANCORE O DESIGN NO NEGÓCIO DE VERDADE
Antes de desenhar, decida: o que esse negócio específico vende, pra quem, e qual é o trabalho principal da página (vender, converter em lead, explicar). A paleta, a tipografia e o layout devem vir do universo desse negócio (o material, o vocabulário, o público) -- uma marcenaria sob encomenda parece muito diferente de uma clínica odontológica infantil, mesmo as duas sendo "página de serviço local". Use o conteúdo e produtos reais fornecidos no lugar de texto genérico.

TIPOGRAFIA COM INTENÇÃO
Escolha 1-2 famílias tipográficas deliberadas pro negócio em questão, não a fonte padrão que você usaria em qualquer projeto. Se usar duas, deixe claramente distintas (ex: serifada de destaque + sem serifa no corpo). Defina uma escala de tamanhos com peso/espaçamento intencional. Linha de texto abaixo de 80 caracteres.

ESTRUTURA VISUAL CARREGA INFORMAÇÃO
Bordas, divisores, numeração e rótulos devem codificar algo real sobre o conteúdo, não decorar por decorar.

CONTENÇÃO -- gaste sua ousadia em UM lugar só
Escolha um elemento de assinatura pra ser o momento memorável da página (pode ser o hero, uma seção específica, uma escolha tipográfica marcante) e mantenha o resto disciplinado ao redor dele. Antes de finalizar, revise mentalmente: se alguma parte do design parece o "padrão genérico" que qualquer gerador faria pra qualquer negócio parecido, refaça essa parte especificamente pro negócio em questão.

REQUISITOS INEGOCIÁVEIS
- Entregue <!DOCTYPE html>, <html lang="pt-BR">, <head> com charset e viewport, <title>, CSS dentro de <style> e <body> completo, semanticamente válido.
- Todo conteúdo deve ser específico, convincente e natural em português brasileiro. Não use lorem ipsum, seções vazias, cartões vazios, depoimentos ou números inventados.
- Crie um design system coerente com tokens CSS de cor, tipografia, espaçamento, raio, sombra e largura de container -- escolhidos pra ESSE negócio, não valores padrão. Reutilize esses tokens em todo o documento.
- Garanta contraste WCAG AA: texto normal >= 4.5:1 e texto grande >= 3:1. Nunca use texto branco/claro em cartões ou fundos brancos/claros, nem texto escuro em fundos escuros.
- Adote CSS mobile-first. O layout deve funcionar sem overflow em 360px, 768px e 1440px, com breakpoints explícitos para tablet e desktop.
- Estilize completamente navegação, links, botões, formulários e estados hover/focus-visible. Nenhum controle pode parecer o padrão do navegador.
- Imagens devem ter src válido, alt descritivo, width/height ou aspect-ratio e object-fit: cover/contain; nunca distorça imagens. A logo deve ter presença legível (mínimo visual de 48px de altura quando fornecida).
- Hero deve ter composição profissional, enquadramento responsivo e contraste robusto; quando houver imagem de fundo, use overlay suficiente.
- Use grids responsivos, composição visual, SVGs inline acessíveis e imagens reais fornecidas. Não invente URLs nem dependa de bibliotecas de ícones.
- Não use alturas fixas excessivas, min-height acima de 100svh, espaçamento vertical acima de 128px, cartões esticados sem conteúdo, elementos vazios ou conteúdo posicionado fora da viewport.
- Não use scripts externos, javascript: URLs, meta refresh, frames arbitrários, CSS @import, position:fixed em contêineres grandes ou overflow-x que esconda um layout quebrado.
- O resultado deve parecer trabalho de uma agência brasileira premium, com identidade própria pra esse negócio específico, e estar pronto para uma apresentação comercial.

Antes de responder, revise mentalmente contraste, hierarquia, densidade, alinhamento, responsividade, completude, se os botões estão horizontais no mobile, se o header cabe em 360px, se o tema ficou claro por padrão e se algum trecho caiu num dos clichês genéricos listados acima. Retorne somente o HTML, sem markdown ou comentários externos.`;

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
  | "vertical-text"
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
:root{--vai-bg:#ffffff;--vai-surface:#f7f8fb;--vai-text:#172033;--vai-muted:#5b667a;--vai-primary:#6366f1;--vai-on-primary:#ffffff;--vai-border:#e1e5ec;--vai-radius:14px;--vai-shadow:0 8px 24px rgba(15,23,42,.06);--vai-container:1180px}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:clip;max-width:100%}
body{margin:0;min-width:0;max-width:100%;background:var(--bg,var(--vai-bg));color:var(--text,var(--vai-text));font-family:var(--font-body,Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:16px;line-height:1.65;overflow-x:clip;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{margin:0 0 .65em;color:inherit;font-family:var(--font-display,var(--font-body,Inter,ui-sans-serif,system-ui,sans-serif));line-height:1.12;text-wrap:balance}
h1{font-size:clamp(2.15rem,6.5vw,4.75rem)}h2{font-size:clamp(1.75rem,4.2vw,3.1rem)}h3{font-size:clamp(1.2rem,2.3vw,1.55rem)}
p{max-width:72ch;margin:0 0 1rem;color:inherit}a{color:var(--link,var(--vai-primary));text-underline-offset:.18em}a:visited{color:var(--link-visited,var(--vai-primary))}img,svg,video,canvas{display:block;max-width:100%;min-width:0}img{height:auto;object-fit:cover}iframe{max-width:100%;border:0}
header,nav{max-width:100%;min-width:0}
button,input,textarea,select{font:inherit}button,.btn,[class*="btn"],a[class*="button"],[role="button"]{display:inline-flex;min-height:44px;max-width:100%;align-items:center;justify-content:center;gap:.55rem;padding:.75rem 1.15rem;border:1px solid transparent;border-radius:var(--radius,12px);background:var(--primary,var(--vai-primary));color:var(--btn-text,var(--vai-on-primary));font-weight:700;line-height:1.2;text-decoration:none;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease;writing-mode:horizontal-tb!important;text-orientation:mixed!important;word-break:normal!important;overflow-wrap:normal!important;white-space:normal;text-align:center}
button:hover,.btn:hover,[class*="btn"]:hover,a[class*="button"]:hover,[role="button"]:hover{transform:translateY(-1px);filter:brightness(.96);box-shadow:0 6px 16px rgba(15,23,42,.12)}
:focus-visible{outline:3px solid #f5b700;outline-offset:3px}
.container,[class*="container"],section>div[class*="wrap"]{width:min(100% - 2rem,var(--vai-container));max-width:100%;margin-inline:auto}
section{position:relative;padding-block:clamp(3rem,6vw,6rem)}section:empty,article:empty,[class*="card"]:empty{display:none!important}
.grid,[class*="-grid"],[class*=" grid"]{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(1rem,2.25vw,1.75rem)}
.card,[class*="card"]{min-width:0;height:auto;min-height:0;padding:clamp(1.1rem,2.2vw,1.75rem);border:1px solid var(--border,var(--vai-border));border-radius:var(--radius,var(--vai-radius));background:var(--card-bg,var(--bg,var(--vai-bg)));color:var(--card-text,var(--text,var(--vai-text)));box-shadow:var(--shadow,var(--vai-shadow))}
.hero,[id="hero"],[class~="hero"]{min-height:min(74svh,680px);display:grid;align-items:center;overflow:hidden}.hero img,[id="hero"] img,[class~="hero"] img{width:100%;max-width:100%;max-height:680px;aspect-ratio:4/3;object-fit:cover;object-position:center}
header img,nav img,.logo img,img.logo,[class*="logo"] img{width:auto!important;height:clamp(44px,5vw,68px)!important;max-width:min(220px,46vw)!important;object-fit:contain!important}
@media(min-width:48rem){.grid,[class*="-grid"],[class*=" grid"]{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:64rem){.grid,[class*="-grid"],[class*=" grid"]{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}}
@media(max-width:47.99rem){section{padding-block:clamp(2.5rem,8vw,3.75rem)}.container,[class*="container"],section>div[class*="wrap"]{width:min(100% - 1.25rem,var(--vai-container))}header{min-height:60px}header img,nav img,.logo img,img.logo,[class*="logo"] img{height:auto!important;max-height:52px!important;max-width:min(170px,44vw)!important}nav ul{gap:.5rem;max-width:100%}.hero,[id="hero"],[class~="hero"]{min-height:auto}.hero img,[id="hero"] img,[class~="hero"] img{aspect-ratio:4/3}button,.btn,[class*="btn"],a[class*="button"],[role="button"]{width:auto;min-width:0;max-width:100%;padding:.72rem 1rem;writing-mode:horizontal-tb!important;text-orientation:mixed!important;word-break:normal!important;overflow-wrap:normal!important}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

const QUALITY_GUARD_SCRIPT = `<script id="__vai_quality_guard__">(()=>{const ready=()=>{const rgba=c=>{const m=c.match(/[\\d.]+/g);if(!m||m.length<3)return null;return[+m[0],+m[1],+m[2],m[3]===undefined?1:+m[3]]},lum=c=>{const v=c.slice(0,3).map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]},ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05),effectiveBg=el=>{for(let node=el;node;node=node.parentElement){const c=rgba(getComputedStyle(node).backgroundColor);if(c&&c[3]>.05)return c}return[255,255,255,1]};document.documentElement.style.overflowX='clip';document.body.style.maxWidth='100%';document.querySelectorAll('button,.btn,[class*="btn"],a[class*="button"],[role="button"]').forEach(el=>{el.style.setProperty('writing-mode','horizontal-tb','important');el.style.setProperty('text-orientation','mixed','important');el.style.setProperty('word-break','normal','important');el.style.setProperty('overflow-wrap','normal','important');el.style.maxWidth='100%'});document.querySelectorAll('body *').forEach(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),text=(el.textContent||'').trim(),hasMedia=!!el.querySelector('img,video,iframe,svg');if(!hasMedia&&((!text&&r.height>320)||r.height>Math.max(innerHeight*1.5,720))){el.style.minHeight='0';el.style.height='auto';el.style.maxHeight='none'}if(text&&el.children.length===0){const fg=rgba(s.color),bg=effectiveBg(el);if(fg&&ratio(lum(fg),lum(bg))<(parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18&&+s.fontWeight>=700?3:4.5)){el.style.setProperty('color',lum(bg)>.45?'#172033':'#ffffff','important');el.setAttribute('data-vai-contrast-repaired','true')}}if(r.left< -2||r.right>document.documentElement.clientWidth+2){el.style.maxWidth='100%';el.style.minWidth='0'}});document.querySelectorAll('img').forEach(img=>{const broken=()=>{img.hidden=true;img.setAttribute('data-vai-broken','true')};img.complete&&img.naturalWidth===0?broken():img.addEventListener('error',broken,{once:true})})};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',ready):ready()})()</script>`;

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
  if (/writing-mode\s*:\s*(?:vertical|sideways)|text-orientation\s*:\s*upright/i.test(styles))
    add(
      "vertical-text",
      "Navegação ou CTA pode usar texto vertical e quebrar a experiência mobile.",
      true,
    );
  if (
    /(?:height|min-height)\s*:\s*(?:[8-9]\d{2}|\d{4,})px/i.test(styles) ||
    /min-height\s*:\s*(?:1[1-9]\d|[2-9]\d{2})vh/i.test(styles) ||
    /(?:section|article|card|hero)[^{}]*\{[^}]*?(?:height|min-height)\s*:\s*(?:[4-9]\d{2}|\d{4,})px/i.test(styles)
  )
    add("oversized-empty-element", "CSS contém altura excessiva.", true);
  if (/(?:padding|margin)(?:-block|-top|-bottom)?\s*:\s*(?:1[3-9]\d|[2-9]\d{2,})px/i.test(styles))
    add("oversized-empty-element", "CSS contém espaçamento vertical excessivo.", true);
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
    /<img\b[^>]*\bsrc\s*=\s*["']\s*(?:["']|#|javascript:)/i.test(html) ||
    /<img\b(?![^>]*(?:width\s*=|height\s*=|width\s*:|height\s*:|aspect-ratio\s*:))[^>]*>/i.test(html)
  )
    add("broken-image", "Imagem sem origem ou dimensões estáveis.", true);
  const inlineStyles = [...html.matchAll(/<[^>]+style=["']([^"']+)["'][^>]*>/gi)].map((tag) => tag[1]);
  for (const style of [styles, ...inlineStyles]) {
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
      /opacity\s*:\s*0(?:\D|$)|visibility\s*:\s*hidden|display\s*:\s*none|color\s*:\s*transparent|font-size\s*:\s*0(?:\D|$)/i.test(
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
    .replace(/<img\b[^>]*\bsrc\s*=\s*(["'])\s*(?:#|javascript:)[^"']*\1[^>]*>/gi, "")
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
  // An incomplete document cannot be made trustworthy by CSS fallbacks.
  // Dangerous markup, on the other hand, is removed by sanitizeSiteHtml.
  if (initial.issues.some((issue) => issue.code === "incomplete-html"))
    return { html, validation: initial, repaired: false };
  const repairedHtml = applySiteSafetyDefaults(html);
  const afterFallbacks = validateSiteHtml(repairedHtml);
  const blockingIssues = afterFallbacks.issues.filter(
    (issue) => !issue.repairable,
  );
  // Repairable findings describe patterns in the model's original CSS. They
  // can remain textually present after the safety stylesheet/runtime guard has
  // neutralised them, so they must not cause a false rejection here.
  const validation: SiteQualityResult = {
    valid: blockingIssues.length === 0,
    issues: blockingIssues,
  };
  return { html: repairedHtml, validation, repaired: repairedHtml !== html };
}
