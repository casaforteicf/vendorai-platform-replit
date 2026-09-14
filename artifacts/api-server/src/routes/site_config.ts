import { Router, type IRouter } from "express";
import { and, eq, or, count, gte } from "drizzle-orm";
import {
  db,
  siteConfigTable,
  insertSiteConfigSchema,
  updateSiteConfigSchema,
  tenantsTable,
  tenantDomainsTable,
  businessProfilesTable,
  produtosCatalogoTable,
  dealsTable,
  leadsTable,
} from "@workspace/db";
import type { GeneratedSiteContent } from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
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

  // Subdomain: *.appvendorai.com
  const subdomainSuffix = ".appvendorai.com";
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
    .where(or(eq(tenantsTable.slug, tenantSlug), eq(tenantsTable.subdomainSlug, tenantSlug)));

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

  const {
    tipo = "landing_page",
    tom = "",
    corPrimaria = "",
    painPoint = "",
    ctaText = "",
  } = req.body as {
    tipo?: string;
    tom?: string;
    corPrimaria?: string;
    painPoint?: string;
    ctaText?: string;
  };

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

  const tomLabel: Record<string, string> = {
    profissional: "Profissional e confiável — use linguagem formal, transmita segurança",
    amigavel: "Amigável e próximo — use 'você', tom caloroso e acolhedor",
    urgente: "Urgente e direto — use linguagem objetiva sem inventar escassez, prazo ou disponibilidade",
    premium: "Premium e sofisticado — elegante, minimalista, palavras de alto valor percebido",
    descontraido: "Descontraído e criativo — informal, bem-humorado, use expressões do dia a dia",
  };
  const tomInstrucao = tom ? (tomLabel[tom] ?? tom) : "Profissional e confiável";

  const corInstrucao = corPrimaria
    ? `Use ${corPrimaria} como cor primária e derive secundária e acento harmonicamente`
    : cores
    ? `Baseie-se nas cores da marca: ${cores}`
    : "";

  const systemPrompt = `Você é um especialista sênior em copywriting persuasivo e web design para pequenas e médias empresas brasileiras.
Seu objetivo é gerar conteúdo de alta qualidade que CONVERTE, sem inventar fatos, métricas, clientes, depoimentos, certificações, prazos, descontos, garantias ou resultados.
Regras obrigatórias:
- Headlines: impactantes, focadas no benefício/resultado do cliente, não no produto
- Prova social: nunca invente nomes, empresas, cidades, avaliações ou depoimentos; se não houver prova fornecida, use uma lista vazia
- Diferenciais: use somente informações fornecidas; não transforme adjetivos em números ou promessas não verificadas
- Escassez e urgência: somente quando explicitamente informadas nos dados de entrada
- Imagens: não gere URLs, bancos de stock ou palavras-chave de busca; a mídia será escolhida pela biblioteca do tenant
- Responda APENAS com JSON válido, sem explicações, sem markdown, sem comentários`;

  const userPrompt = `Gere um JSON completo para o site ${isEcommerce ? "e-commerce" : "landing page"} da empresa abaixo.

EMPRESA: ${empresa}
SEGMENTO: ${vertical}
${slogan ? `SLOGAN: ${slogan}` : ""}
${missao ? `MISSÃO: ${missao}` : ""}
${diferenciais ? `DIFERENCIAIS: ${diferenciais}` : ""}
${publicoAlvo ? `PÚBLICO-ALVO: ${publicoAlvo}` : ""}
${painPoint ? `MAIOR DOR DO CLIENTE: ${painPoint}` : ""}
${ctaText ? `AÇÃO PRINCIPAL (CTA): ${ctaText}` : ""}
TOM DE VOZ: ${tomInstrucao}
${corInstrucao ? `COR: ${corInstrucao}` : ""}
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
    "texto": "texto sobre a empresa em 3-4 frases envolventes, usando somente fatos fornecidos"
  },
  "servicos": [
    {"titulo": "nome do serviço/produto", "descricao": "descrição curta 1-2 frases", "emoji": "emoji relevante"},
    {"titulo": "...", "descricao": "...", "emoji": "..."},
    {"titulo": "...", "descricao": "...", "emoji": "..."}
  ],
  "diferenciais": [
    {"titulo": "diferencial 1", "texto": "explicação baseada nos dados fornecidos", "icone": "emoji"},
    {"titulo": "diferencial 2", "texto": "...", "icone": "emoji"},
    {"titulo": "diferencial 3", "texto": "...", "icone": "emoji"},
    {"titulo": "diferencial 4", "texto": "...", "icone": "emoji"}
  ],
  "depoimentos": [],
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
    "frete": "use somente informação de frete fornecida; caso contrário deixe vazio",
    "pagamento": "use somente formas de pagamento fornecidas; caso contrário deixe vazio",
    "garantia": "use somente política fornecida; caso contrário deixe vazio"
  },` : ""}
  "slogan": "slogan curto e marcante para o rodapé"
}`;

  let generated: GeneratedSiteContent;
  try {
    const aiResult = await gatewayCallOpenAI(
      tenantId,
      "site_generator",
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "gpt-4o", temperature: 0.75, maxTokens: 3500, responseFormat: { type: "json_object" }, log: req.log },
    );

    const raw = aiResult.content || "{}";
    generated = JSON.parse(raw) as GeneratedSiteContent;
  } catch (err) {
    req.log.error({ err }, "AI site generation failed");
    res.status(502).json({ error: "Falha na geração do conteúdo com IA" });
    return;
  }

  // Never invent or fetch stock media. Preserve an existing tenant-selected hero;
  // new sites start without a hero until Media Library / explicit site media supplies one.
  const existingRows = await db
    .select({ id: siteConfigTable.id, heroImageUrl: siteConfigTable.heroImageUrl })
    .from(siteConfigTable)
    .where(eq(siteConfigTable.tenantId, tenantId));
  const heroImageUrl = existingRows[0]?.heroImageUrl ?? null;

  let siteConfig;
  if (existingRows.length > 0) {
    [siteConfig] = await db
      .update(siteConfigTable)
      .set({
        tipo,
        generatedContent: generated,
        heroImageUrl,
        status: "draft",
        ativo: false,
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
        status: "draft",
        ativo: false,
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
    // A tenant that has not generated a site yet is a valid initial state.
    // Returning an empty result prevents clients from retrying a 404 forever.
    res.json(null);
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

// GET /public/vendorai-live-metrics — números reais e honestos do próprio uso
// do Vendor.ai vendendo o Vendor.ai (dogfooding), pro site institucional.
// Fixo no tenant institucional; nunca expõe nomes/dados de clientes, só contagens agregadas.
const INSTITUTIONAL_TENANT_ID = "1d4ea673-58d0-413a-a554-c9aca72a3121";
publicSiteRouter.get("/public/vendorai-live-metrics", async (_req, res) => {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [[leadsRow], [dealsRow], [recentRow]] = await Promise.all([
      db.select({ n: count() }).from(leadsTable).where(eq(leadsTable.tenantId, INSTITUTIONAL_TENANT_ID)),
      db.select({ n: count() }).from(dealsTable).where(eq(dealsTable.tenantId, INSTITUTIONAL_TENANT_ID)),
      db.select({ n: count() }).from(leadsTable).where(and(eq(leadsTable.tenantId, INSTITUTIONAL_TENANT_ID), gte(leadsTable.createdAt, since30d))),
    ]);
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      leadsAcompanhados: leadsRow?.n ?? 0,
      oportunidadesAtivas: dealsRow?.n ?? 0,
      leadsUltimos30dias: recentRow?.n ?? 0,
    });
  } catch {
    res.json({ leadsAcompanhados: 0, oportunidadesAtivas: 0, leadsUltimos30dias: 0 });
  }
});

export default router;