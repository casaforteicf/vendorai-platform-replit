import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, generatedSitesTable, businessProfilesTable, tenantsTable } from "@workspace/db";
import type { SiteGeneratorConfig } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

// Prefer Anthropic when available; fallback to OpenAI
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const useAnthropic = !!anthropicApiKey;
const anthropic = useAnthropic ? new Anthropic({ apiKey: anthropicApiKey }) : null;

const AI_PROVIDER = useAnthropic ? "anthropic" : "openai";
const AI_MODEL = useAnthropic ? "claude-sonnet-4-6" : "gpt-4o-mini";

// ─── Public router (no auth) — serves generated HTML sites ───────────────────
export const publicSiteGeneratorRouter: IRouter = Router();

publicSiteGeneratorRouter.get("/public/:tenantSlug/site-html", async (req, res) => {
  const { tenantSlug } = req.params;

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, tenantSlug));

  if (!tenant) {
    res.status(404).send("<!DOCTYPE html><html><body><h1>Site não encontrado</h1></body></html>");
    return;
  }

  const [site] = await db
    .select({ html: generatedSitesTable.html })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenant.id))
    .orderBy(desc(generatedSitesTable.updatedAt))
    .limit(1);

  if (!site) {
    res.status(404).send("<!DOCTYPE html><html><body><h1>Site não encontrado</h1></body></html>");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.send(site.html);
});

const router: IRouter = Router();

const TYPE_LABELS: Record<string, string> = {
  landing: "landing page de marketing/vendas",
  ecommerce: "e-commerce com produtos e carrinho",
  institutional: "site institucional (sobre, serviços, contato)",
};

const TONE_LABELS: Record<string, string> = {
  profissional: "profissional e confiável",
  amigavel: "amigável e próximo",
  urgente: "urgente e direto ao ponto",
  premium: "premium e sofisticado",
  descontraido: "descontraído e criativo",
};

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
  const { type, name, sector, desc, pain, tone, color, cta, products = [] } = config;
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
  };

  const fonts = FONT_PAIRS[tone as string] ?? FONT_PAIRS.profissional;

  const productsBlock =
    type === "ecommerce" && products.length
      ? `\nPRODUTOS (liste todos com destaque visual):\n${products.map((p) => `- ${p.name}${p.price ? " | " + p.price : ""}`).join("\n")}`
      : "";

  const structureByType: Record<string, string> = {
    landing: `ESTRUTURA DA LANDING PAGE (nesta ordem exata):
1. HEADER fixo — logo à esquerda (inicial do nome em círculo colorido + nome), nav âncoras à direita, botão CTA no canto, hamburger mobile
2. HERO — título impactante (H1, problema que o cliente já sente), subtítulo com a promessa, 2 botões (primário + secundário outline), elemento visual decorativo (formas geométricas ou gradiente abstrato em CSS puro — sem imagens externas)
3. DORES — seção escura/contrastante com 3-4 cards de dores reais do mercado (ícones SVG inline simples, título curto + descrição)
4. SOLUÇÃO — como o negócio resolve cada dor, 3 pilares com ícone SVG + título + parágrafo
5. BENEFÍCIOS / DIFERENCIAIS — grid 2x3 ou 3x2 de cards com número destacado ou ícone grande
6. DEPOIMENTOS — 3 cards com avatar (iniciais em círculo colorido), nome fictício brasileiro, cidade, texto curto e persuasivo (inventados mas realistas para o setor)
7. CTA FINAL — seção de fundo escuro/gradiente, headline forte, subtítulo, botão grande
8. FOOTER — logo, links de âncora, copyright`,

    ecommerce: `ESTRUTURA DO E-COMMERCE (nesta ordem exata):
1. HEADER fixo — logo, nav, ícone de carrinho com badge contador, hamburger mobile
2. HERO — headline de oferta, subtítulo, botão "Ver produtos", badge de frete/desconto
3. GRID DE PRODUTOS — cards modernos com imagem placeholder (gradiente colorido com ícone SVG central), nome, descrição curta, preço em destaque, botão "Comprar pelo WhatsApp" (link wa.me)
4. BENEFÍCIOS — 3 ícones com texto: entrega, pagamento, suporte
5. DEPOIMENTOS — 2-3 clientes satisfeitos com nota 5 estrelas
6. CTA FINAL — urgência, botão WhatsApp
7. CARRINHO LATERAL (drawer) — ativado por JS ao clicar nos produtos, lista itens, total, botão finalizar via WhatsApp
8. FOOTER`,

    institutional: `ESTRUTURA DO SITE INSTITUCIONAL (nesta ordem exata):
1. HEADER fixo — logo, nav âncoras, botão CTA, hamburger mobile
2. HERO — headline sobre a empresa, subtítulo com proposta de valor, 2 botões, elemento visual
3. SOBRE — história/missão em 2 colunas (texto + estatísticas em destaque: anos, clientes, projetos)
4. SERVIÇOS — grid de 4-6 serviços com ícone SVG, título, descrição curta
5. PROCESSO — timeline ou steps numerados explicando como funciona
6. EQUIPE — 3-4 avatares placeholder (iniciais + cargo + mini-bio)
7. DEPOIMENTOS — 3 clientes com nome, empresa e foto-avatar
8. CONTATO — formulário (nome, email, telefone, mensagem) + informações de contato laterais
9. FOOTER`,
  };

  const structure = structureByType[type] || structureByType.landing;

  return `Você é um web designer e copywriter sênior especializado em sites de alta conversão para o mercado brasileiro. Sua missão é gerar um site HTML autocontido de QUALIDADE PROFISSIONAL — comparável aos melhores sites de agência — para o seguinte negócio.

═══════════════════════════════════════
BRIEFING DO CLIENTE
═══════════════════════════════════════
Tipo: ${TYPE_LABELS[type] || type}
Negócio: ${name}
Setor: ${sector || "a definir pelo contexto"}
Sobre o negócio: ${desc}
Maior dor do cliente-alvo: ${pain || "ineficiência e falta de resultados"}
Tom de voz: ${TONE_LABELS[tone] || tone}
Cor primária da marca: ${color} (RGB: ${rgb})
CTA principal: ${ctaText}
${productsBlock}

═══════════════════════════════════════
SISTEMA DE DESIGN — SIGA À RISCA
═══════════════════════════════════════

VARIÁVEIS CSS (sempre no :root):
  --primary: ${color};
  --primary-rgb: ${rgb};
  --primary-dark: (versão 20% mais escura da cor primária calculada manualmente);
  --primary-light: (versão 90% mais clara, para backgrounds sutis);
  --btn-text: ${btnTextColor};
  --bg: #ffffff;
  --bg-alt: #f8f9fc;
  --bg-dark: #0f0f17;
  --text: #111827;
  --text-muted: #6b7280;
  --text-light: #9ca3af;
  --border: #e5e7eb;
  --radius: 14px;
  --radius-sm: 8px;
  --shadow: 0 4px 24px rgba(0,0,0,0.08);
  --shadow-lg: 0 20px 60px rgba(0,0,0,0.12);

TIPOGRAFIA (Google Fonts já carregadas):
  <link href="${fonts.googleUrl}" rel="stylesheet">
  Títulos (h1-h3): font-family: ${fonts.display}; letter-spacing: -0.02em;
  Corpo: font-family: ${fonts.body};
  h1: clamp(2.2rem, 5vw, 3.8rem); font-weight: 800; line-height: 1.1;
  h2: clamp(1.7rem, 3.5vw, 2.6rem); font-weight: 700; line-height: 1.2;
  h3: 1.25rem; font-weight: 700;
  p: 1rem; line-height: 1.7; color: var(--text-muted);

BOTÕES:
  .btn-primary → background: var(--primary); color: ${btnTextColor}; padding: 14px 28px; border-radius: 100px; font-weight: 700; font-size: 0.95rem; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 20px rgba(var(--primary-rgb), 0.35);
  .btn-primary:hover → transform: translateY(-2px); box-shadow: 0 8px 28px rgba(var(--primary-rgb), 0.45);
  .btn-outline → background: transparent; color: var(--text); border: 2px solid var(--border); padding: 12px 26px; border-radius: 100px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  .btn-outline:hover → border-color: var(--primary); color: var(--primary);

CARDS:
  background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; transition: all 0.25s;
  :hover → border-color: rgba(var(--primary-rgb), 0.3); box-shadow: var(--shadow); transform: translateY(-3px);
  Accent top line: border-top: 3px solid var(--primary);

NAV:
  position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);

SEÇÕES:
  padding: 88px 0; (mobile: 56px 0)
  max-width: 1120px; margin: 0 auto; padding-left: 24px; padding-right: 24px;
  Seções alternadas: bg-alt (#f8f9fc) para criar ritmo visual
  Seções escuras: bg-dark (#0f0f17) com texto claro

ANIMAÇÕES (CSS puro, sem bibliotecas externas):
  .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .reveal.visible { opacity: 1; transform: translateY(0); }
  JS: IntersectionObserver detecta .reveal e adiciona .visible
  Delays: .d1{transition-delay:0.1s} .d2{transition-delay:0.2s} .d3{transition-delay:0.3s}

GRADE RESPONSIVA:
  Mobile-first. Grids com grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  Hamburger menu: toggle classe .open no nav mobile

ÍCONES: Use SVG inline simples (viewBox, stroke ou fill) — não use bibliotecas externas.

═══════════════════════════════════════
${structure}
═══════════════════════════════════════

COPY — OBRIGATÓRIO:
- Método SPIN: Situação (dor reconhecida) → Problema (implicações) → Implicação (custo de não resolver) → Necessidade (sua solução)
- Hero headline: fala do problema/transformação, não do produto. Ex: "Chega de perder cliente por falta de resposta" em vez de "Sistema de atendimento"
- Todas as seções com copy REAL específica para "${name}" no setor "${sector || "este mercado"}" — ZERO Lorem ipsum
- Depoimentos fictícios mas realistas: nomes brasileiros, cidades, dores específicas do setor, resultados concretos (números quando possível)
- CTA: verbo de ação + benefício. Ex: "Quero mais clientes", "Começar agora grátis", "Falar com especialista"

QUALIDADE OBRIGATÓRIA:
✓ Visual profissional — equivalente a sites feitos por agências de marketing digital
✓ Nenhuma imagem externa (use gradientes CSS, SVGs inline, iniciais em círculo)
✓ 100% responsivo — mobile impecável
✓ Smooth scroll, hover states, animações sutis
✓ Formulário de contato com validação JS básica (campos obrigatórios)
✓ WhatsApp CTA abre wa.me (número fictício se não informado: 5511999999999)
✓ Acessibilidade: alt em imagens, aria-labels, foco visível

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
  // Remove markdown fences anywhere in the text
  let cleaned = text
    .replace(/```html\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find the first HTML tag or DOCTYPE and discard everything before it
  const doctypeMatch = cleaned.match(/<!DOCTYPE/i);
  const htmlTagMatch = cleaned.match(/<html/i);
  const firstIndex = Math.min(
    doctypeMatch?.index ?? Infinity,
    htmlTagMatch?.index ?? Infinity
  );
  if (firstIndex !== Infinity && firstIndex > 0) {
    cleaned = cleaned.slice(firstIndex);
  }

  // Truncate after the LAST closing </html> tag (not the first)
  // This handles cases where </html> appears inside <script> tags
  const lastClosingHtml = [...cleaned.matchAll(/<\/html\s*>/gi)].pop();
  if (lastClosingHtml && lastClosingHtml.index !== undefined) {
    cleaned = cleaned.slice(0, lastClosingHtml.index + lastClosingHtml[0].length);
  }

  return cleaned.trim();
}

/** Safe wrapper that logs for debugging */
function extractHtmlSafe(text: string, log: { info: (obj: object, msg: string) => void }): string {
  const rawPreview = text.slice(0, 200).replace(/\n/g, "\\n");
  const html = extractHtml(text);
  log.info({ rawLength: text.length, htmlLength: html.length, rawPreview }, "extractHtml debug");
  return html;
}

function isValidHtml(html: string): boolean {
  return html.length >= 500 && (/<html/i.test(html) || /<!DOCTYPE/i.test(html));
}

// Unified AI caller with provider logging
type AiMessage = { role: "user" | "assistant"; content: string };

async function callAI(
  messages: AiMessage[],
  tenantId: string,
  log: { info: (obj: object, msg: string) => void }
): Promise<{ content: string; provider: string; model: string }> {
  if (useAnthropic && anthropic) {
    log.info({ provider: "anthropic", model: AI_MODEL }, "Calling Anthropic for site generation");
    const system = messages.find((m) => m.role === "assistant")?.content;
    const userMessages = messages.filter((m) => m.role === "user");
    const stream = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 64000,
      stream: true,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
      ...(system ? { system } : {}),
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
  }

  log.info({ provider: "openai", model: AI_MODEL }, "Calling OpenAI for site generation");
  const openai = await getOpenAIForTenant(tenantId);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 16000,
    messages: messages as Array<{ role: "user" | "assistant"; content: string }>,
  });
  return {
    content: response.choices[0]?.message?.content ?? "",
    provider: "openai",
    model: "gpt-4o-mini",
  };
}

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

// POST /tenants/:tenantId/site-generator/generate — generate new site
router.post("/tenants/:tenantId/site-generator/generate", async (req, res) => {
  const { tenantId } = req.params;
  const config: SiteGeneratorConfig = req.body;

  if (!config?.type) {
    res.status(400).json({ error: "type é obrigatório" });
    return;
  }

  // Fallback to business_profile for missing fields
  const [bp] = await db
    .select({ nomeFantasia: businessProfilesTable.nomeFantasia, razaoSocial: businessProfilesTable.razaoSocial, vertical: businessProfilesTable.vertical, diferenciais: businessProfilesTable.diferenciais, publicoAlvo: businessProfilesTable.publicoAlvo })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const name = config.name || bp?.nomeFantasia || bp?.razaoSocial || "";
  const sector = config.sector || bp?.vertical || "";
  const desc = config.desc || bp?.diferenciais || bp?.publicoAlvo || "";

  if (!name || !desc) {
    res.status(400).json({ error: "name e desc são obrigatórios. Preencha no cadastro da empresa (Configurações) ou no formulário." });
    return;
  }

  const enrichedConfig = { ...config, name, sector, desc };
  const prompt = buildGeneratePrompt(enrichedConfig);

  let result;
  try {
    result = await callAI([{ role: "user", content: prompt }], tenantId, req.log);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao chamar a IA";
    req.log.error({ error: msg, provider: AI_PROVIDER }, "Site generation failed");
    res.status(502).json({ error: `Erro na geração: ${msg}` });
    return;
  }

  req.log.info({ provider: result.provider, model: result.model, tenantId }, "Site generated successfully");

  const rawText = result.content;
  const html = extractHtmlSafe(rawText, req.log);

  if (!isValidHtml(html)) {
    req.log.error({ rawLength: rawText.length, htmlLength: html.length, provider: result.provider, htmlPreview: html.slice(0, 200) }, "Site generation returned invalid HTML");
    res.status(502).json({ error: "Resposta da IA inválida ou muito curta" });
    return;
  }

  const [site] = await db
    .insert(generatedSitesTable)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      name: enrichedConfig.name,
      siteType: config.type,
      config: enrichedConfig,
      html,
    })
    .returning();

  return res.status(201).json({ ...site, _provider: result.provider, _model: result.model });
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

  const rawText = result.content;
  const html = extractHtml(rawText);

  if (!isValidHtml(html)) {
    req.log.error({ rawLength: rawText.length, htmlLength: html.length, provider: result.provider }, "Site refinement returned invalid HTML");
    res.status(502).json({ error: "Resposta da IA inválida" });
    return;
  }

  await db
    .update(generatedSitesTable)
    .set({ html, updatedAt: new Date() })
    .where(eq(generatedSitesTable.id, siteId));

  return res.json({ html, _provider: result.provider, _model: result.model });
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

export default router;
