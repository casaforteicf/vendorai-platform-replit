import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  db,
  dealsTable,
  leadsTable,
  agendamentosTable,
  activitiesTable,
  customerIntelligenceTable,
  propostasTable,
  obrasTable,
  solicitacoesCompraTable,
  archProjetosTable,
  mediaAssetsTable,
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
import { runAllFinanceIntegrationHealthChecks } from "./finance-integration-health.js";
import { runAutoQuotePipeline } from "./auto-quote.js";
import { sendOutgoingMessage } from "./omnichannel.js";
import { getUpcomingRelationshipEvents } from "./customer-relationship-events.js";
import { searchProspectorCompanies } from "./prospector-company-search.js";
import { searchConstructionWorkSignals } from "./construction-radar-search.js";

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
  | "purchasing"
  | "omnichannel"
  | "customer_intelligence"
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
  id: "prospector.search_companies",
  domain: "prospector",
  description: "Busca empresas por atividade e localidade usando a fonte oficial do Prospector.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{atividade:string,localidade:string,maxResults?:1..20}",
  execute: async (_ctx, input) => {
    const atividade = String(input.atividade ?? "");
    const localidade = String(input.localidade ?? "");
    const data = await searchProspectorCompanies({
      atividade,
      localidade,
      maxResults: Number(input.maxResults ?? 10),
    });
    return {
      ok: true,
      data,
      evidence: {
        source: "prospector:google-places",
        query: data.query,
        count: data.results.length,
      },
    };
  },
});

register({
  id: "prospector.search_construction_signals",
  domain: "prospector",
  description: "Pesquisa sinais de obras privadas e oportunidades de construção usando o Radar de Obras.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{category:string,model:string,locality:string,intervention?,standard?,phase?,productInterest?,maxResults?:1..15}",
  execute: async ({ tenantId }, input) => {
    const data = await searchConstructionWorkSignals({
      tenantId,
      category: String(input.category ?? "construcao"),
      model: String(input.model ?? "obra privada"),
      locality: String(input.locality ?? ""),
      intervention: input.intervention ? String(input.intervention) : undefined,
      standard: input.standard ? String(input.standard) : undefined,
      phase: input.phase ? String(input.phase) : undefined,
      productInterest: input.productInterest ? String(input.productInterest) : undefined,
      maxResults: Math.min(Math.max(Number(input.maxResults ?? 10), 1), 15),
    });
    return {
      ok: true,
      data,
      evidence: {
        source: "prospector:construction-radar",
        count: data.works.length,
      },
    };
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
  id: "agenda.appointments.list",
  domain: "agenda",
  description: "Lista agendamentos recentes do tenant.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const rows = await db.select().from(agendamentosTable)
      .where(eq(agendamentosTable.tenantId, tenantId))
      .orderBy(desc(agendamentosTable.dataHoraInicio))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:agendamentos", count: rows.length } };
  },
});

register({
  id: "admin.operational_attention",
  domain: "admin",
  description: "Lista exceções operacionais que exigem atenção: tarefas vencidas e leads ativos sem responsável.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 100);
    const now = new Date();
    const [overdueTasks, unassignedLeads] = await Promise.all([
      db.select({
        id: activitiesTable.id,
        leadId: activitiesTable.leadId,
        dealId: activitiesTable.dealId,
        titulo: activitiesTable.titulo,
        status: activitiesTable.status,
        responsavelId: activitiesTable.responsavelId,
        dataVencimento: activitiesTable.dataVencimento,
      }).from(activitiesTable)
        .where(and(
          eq(activitiesTable.tenantId, tenantId),
          inArray(activitiesTable.status, ["pendente", "planejado"]),
          lt(activitiesTable.dataVencimento, now),
        ))
        .orderBy(activitiesTable.dataVencimento)
        .limit(limit),
      db.select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        status: leadsTable.status,
        createdAt: leadsTable.createdAt,
      }).from(leadsTable)
        .where(and(
          eq(leadsTable.tenantId, tenantId),
          isNull(leadsTable.assignedTo),
          isNull(leadsTable.naoLeadTipo),
        ))
        .orderBy(desc(leadsTable.createdAt))
        .limit(limit),
    ]);

    return {
      ok: true,
      data: { overdueTasks, unassignedLeads },
      evidence: {
        source: "db:operational-attention",
        overdueTasks: overdueTasks.length,
        unassignedLeads: unassignedLeads.length,
        observedAt: now.toISOString(),
      },
    };
  },
});

register({
  id: "finance.integrations.health",
  domain: "finance",
  description: "Executa health check das integrações financeiras e operacionais configuradas.",
  risk: "medium",
  mutates: true,
  externalEffect: true,
  inputHint: "{}",
  execute: async ({ tenantId }) => {
    const data = await runAllFinanceIntegrationHealthChecks(tenantId);
    return { ok: true, data, evidence: { source: "finance:integration-health" } };
  },
});

register({
  id: "proposals.list",
  domain: "proposals",
  description: "Lista propostas recentes do tenant.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const rows = await db.select().from(propostasTable)
      .where(eq(propostasTable.tenantId, tenantId))
      .orderBy(desc(propostasTable.createdAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:propostas", count: rows.length } };
  },
});

register({
  id: "proposals.auto_quote",
  domain: "proposals",
  description: "Interpreta uma solicitação de orçamento e cria proposta a partir do catálogo quando houver dados suficientes.",
  risk: "medium",
  mutates: true,
  externalEffect: false,
  inputHint: "{leadId:string,mensagem:string}",
  execute: async ({ tenantId }, input) => {
    const leadId = String(input.leadId ?? "");
    const mensagem = String(input.mensagem ?? "");
    if (!leadId || !mensagem) throw new Error("leadId e mensagem são obrigatórios");
    const data = await runAutoQuotePipeline({
      tenantId,
      leadId,
      mensagem,
      log: logger.child({ subsystem: "vendi:auto-quote" }),
    });
    return { ok: true, data, evidence: { source: "proposals:auto-quote", leadId, generated: data.generated } };
  },
});

register({
  id: "works.list",
  domain: "works",
  description: "Lista obras do tenant para coordenação operacional.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const rows = await db.select().from(obrasTable)
      .where(eq(obrasTable.tenantId, tenantId))
      .orderBy(desc(obrasTable.createdAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:obras", count: rows.length } };
  },
});

register({
  id: "purchasing.requests.list",
  domain: "purchasing",
  description: "Lista solicitações de compra e cotações registradas no tenant.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const rows = await db.select().from(solicitacoesCompraTable)
      .where(eq(solicitacoesCompraTable.tenantId, tenantId))
      .orderBy(desc(solicitacoesCompraTable.createdAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:solicitacoes_compra", count: rows.length } };
  },
});

register({
  id: "purchasing.request.create",
  domain: "purchasing",
  description: "Cria uma solicitação de compra interna sem enviar pedido ao fornecedor.",
  risk: "medium",
  mutates: true,
  externalEffect: false,
  inputHint: "{produtoNome:string,quantidade?:number,fornecedorNome:string,produtoId?,fornecedorId?,fornecedorContato?,fornecedorTelefone?,fornecedorEmail?,observacoes?}",
  execute: async ({ tenantId }, input) => {
    const produtoNome = String(input.produtoNome ?? "").trim();
    const fornecedorNome = String(input.fornecedorNome ?? "").trim();
    if (!produtoNome || !fornecedorNome) throw new Error("produtoNome e fornecedorNome são obrigatórios");
    const quantidade = Math.min(Math.max(Math.floor(Number(input.quantidade ?? 1)), 1), 1000000);
    const [row] = await db.insert(solicitacoesCompraTable).values({
      tenantId,
      produtoId: input.produtoId ? String(input.produtoId) : null,
      produtoNome,
      quantidade,
      fornecedorId: input.fornecedorId ? String(input.fornecedorId) : null,
      fornecedorNome,
      fornecedorContato: input.fornecedorContato ? String(input.fornecedorContato) : null,
      fornecedorTelefone: input.fornecedorTelefone ? String(input.fornecedorTelefone) : null,
      fornecedorEmail: input.fornecedorEmail ? String(input.fornecedorEmail) : null,
      observacoes: input.observacoes ? String(input.observacoes) : null,
      enviarPedidoAutomatico: false,
      status: "pendente",
      criadoPorNome: "Vendi",
    }).returning();
    return { ok: Boolean(row), data: row, evidence: { source: "db:solicitacoes_compra", created: Boolean(row) } };
  },
});

register({
  id: "arqdor.projects.list",
  domain: "arqdor",
  description: "Lista projetos Arqdor vinculados ao tenant.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const rows = await db.select().from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tenantId))
      .orderBy(desc(archProjetosTable.updatedAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:arch_projetos", count: rows.length } };
  },
});

register({
  id: "customer_intelligence.relationship_events",
  domain: "customer_intelligence",
  description: "Lista aniversários e datas especiais próximas dos clientes para relacionamento proativo.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{days?:0..365,limit?:1..500}",
  execute: async ({ tenantId }, input) => {
    const data = await getUpcomingRelationshipEvents({
      tenantId,
      days: Number(input.days ?? 30),
      limit: Number(input.limit ?? 100),
    });
    return {
      ok: true,
      data,
      evidence: {
        source: "customer_intelligence:relationship_events",
        count: data.length,
      },
    };
  },
});

register({
  id: "customer_intelligence.list",
  domain: "customer_intelligence",
  description: "Lista inteligência de clientes, intenção, jornada, churn e próxima melhor ação.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const rows = await db.select().from(customerIntelligenceTable)
      .where(eq(customerIntelligenceTable.tenantId, tenantId))
      .orderBy(desc(customerIntelligenceTable.updatedAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:customer_intelligence", count: rows.length } };
  },
});

register({
  id: "media.assets.list",
  domain: "media",
  description: "Lista mídias da Biblioteca de Mídias do tenant.",
  risk: "low",
  mutates: false,
  externalEffect: false,
  inputHint: "{limit?:1..100}",
  execute: async ({ tenantId }, input) => {
    const limit = Math.min(Math.max(Number(input.limit ?? 40), 1), 100);
    const rows = await db.select().from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.tenantId, tenantId))
      .orderBy(desc(mediaAssetsTable.createdAt))
      .limit(limit);
    return { ok: true, data: rows, evidence: { source: "db:media_assets", count: rows.length } };
  },
});

register({
  id: "omnichannel.send",
  domain: "omnichannel",
  description: "Envia mensagem por canal já conectado e registra a conversa no CRM.",
  risk: "high",
  mutates: true,
  externalEffect: true,
  inputHint: "{leadId:string,conteudo:string,canal:'whatsapp'|'instagram'|'messenger'|'email'|'chat'}",
  execute: async ({ tenantId }, input) => {
    const leadId = String(input.leadId ?? "");
    const conteudo = String(input.conteudo ?? "");
    const canal = String(input.canal ?? "");
    if (!leadId || !conteudo) throw new Error("leadId e conteudo são obrigatórios");
    if (!["whatsapp","instagram","messenger","email","chat"].includes(canal)) throw new Error("canal inválido");
    const data = await sendOutgoingMessage({
      tenantId,
      leadId,
      conteudo,
      canal: canal as "whatsapp" | "instagram" | "messenger" | "email" | "chat",
      agentName: "vendi",
    }, logger.child({ subsystem: "vendi:omnichannel" }));
    return { ok: true, data, evidence: { source: "omnichannel", leadId, canal } };
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
