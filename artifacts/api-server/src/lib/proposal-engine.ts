/**
 * Proposal generation engine — AI-driven SPIN proposal builder
 * Uses Claude (Anthropic) with OpenAI fallback, same pattern as site_generator.ts
 */
import { Router, type IRouter } from "express";
import { desc, eq, and } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadBriefingsTable,
  leadProposalsTable,
  leadProductsTable,
  propostasTable,
  conversationsTable,
  messagesTable,
  customerIntelligenceTable,
  businessProfilesTable,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI, callAnthropic as gatewayCallAnthropic } from "./ai-gateway.js";
import { logger } from "./logger.js";

export const AI_PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
export const AI_MODEL = process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-6" : "gpt-4o-mini";

// ── AI caller — routes through gateway (BYOK + quota + logging) ──────────────
export type AiMessage = { role: "user" | "assistant"; content: string };

export async function callProposalAI(
  messages: AiMessage[],
  tenantId: string,
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<{ content: string; provider: string; model: string }> {
  if (process.env.ANTHROPIC_API_KEY) {
    log.info({ provider: "anthropic", model: AI_MODEL }, "Calling Anthropic for proposal generation");
    const system = messages.find((m) => m.role === "assistant")?.content;
    const userMessages = messages.filter((m) => m.role === "user");
    const result = await gatewayCallAnthropic(
      tenantId,
      "proposal_generator",
      userMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { model: "claude-sonnet-4-6", maxTokens: 32000, system },
    );
    return { content: result.content, provider: "anthropic", model: "claude-sonnet-4-6" };
  }

  log.info({ provider: "openai", model: AI_MODEL }, "Calling OpenAI for proposal generation");
  const result = await gatewayCallOpenAI(
    tenantId,
    "proposal_generator",
    messages as Array<{ role: "user" | "assistant"; content: string }>,
    { model: "gpt-4o-mini", maxTokens: 16000 },
  );
  return { content: result.content, provider: "openai", model: "gpt-4o-mini" };
}

// ── Theme generation from client color ───────────────────────────────────────
function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function generateTheme(primaryHex: string): {
  cream: string; cream2: string; ink: string;
  navyDeep: string; navyMid: string;
  accent: string; accentSoft: string;
  secondary: string; secondarySoft: string;
  concrete: string; concreteLine: string;
  ok: string; warn: string;
} {
  const [h, s, l] = hexToHsl(primaryHex);
  // Derive a coherent palette
  const isLight = l > 0.5;
  const accent = primaryHex;
  const accentSoft = hslToHex(h, Math.max(0.2, s * 0.5), isLight ? 0.88 : 0.25);
  const secondary = hslToHex((h + 0.5) % 1, s, l); // complementary hue
  const secondarySoft = hslToHex((h + 0.5) % 1, Math.max(0.2, s * 0.5), isLight ? 0.88 : 0.25);
  const cream = hslToHex(h, Math.min(0.08, s * 0.15), 0.97);
  const cream2 = hslToHex(h, Math.min(0.1, s * 0.2), 0.93);
  const ink = hslToHex(h, Math.min(0.15, s * 0.3), 0.15);
  const navyDeep = hslToHex(h, Math.min(0.2, s * 0.4), 0.06);
  const navyMid = hslToHex(h, Math.min(0.25, s * 0.5), 0.12);
  const concrete = hslToHex(h, Math.min(0.06, s * 0.1), 0.78);
  const concreteLine = hslToHex(h, Math.min(0.05, s * 0.08), 0.85);
  return { cream, cream2, ink, navyDeep, navyMid, accent, accentSoft, secondary, secondarySoft, concrete, concreteLine, ok: "#3FAE7A", warn: "#E0793C" };
}

// ── Prompt builder ───────────────────────────────────────────────────────────
export function buildProposalPrompt(ctx: {
  leadName: string;
  empresa?: string | null;
  objetivo?: string | null;
  mercadoSegmento?: string | null;
  logoUrl?: string | null;
  corDestaque?: string | null;
  products: { nome: string; imagemUrl?: string | null }[];
  propostas: { titulo: string; valorTotal?: string | null; itens?: unknown[]; observacoes?: string | null }[];
  briefing: {
    situationAnswers?: { question: string; answer: string }[];
    problemAnswers?: { question: string; answer: string }[];
    implicationAnswers?: { question: string; answer: string }[];
    needAnswers?: { question: string; answer: string }[];
    freeNotes?: string | null;
  } | null;
  intelligence: {
    churnReasons?: string[];
    opportunities?: string[];
    intentAnalysis?: string | null;
  } | null;
  conversationSamples: string;
  tenantName?: string | null;
  tenantPhone?: string | null;
}): string {
  const productsBlock = ctx.products.length
    ? `\nProdutos do cliente:\n${ctx.products.map((p) => `- ${p.nome}`).join("\n")}`
    : "\nNenhum produto cadastrado.";

  const propostasBlock = ctx.propostas.length
    ? `\nOrçamentos já gerados:\n${ctx.propostas.map((p) => `- ${p.titulo}: R$ ${p.valorTotal || "?"}`).join("\n")}`
    : "\nNenhum orçamento gerado ainda.";

  const briefingBlock = ctx.briefing
    ? `\nBriefing do lead (dados validados no relacionamento):\n- Situação: ${ctx.briefing.situationAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Problemas: ${ctx.briefing.problemAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Implicações: ${ctx.briefing.implicationAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Necessidades: ${ctx.briefing.needAnswers?.map((a) => a.answer).filter(Boolean).join("; ") || "Não informado"}\n- Notas: ${ctx.briefing.freeNotes || ""}`
    : "\nBriefing ainda não gerado.";

  const intelligenceBlock = ctx.intelligence
    ? `\nInteligência do cliente:\n- Razões de churn: ${(ctx.intelligence.churnReasons || []).join("; ") || "Não identificado"}\n- Oportunidades: ${(ctx.intelligence.opportunities || []).join("; ") || "Não identificado"}\n- Análise de intenção: ${ctx.intelligence.intentAnalysis || "Não identificado"}`
    : "";

  const tenantLabel = ctx.tenantName ? `da empresa "${ctx.tenantName}"` : "da empresa contratada";
  const segmentoBlock = ctx.mercadoSegmento
    ? `\n## Segmento do cliente: "${ctx.mercadoSegmento}"\nIMPORTANTE: toda a proposta DEVE usar terminologia, exemplos, dores e oportunidades específicas deste segmento. Não use linguagem genérica de "empresa". Use jargão real do setor. Os problemas, implicações e módulos devem ser exemplos concretos do dia a dia de ${ctx.mercadoSegmento}. Se for varejo: fale em loja, vendedor, estoque, ticket médio, sazonalidade. Se for construção: obra, engenheiro, orçamento, cliente de obra. Se for saúde: paciente, consulta, agenda. Adapte para o segmento real.`
    : "";

  return `Você é um redator comercial sênior ${tenantLabel}. Gere o conteúdo de uma proposta comercial personalizada em formato JSON estrito para o cliente abaixo.

## Dados do cliente
- Nome: ${ctx.leadName}
- Empresa: ${ctx.empresa || "Não informado"}
- Objetivo: ${ctx.objetivo || "Não informado"}
- Mercado/Segmento: ${ctx.mercadoSegmento || "Não informado"}
- Cor de destaque: ${ctx.corDestaque}
${segmentoBlock}
${productsBlock}
${propostasBlock}
${briefingBlock}
${intelligenceBlock}

## Amostra de conversa (ajuste o tom ao estilo real do cliente)
${ctx.conversationSamples || "Nenhuma conversa disponível. Use tom profissional e direto."}

## Instruções OBRIGATÓRIAS
1. Retorne APENAS um JSON válido, sem markdown, sem explicações, sem \`\`\`json.
2. O JSON deve seguir EXATAMENTE esta estrutura:
{
  "hero": {
    "tagline": "string curta (segmento do cliente)",
    "headline": "string de impacto — título principal da proposta",
    "subheadline": "string — parágrafo explicando o valor",
    "ctaPrimary": "string",
    "ctaSecondary": "string",
    "forTag": "string — "Preparado para [Empresa] — [segmento]"
  },
  "situation": {
    "title": "string",
    "subtitle": "string",
    "facts": [
      { "num": "string", "label": "string" }
    ],
    "bridge": "string — parágrafo de transição"
  },
  "problem": {
    "title": "string",
    "subtitle": "string",
    "cards": [
      { "cod": "string", "title": "string", "text": "string" }
    ]
  },
  "implication": {
    "title": "string",
    "subtitle": "string",
    "cascade": [
      { "num": "string", "text": "string" }
    ],
    "close": "string"
  },
  "value": {
    "title": "string",
    "questions": [
      "string — pergunta retórica"
    ],
    "close": "string"
  },
  "solution": {
    "title": "string",
    "subtitle": "string",
    "agents": [
      { "tag": "string", "title": "string", "text": "string" }
    ],
    "ticket": {
      "storeName": "string",
      "clientBubble": "string",
      "agentBubble": "string",
      "responseTime": "string"
    }
  },
  "modules": {
    "title": "string",
    "subtitle": "string",
    "mods": [
      { "cod": "string", "title": "string", "text": "string" }
    ]
  },
  "cta": {
    "title": "string",
    "subtitle": "string",
    "button": "string"
  },
  "meta": {
    "whatsappUrl": "string",
    "clientName": "string"
  }
}
3. Framework SPIN: Situação → Problema → Implicação → Valor → Solução → Módulos → CTA
4. Anfore os PROBLEMAS e IMPLICAÇÕES aos dados do briefing — não invente problemas genéricos se briefing existir.
5. Tom: ajuste baseado na amostra de conversa. Formal se o cliente for formal, direto se for direto.
6. Se houver orçamentos, mencione valores/investimento na seção de valor/CTA.
7. Se não houver briefing, use argumentos genéricos do segmento.
8. Se não houver orçamentos, omita seção de investimento e foque em valor qualitativo.
9. Módulos: selecione 4-6 módulos/serviços mais relevantes ao segmento e ao contexto do cliente, baseados nos produtos cadastrados (se houver) ou nos argumentos de valor da solução apresentada.
10. Todos os textos em português brasileiro.
11. Nunca retorne HTML. Sempre JSON com a estrutura acima.`;
}

// ── HTML renderer from JSON + theme ─────────────────────────────────────────
function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const { execSync } = require("child_process") as typeof import("child_process");
  for (const cmd of ["which chromium", "which chromium-browser", "which google-chrome"]) {
    try { const p = execSync(cmd, { encoding: "utf-8" }).trim(); if (p) return p; } catch {}
  }
  return "/usr/bin/chromium";
}

export async function generateProposalPDF(htmlContent: string): Promise<Buffer> {
  try {
    const puppeteer = (await import("puppeteer-core")).default;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveChromiumPath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" } });
    await browser.close();
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn({ err }, "proposal-engine: puppeteer failed, returning HTML fallback");
    return Buffer.from(htmlContent, "utf-8");
  }
}

export function renderProposalHtml(json: unknown, theme: {
  cream: string; cream2: string; ink: string;
  navyDeep: string; navyMid: string;
  accent: string; accentSoft: string;
  secondary: string; secondarySoft: string;
  concrete: string; concreteLine: string;
  ok: string; warn: string;
}, logoUrl?: string | null, clientName?: string, tenantName?: string, websiteUrl?: string | null, tenantLogoUrl?: string | null, imagens?: string[] | null, orcamento?: {
  titulo: string;
  numero?: string | null;
  itens: Array<{ nome: string; quantidade: number; valorUnitario: number; sku?: string | null; descricao?: string | null }>;
  valorTotal?: string | null;
  observacoes?: string | null;
  formaPagamento?: string | null;
  condPagamento?: string | null;
  prazoEntrega?: string | null;
} | null): string {
  const d = json as Record<string, any>;
  const hero = d.hero || {};
  const situation = d.situation || {};
  const problem = d.problem || {};
  const implication = d.implication || {};
  const value = d.value || {};
  const solution = d.solution || {};
  const modules = d.modules || {};
  const cta = d.cta || {};
  const meta = d.meta || {};

  const facts = (situation.facts || []).map((f: any) =>
    `<div class="fact reveal"><span class="num">${f.num}</span><span class="flabel">${f.label}</span></div>`
  ).join("");

  const problemCards = (problem.cards || []).map((c: any) =>
    `<div class="pcard reveal"><span class="cod">${c.cod}</span><h4>${c.title}</h4><p>${c.text}</p></div>`
  ).join("");

  const cascade = (implication.cascade || []).map((s: any) =>
    `<div class="cascade-step reveal"><span class="snum">${s.num}</span><p>${s.text}</p></div>`
  ).join("");

  const questions = (value.questions || []).map((q: string) =>
    `<blockquote class="need-q reveal">"${q}"</blockquote>`
  ).join("");

  const agents = (solution.agents || []).map((a: any) =>
    `<div class="agent reveal"><span class="tag">${a.tag}</span><h4>${a.title}</h4><p>${a.text}</p></div>`
  ).join("");

  const mods = (modules.mods || []).map((m: any) =>
    `<div class="mod reveal"><span class="cod">${m.cod}</span><h4>${m.title}</h4><p>${m.text}</p></div>`
  ).join("");

  const navLogoUrl = tenantLogoUrl || null;
  const navName = tenantName || "Proposta Comercial";

  const logoHtml = navLogoUrl
    ? `<img src="${navLogoUrl}" alt="${navName}" style="height:34px;object-fit:contain;max-width:160px;" onerror="this.style.display='none'" />`
    : `<div class="badge" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20"><defs><linearGradient id="g1" x1="0" y1="0" x2="20" y2="20"><stop offset="0%" stop-color="${theme.accentSoft}"/><stop offset="100%" stop-color="${theme.secondary}"/></linearGradient></defs><circle cx="10" cy="10" r="3.1" fill="url(#g1)"/><circle cx="3" cy="4" r="1.5" fill="url(#g1)" opacity="0.85"/><circle cx="17" cy="4" r="1.5" fill="url(#g1)" opacity="0.85"/><circle cx="3" cy="16" r="1.5" fill="url(#g1)" opacity="0.85"/><circle cx="17" cy="16" r="1.5" fill="url(#g1)" opacity="0.85"/><g stroke="url(#g1)" stroke-width="0.8" opacity="0.7"><line x1="3" y1="4" x2="10" y2="10"/><line x1="17" y1="4" x2="10" y2="10"/><line x1="3" y1="16" x2="10" y2="10"/><line x1="17" y1="16" x2="10" y2="10"/></g></svg></div>`;

  const wordmark = `<div class="wordmark" style="font-family:var(--body);font-weight:700;font-size:1.1rem;">${navName}</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposta — ${clientName || meta.clientName || "Cliente"}</title>
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
  .nav-tag{font-family:var(--mono);font-size:0.7rem;letter-spacing:0.08em;color:var(--ink);opacity:0.55;text-transform:uppercase;display:none}
  @media(min-width:640px){.nav-tag{display:block}}
  .btn{font-family:var(--body);font-weight:600;font-size:0.85rem;padding:10px 18px;border-radius:100px;border:none;cursor:pointer;text-decoration:none;display:inline-block}
  .btn-primary{background:linear-gradient(90deg,var(--indigo),var(--cyan));color:var(--navy-deep)}
  .btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--ink)}
  section{padding:96px 6vw}
  .container{max-width:1080px;margin:0 auto}
  .cod{font-family:var(--mono);font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--navy-mid);background:var(--cream-2);border:1px solid var(--concrete-line);padding:5px 11px;border-radius:5px;display:inline-block}
  .eyebrow-row{display:flex;align-items:center;gap:12px;margin-bottom:22px}
  .eyebrow-line{flex:1;height:1px;background:var(--concrete-line);display:none}
  @media(min-width:760px){.eyebrow-line{display:block}}
  h1,h2,h3{font-family:var(--display);font-weight:400;line-height:1.08}
  h2{font-size:clamp(1.9rem,4vw,3rem);max-width:18ch}
  p.lead{font-size:1.05rem;color:#3a3358;max-width:62ch}
  .reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}
  .reveal.in{opacity:1;transform:translateY(0)}
  @media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
  @media(scripting:none){.reveal{opacity:1 !important;transform:none !important;transition:none !important}}
  .hero{padding-top:90px;padding-bottom:80px;background:radial-gradient(620px 320px at 86% 6%,rgba(167,139,250,0.16),transparent 70%),var(--cream)}
  .hero .container{display:grid;gap:18px}
  .hero-tag{font-family:var(--mono);font-size:0.78rem;color:var(--navy-mid);opacity:.7;letter-spacing:.06em}
  .hero h1{font-size:clamp(2.4rem,6vw,4.4rem);max-width:15ch;margin:6px 0 18px}
  .hero p.lead{font-size:1.18rem;margin-bottom:30px}
  .hero-ctas{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:54px}
  .for-tag{font-family:var(--mono);font-size:0.75rem;color:#6b6485;border-left:2px solid var(--indigo);padding-left:10px}
  .fact-row{display:grid;gap:14px;grid-template-columns:1fr;margin-top:36px}
  @media(min-width:640px){.fact-row{grid-template-columns:repeat(2,1fr)}}
  @media(min-width:980px){.fact-row{grid-template-columns:repeat(4,1fr)}}
  .fact{background:#fff;border:1px solid var(--concrete-line);border-radius:12px;padding:20px}
  .fact .num{font-family:var(--display);font-size:1.9rem;display:block}
  .fact .flabel{font-family:var(--mono);font-size:0.7rem;color:#6b6485;text-transform:uppercase;margin-top:6px;display:block;line-height:1.4}
  .situation-bridge{margin-top:34px;font-size:0.95rem;color:#4a4368;max-width:60ch;border-left:2px solid var(--indigo);padding-left:14px}
  .cascade{display:flex;flex-direction:column;gap:0;margin-top:40px;max-width:680px}
  .cascade-step{display:flex;gap:18px;align-items:flex-start;padding:20px 0;border-bottom:1px solid rgba(255,255,255,0.14)}
  .cascade-step:last-child{border-bottom:none}
  .cascade-step .snum{font-family:var(--mono);font-size:0.8rem;color:var(--cyan);flex-shrink:0;width:30px;padding-top:3px}
  .cascade-step p{font-size:0.96rem;color:#e6e2f5}
  .cascade-step strong{color:#fff}
  .cascade-close{margin-top:30px;font-family:var(--display);font-style:italic;font-size:1.3rem;color:#fff;max-width:30ch}
  .need-q{font-family:var(--display);font-style:italic;font-size:1.25rem;line-height:1.3;max-width:36ch;padding-left:18px;margin-bottom:26px;border-left:3px solid var(--indigo)}
  .need-close{font-size:1rem;color:#3a3358;margin-top:8px}
  .grid-cards{display:grid;gap:16px;grid-template-columns:1fr;margin-top:36px}
  @media(min-width:760px){.grid-cards{grid-template-columns:1fr 1fr}}
  .pcard{background:#fff;border:1px solid var(--concrete-line);border-radius:14px;padding:24px;position:relative;overflow:hidden}
  .pcard::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--indigo),var(--cyan))}
  .pcard h4{font-family:var(--body);font-weight:700;font-size:1rem;margin-bottom:8px}
  .pcard p{font-size:0.92rem;color:#4a4368}
  .pcard .cod{margin-bottom:10px;font-size:0.65rem}
  .agitate{background:linear-gradient(160deg,var(--navy-mid),var(--navy-deep));color:var(--cream)}
  .agitate .cod{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.18);color:var(--cream)}
  .agitate h2{color:#fff}
  .agitate p.lead{color:#cfc9e6}
  .agents{display:grid;gap:14px;margin-top:38px;grid-template-columns:1fr}
  @media(min-width:680px){.agents{grid-template-columns:repeat(3,1fr)}}
  .agent{background:#fff;border:1px solid var(--concrete-line);border-radius:14px;padding:22px}
  .agent .tag{font-family:var(--mono);font-size:0.68rem;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:linear-gradient(90deg,var(--indigo),var(--cyan));padding:4px 9px;border-radius:5px;display:inline-block;margin-bottom:12px}
  .agent h4{font-size:1.02rem;font-weight:700;margin-bottom:6px}
  .agent p{font-size:0.88rem;color:#4a4368}
  .ticket-wrap{display:flex;justify-content:center;margin:60px 0 10px}
  .ticket{position:relative;width:100%;max-width:430px;background:#fff;border:1px solid var(--concrete-line);border-radius:4px;padding:26px 24px 22px;box-shadow:0 30px 60px -28px rgba(27,20,56,0.35)}
  .ticket::before,.ticket::after{content:'';position:absolute;top:-11px;width:22px;height:22px;border-radius:50%;background:var(--cream);border:1px solid var(--concrete-line);border-top:none}
  .ticket::before{left:-11px}
  .ticket::after{right:-11px}
  .ticket-perf{border-top:1px dashed var(--concrete-line);margin:16px 0}
  .ticket-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
  .ticket-head .t{font-family:var(--mono);font-size:0.7rem;letter-spacing:.06em;text-transform:uppercase;color:#6b6485}
  .ticket-head .n{font-family:var(--mono);font-size:0.7rem;color:#6b6485}
  .ticket-store{font-family:var(--body);font-weight:800;font-size:0.95rem;margin-bottom:18px}
  .bubble{border-radius:10px;padding:10px 13px;font-size:0.85rem;margin-bottom:10px;max-width:88%}
  .bubble.client{background:var(--cream-2);color:var(--ink);margin-right:auto}
  .bubble.agent{background:linear-gradient(90deg,rgba(167,139,250,0.14),rgba(34,211,238,0.14));color:var(--ink);margin-left:auto;border:1px solid var(--indigo-soft)}
  .bubble .who{font-family:var(--mono);font-size:0.62rem;opacity:.6;display:block;margin-bottom:3px;text-transform:uppercase}
  .ticket-foot{display:flex;justify-content:space-between;align-items:center;font-family:var(--mono);font-size:0.75rem;color:#4a4368}
  .ticket-foot .time{color:var(--ok);font-weight:600}
  .modules{background:var(--cream-2)}
  .mod-grid{display:grid;gap:14px;grid-template-columns:1fr;margin-top:36px}
  @media(min-width:640px){.mod-grid{grid-template-columns:1fr 1fr}}
  @media(min-width:980px){.mod-grid{grid-template-columns:1fr 1fr 1fr}}
  .mod{background:var(--cream);border:1px solid var(--concrete-line);border-radius:12px;padding:20px}
  .mod .cod{font-size:0.62rem;margin-bottom:10px}
  .mod h4{font-size:0.95rem;font-weight:700;margin-bottom:6px}
  .mod p{font-size:0.85rem;color:#4a4368}
  .cta-final{background:linear-gradient(160deg,var(--navy-mid),var(--navy-deep));color:#fff;text-align:left}
  .cta-final h2{color:#fff;max-width:16ch}
  .cta-final p.lead{color:#cfc9e6}
  .cta-final .hero-ctas{margin-top:28px}
  .cta-final .btn-ghost{border-color:rgba(255,255,255,0.4);color:#fff}
  footer{padding:30px 6vw;font-family:var(--mono);font-size:0.72rem;color:#8b84a8;background:var(--navy-deep);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
  .gallery-section{padding:60px 6vw;background:var(--cream-2)}
  .gallery-grid{display:grid;gap:12px;margin-top:28px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
  .gallery-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;border:1px solid var(--concrete-line);box-shadow:0 4px 16px -6px rgba(27,20,56,0.18)}
  .client-badge{display:flex;align-items:center;gap:9px;background:rgba(255,255,255,0.82);border:1px solid var(--concrete-line);border-radius:50px;padding:5px 14px 5px 5px;width:fit-content;margin-bottom:8px;backdrop-filter:blur(4px)}
  .client-badge-logo{height:28px;width:28px;object-fit:contain;border-radius:50%;border:1px solid var(--concrete-line);background:#fff;flex-shrink:0}
  .client-badge-label{font-family:var(--mono);font-size:0.62rem;color:#8b84a8;text-transform:uppercase;letter-spacing:.08em}
  .client-badge-name{font-family:var(--mono);font-size:0.74rem;color:var(--navy-mid);font-weight:600}
  .orc-section{background:var(--cream);border-top:1px solid var(--concrete-line)}
  .orc-table{width:100%;border-collapse:collapse;margin-top:28px;font-size:0.9rem}
  .orc-table th{font-family:var(--mono);font-size:0.65rem;letter-spacing:.07em;text-transform:uppercase;color:#6b6485;border-bottom:2px solid var(--concrete-line);padding:8px 10px;text-align:left}
  .orc-table th.r,.orc-table td.r{text-align:right}
  .orc-table td{padding:12px 10px;border-bottom:1px solid var(--concrete-line);color:var(--ink);vertical-align:top}
  .orc-table tr:last-child td{border-bottom:none}
  .orc-table .desc{font-size:0.78rem;color:#6b6485;display:block;margin-top:2px}
  .orc-total-row{display:flex;justify-content:flex-end;margin-top:20px}
  .orc-total-box{background:linear-gradient(90deg,rgba(167,139,250,0.1),rgba(34,211,238,0.08));border:1px solid var(--indigo-soft);border-radius:10px;padding:14px 22px;text-align:right}
  .orc-total-label{font-family:var(--mono);font-size:0.68rem;text-transform:uppercase;letter-spacing:.07em;color:#6b6485;display:block;margin-bottom:4px}
  .orc-total-value{font-family:var(--display);font-size:1.9rem;color:var(--navy-deep);font-weight:700}
  .orc-meta{display:flex;flex-wrap:wrap;gap:20px;margin-top:28px;padding-top:22px;border-top:1px solid var(--concrete-line)}
  .orc-meta-item{display:flex;flex-direction:column;gap:3px}
  .orc-meta-item span:first-child{font-family:var(--mono);font-size:0.62rem;text-transform:uppercase;letter-spacing:.07em;color:#8b84a8}
  .orc-meta-item span:last-child{font-size:0.88rem;color:var(--ink);font-weight:600}
  .orc-obs{margin-top:18px;padding:14px 16px;background:var(--cream-2);border-radius:8px;border:1px solid var(--concrete-line);font-size:0.88rem;color:#4a4368;line-height:1.6}
</style>
</head>
<body>

<header class="nav">
  <div class="logo">
    ${logoHtml}
    ${wordmark}
  </div>
  <div class="nav-tag">Proposta — ${clientName || meta.clientName || "Cliente"}</div>
  <a class="btn btn-primary" href="${meta.whatsappUrl || "#"}" target="_blank" rel="noopener">Falar com a gente</a>
</header>

<main>
  <section class="hero">
    <div class="container">
      <div class="hero-tag">${hero.tagline || ""}</div>
      ${logoUrl ? `<div class="client-badge reveal">
        <img src="${logoUrl}" alt="${clientName || "Cliente"}" class="client-badge-logo" onerror="this.style.display='none'" />
        <div><span class="client-badge-label">Preparado para</span><br><span class="client-badge-name">${clientName || "Cliente"}</span></div>
      </div>` : clientName ? `<div class="client-badge reveal"><div><span class="client-badge-label">Preparado para</span><br><span class="client-badge-name">${clientName}</span></div></div>` : ""}
      <h1 class="reveal">${hero.headline || ""}</h1>
      <p class="lead reveal">${hero.subheadline || ""}</p>
      <div class="hero-ctas">
        <a class="btn btn-primary" href="#solucao">${hero.ctaPrimary || "Ver como funciona"}</a>
        <a class="btn btn-ghost" href="${meta.whatsappUrl || "#"}" target="_blank" rel="noopener">${hero.ctaSecondary || "Falar com a Vendor.ai"}</a>
      </div>
      <div class="for-tag">${hero.forTag || ""}</div>
    </div>
  </section>

  ${imagens && imagens.length > 0 ? `
<section class="gallery-section" id="galeria">
  <div class="container">
    <div class="eyebrow-row"><span class="cod">Galeria</span><div class="eyebrow-line"></div></div>
    <div class="gallery-grid">
      ${imagens.map((url) => `<img src="${url}" class="gallery-img reveal" alt="" loading="lazy" onerror="this.style.display='none'" />`).join("\n      ")}
    </div>
  </div>
</section>
` : ""}

  <section id="situacao">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 01 — A situação</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${situation.title || ""}</h2>
      <p class="lead reveal">${situation.subtitle || ""}</p>
      <div class="fact-row">${facts}</div>
      <p class="situation-bridge reveal">${situation.bridge || ""}</p>
    </div>
  </section>

  <section id="problema">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 02 — O problema</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${problem.title || ""}</h2>
      <p class="lead reveal">${problem.subtitle || ""}</p>
      <div class="grid-cards">${problemCards}</div>
    </div>
  </section>

  <section class="agitate" id="custo">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 03 — A implicação</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${implication.title || ""}</h2>
      <p class="lead reveal">${implication.subtitle || ""}</p>
      <div class="cascade">${cascade}</div>
      <p class="cascade-close reveal">${implication.close || ""}</p>
    </div>
  </section>

  <section id="valor">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 04 — O que isso valeria</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${value.title || ""}</h2>
      ${questions}
      <p class="need-close reveal">${value.close || ""}</p>
    </div>
  </section>

  <section id="solucao">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 05 — A solução</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${solution.title || ""}</h2>
      <p class="lead reveal">${solution.subtitle || ""}</p>
      <div class="agents">${agents}</div>
      <div class="ticket-wrap">
        <div class="ticket reveal">
          <div class="ticket-head"><span class="t">Nota de Atendimento</span><span class="n">Cód. PED-08145</span></div>
          <div class="ticket-store">${solution.ticket?.storeName || ""}</div>
          <div class="bubble client"><span class="who">Cliente · 09:14</span>${solution.ticket?.clientBubble || ""}</div>
          <div class="bubble agent"><span class="who">${navName} · 09:14</span>${solution.ticket?.agentBubble || ""}</div>
          <div class="ticket-perf"></div>
          <div class="ticket-foot"><span>Tempo de 1ª resposta</span><span class="time">${solution.ticket?.responseTime || "5 segundos"}</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="modules" id="modulos">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 06 — Como conecta com ${clientName || meta.clientName || "Cliente"}</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${modules.title || ""}</h2>
      <p class="lead reveal">${modules.subtitle || ""}</p>
      <div class="mod-grid">${mods}</div>
    </div>
  </section>

  ${orcamento ? (() => {
  const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const FORMA_LABELS: Record<string, string> = {
    pix: "PIX", boleto: "Boleto", cartao_credito: "Cartão de Crédito",
    cartao_debito: "Cartão de Débito", transferencia: "Transferência",
    dinheiro: "Dinheiro", a_combinar: "A Combinar",
  };
  const itensValidos = (orcamento.itens || []).filter((i) => i.nome);
  const calculatedTotal = itensValidos.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const totalExibido = orcamento.valorTotal ? parseFloat(orcamento.valorTotal) : calculatedTotal;
  const rows = itensValidos.map((i) => {
    const subtotal = i.quantidade * i.valorUnitario;
    return `<tr>
      <td>${i.nome}${i.descricao ? `<span class="desc">${i.descricao}</span>` : ""}${i.sku ? `<span class="desc">SKU: ${i.sku}</span>` : ""}</td>
      <td class="r">${i.quantidade}</td>
      <td class="r">${fmtBRL(i.valorUnitario)}</td>
      <td class="r">${fmtBRL(subtotal)}</td>
    </tr>`;
  }).join("");
  const metaItems = [
    orcamento.formaPagamento ? `<div class="orc-meta-item"><span>Forma de Pagamento</span><span>${FORMA_LABELS[orcamento.formaPagamento] || orcamento.formaPagamento}</span></div>` : "",
    orcamento.condPagamento ? `<div class="orc-meta-item"><span>Condição</span><span>${orcamento.condPagamento}</span></div>` : "",
    orcamento.prazoEntrega ? `<div class="orc-meta-item"><span>Prazo de Entrega</span><span>${orcamento.prazoEntrega}</span></div>` : "",
  ].filter(Boolean).join("");
  return `
  <section class="orc-section" id="orcamento">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Orçamento${orcamento.numero ? " · " + orcamento.numero : ""}</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${orcamento.titulo}</h2>
      ${itensValidos.length > 0 ? `
      <table class="orc-table reveal">
        <thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Valor Unit.</th><th class="r">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="orc-total-row">
        <div class="orc-total-box">
          <span class="orc-total-label">Total</span>
          <span class="orc-total-value">${fmtBRL(totalExibido)}</span>
        </div>
      </div>` : ""}
      ${metaItems ? `<div class="orc-meta reveal">${metaItems}</div>` : ""}
      ${orcamento.observacoes ? `<div class="orc-obs reveal">${orcamento.observacoes}</div>` : ""}
    </div>
  </section>`;
})() : ""}

  <section class="cta-final" id="contato">
    <div class="container">
      <div class="eyebrow-row"><span class="cod">Cód. 07 — Próximo passo</span><div class="eyebrow-line"></div></div>
      <h2 class="reveal">${cta.title || ""}</h2>
      <p class="lead reveal">${cta.subtitle || ""}</p>
      ${logoUrl ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:22px;opacity:0.75">
        <img src="${logoUrl}" alt="${clientName || 'Cliente'}" style="height:32px;width:auto;object-fit:contain;border-radius:4px;filter:brightness(0) invert(1)" onerror="this.style.display='none'" />
        <span style="font-family:var(--mono);font-size:0.78rem;color:#cfc9e6">${clientName || ""}</span>
      </div>` : ""}
      <div class="hero-ctas">
        <a class="btn btn-primary" href="${meta.whatsappUrl || "#"}" target="_blank" rel="noopener">${cta.button || "Falar no WhatsApp"}</a>
      </div>
    </div>
  </section>
</main>

<footer>
  <span>${navName}</span>
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
    ${logoUrl ? `<img src="${logoUrl}" alt="${clientName || 'Cliente'}" style="height:16px;width:auto;object-fit:contain;opacity:0.55;border-radius:2px" onerror="this.style.display='none'">` : ""}
    <span>Proposta preparada para ${clientName || meta.clientName || "Cliente"}${websiteUrl ? ` · <a href="${websiteUrl}" style="color:inherit;text-decoration:none" target="_blank" rel="noopener">${websiteUrl}</a>` : ""}</span>
  </div>
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
