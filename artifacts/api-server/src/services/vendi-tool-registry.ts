import { desc, eq } from "drizzle-orm";
import {
  db,
  dealsTable,
  leadsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { processAgentInternal } from "./agent-dispatch.js";
import { getAdsOverview } from "./adCampaignIntelligence.js";
import { getPerformanceInsights } from "./content-performance.js";
import { generateContentCalendar } from "./content-calendar.js";
import { publishAnySocialPublication } from "./social-publication-dispatcher.js";
import { getLaunchRevenueScout } from "./launchRevenueScout.js";
import { fetchRenderedPage } from "./browser-fetch.js";
import { discoverWebsite } from "./browser-discovery.js";
import { extractStructuredData, type ExtractionSchema } from "./web-structured-extractor.js";

export type VendiToolRisk = "low" | "medium" | "high";
export type VendiToolDomain =
  | "crm"
  | "marketing"
  | "prospector"
  | "agents"
  | "web"
  | "agenda"
  | "finance"
  | "proposals"
  | "arqdor"
  | "works"
  | "media"
  | "admin";

export type VendiToolContext = {
  tenantId: string;
  userId?: string | null;
  missionId?: string;
};

export type VendiToolResult = {
  ok: boolean;
  data?: unknown;
  evidence?: Record<string, unknown>;
  message?: string;
};

export type VendiToolDefinition = {
  id: string;
  domain: VendiToolDomain;
  description: string;
  risk: VendiToolRisk;
  mutates: boolean;
  externalEffect: boolean;
  inputHint: string;
  execute: (ctx: VendiToolContext, input: Record<string, unknown>) => Promise<VendiToolResult>;
};

const tools = new Map<string, VendiToolDefinition>();

function register(definition: VendiToolDefinition) {
  if (tools.has(definition.id)) throw new Error("VENDI_TOOL_DUPLICATE:" + definition.id);
  tools.set(definition.id, definition);
}

register({
  id: "crm.leads.list",
  domain: "crm",
  description: "Lista leads recentes do tenant para análise operacional.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?: 1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 25), 1), 100);
    const rows = await db.select().from(leadsTable)
      .where(eq(leadsTable.tenantId, tenantId))
      .orderBy(desc(leadsTable.createdAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:leads", count: rows.length } };
  },
});

register({
  id: "crm.deals.list",
  domain: "crm",
  description: "Lista negócios recentes do tenant para análise de pipeline.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?: 1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 25), 1), 100);
    const rows = await db.select().from(dealsTable)
      .where(eq(dealsTable.tenantId, tenantId))
      .orderBy(desc(dealsTable.createdAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:deals", count: rows.length } };
  },
});

register({
  id: "marketing.ads.overview",
  domain: "marketing",
  description: "Retorna visão consolidada de anúncios/campanhas do tenant.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{}",
  execute: async ({ tenantId }) => ({
    ok: true,
    data: await getAdsOverview(tenantId),
    evidence: { source: "marketing:ads" },
  }),
});

register({
  id: "marketing.content.performance",
  domain: "marketing",
  description: "Retorna aprendizados de performance do conteúdo publicado.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{}",
  execute: async ({ tenantId }) => ({
    ok: true,
    data: await getPerformanceInsights(tenantId),
    evidence: { source: "marketing:content-performance" },
  }),
});

register({
  id: "marketing.calendar.generate",
  domain: "marketing",
  description: "Gera ações de calendário para um plano de mídia existente.",
  risk: "medium",
  mutates: true,
  externalEffect: false,
  inputHint: "{mediaPlanId:string,semanas:number,substituirPlanejado?:boolean,refinarComIa?:boolean}",
  execute: async ({ tenantId }, input) => {
    const mediaPlanId = String(input.mediaPlanId ?? "");
    if (!mediaPlanId) throw new Error("mediaPlanId obrigatório");
    const semanas = Math.min(Math.max(Number(input.semanas ?? 4), 1), 52);
    const data = await generateContentCalendar(tenantId, mediaPlanId, semanas, {
      substituirPlanejado: Boolean(input.substituirPlanejado),
      refinarComIa: input.refinarComIa !== false,
    });
    return { ok: true, data, evidence: { source: "marketing:content-calendar", items: data.items.length } };
  },
});

register({
  id: "marketing.social.publish",
  domain: "marketing",
  description: "Publica uma publicação social já criada no tenant.",
  risk: "high",
  mutates: true,
  externalEffect: true,
  inputHint: "{publicationId:string}",
  execute: async ({ tenantId }, input) => {
    const publicationId = String(input.publicationId ?? "");
    if (!publicationId) throw new Error("publicationId obrigatório");
    const data = await publishAnySocialPublication(tenantId, publicationId);
    return { ok: true, data, evidence: { source: "marketing:social-publisher", publicationId } };
  },
});

register({
  id: "prospector.revenue_scout",
  domain: "prospector",
  description: "Consulta oportunidades reais atribuídas do Revenue Scout.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{period?:'7d'|'30d'|'90d'|'all',platform?,campaignId?,landingPageId?,vertical?,intentTier?}",
  execute: async ({ tenantId }, input) => ({
    ok: true,
    data: await getLaunchRevenueScout(tenantId, input as any),
    evidence: { source: "prospector:revenue-scout" },
  }),
});

register({
  id: "agents.dispatch",
  domain: "agents",
  description: "Despacha um agente especializado existente para um lead.",
  risk: "high",
  mutates: true,
  externalEffect: true,
  inputHint: "{leadId:string,mensagem:string,agent?:sdr|closer|followup|reactivation|scheduler|service|onboarding|relacionamento|financeiro|cobranca|reception|pharmacy}",
  execute: async ({ tenantId }, input) => {
    const leadId = String(input.leadId ?? "");
    const mensagem = String(input.mensagem ?? "");
    if (!leadId || !mensagem) throw new Error("leadId e mensagem são obrigatórios");
    const data = await processAgentInternal({
      tenantId,
      leadId,
      mensagem,
      log: logger.child({ subsystem: "vendi" }),
      forcedAgent: input.agent ? String(input.agent) as any : undefined,
      scenario: input.scenario && typeof input.scenario === "object" ? input.scenario as Record<string, unknown> : null,
    });
    return { ok: data.status !== "failed", data, evidence: { source: "agents:dispatch", leadId } };
  },
});

register({
  id: "web.fetch",
  domain: "web",
  description: "Lê uma página pública renderizada, incluindo JavaScript.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{url:string}",
  execute: async (_ctx, input) => {
    const url = String(input.url ?? "");
    if (!url) throw new Error("url obrigatória");
    const host = new URL(url).hostname.toLowerCase();
    const data = await fetchRenderedPage({ url, allowedHosts: [host] });
    return { ok: true, data, evidence: { source: "web:fetch", url: data.url, fetchedAt: data.fetchedAt } };
  },
});

register({
  id: "web.discover",
  domain: "web",
  description: "Mapeia páginas, formulários, ações e chamadas de rede de um site.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{startUrl:string,maxPages?:1..12}",
  execute: async (_ctx, input) => {
    const startUrl = String(input.startUrl ?? "");
    if (!startUrl) throw new Error("startUrl obrigatória");
    const host = new URL(startUrl).hostname.toLowerCase();
    const data = await discoverWebsite({
      startUrl,
      allowedHosts: [host],
      maxPages: Math.min(Math.max(Number(input.maxPages ?? 5), 1), 12),
    });
    return { ok: true, data, evidence: { source: "web:discovery", pages: data.pages.length, apiCandidates: data.networkCalls.length } };
  },
});

register({
  id: "web.extract_structured",
  domain: "web",
  description: "Extrai dados estruturados de uma página pública conforme schema.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{url:string,goal:string,schema:Record<string,'string'|'number'|'boolean'|'string[]'|'number[]'>}",
  execute: async ({ tenantId }, input) => {
    const url = String(input.url ?? "");
    const goal = String(input.goal ?? "");
    const schema = input.schema as ExtractionSchema | undefined;
    if (!url || !goal || !schema) throw new Error("url, goal e schema são obrigatórios");
    const host = new URL(url).hostname.toLowerCase();
    const page = await fetchRenderedPage({ url, allowedHosts: [host], maxTextChars: 50000 });
    const data = await extractStructuredData({ tenantId, goal, page, schema });
    return { ok: true, data, evidence: { source: "web:structured-extract", url: page.url, fetchedAt: page.fetchedAt } };
  },
});

export function getVendiTool(id: string) {
  return tools.get(id);
}

export function listVendiTools() {
  return [...tools.values()].map(({ execute: _execute, ...tool }) => tool);
}

export function listVendiToolDomains() {
  const grouped = new Map<VendiToolDomain, number>();
  for (const tool of tools.values()) grouped.set(tool.domain, (grouped.get(tool.domain) ?? 0) + 1);
  return [...grouped.entries()].map(([domain, count]) => ({ domain, count }));
}

export async function executeVendiTool(
  id: string,
  ctx: VendiToolContext,
  input: Record<string, unknown>,
) {
  const tool = getVendiTool(id);
  if (!tool) throw new Error("VENDI_TOOL_NOT_FOUND:" + id);
  const result = await tool.execute(ctx, input);
  return { tool, result };
}
