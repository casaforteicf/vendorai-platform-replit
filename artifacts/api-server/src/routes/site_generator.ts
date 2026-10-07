import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  businessProfilesTable,
  contentAutopilotArticlesTable,
  db,
  dealsTable,
  generatedSitesTable,
  leadsTable,
  messagesTable,
  produtosCatalogoTable,
  tenantsTable,
  whatsappConnectionsTable,
  webBehaviorEventsTable,
} from "@workspace/db";
import { canonicalDealValueSql } from "../lib/deal-value.js";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getActiveCatalogPreview } from "../lib/catalog-readiness.js";
import coreRouter, { publicSiteGeneratorRouter as corePublicSiteGeneratorRouter } from "./site_generator_core.js";

function hasAccess(req: any, res: any, tenantId: string): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function loadSiteGeneratorBusinessContext(tenantId: string) {
  const [tenantResult, profileResult, whatsappResult] = await Promise.allSettled([
    db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      nomeEmpresa: tenantsTable.nomeEmpresa,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
      logoUrl: tenantsTable.logoUrl,
      site: tenantsTable.site,
      descricao: tenantsTable.descricao,
      updatedAt: tenantsTable.updatedAt,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber,
      businessName: whatsappConnectionsTable.businessName,
      isDefault: whatsappConnectionsTable.isDefault,
      status: whatsappConnectionsTable.status,
      updatedAt: whatsappConnectionsTable.updatedAt,
    }).from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")))
      .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
      .limit(1),
  ]);
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value[0] ?? null : null;
  const profile = profileResult.status === "fulfilled" ? profileResult.value[0] ?? null : null;
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value[0] ?? null : null;
  const mergedProfile = tenant || profile || whatsapp ? {
    ...(profile ?? {}),
    tenantId,
    razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || "",
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    logoUrl: profile?.logoUrl || tenant?.logoUrl || null,
    telefone: profile?.telefone || whatsapp?.displayPhoneNumber || null,
    descricao: tenant?.descricao || null,
    site: tenant?.site || null,
    displayPhoneNumber: whatsapp?.displayPhoneNumber || null,
  } : null;
  return {
    profile: mergedProfile,
    sources: {
      tenant: tenantResult.status === "fulfilled" && Boolean(tenant),
      businessProfile: profileResult.status === "fulfilled" && Boolean(profile),
      whatsapp: whatsappResult.status === "fulfilled" && Boolean(whatsapp),
    },
    degraded: [tenantResult, profileResult, whatsappResult].some((result) => result.status === "rejected"),
  };
}

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function extractSectionBlocks(html: string) {
  const pattern = /<section\b[^>]*>[\s\S]*?<\/section>/gi;
  let blocks = html.match(pattern) ?? [];
  if (blocks.length === 0) blocks = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) ?? [];
  return blocks.map((block, index) => {
    const headingMatch = block.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const title = cleanText(headingMatch?.[1] ?? "") || `Seção ${index + 1}`;
    return { index, key: `${index}:${slugify(title) || `secao-${index + 1}`}`, title, html: block };
  });
}

function restoreLockedSections(originalHtml: string, candidateHtml: string, lockedKeys: string[]): string {
  if (lockedKeys.length === 0) return candidateHtml;
  const originalSections = extractSectionBlocks(originalHtml);
  const candidateSections = extractSectionBlocks(candidateHtml);
  if (originalSections.length === 0 || candidateSections.length === 0) return candidateHtml;

  let restored = candidateHtml;
  const lockedIndexes = new Set(
    lockedKeys
      .map((key) => Number.parseInt(key.split(":")[0] ?? "", 10))
      .filter((index) => Number.isFinite(index)),
  );

  for (const index of [...lockedIndexes].sort((a, b) => b - a)) {
    const original = originalSections[index];
    const candidate = candidateSections[index];
    if (original && candidate) restored = restored.replace(candidate.html, original.html);
  }
  return restored;
}

function isSafePublicUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "::1" || host.endsWith(".local")) return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    const private172 = host.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPublicHtml(url: string): Promise<string> {
  if (!isSafePublicUrl(url)) throw new Error("Use uma URL pública http/https válida");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "VendorAI-SiteRemodel/1.0" },
    });
    if (!response.ok) throw new Error(`O site respondeu HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) throw new Error("A URL não retornou uma página HTML");
    const html = await response.text();
    return html.slice(0, 2_500_000);
  } finally {
    clearTimeout(timeout);
  }
}

function analyzeHtmlStructure(html: string, sourceUrl: string) {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const metaDescription = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1]
    ?? html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i)?.[1]
    ?? "";
  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({ level: Number(match[1]), text: cleanText(match[2]) }))
    .filter((item) => item.text)
    .slice(0, 40);
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: match[1], label: cleanText(match[2]) }))
    .filter((item) => item.label || item.href)
    .slice(0, 80);
  const nav = cleanText(html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? "");
  const images = [...html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, 30);
  const sections = extractSectionBlocks(html).map(({ index, key, title, html: block }) => ({
    index,
    key,
    title,
    excerpt: cleanText(block).slice(0, 360),
  }));

  return {
    sourceUrl,
    title,
    metaDescription: cleanText(metaDescription),
    nav: nav.slice(0, 600),
    headings,
    links,
    images,
    sections,
    bodyExcerpt: cleanText(html).slice(0, 5000),
  };
}

function buildSiteIntelligenceScript(): string {
  return `<script id="vendorai-site-intelligence">
(function(){
  if(window.__vendoraiSiteIntelligence)return;window.__vendoraiSiteIntelligence=true;
  var key='vendorai_site_session';var sid='';
  try{sid=localStorage.getItem(key)||'';if(!sid){sid=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem(key,sid);}}catch(e){sid=Date.now().toString(36)+Math.random().toString(36).slice(2);}
  sid=sid.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,120);
  var q=new URLSearchParams(location.search);
  function payload(eventType,extra){return Object.assign({anonymousSessionId:sid,eventType:eventType,pageUrl:location.href,path:location.pathname,referrer:document.referrer||null,siteIdentifier:(location.hostname.split('.')[0]||location.pathname),utmSource:q.get('utm_source'),utmMedium:q.get('utm_medium'),utmCampaign:q.get('utm_campaign'),utmContent:q.get('utm_content'),utmTerm:q.get('utm_term'),gclid:q.get('gclid'),fbclid:q.get('fbclid')},extra||{});}
  function send(eventType,extra){try{fetch('/api/generated-site/touchpoint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload(eventType,extra)),keepalive:true}).catch(function(){});}catch(e){}}
  send('page_view');
  document.addEventListener('submit',function(e){var f=e.target;send('form_submit',{targetHost:(f&&f.action)||location.host});},true);
})();
</script>`;
}

export const publicSiteGeneratorRouter: IRouter = Router();
publicSiteGeneratorRouter.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  (res as any).send = (body: any) => {
    if (typeof body === "string" && body.includes("</body>") && !body.includes("vendorai-site-intelligence")) {
      body = body.replace("</body>", `${buildSiteIntelligenceScript()}</body>`);
    }
    return originalSend(body);
  };
  next();
});
publicSiteGeneratorRouter.use(corePublicSiteGeneratorRouter);

const router: IRouter = Router();

const remodelAnalyzeSchema = z.object({ url: z.string().trim().min(8).max(2000) });
router.post("/tenants/:tenantId/site-generator/remodel-analyze", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const parsed = remodelAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Informe uma URL pública válida" });
    return;
  }
  try {
    const html = await fetchPublicHtml(parsed.data.url);
    res.json(analyzeHtmlStructure(html, parsed.data.url));
  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/remodel-analyze: falhou");
    res.status(502).json({ error: err instanceof Error ? err.message : "Falha ao analisar a estrutura do site" });
  }
});

router.get("/tenants/:tenantId/site-generator/:siteId/preview", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const [site] = await db
    .select({
      id: generatedSitesTable.id,
      name: generatedSitesTable.name,
      html: generatedSitesTable.html,
      siteType: generatedSitesTable.siteType,
      published: generatedSitesTable.published,
      siteSlug: generatedSitesTable.siteSlug,
      createdAt: generatedSitesTable.createdAt,
      updatedAt: generatedSitesTable.updatedAt,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, String(req.params.siteId)), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site não encontrado" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.query.format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(site.html);
    return;
  }
  res.json({ site });
});

router.get("/tenants/:tenantId/site-generator/:siteId/sections", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const [site] = await db
    .select({ id: generatedSitesTable.id, name: generatedSitesTable.name, html: generatedSitesTable.html, config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, String(req.params.siteId)), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site não encontrado" });
    return;
  }
  const config = (site.config ?? {}) as any;
  const locked = new Set<string>(config.aiProtection?.lockedSectionKeys ?? []);
  res.json({
    siteId: site.id,
    name: site.name,
    lockedFields: config.aiProtection?.lockedFields ?? [],
    sections: extractSectionBlocks(site.html).map(({ index, key, title }) => ({ index, key, title, locked: locked.has(key) })),
  });
});

const protectionSchema = z.object({
  lockedSectionKeys: z.array(z.string().max(120)).max(100),
  lockedFields: z.array(z.string().max(80)).max(50).optional(),
});
router.patch("/tenants/:tenantId/site-generator/:siteId/protection", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const parsed = protectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Configuração de proteção inválida" });
    return;
  }
  const [site] = await db
    .select({ config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, String(req.params.siteId)), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site não encontrado" });
    return;
  }
  const config = (site.config ?? {}) as any;
  const nextConfig = {
    ...config,
    aiProtection: {
      lockedSectionKeys: parsed.data.lockedSectionKeys,
      lockedFields: parsed.data.lockedFields ?? config.aiProtection?.lockedFields ?? [],
      updatedAt: new Date().toISOString(),
    },
  };
  await db
    .update(generatedSitesTable)
    .set({ config: nextConfig as any, updatedAt: new Date() })
    .where(and(eq(generatedSitesTable.id, String(req.params.siteId)), eq(generatedSitesTable.tenantId, tenantId)));
  res.json({ protection: nextConfig.aiProtection });
});

const duplicateSchema = z.object({ name: z.string().trim().min(1).max(180).optional() });
router.post("/tenants/:tenantId/site-generator/:siteId/duplicate", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const parsed = duplicateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: "Nome de versão inválido" });
    return;
  }
  const [site] = await db
    .select()
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, String(req.params.siteId)), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site não encontrado" });
    return;
  }
  const config = (site.config ?? {}) as any;
  const [created] = await db
    .insert(generatedSitesTable)
    .values({
      tenantId,
      name: parsed.data.name ?? `${site.name} — nova versão`,
      siteType: site.siteType,
      siteSlug: null,
      config: {
        ...config,
        versionMeta: {
          sourceSiteId: site.id,
          sourceName: site.name,
          createdAt: new Date().toISOString(),
        },
      } as any,
      html: site.html,
      published: false,
      seoScore: site.seoScore,
      seoChecklist: site.seoChecklist,
      analisadoEm: site.analisadoEm,
    })
    .returning();
  res.status(201).json(created);
});

router.get("/tenants/:tenantId/site-generator/analytics", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  try {
    const [events, leads, deals] = await Promise.all([
      db
        .select({
          anonymousSessionId: webBehaviorEventsTable.anonymousSessionId,
          adCampaignId: webBehaviorEventsTable.adCampaignId,
          eventType: webBehaviorEventsTable.eventType,
          landingPageSlug: webBehaviorEventsTable.landingPageSlug,
          path: webBehaviorEventsTable.path,
        })
        .from(webBehaviorEventsTable)
        .where(eq(webBehaviorEventsTable.tenantId, tenantId)),
      db
        .select({ id: leadsTable.id, adCampaignId: leadsTable.adCampaignId, source: leadsTable.source, naoLeadTipo: leadsTable.naoLeadTipo })
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId)),
      db
        .select({ id: dealsTable.id, leadId: dealsTable.leadId, etapa: dealsTable.etapa, valor: canonicalDealValueSql })
        .from(dealsTable)
        .where(eq(dealsTable.tenantId, tenantId)),
    ]);

    const campaignIds = new Set(events.map((event) => event.adCampaignId).filter((id): id is string => Boolean(id)));
    const attributedLeads = leads.filter((lead) => !lead.naoLeadTipo && Boolean(lead.adCampaignId) && campaignIds.has(lead.adCampaignId!));
    const leadIds = new Set(attributedLeads.map((lead) => lead.id));
    const attributedDeals = deals.filter((deal) => Boolean(deal.leadId) && leadIds.has(deal.leadId!));
    const activeDeals = attributedDeals.filter((deal) => deal.etapa !== "perdido");
    const wonDeals = attributedDeals.filter((deal) => deal.etapa === "ganho");
    const sumValue = (rows: Array<{ valor: string | null }>) => rows.reduce((sum, row) => sum + (Number.parseFloat(row.valor ?? "0") || 0), 0);

    const pageMap = new Map<string, { page: string; events: number; pageViews: number; ctaClicks: number; formSubmits: number; sessions: Set<string> }>();
    for (const event of events) {
      const page = event.landingPageSlug || event.path || "sem-identificacao";
      const item = pageMap.get(page) ?? { page, events: 0, pageViews: 0, ctaClicks: 0, formSubmits: 0, sessions: new Set<string>() };
      item.events += 1;
      if (event.eventType === "page_view") item.pageViews += 1;
      if (event.eventType === "cta_click") item.ctaClicks += 1;
      if (event.eventType === "form_submit") item.formSubmits += 1;
      if (event.anonymousSessionId) item.sessions.add(event.anonymousSessionId);
      pageMap.set(page, item);
    }

    res.json({
      summary: {
        interactions: events.length,
        sessions: new Set(events.map((event) => event.anonymousSessionId).filter(Boolean)).size,
        pageViews: events.filter((event) => event.eventType === "page_view").length,
        ctaClicks: events.filter((event) => event.eventType === "cta_click").length,
        formSubmits: events.filter((event) => event.eventType === "form_submit").length,
        attributedLeads: attributedLeads.length,
        opportunities: activeDeals.length,
        wonDeals: wonDeals.length,
        pipelineValue: sumValue(activeDeals),
        revenue: sumValue(wonDeals),
        attributionCampaigns: campaignIds.size,
      },
      byPage: [...pageMap.values()]
        .map((item) => ({ ...item, sessions: item.sessions.size }))
        .sort((a, b) => b.events - a.events)
        .slice(0, 25),
      attributionNote: "Leads, oportunidades e receita são atribuídos quando o lead possui a mesma campanha registrada nos eventos do site. Sessões sem campanha continuam contabilizadas como comportamento, sem inventar atribuição comercial.",
    });
  } catch (err) {
    req.log?.error({ err, tenantId }, "site-generator/analytics: falhou");
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao consolidar analytics" });
  }
});

function normalizeQuestion(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !new Set(["que", "qual", "quais", "como", "para", "por", "uma", "uns", "das", "dos", "com", "sem", "tem", "isso", "essa", "esse", "meu", "minha", "seu", "sua"]).has(token))
    .slice(0, 18);
}

function similarity(a: string[], b: string[]): number {
  const aa = new Set(a);
  const bb = new Set(b);
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return union === 0 ? 0 : intersection / union;
}

router.get("/tenants/:tenantId/site-generator/business-context", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  try {
    const context = await loadSiteGeneratorBusinessContext(tenantId);
    res.setHeader("Cache-Control", "no-store");
    res.json(context);
  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/business-context: contexto degradado");
    res.status(200).json({ profile: null, sources: { tenant: false, businessProfile: false, whatsapp: false }, degraded: true });
  }
});

const briefingSuggestionsSchema = z.object({ creationMode: z.string().trim().max(40).optional() });
router.post("/tenants/:tenantId/site-generator/briefing-suggestions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const parsed = briefingSuggestionsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: "Contexto do briefing inválido" });
    return;
  }
  try {
    const [contextResult, productsResult] = await Promise.allSettled([
      loadSiteGeneratorBusinessContext(tenantId),
      getActiveCatalogPreview(tenantId, 40),
    ]);
    const context = contextResult.status === "fulfilled" ? contextResult.value : { profile: null, sources: { tenant: false, businessProfile: false, whatsapp: false }, degraded: true };
    const profile = context.profile as Record<string, unknown> | null;
    const products = productsResult.status === "fulfilled" ? productsResult.value : [];
    if (!profile && products.length === 0) {
      res.json({ audiences: [], offers: [], source: "empty", degraded: true });
      return;
    }

    const safeProfile = profile
      ? Object.fromEntries(Object.entries(profile as Record<string, unknown>).filter(([key, value]) => {
          if (/token|secret|senha|password|api.?key|credential/i.test(key)) return false;
          return value !== null && value !== undefined && value !== "";
        }))
      : {};
    const catalog = products.map((product) => ({
      id: product.id,
      nome: product.nome.slice(0, 180),
      descricao: String(product.descricao ?? "").slice(0, 500),
      precoBase: product.precoBase,
      unidade: product.unidade,
      tipo: product.productType,
    })).filter((product) => product.nome);
    const prompt = `Analise o Perfil do Negócio e o catálogo do tenant atual e gere opções comerciais úteis para preencher um briefing de site/landing page.

REGRAS OBRIGATÓRIAS:
- O contexto abaixo pertence SOMENTE a este tenant. Não use conhecimento de outras empresas ou exemplos do VendorAI.
- Entenda o segmento a partir dos dados reais informados no perfil.
- Você pode INFERIR públicos comerciais plausíveis a partir do segmento/descrição, mas não transforme inferências em fatos sobre a empresa.
- Ofertas devem ser produtos, serviços, categorias ou formas plausíveis de apresentar o que a empresa realmente vende. Não invente preço, certificação, garantia, estoque, unidade, depoimento ou condição comercial.
- O CATÁLOGO abaixo contém somente itens ativos e é a fonte comercial oficial. Não use 'profile.produtos' para contradizer nomes, preços ou itens ativos do catálogo.
- Se o catálogo tiver produto adequado, devolva exatamente o id informado em productId. Caso contrário, omita productId.
- Gere de 4 a 8 públicos e de 4 a 8 ofertas. Evite opções redundantes ou genéricas demais.
- Responda em português do Brasil.
- Retorne SOMENTE JSON válido: {"audiences":[{"value":"...","reason":"..."}],"offers":[{"value":"...","productId":"...","reason":"..."}]}.

MODO DE CRIAÇÃO: ${parsed.data.creationMode ?? "new-site"}
PERFIL DO NEGÓCIO: ${JSON.stringify(safeProfile).slice(0, 12000)}
CATÁLOGO OFICIAL ATIVO: ${JSON.stringify(catalog).slice(0, 14000)}`;
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      system: "Você é o Business Context Resolver do VendorAI. Seu trabalho é entender cada tenant pelo próprio perfil e catálogo, sem misturar dados entre empresas e sem inventar fatos.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content.filter((block) => block.type === "text").map((block) => (block as { type: "text"; text: string }).text).join("\n");
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const result = JSON.parse(cleaned) as any;
    const validProductIds = new Set(catalog.map((product) => product.id));
    const audiences = (Array.isArray(result.audiences) ? result.audiences : [])
      .map((item: any) => ({ value: String(item?.value ?? "").trim().slice(0, 180), reason: String(item?.reason ?? "").trim().slice(0, 280) }))
      .filter((item: any) => item.value)
      .slice(0, 8);
    const offers = (Array.isArray(result.offers) ? result.offers : [])
      .map((item: any) => ({
        value: String(item?.value ?? "").trim().slice(0, 180),
        ...(validProductIds.has(String(item?.productId ?? "")) ? { productId: String(item.productId) } : {}),
        reason: String(item?.reason ?? "").trim().slice(0, 280),
      }))
      .filter((item: any) => item.value)
      .slice(0, 8);
    res.json({ audiences, offers, source: "tenant_business_context" });
  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/briefing-suggestions: usando fallback local");
    try {
      const [context, catalog] = await Promise.all([
        loadSiteGeneratorBusinessContext(tenantId),
        getActiveCatalogPreview(tenantId, 8),
      ]);
      const profile = (context.profile ?? {}) as Record<string, any>;
      const audiences = [profile.publicoAlvo, profile.discoveryData?.publicoAlvo, profile.discoveryData?.clienteIdeal]
        .flatMap((value) => typeof value === "string" ? value.split(/\n|;|\||•/g) : [])
        .map((value) => ({ value: value.trim().slice(0, 180), reason: "Perfil do negócio" }))
        .filter((item) => item.value)
        .slice(0, 8);
      const offers = catalog.length > 0
        ? catalog.map((item) => ({
            value: item.nome.trim().slice(0, 180),
            productId: item.id,
            reason: "Catálogo oficial ativo",
          })).filter((item) => item.value).slice(0, 8)
        : Array.isArray(profile.produtos)
          ? profile.produtos.map((item: any) => ({
              value: String(item?.nome ?? "").trim().slice(0, 180),
              reason: "Referência legada — Catálogo oficial vazio",
            })).filter((item: any) => item.value).slice(0, 8)
          : [];
      res.status(200).json({ audiences, offers, source: "local_fallback", degraded: true });
    } catch {
      res.status(200).json({ audiences: [], offers: [], source: "degraded", degraded: true });
    }
  }
});

router.get("/tenants/:tenantId/site-generator/content-signals", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const [messages, leads] = await Promise.all([
    db
      .select({ leadId: messagesTable.leadId, conteudo: messagesTable.conteudo, canal: messagesTable.canal, createdAt: messagesTable.createdAt })
      .from(messagesTable)
      .where(and(eq(messagesTable.tenantId, tenantId), eq(messagesTable.direcao, "entrada")))
      .orderBy(desc(messagesTable.createdAt))
      .limit(800),
    db
      .select({ id: leadsTable.id, naoLeadTipo: leadsTable.naoLeadTipo })
      .from(leadsTable)
      .where(eq(leadsTable.tenantId, tenantId)),
  ]);
  const validLeadIds = new Set(leads.filter((lead) => !lead.naoLeadTipo).map((lead) => lead.id));
  const candidates = messages
    .filter((message) => validLeadIds.has(message.leadId))
    .filter((message) => /\?|\b(quanto|qual|quais|como|quando|onde|porque|por que|diferenca|diferença|prazo|preco|preço|garantia|funciona|serve)\b/i.test(message.conteudo))
    .map((message) => ({ ...message, tokens: normalizeQuestion(message.conteudo) }))
    .filter((message) => message.tokens.length >= 2);

  const clusters: Array<{ example: string; tokens: string[]; count: number; channels: Set<string>; lastSeen: Date }> = [];
  for (const candidate of candidates) {
    let cluster = clusters.find((item) => similarity(item.tokens, candidate.tokens) >= 0.55);
    if (!cluster) {
      cluster = { example: candidate.conteudo.slice(0, 280), tokens: candidate.tokens, count: 0, channels: new Set<string>(), lastSeen: candidate.createdAt };
      clusters.push(cluster);
    }
    cluster.count += 1;
    cluster.channels.add(candidate.canal);
    if (candidate.createdAt > cluster.lastSeen) cluster.lastSeen = candidate.createdAt;
  }

  const signals = clusters
    .filter((cluster) => cluster.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((cluster, index) => ({
      id: `crm-${index + 1}`,
      question: cluster.example,
      occurrences: cluster.count,
      channels: [...cluster.channels],
      lastSeen: cluster.lastSeen.toISOString(),
      recommendations: ["FAQ do site", "Artigo", "Página comparativa", "Post social", "Roteiro de vídeo"],
    }));

  res.json({ analyzedIncomingMessages: candidates.length, signals });
});

const REPURPOSE_CHANNELS = ["article", "instagram", "facebook", "linkedin", "reels", "video_script", "email", "whatsapp", "meta_ad", "google_ads", "landing_page"] as const;
const repurposeSchema = z.object({
  sourceType: z.enum(["site", "article", "product"]),
  sourceId: z.string().min(1),
  channels: z.array(z.enum(REPURPOSE_CHANNELS)).min(1).max(REPURPOSE_CHANNELS.length),
});
router.post("/tenants/:tenantId/site-generator/repurpose", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  const parsed = repurposeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Selecione uma fonte e ao menos um canal" });
    return;
  }
  try {
    let sourceTitle = "Conteúdo";
    let sourceText = "";
    if (parsed.data.sourceType === "site") {
      const [site] = await db.select({ name: generatedSitesTable.name, html: generatedSitesTable.html, config: generatedSitesTable.config }).from(generatedSitesTable)
        .where(and(eq(generatedSitesTable.id, parsed.data.sourceId), eq(generatedSitesTable.tenantId, tenantId))).limit(1);
      if (!site) throw new Error("Site não encontrado");
      sourceTitle = site.name;
      sourceText = `${cleanText(site.html).slice(0, 9000)}\nContexto: ${JSON.stringify(site.config).slice(0, 5000)}`;
    } else if (parsed.data.sourceType === "article") {
      const [article] = await db.select({ titulo: contentAutopilotArticlesTable.titulo, conteudoMd: contentAutopilotArticlesTable.conteudoMd, metaDescription: contentAutopilotArticlesTable.metaDescription }).from(contentAutopilotArticlesTable)
        .where(and(eq(contentAutopilotArticlesTable.id, parsed.data.sourceId), eq(contentAutopilotArticlesTable.tenantId, tenantId))).limit(1);
      if (!article) throw new Error("Artigo não encontrado");
      sourceTitle = article.titulo ?? "Artigo";
      sourceText = `${article.metaDescription ?? ""}\n${article.conteudoMd ?? ""}`.slice(0, 14000);
    } else {
      const [product] = await db.select().from(produtosCatalogoTable)
        .where(and(
          eq(produtosCatalogoTable.id, parsed.data.sourceId),
          eq(produtosCatalogoTable.tenantId, tenantId),
          eq(produtosCatalogoTable.ativo, true),
        )).limit(1);
      if (!product) throw new Error("Produto ativo não encontrado no Catálogo oficial");
      sourceTitle = String((product as any).nome ?? (product as any).name ?? "Produto");
      sourceText = JSON.stringify(product).slice(0, 12000);
    }

    const prompt = `Transforme a fonte abaixo em um kit multicanal do VendorAI. Preserve produto/serviço, público, oferta, posicionamento, fatos e CTA. NÃO invente preço, métrica, depoimento, certificação ou garantia.\n\nFONTE: ${sourceTitle}\n${sourceText}\n\nCANAIS SOLICITADOS: ${parsed.data.channels.join(", ")}\n\nRetorne SOMENTE JSON válido neste formato: {"outputs":[{"channel":"instagram","title":"...","content":"..."}]}. Para landing_page, entregue arquitetura de seções + copy principal. Para meta_ad/google_ads, entregue variações de texto sem configurar orçamento ou publicar campanha. Para reels/video_script, entregue roteiro. Para email/whatsapp, entregue texto pronto para envio.`;
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      system: "Você é o AI Marketing Manager do VendorAI. Responda em português do Brasil e preserve rigor factual.",
      messages: [{ role: "user", content: prompt }],
    });
    const raw = message.content.filter((block) => block.type === "text").map((block) => (block as { type: "text"; text: string }).text).join("\n");
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    let result: any;
    try { result = JSON.parse(cleaned); } catch { result = { outputs: [{ channel: "kit", title: sourceTitle, content: raw }] }; }
    res.json({ sourceType: parsed.data.sourceType, sourceId: parsed.data.sourceId, sourceTitle, ...result });
  } catch (err) {
    req.log?.error({ err, tenantId }, "site-generator/repurpose: falhou");
    res.status(500).json({ error: err instanceof Error ? err.message : "Falha ao reaproveitar conteúdo" });
  }
});

// Enriquecimento de geração sem alterar o motor principal. O core continua sendo
// a fonte de verdade para geração, job, refinamento, publicação e HTML.
router.use(async (req, res, next) => {
  const generateMatch = req.method === "POST" && req.path.match(/^\/tenants\/([^/]+)\/site-generator\/generate$/);
  if (generateMatch && req.body && typeof req.body === "object") {
    const mode = String(req.body.creationMode ?? "");
    const modeInstructions: Record<string, string> = {
      "new-site": "Crie uma arquitetura completa de site, orientada a negócio, conversão e expansão futura pelo Content Autopilot.",
      landing: "Construa uma landing page de alta correspondência entre público, oferta e CTA.",
      campaign: "Esta é uma página de campanha: mantenha message match com anúncio, público, oferta e CTA; elimine distrações institucionais desnecessárias.",
      product: "Esta página deve vender e explicar o produto/serviço selecionado, com benefícios, objeções, aplicações e CTA coerentes.",
      catalog: "Estruture catálogo/vitrine por categorias e caminhos de descoberta, com CTAs comerciais sem inventar estoque ou preço.",
      ecommerce: "Priorize navegação comercial, catálogo, confiança e caminho de compra.",
      remodel: "Remodele o ativo existente preservando explicitamente os elementos aprovados e melhorando estratégia, arquitetura, visual e conversão conforme o nível solicitado.",
    };
    const remodel = req.body.remodelContext as any;
    const structural = remodel?.structure
      ? `SITE EXISTENTE: ${remodel.siteUrl ?? remodel.structure.sourceUrl ?? ""}\nNÍVEL: ${remodel.remodelLevel ?? "complete"}\nOBJETIVO: ${remodel.objective ?? ""}\nPRESERVAR: ${remodel.preserve ?? ""}\nTÍTULO ATUAL: ${remodel.structure.title ?? ""}\nMETA ATUAL: ${remodel.structure.metaDescription ?? ""}\nNAVEGAÇÃO ATUAL: ${remodel.structure.nav ?? ""}\nHEADINGS ATUAIS: ${(remodel.structure.headings ?? []).map((item: any) => `${item.level}:${item.text}`).join(" | ")}\nSEÇÕES ATUAIS: ${(remodel.structure.sections ?? []).map((item: any) => item.title).join(" | ")}\nTRECHO DO CONTEÚDO: ${remodel.structure.bodyExcerpt ?? ""}`
      : "";
    const instruction = [modeInstructions[mode], structural].filter(Boolean).join("\n\n");
    if (instruction) {
      req.body.desc = `${req.body.desc ?? ""}\n\nDIRETRIZES DO WORKSPACE VENDORAI:\n${instruction}`.trim();
      req.body.servicos = `${req.body.servicos ?? ""}\n\nContexto de criação: ${mode || "site"}`.trim();
    }
  }

  const refineMatch = req.method === "POST" && req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/refine$/);
  if (!refineMatch) {
    next();
    return;
  }

  const tenantId = refineMatch[1];
  const siteId = refineMatch[2];
  const [site] = await db.select({ html: generatedSitesTable.html, config: generatedSitesTable.config }).from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId))).limit(1);
  const lockedKeys: string[] = ((site?.config as any)?.aiProtection?.lockedSectionKeys ?? []).filter(Boolean);
  if (!site || lockedKeys.length === 0) {
    next();
    return;
  }

  const sections = extractSectionBlocks(site.html);
  const lockedTitles = lockedKeys.map((key) => sections[Number.parseInt(key.split(":")[0] ?? "", 10)]?.title).filter(Boolean);
  req.body.message = `${req.body.message ?? ""}\n\nREGRA DE PROTEÇÃO OBRIGATÓRIA: NÃO altere, remova, reordene ou reescreva as seções bloqueadas: ${lockedTitles.join(", ")}.`.trim();
  const originalJson = res.json.bind(res);
  (res as any).json = (body: any) => {
    if (!body?.html || typeof body.html !== "string") return originalJson(body);
    const restored = restoreLockedSections(site.html, body.html, lockedKeys);
    body.html = restored;
    void db.update(generatedSitesTable).set({ html: restored, updatedAt: new Date() })
      .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
      .then(() => originalJson(body))
      .catch(() => originalJson(body));
    return res;
  };
  next();
});

router.use(coreRouter);

export default router;
