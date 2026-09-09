import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appActionRegistryTable,
  appAiPoliciesTable,
  appComponentRegistryTable,
  appDataSourceRegistryTable,
  appFeatureRegistryTable,
  appTemplateVersionsTable,
  appTemplatesTable,
  appVerticalsTable,
  appWorkflowRegistryTable,
  db,
  tenantsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { callOpenAI } from "../lib/ai-gateway.js";

const router: IRouter = Router();
router.use(requireRole("super_admin"));

const jsonObjectSchema = z.record(z.string(), z.unknown());

const requestSchema = z.object({
  mode: z.enum(["generate", "revise", "analyze"]).default("generate"),
  depth: z.enum(["fast", "deep"]).default("deep"),
  request: z.string().trim().min(8).max(12000),
  templateId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  appContext: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
    ownerType: z.enum(["tenant", "prospect", "internal"]).optional(),
    ownerName: z.string().nullable().optional(),
    ownerCompany: z.string().nullable().optional(),
    ownerEmail: z.string().nullable().optional(),
    status: z.string().optional(),
  }).optional(),
  currentDefinition: jsonObjectSchema.optional(),
  conversation: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000),
  })).max(12).default([]),
});

const proposalSchema = z.object({
  summary: z.string().default(""),
  assumptions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  architecture: z.object({
    pages: z.array(z.object({ id: z.string(), title: z.string(), purpose: z.string().optional() })).default([]),
    roles: z.array(z.object({ key: z.string(), name: z.string(), purpose: z.string().optional() })).default([]),
    dataModel: z.array(z.object({ entity: z.string(), purpose: z.string().optional(), source: z.string().optional() })).default([]),
    integrations: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
  }).default({ pages: [], roles: [], dataModel: [], integrations: [], risks: [] }),
  definition: jsonObjectSchema.default({}),
  gaps: z.array(z.object({
    type: z.enum(["action", "data_source", "integration", "permission", "component", "other"]),
    key: z.string().optional(),
    description: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  })).default([]),
  recommendedActions: z.array(z.string()).default([]),
  quality: z.object({
    completeness: z.number().min(0).max(100).default(0),
    ux: z.number().min(0).max(100).default(0),
    security: z.number().min(0).max(100).default(0),
    data: z.number().min(0).max(100).default(0),
    integration: z.number().min(0).max(100).default(0),
  }).default({ completeness: 0, ux: 0, security: 0, data: 0, integration: 0 }),
});

type Proposal = z.infer<typeof proposalSchema>;

type RegistryContext = {
  components: Array<{ key: string; name: string; category: string | null }>;
  features: Array<{ key: string; name: string; category: string | null }>;
  actions: Array<{ key: string; name: string; category: string | null; riskLevel: string; requiredPermissions: unknown }>;
  dataSources: Array<{ key: string; name: string; category: string | null }>;
  workflows: Array<{ key: string; name: string }>;
  aiPolicies: Array<{ key: string; name: string; riskLevel: string; rules: unknown }>;
};

const ALLOWED_BLOCK_TYPES = new Set(["hero", "text", "callout", "metrics", "list", "cards", "divider", "action_form"]);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateDefinition(definition: Record<string, unknown>, actionKeys: Set<string>) {
  const findings: string[] = [];
  const runtime = asObject(definition.runtime);
  const pages = asObjects(runtime.pages);
  if (pages.length === 0) findings.push("A definição não possui páginas em runtime.pages.");

  const pageIds = pages.map((page) => text(page.id)).filter(Boolean);
  if (pageIds.length !== pages.length) findings.push("Todas as páginas precisam de id estável.");
  if (new Set(pageIds).size !== pageIds.length) findings.push("Existem IDs de página duplicados.");
  const defaultPageId = text(runtime.defaultPageId);
  if (defaultPageId && !pageIds.includes(defaultPageId)) findings.push("runtime.defaultPageId não aponta para uma página existente.");

  for (const page of pages) {
    for (const block of asObjects(page.blocks)) {
      const type = text(block.type);
      if (!ALLOWED_BLOCK_TYPES.has(type)) findings.push(`Bloco não suportado: ${type || "sem tipo"}.`);
      if (type === "action_form") {
        const props = asObject(block.props);
        const actionKey = text(props.actionKey);
        if (actionKey && !actionKeys.has(actionKey)) findings.push(`Action '${actionKey}' não existe no registry e não pode ser tratada como executável.`);
      }
    }
  }
  return findings;
}

async function loadRegistryContext(verticalId?: string | null): Promise<RegistryContext> {
  const [components, features, actions, dataSources, workflows, policies] = await Promise.all([
    db.select({ key: appComponentRegistryTable.key, name: appComponentRegistryTable.name, category: appComponentRegistryTable.category })
      .from(appComponentRegistryTable).where(eq(appComponentRegistryTable.status, "active")),
    db.select({ key: appFeatureRegistryTable.key, name: appFeatureRegistryTable.name, category: appFeatureRegistryTable.category })
      .from(appFeatureRegistryTable).where(eq(appFeatureRegistryTable.status, "active")),
    db.select({ key: appActionRegistryTable.key, name: appActionRegistryTable.name, category: appActionRegistryTable.category, riskLevel: appActionRegistryTable.riskLevel, requiredPermissions: appActionRegistryTable.requiredPermissions })
      .from(appActionRegistryTable).where(eq(appActionRegistryTable.status, "active")),
    db.select({ key: appDataSourceRegistryTable.key, name: appDataSourceRegistryTable.name, category: appDataSourceRegistryTable.category })
      .from(appDataSourceRegistryTable).where(eq(appDataSourceRegistryTable.status, "active")),
    db.select({ key: appWorkflowRegistryTable.key, name: appWorkflowRegistryTable.name })
      .from(appWorkflowRegistryTable).where(eq(appWorkflowRegistryTable.status, "active")),
    verticalId
      ? db.select({ key: appAiPoliciesTable.key, name: appAiPoliciesTable.name, riskLevel: appAiPoliciesTable.riskLevel, rules: appAiPoliciesTable.rules })
          .from(appAiPoliciesTable)
          .where(and(eq(appAiPoliciesTable.status, "active"), eq(appAiPoliciesTable.verticalId, verticalId)))
      : db.select({ key: appAiPoliciesTable.key, name: appAiPoliciesTable.name, riskLevel: appAiPoliciesTable.riskLevel, rules: appAiPoliciesTable.rules })
          .from(appAiPoliciesTable)
          .where(eq(appAiPoliciesTable.status, "active")),
  ]);
  return { components, features, actions, dataSources, workflows, aiPolicies: policies };
}

function systemPrompt() {
  return `Você é o ARQUITETO IA do VendorAI App Builder. Não é um assistente genérico. Atue simultaneamente como principal product architect, software architect, UX lead, data architect, security engineer e integration architect.

OBJETIVO
Projetar ou revisar apps empresariais operacionais prontos para serem construídos no App Builder, com profundidade suficiente para produção. Pense em jornadas, exceções, papéis, dados, permissões, integrações, observabilidade e evolução futura.

REGRAS INEGOCIÁVEIS
1. Não invente capacidades executáveis. Actions, data sources, components e workflows disponíveis serão fornecidos no contexto. Se algo necessário não existir, registre em gaps; não finja que já existe.
2. Preserve tudo que estiver bom na definição atual quando o modo for revise/analyze. Nunca destrua customizações sem motivo explícito.
3. Gere definition compatível com runtime.version=1. Tipos de bloco permitidos: hero, text, callout, metrics, list, cards, divider, action_form.
4. action_form só pode usar actionKey existente no registry. Se a action necessária não existir, descreva-a em gaps.
5. Segurança por menor privilégio. Sempre pense em role, permission, dados sensíveis, ações críticas e separação de responsabilidades.
6. Mobile-first sem sacrificar desktop. Evite páginas gigantes; use navegação clara e fluxo por tarefa.
7. Diferencie o que é dashboard, operação, consulta, configuração e administração.
8. Não publique. Sua saída sempre é uma proposta versionável para revisão humana.
9. Retorne SOMENTE JSON válido, sem markdown.

FORMATO OBRIGATÓRIO
{
  "summary": "...",
  "assumptions": ["..."],
  "questions": ["somente bloqueadores reais"],
  "warnings": ["..."],
  "architecture": {
    "pages": [{"id":"...","title":"...","purpose":"..."}],
    "roles": [{"key":"...","name":"...","purpose":"..."}],
    "dataModel": [{"entity":"...","purpose":"...","source":"registry|tenant|planned"}],
    "integrations": ["..."],
    "risks": ["..."]
  },
  "definition": {"runtime":{"version":1,"defaultPageId":"...","pages":[]}},
  "gaps": [{"type":"action|data_source|integration|permission|component|other","key":"opcional","description":"...","severity":"low|medium|high|critical"}],
  "recommendedActions": ["..."],
  "quality": {"completeness":0,"ux":0,"security":0,"data":0,"integration":0}
}

Os scores de quality devem ser rigorosos. Um app sem dados, permissões ou integrações necessárias não merece nota alta.`;
}

function parseProposal(content: string): Proposal {
  const raw = JSON.parse(content) as unknown;
  return proposalSchema.parse(raw);
}

router.post("/admin/app-builder/ai/architect", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const billingTenantId = typeof (req as any).user?.tenantId === "string"
    ? (req as any).user.tenantId
    : parsed.data.tenantId;
  if (!billingTenantId) {
    res.status(422).json({ error: "O SuperAdmin precisa estar associado a um tenant de cobrança para usar a IA." });
    return;
  }

  const { mode, depth, request, templateId, tenantId, appContext, conversation } = parsed.data;

  let template: { id: string; name: string; slug: string; description: string | null; verticalId: string } | null = null;
  let vertical: { id: string; key: string; name: string } | null = null;
  let baseDefinition = parsed.data.currentDefinition ?? {};

  if (templateId) {
    [template] = await db.select({
      id: appTemplatesTable.id,
      name: appTemplatesTable.name,
      slug: appTemplatesTable.slug,
      description: appTemplatesTable.description,
      verticalId: appTemplatesTable.verticalId,
    }).from(appTemplatesTable).where(eq(appTemplatesTable.id, templateId)).limit(1);

    if (!template) {
      res.status(404).json({ error: "Template não encontrado" });
      return;
    }

    [vertical] = await db.select({ id: appVerticalsTable.id, key: appVerticalsTable.key, name: appVerticalsTable.name })
      .from(appVerticalsTable).where(eq(appVerticalsTable.id, template.verticalId)).limit(1);

    if (!parsed.data.currentDefinition) {
      const [latest] = await db.select({ definition: appTemplateVersionsTable.definition })
        .from(appTemplateVersionsTable)
        .where(eq(appTemplateVersionsTable.templateId, template.id))
        .orderBy(desc(appTemplateVersionsTable.version))
        .limit(1);
      baseDefinition = latest?.definition ?? {};
    }
  }

  let targetTenant: { id: string; name: string; vertical: string | null } | null = null;
  if (tenantId) {
    [targetTenant] = await db.select({ id: tenantsTable.id, name: tenantsTable.name, vertical: tenantsTable.vertical })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
    if (!targetTenant) {
      res.status(404).json({ error: "Tenant de contexto não encontrado" });
      return;
    }
  }

  const registry = await loadRegistryContext(template?.verticalId);
  const compactContext = {
    mode,
    target: targetTenant ?? appContext ?? { ownerType: "internal" },
    template,
    vertical,
    currentDefinition: baseDefinition,
    registry,
  };

  const historyText = conversation.length
    ? `\nHISTÓRICO RESUMIDO DA CONVERSA:\n${conversation.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n")}`
    : "";

  const first = await callOpenAI(
    billingTenantId,
    "intelligence_analysis",
    [
      { role: "system", content: systemPrompt() },
      { role: "user", content: `CONTEXTO DO APP BUILDER:\n${JSON.stringify(compactContext)}${historyText}\n\nSOLICITAÇÃO ATUAL:\n${request}` },
    ],
    {
      model: "gpt-4.1",
      temperature: 0.2,
      maxTokens: depth === "deep" ? 10000 : 6500,
      responseFormat: { type: "json_object" },
    },
  );

  let proposal: Proposal;
  try {
    proposal = parseProposal(first.content);
  } catch {
    res.status(502).json({ error: "A IA retornou uma arquitetura inválida. Tente novamente." });
    return;
  }

  let findings = validateDefinition(proposal.definition, new Set(registry.actions.map((item) => item.key)));
  let usage = {
    inputTokens: first.inputTokens,
    outputTokens: first.outputTokens,
    costUsd: first.costUsd,
    passes: 1,
  };

  if (depth === "deep") {
    const second = await callOpenAI(
      billingTenantId,
      "intelligence_analysis",
      [
        { role: "system", content: `${systemPrompt()}\n\nSEGUNDA PASSAGEM: você agora é o revisor crítico. Procure falhas de produto, UX, segurança, dados, permissões, integrações, IDs, navegação e compatibilidade com registries. Corrija o projeto. Não apenas comente: devolva a proposta FINAL já corrigida.` },
        { role: "user", content: `CONTEXTO ORIGINAL:\n${JSON.stringify(compactContext)}\n\nSOLICITAÇÃO:\n${request}\n\nCANDIDATO DA PRIMEIRA PASSAGEM:\n${JSON.stringify(proposal)}\n\nACHADOS DO VALIDADOR DETERMINÍSTICO:\n${JSON.stringify(findings)}` },
      ],
      {
        model: "gpt-4.1",
        temperature: 0.1,
        maxTokens: 10000,
        responseFormat: { type: "json_object" },
      },
    );
    try {
      proposal = parseProposal(second.content);
      findings = validateDefinition(proposal.definition, new Set(registry.actions.map((item) => item.key)));
      usage = {
        inputTokens: first.inputTokens + second.inputTokens,
        outputTokens: first.outputTokens + second.outputTokens,
        costUsd: first.costUsd + second.costUsd,
        passes: 2,
      };
    } catch {
      proposal.warnings.push("A segunda passagem não pôde ser validada; foi mantida a proposta da primeira passagem.");
    }
  }

  if (findings.length > 0) proposal.warnings.push(...findings.map((item) => `Validador: ${item}`));

  res.json({
    proposal,
    validation: { ok: findings.length === 0, findings },
    usage,
    context: {
      templateId: template?.id ?? null,
      tenantId: targetTenant?.id ?? null,
      vertical: vertical?.name ?? targetTenant?.vertical ?? null,
      depth,
      mode,
    },
  });
});

export default router;
