import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, generatedSitesTable, businessProfilesTable } from "@workspace/db";
import type { SiteGeneratorConfig } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import { getOpenAIForTenant } from "../lib/agent-engine.js";

// Prefer Anthropic when available; fallback to OpenAI
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const useAnthropic = !!anthropicApiKey;
const anthropic = useAnthropic ? new Anthropic({ apiKey: anthropicApiKey }) : null;

const AI_PROVIDER = useAnthropic ? "anthropic" : "openai";
const AI_MODEL = useAnthropic ? "claude-sonnet-4-6" : "gpt-4o-mini";

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

function buildGeneratePrompt(config: SiteGeneratorConfig): string {
  const { type, name, sector, desc, pain, tone, color, cta, products = [] } = config;

  const productsBlock =
    type === "ecommerce" && products.length
      ? `\nProdutos para listar:\n${products.map((p) => `- ${p.name}${p.price ? ": " + p.price : ""}`).join("\n")}`
      : "";

  return `Você é um especialista em desenvolvimento web e copywriting. Gere um site HTML completo e autocontido (HTML + CSS + JS em um único arquivo) para o seguinte negócio:

Tipo de site: ${TYPE_LABELS[type] || type}
Nome do negócio: ${name}
Setor / nicho: ${sector || "não informado"}
Descrição: ${desc}
Maior dor do cliente: ${pain || "não informada"}
Tom de voz: ${TONE_LABELS[tone] || tone}
Cor principal: ${color}
CTA principal: ${cta || "Entre em contato"}
${productsBlock}

REGRAS OBRIGATÓRIAS:
1. Use SPIN Selling: abra com a situação/problema que o cliente reconhece, amplie a implicação (custo do problema) ANTES de apresentar a solução
2. Use ${color} como cor de destaque principal — gradientes suaves, botões, bordas de destaque
3. Gere copy real e específica para o negócio — zero placeholder Lorem ipsum
4. Site bonito, moderno, responsivo, fontes do Google Fonts incluídas via link
5. Para landing page: hero (S+P) → custo do problema (I) → solução (N) → benefícios → depoimentos placeholder → CTA forte
6. Para e-commerce: hero → grid de produtos com preços e botão "Adicionar ao carrinho" → carrinho lateral simples com JS → CTA de finalização
7. Para institucional: hero → sobre a empresa → serviços → equipe (avatares placeholder) → contato com formulário
8. Inclua um header fixo com logo (nome do negócio) e navegação suave com âncoras
9. Footer com copyright e informações básicas
10. Retorne APENAS o código HTML completo, sem explicações, sem markdown, sem \`\`\`html`;
}

function buildRefinePrompt(userMessage: string): string {
  return `O usuário quer ajustar o site gerado. Pedido exato: "${userMessage}"

Aplique exatamente o que foi pedido e retorne APENAS o HTML completo e atualizado do site.
Mantenha todas as outras seções inalteradas. Sem explicações, sem markdown.`;
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

  // Truncate after the closing </html> tag
  const closingHtml = cleaned.match(/<\/html\s*>/i);
  if (closingHtml && closingHtml.index !== undefined) {
    cleaned = cleaned.slice(0, closingHtml.index + closingHtml[0].length);
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
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
      ...(system ? { system } : {}),
    });
    const content = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as Anthropic.TextBlock).text)
      .join("");
    return { content, provider: "anthropic", model: "claude-sonnet-4-6" };
  }

  log.info({ provider: "openai", model: AI_MODEL }, "Calling OpenAI for site generation");
  const openai = await getOpenAIForTenant(tenantId);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 8192,
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

  const refinePrompt = buildRefinePrompt(message);

  const refineMessages: AiMessage[] = [
    ...history,
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
