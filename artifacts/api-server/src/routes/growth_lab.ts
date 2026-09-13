import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  generatedSitesTable,
  growthLabPromisesTable,
  growthLabBacklogTable,
} from "@workspace/db";

const router: IRouter = Router();

type CapabilityStatus = "available" | "partial" | "missing";
type Capability = {
  id: string;
  name: string;
  module: string;
  status: CapabilityStatus;
  keywords: string[];
};

const CAPABILITIES: Capability[] = [
  { id: "crm", name: "CRM e pipeline", module: "CRM", status: "available", keywords: ["crm", "pipeline", "oportunidade", "negocio", "lead"] },
  { id: "visitor", name: "Visitor Intelligence", module: "Inteligência", status: "available", keywords: ["visitante", "origem", "cidade", "campanha", "sessao", "site"] },
  { id: "revenue", name: "Revenue Scout", module: "Receita", status: "available", keywords: ["receita", "reativar", "cliente inativo", "oportunidade escondida"] },
  { id: "followup", name: "Follow-up com IA", module: "Agentes", status: "available", keywords: ["follow-up", "followup", "acompanhar", "retomar", "cobrar retorno"] },
  { id: "agenda", name: "Agenda inteligente", module: "Agenda", status: "available", keywords: ["agenda", "agendar", "reuniao", "compromisso"] },
  { id: "content", name: "Conteúdo e criativos", module: "Marketing", status: "available", keywords: ["conteudo", "criativo", "post", "imagem", "roteiro"] },
  { id: "ads", name: "Gestão de anúncios", module: "Marketing", status: "partial", keywords: ["anuncio", "meta ads", "google ads", "campanha paga", "trafego pago"] },
  { id: "seo", name: "SEO e Search Console", module: "Marketing", status: "available", keywords: ["seo", "google", "search console", "busca organica", "posicionamento"] },
  { id: "lp", name: "Sites e landing pages", module: "Marketing", status: "available", keywords: ["landing page", "lp", "site", "pagina"] },
  { id: "whatsapp", name: "WhatsApp conectado ao CRM", module: "Conversas", status: "available", keywords: ["whatsapp", "mensagem", "conversa"] },
  { id: "social", name: "Publicação multicanal", module: "Marketing", status: "partial", keywords: ["instagram", "facebook", "tiktok", "publicar", "rede social"] },
  { id: "payment", name: "Cobrança e pagamento", module: "Financeiro", status: "partial", keywords: ["cobranca", "pagamento", "pix", "cartao"] },
  { id: "proposal", name: "Orçamentos e propostas", module: "Comercial", status: "available", keywords: ["orcamento", "proposta", "cotacao"] },
  { id: "automation", name: "Automações por evento", module: "Automação", status: "partial", keywords: ["automatico", "automaticamente", "automacao", "gatilho", "evento"] },
];

const PROMISE_VERBS = [
  "aument", "atraia", "automat", "centraliz", "conect", "converta", "crie", "econom",
  "encontr", "gere", "gerencie", "identif", "melhor", "monitore", "otimiz", "publique",
  "recuper", "reduz", "transform", "venda", "vender", "acompan", "agend", "receba",
];

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHtmlText(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function isUsefulPromise(value: string, force = false) {
  const text = value.trim();
  if (text.length < 14 || text.length > 240) return false;
  const normalized = normalize(text);
  if (/^(saiba mais|fale conosco|entre em contato|ver mais|comprar|comece agora|teste agora|quero saber mais)$/i.test(text)) return false;
  if (force) return true;
  return PROMISE_VERBS.some((verb) => normalized.includes(verb));
}

function extractPromisesFromSite(site: {
  name: string;
  config: any;
  html: string;
}) {
  const candidates: Array<{ text: string; source: string; force?: boolean }> = [];
  const config = site.config ?? {};

  if (typeof config.headline === "string") candidates.push({ text: config.headline, source: "config.headline", force: true });
  if (typeof config.desc === "string") candidates.push({ text: config.desc, source: "config.desc", force: true });
  if (typeof config.pain === "string") candidates.push({ text: config.pain, source: "config.pain" });
  if (typeof config.cta === "string") candidates.push({ text: config.cta, source: "config.cta" });
  if (typeof config.servicos === "string") {
    config.servicos.split(/[\n•|]/).forEach((item: string) => candidates.push({ text: item, source: "config.servicos" }));
  }

  const html = site.html ?? "";
  for (const match of html.matchAll(/<(h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = String(match[1]).toLowerCase();
    const text = cleanHtmlText(String(match[2] ?? ""));
    candidates.push({ text, source: `html.${tag}`, force: tag === "h1" || tag === "h2" });
  }

  const seen = new Set<string>();
  const result: Array<{ text: string; source: string }> = [];
  for (const candidate of candidates) {
    const text = cleanHtmlText(candidate.text);
    const key = normalize(text);
    if (!key || seen.has(key) || !isUsefulPromise(text, candidate.force)) continue;
    seen.add(key);
    result.push({ text, source: candidate.source });
    if (result.length >= 16) break;
  }
  return result;
}

function detectCapabilities(text: string) {
  const normalized = normalize(text);
  return CAPABILITIES.filter((capability) =>
    capability.keywords.some((keyword) => normalized.includes(normalize(keyword))),
  );
}

function coverage(capabilities: Capability[]) {
  if (!capabilities.length) return 0;
  const score = capabilities.reduce((sum, capability) => {
    return sum + (capability.status === "available" ? 100 : capability.status === "partial" ? 50 : 0);
  }, 0);
  return Math.round(score / capabilities.length);
}

async function refreshBacklog(tenantId: string) {
  const promises = await db
    .select({ capabilityIds: growthLabPromisesTable.capabilityIds })
    .from(growthLabPromisesTable)
    .where(eq(growthLabPromisesTable.tenantId, tenantId));

  let updated = 0;
  for (const capability of CAPABILITIES.filter((item) => item.status !== "available")) {
    const affectedPromises = promises.filter((item) =>
      Array.isArray(item.capabilityIds) && item.capabilityIds.includes(capability.id),
    ).length;
    if (!affectedPromises) continue;

    const priorityScore = Math.min(
      100,
      (capability.status === "missing" ? 60 : 35) + affectedPromises * 12,
    );

    await db
      .insert(growthLabBacklogTable)
      .values({
        tenantId,
        capabilityId: capability.id,
        capabilityName: capability.name,
        module: capability.module,
        currentStatus: capability.status,
        affectedPromises,
        priorityScore,
        action: "complete_product",
        state: "open",
        metadata: { source: "growth_lab_auto_scan" },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [growthLabBacklogTable.tenantId, growthLabBacklogTable.capabilityId],
        set: {
          capabilityName: capability.name,
          module: capability.module,
          currentStatus: capability.status,
          affectedPromises,
          priorityScore,
          action: "complete_product",
          state: "open",
          metadata: { source: "growth_lab_auto_scan" },
          updatedAt: new Date(),
        },
      });
    updated += 1;
  }
  return updated;
}

router.get("/tenants/:tenantId/growth-lab/promises", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const items = await db
    .select()
    .from(growthLabPromisesTable)
    .where(eq(growthLabPromisesTable.tenantId, tenantId))
    .orderBy(desc(growthLabPromisesTable.createdAt));

  res.json(items);
});

router.post("/tenants/:tenantId/growth-lab/promises", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = req.body as {
    promise?: string;
    lpName?: string;
    lpPath?: string | null;
    source?: string;
    capabilityIds?: string[];
    coverage?: number;
    status?: string;
    metadata?: Record<string, unknown>;
  };

  const promise = body.promise?.trim();
  if (!promise) {
    res.status(400).json({ error: "promise is required" });
    return;
  }

  const [created] = await db
    .insert(growthLabPromisesTable)
    .values({
      tenantId,
      promise,
      lpName: body.lpName?.trim() || "Nova promessa",
      lpPath: body.lpPath ?? null,
      source: body.source?.trim() || "manual",
      capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : [],
      coverage: Number.isFinite(body.coverage) ? Math.max(0, Math.min(100, Number(body.coverage))) : 0,
      status: body.status?.trim() || "review",
      metadata: body.metadata ?? {},
      updatedAt: new Date(),
    })
    .returning();

  res.status(201).json(created);
});

router.post("/tenants/:tenantId/growth-lab/scan-sites", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const sites = await db
    .select({
      id: generatedSitesTable.id,
      name: generatedSitesTable.name,
      siteSlug: generatedSitesTable.siteSlug,
      siteType: generatedSitesTable.siteType,
      published: generatedSitesTable.published,
      config: generatedSitesTable.config,
      html: generatedSitesTable.html,
      updatedAt: generatedSitesTable.updatedAt,
    })
    .from(generatedSitesTable)
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .orderBy(desc(generatedSitesTable.updatedAt));

  const existing = await db
    .select({
      promise: growthLabPromisesTable.promise,
      lpPath: growthLabPromisesTable.lpPath,
    })
    .from(growthLabPromisesTable)
    .where(eq(growthLabPromisesTable.tenantId, tenantId));

  const existingKeys = new Set(
    existing.map((item) => `${item.lpPath ?? ""}::${normalize(item.promise)}`),
  );

  let extracted = 0;
  let created = 0;
  let skipped = 0;

  for (const site of sites) {
    const lpPath = site.siteSlug ? `/sites/${site.siteSlug}` : `/site-generator/${site.id}`;
    const candidates = extractPromisesFromSite(site);
    extracted += candidates.length;

    for (const candidate of candidates) {
      const key = `${lpPath}::${normalize(candidate.text)}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }

      const capabilities = detectCapabilities(candidate.text);
      const score = coverage(capabilities);
      await db.insert(growthLabPromisesTable).values({
        tenantId,
        promise: candidate.text,
        lpName: site.name,
        lpPath,
        source: "site_generator_scan",
        capabilityIds: capabilities.map((item) => item.id),
        coverage: score,
        status: capabilities.length === 0 ? "review" : score === 100 ? "ready" : "gap",
        metadata: {
          sourceSiteId: site.id,
          sourceSiteType: site.siteType,
          published: site.published,
          extractedFrom: candidate.source,
          siteUpdatedAt: site.updatedAt?.toISOString?.() ?? site.updatedAt,
        },
        updatedAt: new Date(),
      });
      existingKeys.add(key);
      created += 1;
    }
  }

  const backlogUpdated = await refreshBacklog(tenantId);

  res.json({
    scannedSites: sites.length,
    extracted,
    created,
    skipped,
    backlogUpdated,
  });
});

router.get("/tenants/:tenantId/growth-lab/backlog", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const items = await db
    .select()
    .from(growthLabBacklogTable)
    .where(eq(growthLabBacklogTable.tenantId, tenantId))
    .orderBy(desc(growthLabBacklogTable.priorityScore), desc(growthLabBacklogTable.createdAt));

  res.json(items);
});

router.post("/tenants/:tenantId/growth-lab/backlog/upsert", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = req.body as {
    capabilityId?: string;
    capabilityName?: string;
    module?: string;
    currentStatus?: string;
    affectedPromises?: number;
    priorityScore?: number;
    action?: string;
    state?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.capabilityId?.trim() || !body.capabilityName?.trim() || !body.module?.trim()) {
    res.status(400).json({ error: "capabilityId, capabilityName and module are required" });
    return;
  }

  const [item] = await db
    .insert(growthLabBacklogTable)
    .values({
      tenantId,
      capabilityId: body.capabilityId.trim(),
      capabilityName: body.capabilityName.trim(),
      module: body.module.trim(),
      currentStatus: body.currentStatus?.trim() || "missing",
      affectedPromises: Math.max(0, Number(body.affectedPromises ?? 0)),
      priorityScore: Math.max(0, Math.min(100, Number(body.priorityScore ?? 0))),
      action: body.action?.trim() || "complete_product",
      state: body.state?.trim() || "open",
      metadata: body.metadata ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [growthLabBacklogTable.tenantId, growthLabBacklogTable.capabilityId],
      set: {
        capabilityName: body.capabilityName.trim(),
        module: body.module.trim(),
        currentStatus: body.currentStatus?.trim() || "missing",
        affectedPromises: Math.max(0, Number(body.affectedPromises ?? 0)),
        priorityScore: Math.max(0, Math.min(100, Number(body.priorityScore ?? 0))),
        action: body.action?.trim() || "complete_product",
        state: body.state?.trim() || "open",
        metadata: body.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(item);
});

export default router;
