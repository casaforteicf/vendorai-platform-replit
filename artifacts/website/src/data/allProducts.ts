import { products as coreProducts, type Product } from "./products";

const commercialProducts: Product[] = [
  {
    slug: "growth",
    name: "VendorAI Growth",
    eyebrow: "Plano completo",
    summary: "O único plano VendorAI: acesso completo ao ecossistema, sem limite de usuários e sem módulos escondidos por faixa de plano.",
    description: "Use o VendorAI completo em assinatura contínua ou por períodos. As condições comerciais são apresentadas nas landing pages e campanhas correspondentes e permanecem vinculadas à origem da oportunidade. O site institucional não funciona como tabela pública de preços.",
    benefits: ["Sem limite de usuários", "Todos os módulos Growth", "5 dias grátis", "Escolha entre assinatura ou períodos"],
    features: ["CRM e vendas", "Agentes de IA", "Marketing", "Atendimento omnichannel", "Gestão e analytics", "Automações e integrações"],
    useCases: ["Centralizar a operação comercial", "Automatizar atendimento e vendas", "Gerenciar marketing e conteúdo", "Acompanhar indicadores e oportunidades"],
    integrations: ["WhatsApp", "Instagram", "Meta", "Google", "ERP", "APIs e Webhooks"]
  },
  {
    slug: "content-planner",
    name: "Vendor Content Planner",
    eyebrow: "Planejamento de conteúdo",
    summary: "Planejamento estratégico de conteúdo, calendário, temas, canais, frequência e campanhas.",
    description: "Organize o que publicar, quando publicar, em qual canal e com qual objetivo. O Content Planner transforma estratégia em calendário executável e conectado às campanhas e ao CRM.",
    benefits: ["Calendário organizado", "Consistência de marca", "Planejamento por objetivo", "Menos improviso"],
    features: ["Calendário editorial", "Temas e pautas", "Frequência por canal", "Planejamento de campanhas", "Prazos e responsáveis", "Integração com criação"],
    useCases: ["Calendário mensal", "Lançamentos", "Campanhas sazonais", "Planejamento por nicho"],
    integrations: ["Content Studio", "Creative Studio", "Ads", "CRM", "Meta"]
  },
  {
    slug: "content-studio",
    name: "Vendor Content Studio",
    eyebrow: "Produção de conteúdo",
    summary: "Criação operacional de textos, legendas, copies, roteiros, carrosséis e conteúdos de campanha com IA.",
    description: "Produza conteúdo a partir do planejamento, do contexto da empresa e dos objetivos comerciais, mantendo linguagem, posicionamento e chamada para ação alinhados.",
    benefits: ["Produção mais rápida", "Conteúdo alinhado à marca", "Mais formatos em menos tempo", "Ligação direta com campanhas"],
    features: ["Posts e legendas", "Copies comerciais", "Roteiros", "Carrosséis", "Variações de conteúdo", "Reaproveitamento de peças"],
    useCases: ["Redes sociais", "Campanhas de aquisição", "Nutrição de leads", "Conteúdo institucional"],
    integrations: ["Content Planner", "Creative Studio", "Ads", "CRM", "Knowledge Hub"]
  },
  {
    slug: "creative-studio",
    name: "Vendor Creative Studio",
    eyebrow: "Criação visual com IA",
    summary: "Imagens, vídeos, voz, dublagem, mockups e mídia criativa gerados para campanhas e produtos.",
    description: "Centralize a criação visual com IA para produzir materiais de marketing, apresentações de produtos e peças adaptadas aos diferentes canais.",
    benefits: ["Mais velocidade criativa", "Menos dependência de ferramentas separadas", "Variações rápidas", "Formatos prontos para canais"],
    features: ["Geração de imagens", "Vídeos com IA", "Voz e dublagem", "Mockups", "Formatos para redes sociais", "Biblioteca de mídia"],
    useCases: ["Anúncios", "Posts e Stories", "Apresentações de produto", "Campanhas promocionais"],
    integrations: ["Content Studio", "Content Planner", "Ads", "Catálogo", "Meta"]
  },
  {
    slug: "ads",
    name: "Vendor Ads",
    eyebrow: "Mídia paga",
    summary: "Planejamento e geração de campanhas e anúncios conectados ao CRM, públicos e objetivos comerciais.",
    description: "Estruture campanhas, orçamento, público, textos e criativos em um fluxo único, com suporte a diferentes formatos e canais de mídia.",
    benefits: ["Campanhas mais rápidas", "Criativos conectados à estratégia", "Menos retrabalho", "Marketing ligado ao funil"],
    features: ["Meta Ads", "Estratégia de campanha", "Públicos", "Orçamento", "Copies e criativos", "Ativar e pausar campanhas"],
    useCases: ["Captação de leads", "Remarketing", "Lançamentos", "Campanhas por região ou nicho"],
    integrations: ["Meta", "Google", "CRM", "Content Studio", "Creative Studio"]
  },
  {
    slug: "gestao",
    name: "Vendor Gestão",
    eyebrow: "Gestão operacional",
    summary: "ERP, financeiro, estoque, compras, fornecedores e controles administrativos conectados à operação comercial.",
    description: "Leve as informações da venda para a gestão sem duplicar trabalho. Organize financeiro, documentos, compras, estoque, fornecedores e rotinas administrativas no mesmo ecossistema.",
    benefits: ["Menos retrabalho", "Dados conectados às vendas", "Mais controle operacional", "Visão gerencial centralizada"],
    features: ["Contas a pagar e receber", "Compras", "Estoque", "Fornecedores", "Documentos fiscais", "Indicadores gerenciais"],
    useCases: ["Distribuidoras", "Varejo", "Representações", "Empresas de serviços e construção"],
    integrations: ["CRM", "Financeiro", "Catálogo", "ERP Hub", "JARVIS"]
  },
  {
    slug: "praca-ai",
    name: "Praça.ai",
    eyebrow: "Marketplace conectado",
    summary: "Marketplace com vitrine, pedidos, pagamentos, avaliações, logística, rastreio e operação integrada ao VendorAI.",
    description: "Conecte catálogo e operação ao Praça.ai para vender, acompanhar pedidos, organizar split, coleta, entrega, reputação, afiliados e atendimento em uma experiência integrada.",
    benefits: ["Novo canal de vendas", "Pedidos integrados", "Logística rastreável", "Reputação e avaliações"],
    features: ["Vitrine e produtos", "Pedidos", "Pagamentos e split", "Avaliações", "Rastreio", "Logística e entregadores"],
    useCases: ["Lojas e distribuidores", "Marketplaces locais", "Venda com entrega", "Operações com parceiros e afiliados"],
    integrations: ["Catálogo", "CRM", "Financeiro", "Logística", "WhatsApp"]
  },
  {
    slug: "app-builder",
    name: "Vendor App Builder",
    eyebrow: "Aplicativos",
    summary: "Criação e gestão de aplicativos conectados ao ecossistema VendorAI e aos dados do tenant.",
    description: "Estruture aplicativos a partir de templates ou fluxos guiados por IA, mantendo integração com a operação, identidade e serviços do cliente.",
    benefits: ["Apps mais rápidos de lançar", "Integração com o VendorAI", "Identidade personalizada", "Evolução por versões"],
    features: ["Templates", "Arquitetura assistida por IA", "Preview", "Versões", "Configuração por tenant", "Publicação"],
    useCases: ["Aplicativo de cliente", "App operacional", "Portais móveis", "Experiências por segmento"],
    integrations: ["VendorAI", "Supabase", "APIs", "Catálogo", "Automações"]
  },
  {
    slug: "reputation",
    name: "Vendor Reputation",
    eyebrow: "Reputação e experiência",
    summary: "Acompanhe avaliações, sinais de satisfação, reputação e pontos de atenção na experiência do cliente.",
    description: "Centralize avaliações e sinais de experiência para identificar problemas, oportunidades de melhoria e clientes que merecem acompanhamento proativo.",
    benefits: ["Reputação monitorada", "Resposta mais rápida a problemas", "Mais aprendizado com clientes", "Sinais para retenção"],
    features: ["Avaliações", "Fotos e evidências", "Sinais de satisfação", "Alertas", "Histórico por cliente", "Indicadores de reputação"],
    useCases: ["Pós-venda", "Marketplace", "Atendimento", "Gestão de qualidade"],
    integrations: ["CRM", "Praça.ai", "JARVIS", "Suporte", "Customer Intelligence"]
  },
  {
    slug: "app-personalizado",
    name: "App Personalizado VendorAI",
    eyebrow: "Aplicativo white-label",
    summary: "Aplicativo personalizado com marca, nome, identidade, ícone, splash e configuração do tenant.",
    description: "Entregue ao cliente uma experiência própria, mantendo o poder do VendorAI por trás da operação e personalizando os principais elementos visuais e de distribuição do aplicativo.",
    benefits: ["Marca própria", "Experiência dedicada", "Integração com o tenant", "Entrega white-label"],
    features: ["Nome e identidade", "Ícone", "Splash", "Configuração do tenant", "Build personalizado", "Preparação para distribuição"],
    useCases: ["Redes e franquias", "Empresas com marca própria", "Portais de cliente", "Operações white-label"],
    integrations: ["VendorAI", "App Builder", "CRM", "Notificações", "APIs"]
  },
  {
    slug: "implantacao",
    name: "Implantação VendorAI",
    eyebrow: "Serviço opcional",
    summary: "Implantação humana assistida para quem prefere apoio além do onboarding autoguiado pelo agente.",
    description: "A implantação padrão do Growth é autoguiada. Este serviço opcional inclui apoio humano para configuração inicial, parametrização, integrações, usuários e treinamento, conforme condição comercial apresentada na proposta correspondente.",
    benefits: ["Apoio humano dedicado", "Configuração orientada", "Integrações acompanhadas", "Treinamento da equipe"],
    features: ["Diagnóstico inicial", "Parametrização", "Integrações", "Configuração de usuários", "Treinamento", "Validação de entrada em operação"],
    useCases: ["Equipes com pouco tempo", "Operações complexas", "Implantações com várias integrações", "Entrada assistida em produção"],
    integrations: ["Growth", "CRM", "Agentes de IA", "Integrações", "Knowledge Hub"]
  }
];

export const products: Product[] = [...coreProducts, ...commercialProducts];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
