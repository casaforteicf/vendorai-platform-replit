import { eq } from "drizzle-orm";
import { db, businessProfilesTable } from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "./ai-gateway.js";

export type ProposalBuilderModuleKey =
  | "capa"
  | "apresentacao_empresa"
  | "produto_servico"
  | "curiosidades_conteudo"
  | "cases_provas"
  | "faq"
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

export type ProposalBuilderVisualStyle = {
  preset: "premium_arquitetonico" | "corporativo" | "catalogo_comercial" | "minimalista" | "tecnico";
  heroVariant: "fotografico" | "minimalista" | "institucional" | "produto";
  stageVariant: "cards" | "timeline" | "accordion" | "lista_tecnica";
  investmentVariant: "valor_global" | "por_etapa" | "por_item";
  density: "arejado" | "equilibrado" | "compacto";
  imageEmphasis: "alta" | "media" | "baixa";
};

export type ProposalBuilderTemplate = {
  id: string;
  name: string;
  vertical: string;
  proposalKind?: "construction_project" | "architecture_service" | "retail_quote" | "distribution_b2b" | "vehicle_sale" | "insurance_quote" | "professional_service" | "generic";
  isDefault: boolean;
  modules: ProposalBuilderModule[];
  visualStyle: ProposalBuilderVisualStyle;
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
  "produto_servico",
  "curiosidades_conteudo",
  "cases_provas",
  "faq",
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
  context?: {
    companyName?: string | null;
    products?: unknown;
    salesChannels?: unknown;
    discoveryData?: Record<string, unknown> | null;
  },
): Omit<ProposalBuilderTemplate, "id" | "createdAt" | "updatedAt"> {
  const normalize = (value: unknown) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const vertical = normalize(verticalRaw || "geral");
  const contextText = [
    vertical,
    normalize(context?.companyName),
    normalize(JSON.stringify(context?.products ?? "")),
    normalize(JSON.stringify(context?.salesChannels ?? "")),
    normalize(JSON.stringify(context?.discoveryData ?? {})),
  ].join(" ");

  const isBuildingMaterials = /(material(is)? de construcao|loja de material|varejo.*construcao|distribuidora.*construcao|atacado.*construcao|ferragens|tintas|revestimentos|pisos|acabamentos)/.test(contextText);
  const isDistributor = /(distribuidora|distribuicao|atacado|b2b)/.test(contextText);
  const isArchitecture = /(arquitetura|interiores|design de interiores|escritorio de arquitetura|arqdor)/.test(contextText);
  const isConstructionProject = !isBuildingMaterials && /(construtora|execucao de obra|construcao civil|reforma|obra|icf)/.test(contextText);
  const isVehicle = /(veiculo|automovel|carro|moto|seminovo|concessionaria|mobilidade eletrica)/.test(contextText);
  const isInsurance = /(seguro|corretora de seguros|apolice)/.test(contextText);
  const isProfessionalService = /(advocacia|contabilidade|clinica|consultoria|agencia|servico profissional)/.test(contextText);

  const proposalKind: NonNullable<ProposalBuilderTemplate["proposalKind"]> =
    isBuildingMaterials && isDistributor ? "distribution_b2b"
      : isBuildingMaterials ? "retail_quote"
      : isArchitecture ? "architecture_service"
      : isConstructionProject ? "construction_project"
      : isVehicle ? "vehicle_sale"
      : isInsurance ? "insurance_quote"
      : isProfessionalService ? "professional_service"
      : "generic";

  const keysByKind: Record<NonNullable<ProposalBuilderTemplate["proposalKind"]>, ProposalBuilderModuleKey[]> = {
    construction_project: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo", "escopo",
      "etapas_orcamento", "imagem_por_etapa", "cronograma", "fisico_financeiro",
      "condicoes_comerciais", "validade_inicio", "aceite", "portal_cliente",
    ],
    architecture_service: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo", "escopo",
      "etapas_orcamento", "imagem_por_etapa", "cronograma",
      "condicoes_comerciais", "validade_inicio", "aceite", "anexos", "portal_cliente",
    ],
    retail_quote: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo",
      "tabela_itens", "condicoes_comerciais", "validade_inicio", "aceite", "anexos", "portal_cliente",
    ],
    distribution_b2b: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo",
      "tabela_itens", "condicoes_comerciais", "validade_inicio", "aceite", "anexos", "portal_cliente",
    ],
    vehicle_sale: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo",
      "tabela_itens", "condicoes_comerciais", "validade_inicio", "aceite", "anexos", "portal_cliente",
    ],
    insurance_quote: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo",
      "escopo", "condicoes_comerciais", "validade_inicio", "aceite", "anexos", "portal_cliente",
    ],
    professional_service: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo",
      "escopo", "etapas_orcamento", "condicoes_comerciais", "validade_inicio", "aceite", "portal_cliente",
    ],
    generic: [
      "capa", "apresentacao_empresa", "produto_servico", "curiosidades_conteudo", "cases_provas", "faq", "diferenciais", "resumo_executivo",
      "escopo", "tabela_itens", "condicoes_comerciais", "validade_inicio", "aceite", "portal_cliente",
    ],
  };
  const keys = keysByKind[proposalKind];

  const names: Record<NonNullable<ProposalBuilderTemplate["proposalKind"]>, string> = {
    construction_project: "Obra · Proposta completa",
    architecture_service: "Arquitetura · Projeto e honorários",
    retail_quote: "Varejo · Orçamento comercial",
    distribution_b2b: "Distribuição B2B · Cotação comercial",
    vehicle_sale: "Veículos · Proposta de venda",
    insurance_quote: "Seguros · Cotação e coberturas",
    professional_service: "Serviços · Proposta profissional",
    generic: "Proposta comercial padrão",
  };

  const nonConstructionRules = proposalKind === "retail_quote" || proposalKind === "distribution_b2b"
    ? {
        tone: "profissional, comercial e objetivo",
        technicalLevel: "detalhar produto, aplicação, quantidade, condição, prazo e entrega sem transformar a proposta em cronograma de obra",
        imageRules: [
          "Priorizar imagens reais ou representativas dos produtos, categorias e aplicações vendidas.",
          "Não gerar imagens de fundação, estrutura, instalações ou etapas de obra apenas porque o segmento contém a palavra construção.",
        ],
        contentRules: [
          "Organizar a proposta por produtos, categorias, quantidades, preços, condições comerciais, entrega e validade.",
          "Se houver venda B2B, destacar mix, disponibilidade, prazo, frete e condições aplicáveis ao cliente.",
        ],
        avoid: [
          "Não usar cronograma físico-financeiro, radier, fundação, estrutura ou gestão de obra sem evidência explícita no escopo.",
          "Não apresentar custo interno, margem ou preço de fornecedor.",
        ],
      }
    : null;

  return {
    name: names[proposalKind],
    vertical: vertical || "geral",
    proposalKind,
    isDefault: true,
    modules: keys.map((key, index) => ({
      key,
      enabled: true,
      order: index + 1,
      required: key === "capa" || key === "condicoes_comerciais" || key === "aceite",
    })),
    visualStyle: proposalKind === "construction_project" || proposalKind === "architecture_service"
      ? {
          preset: "premium_arquitetonico",
          heroVariant: "fotografico",
          stageVariant: "cards",
          investmentVariant: "por_etapa",
          density: "arejado",
          imageEmphasis: "alta",
        }
      : proposalKind === "retail_quote" || proposalKind === "distribution_b2b"
        ? {
            preset: "catalogo_comercial",
            heroVariant: "produto",
            stageVariant: "lista_tecnica",
            investmentVariant: "por_item",
            density: "equilibrado",
            imageEmphasis: "media",
          }
        : {
            preset: "corporativo",
            heroVariant: "institucional",
            stageVariant: "accordion",
            investmentVariant: "valor_global",
            density: "equilibrado",
            imageEmphasis: "media",
          },
    aiRules: nonConstructionRules
      ?? (proposalKind === "construction_project"
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
              "Organizar o orçamento por etapas e, quando necessário, por fases/subfases executivas dentro da mesma etapa. Ex.: Estrutura ICF pode ter Fase 1 · 1º pavimento e Fase 2 · 2º pavimento; lajes podem ser Laje 1 e Laje 2.",
              "O cronograma deve partir da primeira data definida e projetar automaticamente as etapas seguintes com base em duração, dependências e defasagens. Não presumir sequência rígida: etapas independentes podem ocorrer simultaneamente.",
              "Apresentar cronograma executivo com início, duração, término, dependência e observação/marco quando houver.",
              "O cronograma físico-financeiro deve ser mensal e mostrar planejamento por mês, avanço físico previsto e valor financeiro previsto conforme as etapas ativas naquele período.",
              "Quando existir entrada/sinal percentual, destacar valor e percentual da entrada como adiantamento contratual. A entrada não deve ser somada novamente ao valor da obra.",
              "Quando a regra comercial prever amortização da entrada nas medições, demonstrar medição bruta, percentual/valor de desconto da entrada e valor líquido da parcela. Ex.: medição de R$ 100.000 com desconto de entrada de 10% resulta em parcela líquida de R$ 90.000.",
              "Usar as medições mensais como base do faturamento da execução quando esse for o modelo contratual do tenant, preservando o valor total contratado.",
              "Permitir etapas simultâneas no cronograma e no físico-financeiro, rateando financeiramente apenas os períodos efetivamente planejados.",
              "Usar somente a identidade visual oficial do tenant cadastrada no Kit da Marca/Business Profile.",
              "Na proposta ao cliente, priorizar leitura executiva: valor da etapa, escopo resumido, prazo, imagens coerentes, cronograma e condições comerciais. Detalhamento de itens deve respeitar a configuração escolhida pelo tenant.",
            ],
            avoid: [
              "Não inventar escopo técnico que não exista no orçamento.",
              "Não transformar fases internas em novos custos se elas apenas subdividem uma etapa já contratada.",
              "Não duplicar a entrada/sinal no total do contrato nem cobrar a entrada novamente nas medições.",
              "Não impor dependência sequencial entre etapas quando o planejamento permitir execução paralela.",
              "Não apresentar custo interno, margem, preço de fornecedor ou informação privada ao cliente.",
            ],
          }
        : {
            tone: "profissional, claro e comercial",
            technicalLevel: "adequado ao segmento e ao tipo de operação do tenant",
            imageRules: ["Usar imagens coerentes com o produto ou serviço efetivamente ofertado."],
            contentRules: ["Usar dados do orçamento, catálogo, operação e perfil do tenant como fonte principal."],
            avoid: ["Não inventar condições comerciais, escopo ou módulos operacionais inexistentes."],
          }),
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

  const visualRaw =
    source.visualStyle && typeof source.visualStyle === "object"
      ? (source.visualStyle as Record<string, unknown>)
      : {};
  const visualFallback = fallback.visualStyle;
  const visualStyle: ProposalBuilderVisualStyle = {
    preset:
      visualRaw.preset === "corporativo"
      || visualRaw.preset === "catalogo_comercial"
      || visualRaw.preset === "minimalista"
      || visualRaw.preset === "tecnico"
        ? visualRaw.preset
        : "premium_arquitetonico",
    heroVariant:
      visualRaw.heroVariant === "minimalista"
      || visualRaw.heroVariant === "institucional"
      || visualRaw.heroVariant === "produto"
        ? visualRaw.heroVariant
        : visualFallback.heroVariant,
    stageVariant:
      visualRaw.stageVariant === "timeline"
      || visualRaw.stageVariant === "accordion"
      || visualRaw.stageVariant === "lista_tecnica"
        ? visualRaw.stageVariant
        : visualFallback.stageVariant,
    investmentVariant:
      visualRaw.investmentVariant === "valor_global"
      || visualRaw.investmentVariant === "por_item"
        ? visualRaw.investmentVariant
        : visualFallback.investmentVariant,
    density:
      visualRaw.density === "compacto" || visualRaw.density === "equilibrado"
        ? visualRaw.density
        : visualFallback.density,
    imageEmphasis:
      visualRaw.imageEmphasis === "baixa" || visualRaw.imageEmphasis === "media"
        ? visualRaw.imageEmphasis
        : visualFallback.imageEmphasis,
  };

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
    proposalKind:
      source.proposalKind === "construction_project"
      || source.proposalKind === "architecture_service"
      || source.proposalKind === "retail_quote"
      || source.proposalKind === "distribution_b2b"
      || source.proposalKind === "vehicle_sale"
      || source.proposalKind === "insurance_quote"
      || source.proposalKind === "professional_service"
      || source.proposalKind === "generic"
        ? source.proposalKind
        : fallback.proposalKind,
    isDefault: source.isDefault !== false,
    modules: modules.length ? modules : fallback.modules,
    visualStyle,
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

  const fallback = defaultProposalBuilderTemplate(profile.vertical, {
    companyName: profile.nomeFantasia || profile.razaoSocial,
    products: profile.produtos,
    salesChannels: profile.canaisVenda,
    discoveryData: discovery,
  });
  let proposed: unknown = fallback;

  try {
    const prompt = [
      "Crie um modelo modular padrão de proposta comercial para este tenant.",
      "Retorne APENAS JSON válido, sem markdown.",
      `Empresa: ${profile.nomeFantasia || profile.razaoSocial}`,
      `Vertical/segmento: ${profile.vertical || "não informado"}`,
      `Diferenciais: ${profile.diferenciais || "não informado"}`,
      `Público-alvo: ${profile.publicoAlvo || "não informado"}`,
      `Produtos/serviços cadastrados: ${JSON.stringify(profile.produtos ?? [])}`,
      `Canais de venda: ${JSON.stringify(profile.canaisVenda ?? [])}`,
      `Contexto adicional do tenant: ${JSON.stringify(discovery).slice(0, 6000)}`,
      `Modelo seguro sugerido pelo classificador: ${JSON.stringify(fallback)}`,
      `Módulos permitidos: ${ALLOWED_PROPOSAL_MODULES.join(", ")}`,
      "Antes de escolher os módulos, classifique o TIPO DE OPERAÇÃO real do tenant. Não use apenas a palavra do segmento.",
      "Diferencie explicitamente construtora/execução de obra de loja ou distribuidora de materiais de construção.",
      "Se for loja/distribuidora de materiais de construção, NÃO use cronograma físico-financeiro, radier, fundação, instalações ou portal de obra por padrão. Priorize produtos, preços, mix, prazo, frete/entrega, validade, imagens de produto/aplicação e aceite.",
      "Se for construtora/execução de obra, use etapas, escopo, imagens por etapa, cronograma, físico-financeiro e portal quando fizer sentido.",
      "Para construção, o modelo deve suportar fases/subfases dentro das etapas, cronograma com dependências e etapas simultâneas, planejamento mensal e entrada/sinal como adiantamento contratual.",
      "Quando houver entrada percentual amortizada nas medições, a proposta deve mostrar medição bruta, desconto proporcional da entrada e valor líquido, sem duplicar o valor da entrada no contrato.",
      "Se for arquitetura/interiores, trate como projeto/honorários, etapas do projeto, imagens/renders e cronograma, sem assumir execução completa de obra.",
      "Se já existir um modelo ativo, use-o como referência para evoluir a nova versão sem perder as decisões válidas.",
      `Modelo ativo anterior: ${JSON.stringify(existingTemplates.find((item) => item.id === discovery.activeProposalBuilderTemplateId) ?? existingTemplates.find((item) => item.isDefault) ?? null)}`,
      "Formato obrigatório:",
      '{"name":"...","vertical":"...","proposalKind":"construction_project|architecture_service|retail_quote|distribution_b2b|vehicle_sale|insurance_quote|professional_service|generic","isDefault":true,"modules":[{"key":"capa","enabled":true,"order":1,"required":true}],"aiRules":{"tone":"...","technicalLevel":"...","imageRules":["..."],"contentRules":["..."],"avoid":["..."]}}',
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
