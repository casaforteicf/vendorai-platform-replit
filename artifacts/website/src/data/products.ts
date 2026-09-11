export type Product = {
  slug: string;
  name: string;
  eyebrow: string;
  summary: string;
  description: string;
  benefits: string[];
  features: string[];
  useCases: string[];
  integrations: string[];
};

export const products: Product[] = [
  {
    slug: "crm",
    name: "CRM Inteligente",
    eyebrow: "Vendas e relacionamento",
    summary: "Leads, clientes, oportunidades e atividades em uma operação comercial única, conectada à IA.",
    description: "Centralize toda a jornada comercial em um CRM com pipeline visual, histórico 360°, tarefas, propostas, segmentação e inteligência para priorizar a próxima ação.",
    benefits: ["Mais controle do funil", "Menos oportunidades esquecidas", "Histórico completo por cliente", "Equipe comercial mais produtiva"],
    features: ["Pipeline Kanban", "Leads, contatos e negócios", "Tags, filtros e segmentação", "Tarefas e follow-ups", "Propostas e histórico", "Lead scoring e próxima melhor ação"],
    useCases: ["Organizar prospecção e carteira", "Acompanhar negociações até o fechamento", "Distribuir leads entre vendedores", "Reativar oportunidades paradas"],
    integrations: ["WhatsApp", "Instagram", "E-mail", "Agenda", "Agentes de IA"]
  },
  {
    slug: "jarvis",
    name: "JARVIS",
    eyebrow: "Inteligência executiva",
    summary: "Um agente mestre para consultar, analisar, comparar e acompanhar tudo o que acontece na operação.",
    description: "O JARVIS conecta dados, sinais, tarefas e decisões para funcionar como uma camada de inteligência sobre o VendorAI, respondendo por voz ou texto e destacando o que exige atenção.",
    benefits: ["Visão executiva centralizada", "Menos tempo procurando informação", "Alertas por prioridade", "Decisões com mais contexto"],
    features: ["Consulta por voz e texto", "Watchlists", "Radar de oportunidades e riscos", "Comparações inteligentes", "Agenda de inteligência", "Fila de aprovações"],
    useCases: ["Perguntar o que mudou hoje", "Comparar campanhas ou regiões", "Revisar riscos e oportunidades", "Receber prioridades para a diretoria"],
    integrations: ["CRM", "Marketing", "Financeiro", "Agenda", "Revenue Scout"]
  },
  {
    slug: "agentes-ia",
    name: "Agentes de IA",
    eyebrow: "Equipe digital",
    summary: "Agentes especializados para SDR, vendas, follow-up, cobrança, suporte, agenda e pós-venda.",
    description: "Monte uma equipe de agentes que trabalha com o mesmo contexto da empresa, segue regras comerciais e atua em diferentes etapas da jornada do cliente.",
    benefits: ["Atendimento contínuo", "Padronização de abordagem", "Escala sem perder contexto", "Menos tarefas repetitivas"],
    features: ["SDR", "Closer", "Follow-up", "Financeiro e cobrança", "Suporte", "Agendamento e pós-venda"],
    useCases: ["Qualificar novos leads", "Responder clientes automaticamente", "Cobrar retornos", "Agendar reuniões e visitas"],
    integrations: ["CRM", "WhatsApp", "Instagram", "Knowledge Hub", "Agenda"]
  },
  {
    slug: "prospeccao",
    name: "Prospecção IA",
    eyebrow: "Aquisição de clientes",
    summary: "Descubra, qualifique e organize novos potenciais clientes antes mesmo de entrarem no seu funil.",
    description: "A prospecção combina critérios de segmento, região, sinais e regras comerciais para montar listas melhores e encaminhar oportunidades relevantes ao CRM.",
    benefits: ["Mais leads qualificados", "Prospecção em escala", "Menos pesquisa manual", "Priorização por potencial"],
    features: ["Busca por segmento e região", "Sinais de prospecção", "Enriquecimento de dados", "Aprovação de contatos", "Cadências", "Envio ao CRM"],
    useCases: ["Abrir novas regiões", "Atacar um nicho específico", "Encontrar empresas com sinais de compra", "Criar listas para campanhas frias"],
    integrations: ["Revenue Scout", "CRM", "Campanhas", "Agentes de IA", "Landing Pages"]
  },
  {
    slug: "revenue-scout",
    name: "Revenue Scout",
    eyebrow: "Inteligência de receita",
    summary: "Regras e sinais para encontrar oportunidades comerciais com maior chance de gerar receita.",
    description: "Transforme critérios do seu negócio em um motor de priorização que avalia contexto, segmento, potencial e momento de compra para orientar a equipe.",
    benefits: ["Foco nas melhores oportunidades", "Regras comerciais padronizadas", "Mais eficiência na prospecção", "Visão de potencial por lead"],
    features: ["Regras configuráveis", "Sinais e eventos", "Scores de oportunidade", "Priorização", "Filtros por operação", "Relatórios"],
    useCases: ["Priorizar carteira", "Encontrar clientes para upsell", "Identificar regiões promissoras", "Apoiar prospecção ativa"],
    integrations: ["Prospecção IA", "CRM", "JARVIS", "Analytics", "Campanhas"]
  },
  {
    slug: "omnichannel",
    name: "Omnichannel",
    eyebrow: "Atendimento unificado",
    summary: "WhatsApp, Instagram e outros canais organizados em uma única central de conversas.",
    description: "Unifique o histórico de atendimento e permita que equipe humana e agentes de IA trabalhem sobre o mesmo cliente sem perder contexto.",
    benefits: ["Menos conversas perdidas", "Resposta mais rápida", "Histórico centralizado", "Transição suave entre IA e equipe"],
    features: ["Inbox unificada", "WhatsApp oficial", "Instagram profissional", "Facebook Messenger", "Distribuição de atendimento", "Histórico por contato"],
    useCases: ["Central de atendimento", "Vendas por WhatsApp", "Suporte e pós-venda", "Triagem automática"],
    integrations: ["CRM", "Agentes de IA", "WhatsApp", "Instagram", "Facebook"]
  },
  {
    slug: "marketing",
    name: "Marketing IA",
    eyebrow: "Conteúdo e mídia",
    summary: "Planejamento, criação de conteúdo, campanhas, anúncios e acompanhamento conectados ao comercial.",
    description: "Planeje campanhas, produza peças com IA, publique nos canais conectados e mantenha o marketing ligado ao CRM e às oportunidades de venda.",
    benefits: ["Produção mais rápida", "Estratégia e execução conectadas", "Mais consistência de marca", "Campanhas ligadas ao funil"],
    features: ["Planejador de conteúdo", "Textos e imagens com IA", "Feed, Stories e Reels", "Campanhas segmentadas", "Meta Ads", "Biblioteca de conteúdo"],
    useCases: ["Calendário mensal", "Campanhas por nicho", "Lançamentos", "Remarketing e nutrição"],
    integrations: ["Instagram", "Facebook", "Meta Ads", "CRM", "Landing Pages"]
  },
  {
    slug: "agenda-inteligente",
    name: "Agenda Inteligente",
    eyebrow: "Tarefas e compromissos",
    summary: "Reuniões, retornos, visitas, tarefas e agendamentos ligados diretamente aos clientes e oportunidades.",
    description: "Tenha uma agenda comercial integrada ao CRM e aos agentes, com compromissos, lembretes e acompanhamento das atividades da equipe.",
    benefits: ["Menos esquecimentos", "Rotina comercial organizada", "Visão da equipe", "Agendamento automatizado"],
    features: ["Compromissos", "Tarefas", "Lembretes", "Agenda por usuário", "Vínculo com leads", "Agendamento por IA"],
    useCases: ["Agendar demonstrações", "Organizar visitas", "Programar follow-ups", "Coordenar equipes"],
    integrations: ["CRM", "Agentes de IA", "Google Calendar", "WhatsApp", "JARVIS"]
  },
  {
    slug: "catalogo-propostas",
    name: "Catálogo e Propostas",
    eyebrow: "Produtos e negociação",
    summary: "Produtos, fornecedores, regras de preço, estoque e propostas comerciais em um só fluxo.",
    description: "Estruture o catálogo comercial e conecte produtos, preços, margens, fornecedores e propostas ao processo de venda.",
    benefits: ["Propostas mais rápidas", "Preço mais consistente", "Menos erro operacional", "Catálogo conectado ao CRM"],
    features: ["Produtos e categorias", "Fornecedores", "Estoque", "Composição de preço", "Comissões", "Propostas comerciais"],
    useCases: ["Distribuidoras", "Lojas", "Representações", "Construtoras e serviços com materiais"],
    integrations: ["CRM", "Financeiro", "E-commerce", "Marketplace", "Revenue Scout"]
  },
  {
    slug: "financeiro",
    name: "Financeiro e ERP Hub",
    eyebrow: "Gestão financeira",
    summary: "Cobrança, comissões, conciliação e indicadores financeiros integrados à operação comercial.",
    description: "Conecte vendas e financeiro para acompanhar recebimentos, cobranças, comissões e desempenho sem duplicar informações entre sistemas.",
    benefits: ["Menos retrabalho", "Cobrança organizada", "Comissões rastreáveis", "Indicadores conectados às vendas"],
    features: ["Faturas e cobranças", "PIX e cartão", "Comissões", "Conciliação", "Indicadores percentuais", "Integração ERP"],
    useCases: ["Cobrar clientes", "Calcular comissões", "Acompanhar inadimplência", "Integrar ERP existente"],
    integrations: ["CRM", "ERP Hub", "Pagamentos", "JARVIS", "Analytics"]
  },
  {
    slug: "sites-lp-ecommerce",
    name: "Sites, LPs e E-commerce",
    eyebrow: "Presença digital",
    summary: "Crie páginas, landing pages e lojas conectadas diretamente ao CRM e às campanhas.",
    description: "Transforme tráfego em oportunidades com páginas que enviam os contatos automaticamente para o funil e preservam a origem da conversão.",
    benefits: ["Captação integrada", "Menos ferramentas separadas", "Rastreamento de origem", "Campanhas mais rápidas"],
    features: ["Gerador de site", "Landing pages", "Formulários", "E-commerce", "Tracking", "Integração com CRM"],
    useCases: ["Campanhas de aquisição", "Páginas por produto", "Catálogos online", "Lojas e lançamentos"],
    integrations: ["CRM", "Marketing IA", "Meta", "Google", "Catálogo"]
  },
  {
    slug: "knowledge-hub",
    name: "Knowledge Hub",
    eyebrow: "Conhecimento da empresa",
    summary: "Documentos, regras, informações e contexto usados pela equipe e pelos agentes de IA.",
    description: "Centralize o conhecimento operacional para que as respostas, automações e agentes respeitem políticas, produtos e processos reais da empresa.",
    benefits: ["IA mais alinhada", "Menos informação dispersa", "Onboarding mais rápido", "Respostas mais consistentes"],
    features: ["Documentos", "Regras internas", "Base de perguntas e respostas", "Contexto por tenant", "Fontes conectadas", "Permissões"],
    useCases: ["Treinar agentes", "Centralizar políticas", "Organizar manuais", "Apoiar suporte e vendas"],
    integrations: ["Agentes de IA", "JARVIS", "CRM", "Suporte", "Automações"]
  },
  {
    slug: "analytics",
    name: "Analytics Executivo",
    eyebrow: "Gestão e indicadores",
    summary: "Painéis para acompanhar vendas, marketing, operação, uso da IA e desempenho das equipes.",
    description: "Transforme os dados espalhados pelos módulos do VendorAI em indicadores executivos e análises comparáveis para orientar decisões.",
    benefits: ["Visão unificada", "Decisão mais rápida", "Indicadores comparáveis", "Acompanhamento por equipe ou unidade"],
    features: ["Dashboards", "KPIs comerciais", "Indicadores de marketing", "Uso de IA", "Comparativos", "Relatórios gerenciais"],
    useCases: ["Reuniões de gestão", "Comparar vendedores", "Analisar conversão", "Acompanhar evolução"],
    integrations: ["CRM", "Marketing", "Financeiro", "JARVIS", "Revenue Scout"]
  },
  {
    slug: "automacoes",
    name: "Automações e Integrações",
    eyebrow: "Operação conectada",
    summary: "Webhooks, APIs e fluxos que conectam o VendorAI a ferramentas externas e rotinas internas.",
    description: "Automatize tarefas e conecte sistemas para reduzir digitação manual, atrasos e inconsistências entre áreas.",
    benefits: ["Menos trabalho manual", "Processos mais rápidos", "Dados sincronizados", "Escalabilidade operacional"],
    features: ["Webhooks", "APIs", "N8N", "Typebot", "Gatilhos", "Alertas e notificações"],
    useCases: ["Sincronizar sistemas", "Criar alertas", "Automatizar cadências", "Disparar ações após eventos"],
    integrations: ["N8N", "Typebot", "Supabase", "CRMs externos", "ERPs"]
  },
  {
    slug: "arqdor-ai",
    name: "Arqdor.ai",
    eyebrow: "Arquitetura e projetos",
    summary: "Projetos, ambientes, renderização com IA, orçamento e portal do cliente integrados.",
    description: "Uma vertical especializada para arquitetura e interiores, com gestão de projeto, biblioteca de materiais, renderização, orçamento e experiência do cliente.",
    benefits: ["Projeto e cliente no mesmo ambiente", "Renders com IA", "Mais velocidade nas revisões", "Orçamento integrado"],
    features: ["Projetos e ambientes", "Renders com IA", "Biblioteca de materiais", "Orçamentos", "Portal do cliente", "Histórico e revisões"],
    useCases: ["Escritórios de arquitetura", "Design de interiores", "Marcenarias", "Construtoras"],
    integrations: ["VendorAI CRM", "Catálogo", "Financeiro", "Portal do cliente", "IA generativa"]
  }
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
