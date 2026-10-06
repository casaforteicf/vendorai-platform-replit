import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import {
  appActionRegistryTable,
  appComponentRegistryTable,
  appDataSourceRegistryTable,
  appFeatureRegistryTable,
  appInstanceVersionsTable,
  appInstancesTable,
  appTemplateVersionsTable,
  appTemplatesTable,
  appVerticalsTable,
  appWorkflowRegistryTable,
  businessProfilesTable,
  db,
  tenantLeadCaptureToolsTable,
  tenantAgentConfigsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { getTenantCommercialAccess } from "../middlewares/commercialProductAccess.js";
import {
  buildVerticalStarterDefinition,
  findVerticalBlueprint,
  resolveVerticalBlueprint,
  type RegistryCapability,
} from "../lib/app_vertical_blueprints.js";

type JsonObject = Record<string, unknown>;

export type JarvisToolBuildRequest = {
  brief: string;
  name?: string;
  mode?: "auto" | "reuse" | "create";
  publish?: boolean;
  freePolicy?: { mode?: "uses" | "days" | "session" | "custom"; limit?: number; durationDays?: number; note?: string };
};

export type JarvisToolBuildResult = {
  strategy: "reuse" | "created" | "requires_development";
  summary: string;
  tool?: Record<string, unknown>;
  app?: { id: string; name: string; slug: string; runtimeUrl: string; published: boolean };
  gaps?: Array<{ type: string; description: string }>;
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function slugify(value: string) {
  const slug = normalize(value).replace(/\s+/g, "-").replace(/^-|-$/g, "");
  return (slug || "ferramenta-jarvis").slice(0, 72);
}

function words(value: string) {
  return new Set(normalize(value).split(/\s+/).filter((item) => item.length >= 3));
}

function similarity(a: string, b: string) {
  const aw = words(a);
  const bw = words(b);
  if (!aw.size || !bw.size) return 0;
  let common = 0;
  for (const item of aw) if (bw.has(item)) common += 1;
  return common / Math.max(aw.size, bw.size);
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function sanitizeRuntimeDefinition(definition: JsonObject, actionKeys: Set<string>, dataSourceKeys: Set<string>) {
  const runtime = asObject(definition.runtime);
  const rawPages = Array.isArray(runtime.pages) ? runtime.pages.filter((p): p is JsonObject => !!p && typeof p === "object" && !Array.isArray(p)) : [];
  const allowedTypes = new Set(["hero", "text", "callout", "metrics", "list", "cards", "divider", "action_form"]);
  const pages = rawPages.slice(0, 8).map((page, pageIndex) => {
    const blocksRaw = Array.isArray(page.blocks) ? page.blocks.filter((b): b is JsonObject => !!b && typeof b === "object" && !Array.isArray(b)) : [];
    const blocks = blocksRaw.slice(0, 20).flatMap((block, blockIndex) => {
      const type = typeof block.type === "string" ? block.type : "";
      if (!allowedTypes.has(type)) return [];
      const props = asObject(block.props);
      if (type === "action_form") {
        const actionKey = typeof props.actionKey === "string" ? props.actionKey : "";
        if (!actionKeys.has(actionKey)) return [];
      }
      const requested = Array.isArray(block.dataSources) ? block.dataSources.filter((v): v is string => typeof v === "string") : [];
      return [{
        ...block,
        id: typeof block.id === "string" && block.id ? block.id : `block-${pageIndex + 1}-${blockIndex + 1}`,
        dataSources: requested.filter((key) => dataSourceKeys.has(key)),
      }];
    });
    return {
      ...page,
      id: typeof page.id === "string" && page.id ? page.id : `page-${pageIndex + 1}`,
      title: typeof page.title === "string" && page.title ? page.title : `Página ${pageIndex + 1}`,
      blocks,
    };
  });

  if (!pages.length) return null;
  const pageIds = new Set(pages.map((p) => String(p.id)));
  const defaultPageId = typeof runtime.defaultPageId === "string" && pageIds.has(runtime.defaultPageId)
    ? runtime.defaultPageId
    : String(pages[0]!.id);

  const usedActions = new Set<string>();
  for (const page of pages) {
    for (const block of (page.blocks as JsonObject[])) {
      if (block.type !== "action_form") continue;
      const key = asObject(block.props).actionKey;
      if (typeof key === "string" && actionKeys.has(key)) usedActions.add(key);
    }
  }

  return {
    ...definition,
    runtime: { ...runtime, version: 1, defaultPageId, pages },
    settings: {
      ...asObject(definition.settings),
      runtimeAccess: {
        ...asObject(asObject(definition.settings).runtimeAccess),
        actions: { enabled: usedActions.size > 0, keys: [...usedActions] },
      },
      jarvisBuilt: true,
    },
  };
}

async function loadRegistry(): Promise<RegistryCapability[]> {
  const [components, features, actions, workflows, dataSources] = await Promise.all([
    db.select({ key: appComponentRegistryTable.key, name: appComponentRegistryTable.name, category: appComponentRegistryTable.category })
      .from(appComponentRegistryTable).where(eq(appComponentRegistryTable.status, "active")),
    db.select({ key: appFeatureRegistryTable.key, name: appFeatureRegistryTable.name, category: appFeatureRegistryTable.category })
      .from(appFeatureRegistryTable).where(eq(appFeatureRegistryTable.status, "active")),
    db.select({ key: appActionRegistryTable.key, name: appActionRegistryTable.name, category: appActionRegistryTable.category })
      .from(appActionRegistryTable).where(and(eq(appActionRegistryTable.status, "active"), isNotNull(appActionRegistryTable.executorKey))),
    db.select({ key: appWorkflowRegistryTable.key, name: appWorkflowRegistryTable.name })
      .from(appWorkflowRegistryTable).where(eq(appWorkflowRegistryTable.status, "active")),
    db.select({ key: appDataSourceRegistryTable.key, name: appDataSourceRegistryTable.name, category: appDataSourceRegistryTable.category })
      .from(appDataSourceRegistryTable).where(eq(appDataSourceRegistryTable.status, "active")),
  ]);
  return [
    ...components.map((x) => ({ ...x, kind: "component" as const })),
    ...features.map((x) => ({ ...x, kind: "feature" as const })),
    ...actions.map((x) => ({ ...x, kind: "action" as const })),
    ...workflows.map((x) => ({ ...x, category: null, kind: "workflow" as const })),
    ...dataSources.map((x) => ({ ...x, kind: "dataSource" as const })),
  ];
}

async function ensureBaseTemplate(verticalRaw: string | null, registry: RegistryCapability[]) {
  const blueprint = findVerticalBlueprint(verticalRaw);
  if (!blueprint) return null;
  const resolution = resolveVerticalBlueprint(blueprint, registry);

  return db.transaction(async (tx) => {
    let [vertical] = await tx.select().from(appVerticalsTable).where(eq(appVerticalsTable.key, blueprint.key)).limit(1);
    if (!vertical) {
      [vertical] = await tx.insert(appVerticalsTable).values({
        key: blueprint.key,
        name: blueprint.name,
        familyKey: blueprint.familyKey,
        status: "active",
        metadata: { system: true, blueprint: true },
      }).returning();
    }

    const templateSlug = `base-${blueprint.key}`;
    let [template] = await tx.select().from(appTemplatesTable)
      .where(and(eq(appTemplatesTable.verticalId, vertical.id), eq(appTemplatesTable.slug, templateSlug))).limit(1);
    if (!template) {
      [template] = await tx.insert(appTemplatesTable).values({
        verticalId: vertical.id,
        name: `Base · ${blueprint.name}`,
        slug: templateSlug,
        description: blueprint.description,
        status: "active",
        settings: { system: true, blueprintKey: blueprint.key, generated: true },
      }).returning();
    }

    let [version] = await tx.select().from(appTemplateVersionsTable)
      .where(and(eq(appTemplateVersionsTable.templateId, template.id), eq(appTemplateVersionsTable.status, "published")))
      .orderBy(desc(appTemplateVersionsTable.version)).limit(1);
    if (!version) {
      const [latest] = await tx.select({ value: max(appTemplateVersionsTable.version) }).from(appTemplateVersionsTable)
        .where(eq(appTemplateVersionsTable.templateId, template.id));
      [version] = await tx.insert(appTemplateVersionsTable).values({
        templateId: template.id,
        version: (latest?.value ?? 0) + 1,
        status: "published",
        definition: buildVerticalStarterDefinition(blueprint, resolution, registry),
        changeLog: "Base materializada automaticamente pelo JARVIS Tool Builder",
        publishedAt: new Date(),
      }).returning();
    }
    return { blueprint, resolution, template, version };
  });
}

async function aiPlan(params: {
  tenantId: string;
  vertical: string | null;
  brief: string;
  requestedName?: string;
  tools: Array<{ toolKey: string; toolLabel: string; deliveryType: string; metadata: unknown }>;
  apps: Array<{ id: string; name: string; slug: string; status: string }>;
  registry: RegistryCapability[];
}) {
  const registry = params.registry.slice(0, 160).map((r) => ({ kind: r.kind, key: r.key, name: r.name }));
  const prompt = `Você é o JARVIS Tool Orchestrator do VendorAI.
Objetivo: atender o pedido do tenant REUTILIZANDO capacidades existentes antes de criar algo novo.
Nunca invente actions, dataSources, integrações ou capacidades.
Se faltar capacidade executável essencial, strategy deve ser "requires_development".
Se uma ferramenta existente atende bem, strategy="reuse" e existingToolKey deve ser exatamente uma chave fornecida.
Se for possível compor uma experiência nova somente com registry real, strategy="create" e definition deve usar apenas blocos hero,text,callout,metrics,list,cards,divider,action_form. action_form só pode usar actionKey do registry.
Retorne JSON puro.

VERTICAL: ${params.vertical ?? "não informada"}
PEDIDO: ${params.brief}
NOME DESEJADO: ${params.requestedName ?? ""}
FERRAMENTAS DO TENANT: ${JSON.stringify(params.tools)}
APPS PUBLICADOS/RASCUNHOS: ${JSON.stringify(params.apps)}
REGISTRY DISPONÍVEL: ${JSON.stringify(registry)}

Formato:
{
 "strategy":"reuse|create|requires_development",
 "summary":"...",
 "name":"...",
 "existingToolKey":null,
 "deliveryType":"tool|agent|simulator|planner|analyzer|pre_project|app",
 "gaps":[{"type":"action|data_source|integration|other","description":"..."}],
 "definition":{"runtime":{"defaultPageId":"home","pages":[...]}, "settings":{}}
}`;

  const result = await callOpenAI(params.tenantId, "intelligence_analysis", [
    { role: "system", content: "Responda somente JSON válido. Preserve segurança, isolamento por tenant e reutilização de capacidades existentes." },
    { role: "user", content: prompt },
  ], { maxTokens: 4500, temperature: 0.1, responseFormat: { type: "json_object" } });

  return JSON.parse(result.content) as {
    strategy?: string;
    summary?: string;
    name?: string;
    existingToolKey?: string | null;
    deliveryType?: string;
    gaps?: Array<{ type?: string; description?: string }>;
    definition?: JsonObject;
  };
}



function runtimeAccessPolicy(definition: unknown): { publicEnabled: boolean; authEnabled: boolean } {
  const root = asObject(definition);
  const settings = asObject(root.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const publicPolicy = asObject(runtimeAccess.public);
  const authPolicy = asObject(runtimeAccess.auth);
  return {
    publicEnabled: publicPolicy.enabled === true,
    authEnabled: authPolicy.enabled === true,
  };
}

export async function syncTenantLeadCaptureToolsFromExistingCapabilities(tenantId: string): Promise<{
  discovered: number;
  createdOrUpdated: number;
  skipped: number;
}> {
  const [[profile], apps, agentConfigs, commercialAccess] = await Promise.all([
    db
      .select({ vertical: businessProfilesTable.vertical })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
    db
      .select({
        id: appInstancesTable.id,
        name: appInstancesTable.name,
        status: appInstancesTable.status,
      })
      .from(appInstancesTable)
      .where(and(
        eq(appInstancesTable.tenantId, tenantId),
        eq(appInstancesTable.status, "published"),
      )),
    db
      .select({
        agentKey: tenantAgentConfigsTable.agentKey,
        ativo: tenantAgentConfigsTable.ativo,
        nomePerfil: tenantAgentConfigsTable.nomePerfil,
      })
      .from(tenantAgentConfigsTable)
      .where(and(
        eq(tenantAgentConfigsTable.tenantId, tenantId),
        eq(tenantAgentConfigsTable.ativo, true),
      )),
    getTenantCommercialAccess(tenantId),
  ]);

  let createdOrUpdated = 0;
  let skipped = 0;

  for (const app of apps) {
    const [version] = await db
      .select({
        id: appInstanceVersionsTable.id,
        definition: appInstanceVersionsTable.definition,
        publishedAt: appInstanceVersionsTable.publishedAt,
      })
      .from(appInstanceVersionsTable)
      .where(and(
        eq(appInstanceVersionsTable.tenantId, tenantId),
        eq(appInstanceVersionsTable.appInstanceId, app.id),
        eq(appInstanceVersionsTable.status, "published"),
      ))
      .orderBy(desc(appInstanceVersionsTable.publishedAt), desc(appInstanceVersionsTable.version))
      .limit(1);

    if (!version) {
      skipped += 1;
      continue;
    }

    const access = runtimeAccessPolicy(version.definition);
    if (!access.publicEnabled && !access.authEnabled) {
      skipped += 1;
      continue;
    }

    const toolKey = `app.instance.${app.id}`;
    const runtimeUrl = `/apps/${app.id}`;
    const [existing] = await db
      .select({ metadata: tenantLeadCaptureToolsTable.metadata })
      .from(tenantLeadCaptureToolsTable)
      .where(and(
        eq(tenantLeadCaptureToolsTable.tenantId, tenantId),
        eq(tenantLeadCaptureToolsTable.toolKey, toolKey),
      ))
      .limit(1);

    const metadata = {
      ...asObject(existing?.metadata),
      source: "auto_discovered_app_builder",
      appInstanceId: app.id,
      appVersionId: version.id,
      runtimeUrl,
      publicRuntime: access.publicEnabled,
      authenticatedRuntime: access.authEnabled,
      autoDiscovered: true,
      lastSyncedAt: new Date().toISOString(),
    };

    await db
      .insert(tenantLeadCaptureToolsTable)
      .values({
        tenantId,
        toolKey,
        toolLabel: app.name,
        deliveryType: "app",
        enabled: true,
        freePolicy: { mode: "session", limit: 1 },
        metadata,
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [tenantLeadCaptureToolsTable.tenantId, tenantLeadCaptureToolsTable.toolKey],
        set: {
          toolLabel: app.name,
          deliveryType: "app",
          metadata,
          updatedAt: new Date(),
        },
      });

    createdOrUpdated += 1;
  }


  const publicAgentLabels: Record<string, string> = {
    prospector: "Prospector consultivo",
    sdr: "Assistente comercial",
    suporte: "Agente de suporte",
    farmacia: "Agente da Farmácia",
    agendamento: "Agente de agendamento",
  };

  const tenantVertical = normalize(profile?.vertical ?? "");

  for (const agent of agentConfigs) {
    const verticalCompatible =
      agent.agentKey !== "farmacia" || tenantVertical.includes("farm");

    if (!verticalCompatible || !Object.prototype.hasOwnProperty.call(publicAgentLabels, agent.agentKey)) {
      skipped += 1;
      continue;
    }
    const toolKey = `agent.public.${agent.agentKey}`;
    const metadata = {
      source: "auto_discovered_agent",
      agentKey: agent.agentKey,
      publicPath: `/entrega/agente/${agent.agentKey}`,
      autoDiscovered: true,
      lastSyncedAt: new Date().toISOString(),
    };
    await db
      .insert(tenantLeadCaptureToolsTable)
      .values({
        tenantId,
        toolKey,
        toolLabel: agent.nomePerfil?.trim() || publicAgentLabels[agent.agentKey]!,
        deliveryType: "agent",
        enabled: true,
        freePolicy: { mode: "session", limit: 1 },
        metadata,
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [tenantLeadCaptureToolsTable.tenantId, tenantLeadCaptureToolsTable.toolKey],
        set: {
          toolLabel: agent.nomePerfil?.trim() || publicAgentLabels[agent.agentKey]!,
          deliveryType: "agent",
          metadata,
          updatedAt: new Date(),
        },
      });
    createdOrUpdated += 1;
  }

  if (commercialAccess.moduleKeys.has("sdr")) {
    const metadata = {
      source: "auto_discovered_simulator",
      publicPath: "/entrega/simulador/sdr",
      autoDiscovered: true,
      lastSyncedAt: new Date().toISOString(),
    };
    await db
      .insert(tenantLeadCaptureToolsTable)
      .values({
        tenantId,
        toolKey: "simulator.sdr",
        toolLabel: "Simulador de atendimento",
        deliveryType: "simulator",
        enabled: true,
        freePolicy: { mode: "session", limit: 1 },
        metadata,
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [tenantLeadCaptureToolsTable.tenantId, tenantLeadCaptureToolsTable.toolKey],
        set: { metadata, updatedAt: new Date() },
      });
    createdOrUpdated += 1;
  }

  if (commercialAccess.moduleKeys.has("arch")) {
    const metadata = {
      source: "auto_discovered_arqdor",
      publicPath: "/entrega/arqdor/pre-projeto",
      moduleKey: "arch",
      autoDiscovered: true,
      lastSyncedAt: new Date().toISOString(),
    };
    await db
      .insert(tenantLeadCaptureToolsTable)
      .values({
        tenantId,
        toolKey: "arqdor.pre_project.public",
        toolLabel: "Pré-Projeto ARQDOR",
        deliveryType: "pre_project",
        enabled: true,
        freePolicy: { mode: "uses", limit: 1 },
        metadata,
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [tenantLeadCaptureToolsTable.tenantId, tenantLeadCaptureToolsTable.toolKey],
        set: { metadata, updatedAt: new Date() },
      });
    createdOrUpdated += 1;
  }

  return {
    discovered: apps.length + agentConfigs.length + (commercialAccess.moduleKeys.has("sdr") ? 1 : 0) + (commercialAccess.moduleKeys.has("arch") ? 1 : 0),
    createdOrUpdated,
    skipped,
  };
}

export type ExistingLeadCaptureToolRecommendation = {
  toolKey: string;
  toolLabel: string;
  deliveryType: string;
  toolRef: string;
  reason: string;
  source: "jarvis" | "lexical";
};

function resolveExistingToolRef(tool: { toolKey: string; metadata: unknown }): string | null {
  const metadata = asObject(tool.metadata);
  const candidates = [
    metadata["publicUrl"],
    metadata["runtimeUrl"],
    metadata["route"],
    metadata["publicPath"],
    metadata["toolRef"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim();
    if (value.startsWith("/") && !value.startsWith("//")) return value;
  }
  return null;
}

export async function recommendExistingLeadCaptureToolWithJarvis(params: {
  tenantId: string;
  brief: string;
}): Promise<{
  recommendation: ExistingLeadCaptureToolRecommendation | null;
  tools: Array<{
    id: string;
    toolKey: string;
    toolLabel: string;
    deliveryType: string;
    toolRef: string;
    freePolicy: unknown;
    metadata: unknown;
  }>;
}> {
  const rows = await db
    .select()
    .from(tenantLeadCaptureToolsTable)
    .where(and(
      eq(tenantLeadCaptureToolsTable.tenantId, params.tenantId),
      eq(tenantLeadCaptureToolsTable.enabled, true),
    ));

  const tools = rows.flatMap((tool) => {
    const toolRef = resolveExistingToolRef(tool);
    if (!toolRef) return [];
    return [{
      id: tool.id,
      toolKey: tool.toolKey,
      toolLabel: tool.toolLabel,
      deliveryType: tool.deliveryType,
      toolRef,
      freePolicy: tool.freePolicy,
      metadata: tool.metadata,
    }];
  });

  if (tools.length === 0) return { recommendation: null, tools: [] };

  const lexical = tools
    .map((tool) => ({
      tool,
      score: similarity(params.brief, `${tool.toolLabel} ${tool.toolKey} ${tool.deliveryType} ${JSON.stringify(tool.metadata)}`),
    }))
    .sort((a, b) => b.score - a.score)[0]!;

  if (tools.length === 1 || lexical.score >= 0.62) {
    return {
      recommendation: {
        toolKey: lexical.tool.toolKey,
        toolLabel: lexical.tool.toolLabel,
        deliveryType: lexical.tool.deliveryType,
        toolRef: lexical.tool.toolRef,
        reason: tools.length === 1
          ? "Única ferramenta de entrega habilitada e executável deste tenant."
          : "Melhor correspondência com o objetivo e contexto da campanha.",
        source: "lexical",
      },
      tools,
    };
  }

  try {
    const result = await callOpenAI(params.tenantId, "intelligence_analysis", [
      {
        role: "system",
        content:
          "Você é o JARVIS do VendorAI. Escolha UMA ferramenta existente para entregar ao lead. " +
          "Nunca crie ferramenta, rota ou chave. Responda JSON puro com toolKey e reason. " +
          "Se nenhuma for adequada, toolKey deve ser null.",
      },
      {
        role: "user",
        content: JSON.stringify({
          campaignBrief: params.brief,
          tools: tools.map((tool) => ({
            toolKey: tool.toolKey,
            toolLabel: tool.toolLabel,
            deliveryType: tool.deliveryType,
            metadata: tool.metadata,
          })),
        }),
      },
    ], { maxTokens: 350, temperature: 0.1, responseFormat: { type: "json_object" } });

    const parsed = JSON.parse(result.content) as { toolKey?: string | null; reason?: string };
    const chosen = parsed.toolKey ? tools.find((tool) => tool.toolKey === parsed.toolKey) : null;
    if (chosen) {
      return {
        recommendation: {
          toolKey: chosen.toolKey,
          toolLabel: chosen.toolLabel,
          deliveryType: chosen.deliveryType,
          toolRef: chosen.toolRef,
          reason: parsed.reason?.trim() || "Selecionada pelo JARVIS conforme o contexto da campanha.",
          source: "jarvis",
        },
        tools,
      };
    }
  } catch {
    // Recomendação por IA é opcional; em falha, cai no ranking lexical sem inventar nada.
  }

  return {
    recommendation: {
      toolKey: lexical.tool.toolKey,
      toolLabel: lexical.tool.toolLabel,
      deliveryType: lexical.tool.deliveryType,
      toolRef: lexical.tool.toolRef,
      reason: "Melhor correspondência disponível entre as ferramentas existentes.",
      source: "lexical",
    },
    tools,
  };
}

export async function buildLeadCaptureToolWithJarvis(tenantId: string, request: JarvisToolBuildRequest): Promise<JarvisToolBuildResult> {
  const [[profile], existingTools, apps, registry] = await Promise.all([
    db.select({ vertical: businessProfilesTable.vertical }).from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select().from(tenantLeadCaptureToolsTable).where(eq(tenantLeadCaptureToolsTable.tenantId, tenantId)),
    db.select({ id: appInstancesTable.id, name: appInstancesTable.name, slug: appInstancesTable.slug, status: appInstancesTable.status })
      .from(appInstancesTable).where(eq(appInstancesTable.tenantId, tenantId)),
    loadRegistry(),
  ]);

  const brief = request.brief.trim();
  const forcedReuse = request.mode === "reuse";
  const lexical = existingTools
    .map((tool) => ({ tool, score: similarity(brief, `${tool.toolLabel} ${tool.toolKey} ${tool.deliveryType}`) }))
    .sort((a, b) => b.score - a.score)[0];

  if ((forcedReuse || (request.mode !== "create" && lexical && lexical.score >= 0.6)) && lexical) {
    return {
      strategy: "reuse",
      summary: `O JARVIS encontrou uma entrega já existente adequada: ${lexical.tool.toolLabel}.`,
      tool: lexical.tool as unknown as Record<string, unknown>,
    };
  }

  const plan = await aiPlan({
    tenantId,
    vertical: profile?.vertical ?? null,
    brief,
    requestedName: request.name,
    tools: existingTools.map((t) => ({ toolKey: t.toolKey, toolLabel: t.toolLabel, deliveryType: t.deliveryType, metadata: t.metadata })),
    apps,
    registry,
  });

  if (plan.strategy === "reuse" && plan.existingToolKey) {
    const tool = existingTools.find((item) => item.toolKey === plan.existingToolKey);
    if (tool) return { strategy: "reuse", summary: plan.summary || `Reutilizando ${tool.toolLabel}.`, tool: tool as unknown as Record<string, unknown> };
  }

  const gaps = (plan.gaps ?? [])
    .filter((g) => g && typeof g.description === "string")
    .map((g) => ({ type: String(g.type ?? "other"), description: String(g.description) }));

  if (plan.strategy === "requires_development" || gaps.some((g) => /essencial|necessaria|necessário|falt/i.test(g.description))) {
    return {
      strategy: "requires_development",
      summary: plan.summary || "A solicitação exige uma capacidade que ainda não existe no registry seguro do VendorAI.",
      gaps,
    };
  }

  const base = await ensureBaseTemplate(profile?.vertical ?? null, registry);
  if (!base) {
    return {
      strategy: "requires_development",
      summary: "O tenant ainda não possui uma vertical mapeada no App Builder para criação segura desta entrega.",
      gaps: [{ type: "other", description: "Mapear a vertical no App Builder antes da publicação automática." }],
    };
  }

  const actionKeys = new Set(registry.filter((r) => r.kind === "action").map((r) => r.key));
  const dataSourceKeys = new Set(registry.filter((r) => r.kind === "dataSource").map((r) => r.key));
  const definition = sanitizeRuntimeDefinition(asObject(plan.definition), actionKeys, dataSourceKeys);
  if (!definition) {
    return {
      strategy: "requires_development",
      summary: "O JARVIS não conseguiu montar uma definição de runtime válida apenas com capacidades existentes.",
      gaps: [{ type: "other", description: "Nenhuma página executável segura foi gerada." }],
    };
  }

  const toolName = (request.name || plan.name || "Ferramenta criada pelo JARVIS").trim().slice(0, 120);
  const baseSlug = slugify(toolName);
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
  const publish = request.publish !== false;

  const created = await db.transaction(async (tx) => {
    const [app] = await tx.insert(appInstancesTable).values({
      tenantId,
      templateId: base.template.id,
      templateVersionId: base.version.id,
      name: toolName,
      slug,
      status: publish ? "published" : "draft",
      theme: {},
      navigation: [],
      settings: {
        jarvisBuilt: true,
        leadCapture: true,
        sourceBrief: brief.slice(0, 4000),
        verticalKey: base.blueprint.key,
      },
      whiteLabel: {},
    }).returning();

    const [version] = await tx.insert(appInstanceVersionsTable).values({
      tenantId,
      appInstanceId: app.id,
      templateVersionId: base.version.id,
      version: 1,
      status: publish ? "published" : "draft",
      definition: {
        ...definition,
        name: toolName,
        slug,
        templateId: base.template.id,
        templateVersionId: base.version.id,
      },
      publishedAt: publish ? new Date() : null,
    }).returning();

    const toolKey = `jarvis.app.${app.id}`;
    const [tool] = await tx.insert(tenantLeadCaptureToolsTable).values({
      tenantId,
      toolKey,
      toolLabel: toolName,
      vertical: profile?.vertical ?? null,
      deliveryType: plan.deliveryType || "app",
      enabled: true,
      freePolicy: {
        mode: request.freePolicy?.mode ?? "uses",
        limit: request.freePolicy?.limit ?? 1,
        durationDays: request.freePolicy?.durationDays,
        note: request.freePolicy?.note,
      } as any,
      metadata: {
        source: "jarvis_app_builder",
        appInstanceId: app.id,
        appVersionId: version.id,
        runtimeUrl: `/apps/${app.id}`,
        blueprintKey: base.blueprint.key,
        buildBrief: brief.slice(0, 4000),
      },
    }).returning();

    return { app, version, tool };
  });

  return {
    strategy: "created",
    summary: plan.summary || `O JARVIS criou ${toolName} usando apenas capacidades registradas no App Builder.`,
    tool: created.tool as unknown as Record<string, unknown>,
    app: {
      id: created.app.id,
      name: created.app.name,
      slug: created.app.slug,
      runtimeUrl: `/apps/${created.app.id}`,
      published: publish,
    },
    gaps,
  };
}
