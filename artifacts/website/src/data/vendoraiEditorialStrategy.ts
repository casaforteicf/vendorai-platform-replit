export type EditorialPillar = {
  id: string;
  name: string;
  share: number;
  purpose: string;
  examples: string[];
};

export type EditorialEpisode = {
  id: string;
  series: string;
  title: string;
  hook: string;
  problem: string;
  demonstration: string;
  capability: string[];
  cta: string;
  format: "reel" | "carousel" | "story" | "short";
};

export const VENDORAI_EDITORIAL_PILLARS: EditorialPillar[] = [
  {
    id: "pain-diagnosis",
    name: "Dor e diagnóstico",
    share: 40,
    purpose: "Fazer o empresário reconhecer perdas e rupturas da própria operação antes de apresentar o produto.",
    examples: [
      "Lead pago sem próxima ação",
      "Ferramentas que não conversam",
      "Proposta que esfria sem acompanhamento",
      "Marketing que mede clique mas não acompanha venda",
    ],
  },
  {
    id: "product-demonstration",
    name: "Demonstração real",
    share: 30,
    purpose: "Mostrar o VendorAI executando uma ação concreta em vez de apenas listar funcionalidades.",
    examples: [
      "Encontrando oportunidades paradas",
      "Preparando follow-up com contexto",
      "Identificando conteúdo vencedor",
      "Transformando visita em sinal comercial",
    ],
  },
  {
    id: "proof-result",
    name: "Prova e resultado",
    share: 20,
    purpose: "Exibir evidências operacionais reais: oportunidades, ações, conversões, tempo economizado e evolução de indicadores.",
    examples: [
      "O VendorAI encontrou X oportunidades",
      "X contatos voltaram para a jornada",
      "Conteúdo Y ficou acima da média",
      "Campanha Z gerou oportunidades comerciais",
    ],
  },
  {
    id: "offer-invitation",
    name: "Produto e convite",
    share: 10,
    purpose: "Converter atenção em teste ou diagnóstico sem transformar o perfil em catálogo de software.",
    examples: [
      "Executar diagnóstico",
      "Ver funcionando no meu negócio",
      "Testar a missão Recuperar Vendas",
      "Conectar minha operação",
    ],
  },
];

export const VENDORAI_CONTENT_RULES = [
  "Começar por um problema de negócio, não por uma funcionalidade.",
  "Mostrar uma ação executável dentro do VendorAI sempre que possível.",
  "Evitar promessa de resultado garantido.",
  "Não atacar nominalmente concorrentes; atacar fragmentação, falta de execução e falta de evidência.",
  "Toda promessa de campanha deve corresponder a uma capacidade real do produto.",
  "Preferir demonstração de tela e evidência operacional a vídeo institucional genérico.",
  "Fechar com CTA ligado a uma LP ou missão real.",
] as const;

export const VENDORAI_LOST_MONEY_SERIES: EditorialEpisode[] = [
  {
    id: "lost-money-01",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Lead pago sem próxima ação",
    hook: "Você pagou por esse lead. Quem decidiu o que acontece depois?",
    problem: "O contato entra, recebe uma resposta e desaparece do radar quando não existe próxima ação estruturada.",
    demonstration: "Mostrar CRM, oportunidade e criação/acompanhamento da próxima ação.",
    capability: ["CRM", "Follow-up IA", "Next Best Action"],
    cta: "Descubra onde seus leads estão parando.",
    format: "reel",
  },
  {
    id: "lost-money-02",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Propostas esquecidas",
    hook: "Quantas propostas abertas hoje ninguém está acompanhando?",
    problem: "A negociação existe, mas perde prioridade na rotina da equipe e esfria sem cadência.",
    demonstration: "Mostrar pipeline filtrando oportunidades paradas e follow-up preparado pelo sistema.",
    capability: ["Pipeline", "Follow-up IA", "Agenda"],
    cta: "Encontre oportunidades paradas no seu negócio.",
    format: "reel",
  },
  {
    id: "lost-money-03",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Cliente que já comprou e nunca voltou",
    hook: "Você já pagou para conquistar esse cliente uma vez. Por que começar do zero?",
    problem: "Clientes inativos ficam esquecidos enquanto a empresa continua pagando por aquisição nova.",
    demonstration: "Mostrar Revenue Scout identificando recompra, reativação, upsell ou cross-sell.",
    capability: ["Revenue Scout", "CRM", "Campanhas"],
    cta: "Procure receita dentro da sua própria base.",
    format: "reel",
  },
  {
    id: "lost-money-04",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Marketing sem venda",
    hook: "Seu relatório mostra clique. Onde está a venda?",
    problem: "Marketing e comercial trabalham com métricas diferentes e não compartilham a mesma jornada.",
    demonstration: "Mostrar origem/campanha chegando ao lead, oportunidade e resultado comercial.",
    capability: ["Marketing", "CRM", "Analytics"],
    cta: "Conecte marketing ao resultado comercial.",
    format: "carousel",
  },
  {
    id: "lost-money-05",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "WhatsApp sem memória comercial",
    hook: "A conversa aconteceu. Seu CRM sabe o que foi decidido?",
    problem: "Histórico fica espalhado e a próxima pessoa precisa reconstruir o contexto do cliente.",
    demonstration: "Mostrar Omnichannel, histórico do contato e oportunidade no CRM.",
    capability: ["Omnichannel", "WhatsApp", "CRM"],
    cta: "Pare de vender com contexto espalhado.",
    format: "reel",
  },
  {
    id: "lost-money-06",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Visitante interessado que some",
    hook: "Alguém voltou à sua página de preço. Sua equipe ficou sabendo?",
    problem: "Sinais de intenção existem no site, mas não chegam à operação comercial.",
    demonstration: "Mostrar Visitor Intelligence, jornada, origem e sinal de interesse.",
    capability: ["Visitor Intelligence", "CRM", "Alertas"],
    cta: "Veja os sinais que sua operação está ignorando.",
    format: "reel",
  },
  {
    id: "lost-money-07",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Conteúdo que gera atenção e morre ali",
    hook: "Seu post performou. O que o sistema fez com essa informação?",
    problem: "Conteúdo é tratado como peça isolada e não alimenta a próxima decisão de marketing.",
    demonstration: "Mostrar conteúdo vencedor, variações, pauta diária e decisão de replicar/testar mídia.",
    capability: ["Content Performance", "Motor de Conteúdo", "Meta Growth"],
    cta: "Transforme resultado de conteúdo em próxima ação.",
    format: "short",
  },
  {
    id: "lost-money-08",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Ferramentas demais",
    hook: "Quantas telas precisam estar abertas para uma única venda acontecer?",
    problem: "Cada ferramenta cria atividade, mas alguém continua responsável por transportar contexto entre elas.",
    demonstration: "Mostrar a jornada conectada: campanha → lead → CRM → follow-up → pipeline → resultado.",
    capability: ["Marketing", "CRM", "Agentes IA", "Analytics"],
    cta: "Veja sua operação trabalhando como um só sistema.",
    format: "reel",
  },
  {
    id: "lost-money-09",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Equipe ocupada com trabalho repetitivo",
    hook: "Seu vendedor está vendendo ou atualizando sistema?",
    problem: "Rotinas repetitivas consomem tempo que deveria estar concentrado em negociação e relacionamento.",
    demonstration: "Mostrar agentes de IA preparando atendimento, qualificação, follow-up e tarefas.",
    capability: ["Agentes IA", "Automação", "CRM"],
    cta: "Automatize a rotina sem perder o contexto.",
    format: "reel",
  },
  {
    id: "lost-money-10",
    series: "Onde seu negócio está perdendo dinheiro?",
    title: "Relatório sem próxima ação",
    hook: "Se o relatório diz o que aconteceu, quem diz o que fazer agora?",
    problem: "Indicadores são consumidos como retrospectiva e não viram prioridade operacional.",
    demonstration: "Mostrar dashboard, recomendação, missão e ação preparada.",
    capability: ["Analytics", "JARVIS", "Missões"],
    cta: "Transforme indicador em ação.",
    format: "carousel",
  },
];

export const VENDORAI_CHANNEL_CADENCE = {
  instagram: {
    reelsPerWeek: 5,
    carouselsPerWeek: 2,
    storiesPerDay: "3-8",
    priority: ["dor", "demonstração", "prova"],
  },
  tiktok: {
    shortsPerWeek: 5,
    priority: ["gancho rápido", "demonstração", "antes/depois operacional"],
  },
  linkedin: {
    postsPerWeek: 3,
    priority: ["tese", "diagnóstico", "case operacional"],
  },
} as const;
