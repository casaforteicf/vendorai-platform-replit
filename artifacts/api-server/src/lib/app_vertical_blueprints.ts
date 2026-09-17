export type BlueprintLayer = "app_product" | "app_admin" | "vendorai_saas";
export type RegistryKind = "component" | "feature" | "action" | "dataSource" | "workflow";

export type BlueprintRequirement = {
  key: string;
  name: string;
  layer: BlueprintLayer;
  kinds?: RegistryKind[];
  aliases?: string[];
};

export type VerticalBlueprint = {
  key: string;
  name: string;
  familyKey: string;
  aliases: string[];
  description: string;
  requirements: BlueprintRequirement[];
  safeguards?: string[];
};

export type RegistryCapability = {
  kind: RegistryKind;
  key: string;
  name: string;
  category?: string | null;
};

const req = (key: string, name: string, layer: BlueprintLayer, aliases: string[] = [], kinds?: RegistryKind[]): BlueprintRequirement => ({ key, name, layer, aliases, kinds });

const CORE = [
  req("customer-accounts", "Contas e perfis de clientes", "app_product", ["customers", "clientes", "users", "usuarios"]),
  req("notifications", "Notificações e comunicação transacional", "app_product", ["notification", "notificacoes", "messages", "mensagens"]),
  req("content-admin", "Administração de conteúdo e cadastros", "app_admin", ["content", "conteudo", "catalog", "catalogo"]),
  req("crm-leads", "CRM e gestão de leads", "vendorai_saas", ["crm", "leads", "prospecting", "prospector"]),
  req("conversations", "Conversas e atendimento", "vendorai_saas", ["conversation", "conversas", "chat", "support"]),
  req("automation", "Automações e workflows", "vendorai_saas", ["automations", "automacao", "workflow"]),
  req("analytics", "Métricas e inteligência", "vendorai_saas", ["metrics", "metricas", "intelligence", "analytics"]),
];

const commerce = [
  req("catalog", "Catálogo de produtos ou serviços", "app_product", ["products", "produtos", "services", "servicos"]),
  req("orders", "Pedidos e acompanhamento", "app_product", ["order", "pedidos", "sales", "vendas"]),
  req("payments", "Pagamentos e cobrança", "app_product", ["payment", "pagamentos", "billing", "checkout"]),
  req("inventory", "Estoque e disponibilidade", "app_admin", ["estoque", "stock", "inventory"]),
];

const scheduling = [
  req("appointments", "Agenda e agendamentos", "app_product", ["agenda", "booking", "schedule", "agendamento"]),
  req("professional-calendar", "Gestão de horários e profissionais", "app_admin", ["calendar", "calendario", "professionals", "equipe"]),
  req("reminders", "Lembretes automáticos", "vendorai_saas", ["reminder", "lembretes", "notifications"]),
];

const documents = [
  req("documents", "Documentos e arquivos", "app_product", ["document", "documentos", "files", "arquivos"]),
  req("approvals", "Aprovações e aceite", "app_product", ["approval", "aprovacao", "signature", "assinatura"]),
  req("document-admin", "Modelos e controle documental", "app_admin", ["templates", "modelos", "documents"]),
];

function blueprint(key: string, name: string, familyKey: string, description: string, requirements: BlueprintRequirement[], aliases: string[] = [], safeguards?: string[]): VerticalBlueprint {
  const unique = new Map<string, BlueprintRequirement>();
  for (const item of [...CORE, ...requirements]) unique.set(item.key, item);
  return { key, name, familyKey, aliases, description, requirements: [...unique.values()], safeguards };
}

export const VERTICAL_BLUEPRINTS: VerticalBlueprint[] = [
  blueprint("mercados", "Mercados e supermercados", "varejo", "Compras recorrentes, ofertas, fidelidade e entrega.", [...commerce, req("loyalty", "Fidelidade e benefícios", "app_product", ["fidelidade", "rewards"]), req("delivery", "Entrega e retirada", "app_product", ["entrega", "pickup"])]),
  blueprint("lojas-roupas", "Lojas de roupas", "varejo", "Catálogo por coleção, variações, provador e venda omnichannel.", [...commerce, req("product-variants", "Tamanhos, cores e variações", "app_product", ["variants", "variacoes", "sku"]), req("collections", "Coleções e vitrines", "app_admin", ["colecoes", "showcase"])]),
  blueprint("lojas-moveis", "Lojas de móveis", "varejo", "Venda consultiva, ambientes, medidas e logística.", [...commerce, req("quotes", "Orçamentos e venda consultiva", "app_product", ["orcamento", "proposal", "propostas"]), req("delivery-installation", "Entrega e montagem", "app_product", ["montagem", "installation"])]),
  blueprint("farmacias", "Farmácias", "varejo", "Catálogo, pedidos e atendimento com controles sanitários.", [...commerce, req("prescription-intake", "Recebimento controlado de receita", "app_product", ["receita", "prescription"])], [], ["Não diagnosticar nem prescrever; exigir validação farmacêutica quando aplicável."]),
  blueprint("postos-combustiveis", "Postos de combustíveis", "varejo", "Fidelidade, preços, serviços e conveniência.", [...commerce, req("fuel-prices", "Preços e tipos de combustível", "app_product", ["combustivel", "fuel"]), req("fleet-benefits", "Benefícios para frotas", "app_product", ["frota", "fleet"])]),
  blueprint("arquitetura-construcao", "Arquitetura e construção", "projetos-obras", "Projetos, orçamento, aprovação, execução e pós-obra.", [...documents, req("project-portfolio", "Portfólio e projetos", "app_product", ["projetos", "portfolio"]), req("budget-engine", "Orçamento de obra", "app_product", ["orcamento", "budget"]), req("project-tracking", "Acompanhamento de obra", "app_product", ["obra", "construction", "producao"]), req("procurement", "Compras e fornecedores", "app_admin", ["compras", "fornecedores", "procurement"]) ]),
  blueprint("veiculos-mobilidade", "Veículos e mobilidade", "automotivo", "Estoque, simulação, test-drive, oficina e relacionamento.", [req("vehicle-inventory", "Estoque de veículos", "app_product", ["veiculos", "vehicles", "estoque"]), req("financing-simulation", "Simulação de financiamento", "app_product", ["financiamento", "financing"]), ...scheduling, req("service-orders", "Ordens de serviço", "app_admin", ["oficina", "service-order"])]),
  blueprint("seguros", "Seguros", "servicos-financeiros", "Diagnóstico de cobertura, cotação, apólices e sinistros.", [...documents, req("coverage-diagnosis", "Diagnóstico de cobertura", "app_product", ["cobertura", "coverage"]), req("insurance-quotes", "Cotações de seguro", "app_product", ["cotacao", "quotes"]), req("claims", "Aviso e acompanhamento de sinistro", "app_product", ["sinistro", "claims"])], [], ["Não prometer cobertura; decisões e recomendações reguladas exigem profissional habilitado."]),
  blueprint("academias", "Academias", "fitness", "Planos, treinos, aulas, evolução e retenção.", [...scheduling, req("memberships", "Planos e matrículas", "app_product", ["planos", "memberships"]), req("workouts", "Treinos e evolução", "app_product", ["treino", "workout"]), req("checkin", "Check-in e frequência", "app_product", ["frequencia", "attendance"])]),
  blueprint("advocacia", "Advocacia", "juridico", "Triagem, casos, documentos, prazos e portal do cliente.", [...documents, ...scheduling, req("case-management", "Gestão de casos e processos", "app_admin", ["processos", "cases", "legal"]), req("deadlines", "Prazos e compromissos", "app_admin", ["prazos", "deadlines"])], [], ["Não substituir aconselhamento jurídico; respostas conclusivas exigem advogado responsável."]),
  blueprint("barbearias", "Barbearias", "beleza", "Serviços, profissionais, agenda, recorrência e fidelidade.", [...scheduling, req("service-menu", "Catálogo de serviços", "app_product", ["servicos", "services"]), req("loyalty", "Fidelidade e recorrência", "app_product", ["fidelidade", "rewards"]), req("payments", "Pagamentos", "app_product", ["payment", "pagamentos"])]),
  blueprint("saloes-beleza", "Salões de beleza", "beleza", "Agenda por profissional, serviços, pacotes e relacionamento.", [...scheduling, ...commerce, req("packages", "Pacotes e recorrência", "app_product", ["pacotes", "subscriptions"])]),
  blueprint("clinicas", "Clínicas", "saude", "Agendamento, triagem, atendimento e relacionamento com segurança.", [...scheduling, ...documents, req("patient-intake", "Cadastro e triagem do paciente", "app_product", ["paciente", "triagem", "patient"]), req("care-records", "Registros de atendimento", "app_admin", ["prontuario", "records"])], [], ["Dados de saúde são sensíveis; diagnóstico e conduta clínica exigem profissional habilitado."]),
  blueprint("odontologia", "Odontologia", "saude", "Agenda, avaliação, plano de tratamento e acompanhamento.", [...scheduling, ...documents, req("treatment-plans", "Planos de tratamento", "app_product", ["tratamento", "treatment"]), req("dental-records", "Registros odontológicos", "app_admin", ["odontograma", "dental"])], [], ["Diagnóstico e plano clínico exigem cirurgião-dentista responsável."]),
  blueprint("estetica", "Estética", "saude-beleza", "Avaliação, protocolos, sessões, consentimentos e evolução.", [...scheduling, ...documents, req("protocols", "Protocolos e sessões", "app_product", ["protocolos", "sessions"]), req("before-after", "Evolução e registros", "app_admin", ["evolucao", "before-after"])], [], ["Procedimentos e contraindicações exigem avaliação profissional."]),
  blueprint("medicos", "Médicos", "saude", "Agenda, pré-consulta, documentos e acompanhamento.", [...scheduling, ...documents, req("pre-consultation", "Pré-consulta estruturada", "app_product", ["anamnese", "pre-consulta"]), req("care-records", "Registros de atendimento", "app_admin", ["prontuario", "records"])], [], ["Não diagnosticar ou prescrever sem médico responsável; proteger dados sensíveis."]),
  blueprint("nutricionistas", "Nutricionistas", "saude", "Avaliação, planos, acompanhamento e evolução nutricional.", [...scheduling, ...documents, req("nutrition-assessment", "Avaliação nutricional", "app_product", ["nutricao", "assessment"]), req("meal-plans", "Planos alimentares", "app_product", ["plano-alimentar", "meal-plan"])], [], ["Conduta nutricional individual exige nutricionista responsável."]),
  blueprint("fisioterapeutas", "Fisioterapeutas", "saude", "Avaliação funcional, sessões, exercícios e evolução.", [...scheduling, ...documents, req("functional-assessment", "Avaliação funcional", "app_product", ["avaliacao-funcional", "functional"]), req("therapy-plans", "Planos e exercícios", "app_product", ["fisioterapia", "therapy"])], [], ["Avaliação e conduta terapêutica exigem fisioterapeuta responsável."]),
  blueprint("restaurantes-delivery", "Restaurantes e tele-entrega", "alimentacao", "Cardápio, pedidos, pagamento, entrega e fidelidade.", [...commerce, req("menu-options", "Adicionais e personalização", "app_product", ["cardapio", "menu", "adicionais"]), req("delivery", "Entrega e retirada", "app_product", ["entrega", "delivery", "pickup"]), req("kitchen-flow", "Fluxo de cozinha", "app_admin", ["cozinha", "kitchen"])]),
  blueprint("hoteis", "Hotéis e hospedagem", "hospitalidade", "Reservas, quartos, check-in, serviços e relacionamento.", [...scheduling, req("room-inventory", "Quartos e disponibilidade", "app_product", ["quartos", "rooms", "availability"]), req("reservations", "Reservas e tarifas", "app_product", ["reservas", "booking", "rates"]), req("guest-services", "Serviços ao hóspede", "app_product", ["hospede", "guest"]), req("housekeeping", "Operação e governança", "app_admin", ["governanca", "housekeeping"])]),
  blueprint("imobiliarias", "Imobiliárias", "imobiliario", "Imóveis, busca, visitas, propostas, documentos e relacionamento.", [...documents, ...scheduling, req("property-listings", "Catálogo de imóveis", "app_product", ["imoveis", "properties", "listings"]), req("property-search", "Busca e filtros", "app_product", ["busca", "search", "filtros"]), req("proposals", "Propostas e negociação", "app_product", ["propostas", "negociacao"]) ]),
];

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function findVerticalBlueprint(value?: string | null): VerticalBlueprint | null {
  if (!value) return null;
  const target = normalize(value);
  return VERTICAL_BLUEPRINTS.find((item) => [item.key, item.name, ...item.aliases].some((candidate) => normalize(candidate) === target))
    ?? VERTICAL_BLUEPRINTS.find((item) => target.includes(normalize(item.key)) || normalize(item.name).includes(target))
    ?? null;
}

export function resolveVerticalBlueprint(blueprint: VerticalBlueprint, registry: RegistryCapability[]) {
  const available = registry.map((item) => ({ ...item, search: normalize([item.key, item.name, item.category ?? ""].join(" ")) }));
  const reused: Array<BlueprintRequirement & { registry: RegistryCapability }> = [];
  const gaps: BlueprintRequirement[] = [];
  for (const requirement of blueprint.requirements) {
    const candidates = [requirement.key, requirement.name, ...(requirement.aliases ?? [])].map(normalize).filter((item) => item.length >= 3);
    const match = available.find((item) => (!requirement.kinds || requirement.kinds.includes(item.kind)) && candidates.some((candidate) => item.search === candidate || item.search.includes(candidate) || candidate.includes(item.search)));
    if (match) reused.push({ ...requirement, registry: { kind: match.kind, key: match.key, name: match.name, category: match.category } });
    else gaps.push(requirement);
  }
  return {
    blueprint: { key: blueprint.key, name: blueprint.name, familyKey: blueprint.familyKey, description: blueprint.description, safeguards: blueprint.safeguards ?? [] },
    summary: { required: blueprint.requirements.length, reused: reused.length, gaps: gaps.length },
    reused,
    gaps,
  };
}

export function buildVerticalStarterDefinition(blueprint: VerticalBlueprint, resolution?: ReturnType<typeof resolveVerticalBlueprint>, registry: RegistryCapability[] = []) {
  const product = blueprint.requirements.filter((item) => item.layer === "app_product");
  const admin = blueprint.requirements.filter((item) => item.layer === "app_admin");
  const saas = blueprint.requirements.filter((item) => item.layer === "vendorai_saas");
  const reused = new Set((resolution?.reused ?? []).map((item) => item.key));
  const capabilityCards = product.filter((item) => reused.has(item.key)).map((item) => ({
    title: item.name,
    body: "Capacidade existente validada para reutilização.",
  }));
  const pendingProduct = product.filter((item) => !reused.has(item.key));
  const hasProfileAction = registry.some((item) => item.kind === "action" && item.key === "viewer.profile.update");
  const hasProfileSource = registry.some((item) => item.kind === "dataSource" && item.key === "viewer.profile");
  const runtimeActionKeys = hasProfileAction ? ["viewer.profile.update"] : [];
  return {
    vertical: { key: blueprint.key, name: blueprint.name, familyKey: blueprint.familyKey },
    blueprint: {
      version: 1,
      requirements: blueprint.requirements,
      reuse: resolution?.summary ?? null,
      safeguards: blueprint.safeguards ?? [],
    },
    runtimeAccess: { actions: { enabled: runtimeActionKeys.length > 0, keys: runtimeActionKeys } },
    dataModel: blueprint.requirements.map((item) => ({ entity: item.key, name: item.name, layer: item.layer, availability: reused.has(item.key) ? "registry" : "gap" })),
    security: {
      roles: [
        { key: "customer", name: "Cliente", permissions: ["app.read", "profile.write_self", "profile.crm.read_self", "request.create"] },
        { key: "operator", name: "Operador", permissions: ["app.read", "requests.manage", "customers.read"] },
        { key: "admin", name: "Administrador", permissions: ["app.admin", "users.manage", "content.manage", "settings.manage"] },
      ],
      defaultRole: "customer",
      principles: ["menor privilégio", "separação entre operação e administração", "consentimento para captura de lead"],
    },
    productModel: {
      appProduct: {
        valueProposition: blueprint.description,
        nativeFunctions: product.map((item) => item.name),
        userJourneys: ["Descobrir serviços e benefícios", "Receber valor antes do cadastro", "Solicitar atendimento ou avançar na jornada"],
        channels: ["mobile", "web"],
      },
      appAdmin: {
        nativeFunctions: admin.map((item) => item.name),
        manages: admin.map((item) => item.name),
      },
      vendorAiSaas: {
        valueProposition: "Gestão recorrente de relacionamento, operação, automação e inteligência sem duplicar o produto principal.",
        capabilities: saas.map((item) => item.name),
        consumes: ["leads consentidos", "eventos de uso", "solicitações e conversas"],
        returns: ["automações", "insights", "segmentações", "tarefas e handoffs"],
      },
      boundaries: ["Funções essenciais permanecem no App Product.", "CRM, marketing, automação e analytics ampliados permanecem no VendorAI SaaS."],
      monetization: { appSale: "Licença do App Product", saasSubscription: "Assinatura VendorAI SaaS", addons: ["integrações", "consumo de IA", "canais adicionais"] },
    },
    valueAgent: {
      enabled: true,
      name: `Especialista ${blueprint.name}`,
      promise: `Entregar uma orientação inicial útil para ${blueprint.name.toLowerCase()} antes de solicitar cadastro.`,
      preLeadServices: ["Entender o objetivo e o contexto", "Organizar necessidades e próximos passos", "Entregar uma pré-análise informativa"],
      publicDataSources: [],
      intakeQuestions: ["Qual é seu principal objetivo?", "Qual é o contexto atual?", "Qual é a urgência?"],
      qualification: { signals: ["necessidade", "urgência", "aderência"], scores: ["fit", "intenção"], routing: ["especialista humano"] },
      handoff: { triggers: ["pedido de contato", "caso complexo", "decisão regulada"], destination: "Equipe responsável", sla: "Conforme configuração do tenant" },
      crm: { createLead: true, pipeline: blueprint.familyKey, fields: ["objetivo", "contexto", "urgência", "consentimento"], artifacts: ["resumo da pré-análise"] },
      safeguards: blueprint.safeguards ?? [],
      missingCapabilities: (resolution?.gaps ?? []).map((item) => item.name),
    },
    runtime: {
      version: 1,
      defaultPageId: "inicio",
      pages: [
        {
          id: "inicio",
          title: "Início",
          blocks: [
            { id: "hero-inicio", type: "hero", props: { title: blueprint.name, body: blueprint.description } },
            { id: "capacidades", type: "cards", props: { title: "Recursos disponíveis", items: capabilityCards.slice(0, 8) } },
            ...(pendingProduct.length > 0 ? [{ id: "evolucao-segura", type: "callout", props: { title: "Evolução planejada", body: `${pendingProduct.length} capacidade(s) adicional(is) permanecem no backlog técnico e não são apresentadas como disponíveis.`, tone: "info" } }] : []),
          ],
        },
        {
          id: "atendimento",
          title: "Atendimento",
          blocks: [
            { id: "valor-primeiro", type: "callout", props: { title: "Valor antes do cadastro", body: "Receba uma orientação inicial, entenda os próximos passos e só então escolha se deseja falar com a equipe.", tone: "info" } },
            { id: "jornada", type: "list", props: { title: "Como funciona", items: [{ title: "Conte seu objetivo" }, { title: "Receba uma pré-análise" }, { title: "Avance para atendimento quando fizer sentido" }] } },
          ],
        },
        ...(hasProfileAction || hasProfileSource ? [{
          id: "meu-perfil",
          title: "Meu perfil",
          blocks: [
            ...(hasProfileSource ? [{ id: "perfil-resumo", type: "text", dataSources: ["viewer.profile"], props: { title: "Olá, {{data.viewer.profile.displayName}}", body: "E-mail: {{data.viewer.profile.email}}\nTelefone: {{data.viewer.profile.phone}}" } }] : []),
            ...(hasProfileAction ? [{ id: "perfil-editar", type: "action_form", props: { actionKey: "viewer.profile.update", title: "Atualizar meus dados", body: "Altere somente seus dados básicos de contato.", submitLabel: "Salvar alterações", successMessage: "Perfil atualizado com sucesso.", fields: [{ name: "displayName", label: "Nome", type: "text" }, { name: "phone", label: "Telefone", type: "tel" }, { name: "locale", label: "Idioma", type: "text" }] } }] : []),
          ],
        }] : []),        {
          id: "sobre",
          title: "Sobre",
          blocks: [
            { id: "sobre-texto", type: "text", props: { title: `Sobre ${blueprint.name}`, body: blueprint.description } },
          ],
        },
      ],
    },
  };
}