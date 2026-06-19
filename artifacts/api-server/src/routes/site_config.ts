import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  siteConfigTable,
  insertSiteConfigSchema,
  updateSiteConfigSchema,
  tenantsTable,
  tenantDomainsTable,
  businessProfilesTable,
  produtosCatalogoTable,
} from "@workspace/db";
import type { GeneratedSiteContent } from "@workspace/db";
import { getOpenAI } from "../lib/agent-engine.js";
import express from "express";

// ─── Public router (no auth) ─────────────────────────────────────────────────
export const publicSiteRouter: IRouter = Router();

async function resolveTenantByHost(req: express.Request): Promise<{ id: string; slug: string; name: string } | null> {
  const host = req.headers.host || req.headers["x-forwarded-host"] || "";
  const hostStr = Array.isArray(host) ? host[0] : host;
  const hostLower = hostStr.toLowerCase();

  // Custom domain: lookup only active verified domains
  const [customDomain] = await db
    .select({ tenantId: tenantDomainsTable.tenantId })
    .from(tenantDomainsTable)
    .where(
      and(
        eq(tenantDomainsTable.domain, hostLower),
        eq(tenantDomainsTable.status, "active")
      )
    );

  if (customDomain) {
    const [tenant] = await db
      .select({ id: tenantsTable.id, slug: tenantsTable.slug, name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, customDomain.tenantId));
    return tenant ?? null;
  }

  // Subdomain: *.vendor.ai
  const subdomainSuffix = ".vendor.ai";
  if (hostLower.endsWith(subdomainSuffix)) {
    const slug = hostLower.slice(0, -subdomainSuffix.length);
    const [tenant] = await db
      .select({ id: tenantsTable.id, slug: tenantsTable.slug, name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.subdomainSlug, slug));
    return tenant ?? null;
  }

  return null;
}

publicSiteRouter.get("/public/:tenantSlug/site", async (req, res) => {
  const { tenantSlug } = req.params;

  const [tenant] = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, tenantSlug));

  if (!tenant) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const [siteConfig] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenant.id));

  if (!siteConfig || !siteConfig.ativo) {
    res.status(404).json({ error: "Site not found or inactive" });
    return;
  }

  const [[businessProfile], produtos] = await Promise.all([
    db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenant.id)),
    db
      .select({
        id: produtosCatalogoTable.id,
        nome: produtosCatalogoTable.nome,
        descricao: produtosCatalogoTable.descricao,
        precoBase: produtosCatalogoTable.precoBase,
        unidade: produtosCatalogoTable.unidade,
      })
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenant.id),
          eq(produtosCatalogoTable.ativo, true)
        )
      )
      .orderBy(produtosCatalogoTable.nome),
  ]);

  res.json({
    tenant,
    businessProfile: businessProfile ?? null,
    produtos,
    siteConfig,
  });
});

// Host-based routing (subdomain or custom domain)
publicSiteRouter.get("/public/site", async (req, res) => {
  const tenant = await resolveTenantByHost(req);

  if (!tenant) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const [siteConfig] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenant.id));

  if (!siteConfig || !siteConfig.ativo) {
    res.status(404).json({ error: "Site not found or inactive" });
    return;
  }

  const [[businessProfile], produtos] = await Promise.all([
    db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenant.id)),
    db
      .select({
        id: produtosCatalogoTable.id,
        nome: produtosCatalogoTable.nome,
        descricao: produtosCatalogoTable.descricao,
        precoBase: produtosCatalogoTable.precoBase,
        unidade: produtosCatalogoTable.unidade,
      })
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenant.id),
          eq(produtosCatalogoTable.ativo, true)
        )
      )
      .orderBy(produtosCatalogoTable.nome),
  ]);

  res.json({
    tenant,
    businessProfile: businessProfile ?? null,
    produtos,
    siteConfig,
  });
});

// ─── Authenticated CRUD ───────────────────────────────────────────────────────
const router: IRouter = Router();

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function userTenantId(req: Express.Request): string | undefined {
  return (req as any).user?.tenantId;
}
function canAccessTenant(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || userTenantId(req) === tenantId;
}
function isPgUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === "23505") return true;
  if ("cause" in err) return isPgUniqueViolation((err as { cause: unknown }).cause);
  return false;
}

// ─── AI site generation ───────────────────────────────────────────────────────
router.post("/tenants/:tenantId/site-config/generate", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const { tipo = "landing_page" } = req.body as { tipo?: string };

  const [[businessProfile], [tenant], produtos] = await Promise.all([
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)),
    db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)),
    db.select().from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
      .limit(12),
  ]);

  const disc = (businessProfile?.discoveryData ?? {}) as Record<string, unknown>;
  const empresa = businessProfile?.nomeFantasia ?? tenant?.name ?? "Empresa";
  const vertical = businessProfile?.vertical ?? "negócios";
  const diferenciais = businessProfile?.diferenciais ?? "";
  const publicoAlvo = businessProfile?.publicoAlvo ?? "";
  const slogan = (disc["sloganMarca"] as string | undefined) ?? "";
  const cores = Array.isArray(disc["coresBrand"]) ? (disc["coresBrand"] as string[]).join(", ") : "";
  const missao = (disc["missaoEmpresa"] as string | undefined) ?? "";
  const produtosTexto = produtos.map(p => `- ${p.nome}: R$ ${p.precoBase}`).join("\n");

  const isEcommerce = tipo === "ecommerce";

  const systemPrompt = `Você é um especialista em copywriting e web design para pequenas e médias empresas brasileiras. 
Gere conteúdo completo para um site profissional em português brasileiro.
Responda APENAS com JSON válido, sem explicações, sem markdown.`;

  const userPrompt = `Gere um JSON completo para o site ${isEcommerce ? "e-commerce" : "landing page"} da empresa abaixo.

EMPRESA: ${empresa}
SEGMENTO: ${vertical}
${slogan ? `SLOGAN: ${slogan}` : ""}
${missao ? `MISSÃO: ${missao}` : ""}
${diferenciais ? `DIFERENCIAIS: ${diferenciais}` : ""}
${publicoAlvo ? `PÚBLICO-ALVO: ${publicoAlvo}` : ""}
${cores ? `CORES DA MARCA: ${cores}` : ""}
${produtosTexto ? `PRODUTOS/SERVIÇOS:\n${produtosTexto}` : ""}

Gere um JSON com EXATAMENTE esta estrutura (todos os campos obrigatórios):
{
  "hero": {
    "headline": "título principal impactante (máx 8 palavras)",
    "subheadline": "subtítulo convincente descrevendo o valor (máx 20 palavras)",
    "cta": "texto do botão principal (ex: Fale Conosco, Comprar Agora)",
    "cta2": "texto do botão secundário (ex: Ver Serviços)"
  },
  "sobre": {
    "titulo": "Sobre a ${empresa}",
    "texto": "texto sobre a empresa em 3-4 frases envolventes, destacando história e proposta de valor"
  },
  "servicos": [
    {"titulo": "nome do serviço/produto", "descricao": "descrição curta 1-2 frases", "emoji": "emoji relevante"},
    {"titulo": "...", "descricao": "...", "emoji": "..."},
    {"titulo": "...", "descricao": "...", "emoji": "..."}
  ],
  "diferenciais": [
    {"titulo": "diferencial 1", "texto": "explicação do diferencial em 1 frase", "icone": "emoji"},
    {"titulo": "diferencial 2", "texto": "...", "icone": "emoji"},
    {"titulo": "diferencial 3", "texto": "...", "icone": "emoji"},
    {"titulo": "diferencial 4", "texto": "...", "icone": "emoji"}
  ],
  "depoimentos": [
    {"nome": "Nome Sobrenome", "cargo": "cargo ou contexto", "empresa": "empresa ou cidade", "texto": "depoimento realista e convincente", "estrelas": 5},
    {"nome": "...", "cargo": "...", "empresa": "...", "texto": "...", "estrelas": 5},
    {"nome": "...", "cargo": "...", "empresa": "...", "texto": "...", "estrelas": 5}
  ],
  "faq": [
    {"pergunta": "pergunta frequente 1", "resposta": "resposta clara e objetiva"},
    {"pergunta": "...", "resposta": "..."},
    {"pergunta": "...", "resposta": "..."}
  ],
  "cta_final": {
    "titulo": "título da seção CTA final (ex: Pronto para começar?)",
    "texto": "texto motivacional curto para conversão",
    "botao": "texto do botão CTA final"
  },
  "cores": {
    "primaria": "${cores ? "baseie-se nas cores informadas" : "#1e3a5f"}",
    "secundaria": "cor secundária complementar (hex)",
    "acento": "cor de destaque vibrante (hex)"
  },
  ${isEcommerce ? `"ecommerce": {
    "titulo": "título da seção loja",
    "descricao": "texto convidando a explorar os produtos",
    "frete": "informação sobre frete (ex: Frete grátis acima de R$ 150)",
    "pagamento": "formas de pagamento aceitas",
    "garantia": "política de garantia/troca"
  },` : ""}
  "imageKeyword": "2-3 palavras em inglês para busca de imagem de fundo relevante ao negócio",
  "slogan": "slogan curto e marcante para o rodapé"
}`;

  let generated: GeneratedSiteContent;
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    generated = JSON.parse(raw) as GeneratedSiteContent;
  } catch (err) {
    req.log.error({ err }, "AI site generation failed");
    res.status(502).json({ error: "Falha na geração do conteúdo com IA" });
    return;
  }

  // Hero image via Unsplash Source (keyword from AI)
  const keyword = encodeURIComponent(generated.imageKeyword ?? vertical);
  const heroImageUrl = `https://images.unsplash.com/1600x900/?${keyword}&auto=format&fit=crop&q=80`;

  // Upsert site_config
  const existingRows = await db
    .select({ id: siteConfigTable.id })
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenantId));

  let siteConfig;
  if (existingRows.length > 0) {
    [siteConfig] = await db
      .update(siteConfigTable)
      .set({
        tipo,
        generatedContent: generated,
        heroImageUrl,
        status: "published",
        ativo: true,
        corPrimaria: generated.cores?.primaria ?? null,
        tagline: generated.hero?.subheadline ?? null,
        updatedAt: new Date(),
      })
      .where(eq(siteConfigTable.tenantId, tenantId))
      .returning();
  } else {
    [siteConfig] = await db
      .insert(siteConfigTable)
      .values({
        tenantId,
        tipo,
        generatedContent: generated,
        heroImageUrl,
        status: "published",
        ativo: true,
        corPrimaria: generated.cores?.primaria ?? null,
        tagline: generated.hero?.subheadline ?? null,
      })
      .returning();
  }

  const tenantSlug = tenant?.slug ?? tenantId;
  res.json({ siteConfig, tenantSlug });
});

// ─── CRUD ─────────────────────────────────────────────────────────────────────

// POST /site-config
router.post("/site-config", async (req, res) => {
  const parsed = insertSiteConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  if (!canAccessTenant(req, parsed.data.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  try {
    const [config] = await db.insert(siteConfigTable).values(parsed.data).returning();
    res.status(201).json(config);
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ error: "Site config already exists for this tenant" });
      return;
    }
    throw err;
  }
});

// GET /tenants/:tenantId/site-config
router.get("/tenants/:tenantId/site-config", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const [config] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenantId));

  if (!config) {
    res.status(404).json({ error: "Site config not found" });
    return;
  }
  res.json(config);
});

// PATCH /site-config/:id
router.patch("/site-config/:id", async (req, res) => {
  const parsed = updateSiteConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Site config not found" });
    return;
  }
  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const [updated] = await db
    .update(siteConfigTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(siteConfigTable.id, existing.id))
    .returning();

  res.json(updated);
});

// DELETE /site-config/:id
router.delete("/site-config/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(siteConfigTable)
    .where(eq(siteConfigTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Site config not found" });
    return;
  }
  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  await db.delete(siteConfigTable).where(eq(siteConfigTable.id, existing.id));
  res.status(204).send();
});

export default router;
