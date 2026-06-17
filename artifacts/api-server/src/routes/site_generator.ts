import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, generatedSitesTable } from "@workspace/db";
import type { SiteGeneratorConfig } from "@workspace/db";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  return text
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
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

  if (!config?.name || !config?.desc || !config?.type) {
    res.status(400).json({ error: "name, desc e type são obrigatórios" });
    return;
  }

  const prompt = buildGeneratePrompt(config);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.choices[0]?.message?.content ?? "";
  const html = extractHtml(rawText);

  if (!html || html.length < 500) {
    res.status(502).json({ error: "Resposta da IA inválida ou muito curta" });
    return;
  }

  const [site] = await db
    .insert(generatedSitesTable)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      name: config.name,
      siteType: config.type,
      config,
      html,
    })
    .returning();

  return res.status(201).json(site);
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

  const refineMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user", content: refinePrompt },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: refineMessages,
  });

  const rawText = response.choices[0]?.message?.content ?? "";
  const html = extractHtml(rawText);

  if (!html || html.length < 500) {
    res.status(502).json({ error: "Resposta da IA inválida" });
    return;
  }

  await db
    .update(generatedSitesTable)
    .set({ html, updatedAt: new Date() })
    .where(eq(generatedSitesTable.id, siteId));

  return res.json({ html });
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
