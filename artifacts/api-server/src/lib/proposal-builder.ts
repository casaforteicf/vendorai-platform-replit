import { eq } from "drizzle-orm";
import { db, businessProfilesTable } from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "./ai-gateway.js";

export type ProposalBuilderModuleKey =
  | "capa"
  | "apresentacao_empresa"
  | "diferenciais"
  | "resumo_executivo"
  | "escopo"
  | "etapas_orcamento"
  | "imagem_por_etapa"
  | "tabela_itens"
  | "cronograma"
  | "fisico_financeiro"
  | "condicoes_comerciais"
  | "validade_inicio"
  | "aceite"
  | "anexos"
  | "portal_cliente";

export type ProposalBuilderModule = {
  key: ProposalBuilderModuleKey;
  enabled: boolean;
  order: number;
  required?: boolean;
};

export type ProposalBuilderTemplate = {
  id: string;
  name: string;
  vertical: string;
  isDefault: boolean;
  modules: ProposalBuilderModule[];
  aiRules: {
    tone?: string;
    technicalLevel?: string;
    imageRules?: string[];
    contentRules?: string[];
    avoid?: string[];
  };
  createdBy: "ai" | "manual";
  createdAt: string;
  updatedAt: string;
};

export const ALLOWED_PROPOSAL_MODULES: ProposalBuilderModuleKey[] = [
  "capa",
  "apresentacao_empresa",
  "diferenciais",
  "resumo_executivo",
  "escopo",
  "etapas_orcamento",
  "imagem_por_etapa",
  "tabela_itens",
  "cronograma",
  "fisico_financeiro",
  "condicoes_comerciais",
  "validade_inicio",
  "aceite",
  "anexos",
  "portal_cliente",
];

export function defaultProposalBuilderTemplate(
  verticalRaw: string | null | undefined,
): Omit<ProposalBuilderTemplate, "id" | "createdAt" | "updatedAt"> {
  const vertical = String(verticalRaw ?? "geral")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const construction = /(construcao|construtora|arquitetura|reforma|obra|icf)/.test(vertical);
  const keys: ProposalBuilderModuleKey[] = construction
    ? [
        "capa",
        "apresentacao_empresa",
        "diferenciais",
        "resumo_executivo",
        "escopo",
        "etapas_orcamento",
        "imagem_por_etapa",
        "cronograma",
        "fisico_financeiro",
        "condicoes_comerciais",
        "validade_inicio",
        "aceite",
        "portal_cliente",
      ]
    : [
        "capa",
        "apresentacao_empresa",
        "diferenciais",
        "resumo_executivo",
        "escopo",
        "tabela_itens",
        "condicoes_comerciais",
        "validade_inicio",
        "aceite",
      ];

  return {
    name: construction ? "Construção · Proposta completa" : "Proposta comercial padrão",
    vertical: vertical || "geral",
    isDefault: true,
    modules: keys.map((key, index) => ({
      key,
      enabled: true,
      order: index + 1,
      required: key === "capa" || key === "condicoes_comerciais" || key === "aceite",
    })),
    aiRules: construction
      ? {
          tone: "profissional, técnico e comercial, com texto objetivo",
          technicalLevel:
            "explicar o suficiente para o cliente entender o que está contratado sem expor custos internos",
          imageRules: [
            "A imagem de cada etapa deve representar tecnicamente o escopo real daquela etapa, nunca uma foto genérica de obra.",
            "Se a fundação for radier, mostrar radier, base, malhas/armaduras e passagens; não mostrar baldrame quando ele não fizer parte do escopo.",
            "Em instalações, priorizar tubos PEX, mangueiras/conduítes corrugados, tubulações, caixas e passagens técnicas visíveis.",
            "Não inserir textos, logotipos, selos ou marcas d'água nas imagens das etapas.",
          ],
          contentRules: [
            "Organizar orçamento por etapas e resumir claramente o que está contemplado em cada uma.",
            "Permitir etapas simultâneas no cronograma e no físico-financeiro.",
            "Usar somente a identidade visual oficial do tenant cadastrada no Kit da Marca/Business Profile.",
          ],
          avoid: [
            "Não inventar escopo técnico que não exista no orçamento.",
            "Não apresentar custo interno, margem, preço de fornecedor ou informação privada ao cliente.",
          ],
        }
      : {
          tone: "profissional, claro e comercial",
          technicalLevel: "adequado ao segmento do tenant",
          imageRules: ["Usar imagens coerentes com o produto ou serviço efetivamente ofertado."],
          contentRules: ["Usar dados do orçamento e do perfil do tenant como fonte principal."],
          avoid: ["Não inventar condições comerciais ou escopo inexistente."],
        },
    createdBy: "ai",
  };
}

export function normalizeProposalBuilderTemplate(
  raw: unknown,
  fallback: Omit<ProposalBuilderTemplate, "id" | "createdAt" | "updatedAt">,
): Omit<ProposalBuilderTemplate, "id" | "createdAt" | "updatedAt"> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawModules = Array.isArray(source.modules) ? source.modules : [];

  const modules = rawModules
    .map((item, index) => {
      const module = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const key = String(module.key ?? "") as ProposalBuilderModuleKey;
      if (!ALLOWED_PROPOSAL_MODULES.includes(key)) return null;
      const required = module.required === true;
      return {
        key,
        enabled: required ? true : module.enabled !== false,
        order: Number.isFinite(Number(module.order))
          ? Math.max(1, Math.round(Number(module.order)))
          : index + 1,
        required,
      };
    })
    .filter((item): item is ProposalBuilderModule => Boolean(item))
    .sort((a, b) => a.order - b.order);

  const aiRulesRaw =
    source.aiRules && typeof source.aiRules === "object"
      ? (source.aiRules as Record<string, unknown>)
      : {};
  const asStrings = (value: unknown) =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(0, 20)
      : undefined;

  return {
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.trim().slice(0, 120)
        : fallback.name,
    vertical:
      typeof source.vertical === "string" && source.vertical.trim()
        ? source.vertical.trim().slice(0, 80)
        : fallback.vertical,
    isDefault: source.isDefault !== false,
    modules: modules.length ? modules : fallback.modules,
    aiRules: {
      tone:
        typeof aiRulesRaw.tone === "string"
          ? aiRulesRaw.tone.slice(0, 500)
          : fallback.aiRules.tone,
      technicalLevel:
        typeof aiRulesRaw.technicalLevel === "string"
          ? aiRulesRaw.technicalLevel.slice(0, 500)
          : fallback.aiRules.technicalLevel,
      imageRules: asStrings(aiRulesRaw.imageRules) ?? fallback.aiRules.imageRules,
      contentRules: asStrings(aiRulesRaw.contentRules) ?? fallback.aiRules.contentRules,
      avoid: asStrings(aiRulesRaw.avoid) ?? fallback.aiRules.avoid,
    },
    createdBy: source.createdBy === "manual" ? "manual" : "ai",
  };
}

type EnsureProposalBuilderOptions = {
  tenantId: string;
  forceNewVersion?: boolean;
  log?: {
    warn?: (obj: object, message?: string) => void;
    info?: (obj: object, message?: string) => void;
  };
};

export async function ensureTenantProposalBuilderTemplate({
  tenantId,
  forceNewVersion = false,
  log,
}: EnsureProposalBuilderOptions): Promise<{
  template: ProposalBuilderTemplate;
  templates: ProposalBuilderTemplate[];
  activeTemplateId: string;
  created: boolean;
}> {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);

  if (!profile) throw new Error("Business profile not found");

  const discovery = (profile.discoveryData ?? {}) as Record<string, unknown>;
  const existingTemplates = Array.isArray(discovery.proposalBuilderTemplates)
    ? (discovery.proposalBuilderTemplates as ProposalBuilderTemplate[]).filter(
        (item) => item && typeof item.id === "string",
      )
    : [];

  if (existingTemplates.length && !forceNewVersion) {
    const activeId =
      typeof discovery.activeProposalBuilderTemplateId === "string"
        ? discovery.activeProposalBuilderTemplateId
        : existingTemplates.find((item) => item.isDefault)?.id ?? existingTemplates[0]!.id;
    const active =
      existingTemplates.find((item) => item.id === activeId) ??
      existingTemplates.find((item) => item.isDefault) ??
      existingTemplates[0]!;
    return {
      template: active,
      templates: existingTemplates,
      activeTemplateId: active.id,
      created: false,
    };
  }

  const fallback = defaultProposalBuilderTemplate(profile.vertical);
  let proposed: unknown = fallback;

  try {
    const prompt = [
      "Crie um modelo modular padrão de proposta comercial para este tenant.",
      "Retorne APENAS JSON válido, sem markdown.",
      `Empresa: ${profile.nomeFantasia || profile.razaoSocial}`,
      `Vertical/segmento: ${profile.vertical || "não informado"}`,
      `Diferenciais: ${profile.diferenciais || "não informado"}`,
      `Público-alvo: ${profile.publicoAlvo || "não informado"}`,
      `Módulos permitidos: ${ALLOWED_PROPOSAL_MODULES.join(", ")}`,
      "Formato obrigatório:",
      '{"name":"...","vertical":"...","isDefault":true,"modules":[{"key":"capa","enabled":true,"order":1,"required":true}],"aiRules":{"tone":"...","technicalLevel":"...","imageRules":["..."],"contentRules":["..."],"avoid":["..."]}}',
      "Para construção civil, imagens por etapa precisam ser tecnicamente coerentes com o orçamento. Ex.: radier não deve virar baldrame; instalações devem mostrar PEX, conduítes/mangueiras corrugadas, hidráulica e elétrica quando estes itens estiverem no escopo.",
      "Nunca recomende exibir custos internos, margens ou preços de fornecedor ao cliente.",
    ].join("\n");

    const result = await gatewayCallOpenAI(
      tenantId,
      "proposal_generator",
      [{ role: "user", content: prompt }],
      { model: "gpt-4o", maxTokens: 3000 },
    );
    const cleaned = result.content
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    proposed = JSON.parse(cleaned);
  } catch (err) {
    log?.warn?.({ err, tenantId }, "proposal builder AI bootstrap failed; using safe default");
  }

  const normalized = normalizeProposalBuilderTemplate(proposed, fallback);
  const now = new Date().toISOString();
  const template: ProposalBuilderTemplate = {
    ...normalized,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  const nextTemplates = [
    ...existingTemplates.map((item) =>
      item.isDefault ? { ...item, isDefault: false } : item,
    ),
    template,
  ];

  await db
    .update(businessProfilesTable)
    .set({
      discoveryData: {
        ...discovery,
        proposalBuilderTemplates: nextTemplates,
        activeProposalBuilderTemplateId: template.id,
      },
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.tenantId, tenantId));

  log?.info?.({ tenantId, templateId: template.id }, "proposal builder template ready");

  return {
    template,
    templates: nextTemplates,
    activeTemplateId: template.id,
    created: true,
  };
}
