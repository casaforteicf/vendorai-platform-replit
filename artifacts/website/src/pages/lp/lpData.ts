export interface PainPoint {
  icon: string;
  title: string;
  desc: string;
}

export interface Stat {
  value: string;
  label: string;
  detail: string;
}

export interface AgentCard {
  icon: string;
  name: string;
  desc: string;
}

export interface ObrasHubFeature {
  icon: string;
  badge?: string;
  title: string;
  problem: string;
  solution: string;
}

export interface LpConfig {
  slug: string;
  vertical: string;
  emoji: string;
  situation: {
    tag: string;
    headline: string;
    subheadline: string;
  };
  problem: {
    title: string;
    subtitle: string;
    points: PainPoint[];
  };
  implication: {
    title: string;
    stats: Stat[];
  };
  needPayoff: {
    title: string;
    subtitle: string;
    agents: AgentCard[];
  };
  obrasHub?: {
    badge: string;
    title: string;
    subtitle: string;
    features: ObrasHubFeature[];
    vsCallout: {
      title: string;
      desc: string;
    };
  };
  cta: {
    headline: string;
    sub: string;
  };
  gtagConversionLabel: string;
}

export const LP_CONFIGS: LpConfig[] = [
  {
    slug: "construcao-civil",
    vertical: "Construção Civil",
    emoji: "🏗️",
    situation: {
      tag: "Para construtoras · incorporadoras · empreiteiras",
      headline: "Seu cliente pediu orçamento às 21h.\nSeu concorrente já respondeu.",
      subheadline:
        "Construtoras que usam VendorAI nunca perdem um lead fora do horário comercial — e fecham 3× mais propostas de obra sem aumentar a equipe de vendas.",
    },
    problem: {
      title: "Reconhecemos a sua realidade",
      subtitle: "Você tem obra para tocar. Não sobra tempo para ficar no WhatsApp o dia todo.",
      points: [
        {
          icon: "🌙",
          title: "Leads chegando após as 18h sem resposta",
          desc: "Clientes pesquisam construtoras no fim do dia ou no fim de semana. Quem tem IA responde em segundos. Você responde na manhã seguinte — quando o lead já fechou com outro.",
        },
        {
          icon: "📋",
          title: "Orçamentos enviados que ficam no silêncio",
          desc: "Você dedicou horas montando a proposta. O cliente visualizou e sumiu. Sem follow-up estruturado e no momento certo, a proposta morre na caixa de entrada.",
        },
        {
          icon: "📱",
          title: "Instagram cheio de perguntas, zero conversão",
          desc: "DMs com perguntas sobre metragem, prazo e preço chegam o tempo todo. Resposta manual demora horas. O lead esfria, pede cotação no concorrente e compara preço.",
        },
      ],
    },
    implication: {
      title: "O custo real de não resolver isso agora",
      stats: [
        {
          value: "80%",
          label: "dos leads de obra fecham com quem responde primeiro",
          detail: "Quanto tempo sua empresa leva para responder um contato novo hoje?",
        },
        {
          value: "R$800k",
          label: "é o ticket médio de uma obra residencial",
          detail: "Quantas propostas sem follow-up você perdeu nos últimos 30 dias?",
        },
        {
          value: "12h",
          label: "tempo médio de resposta de construtoras sem IA",
          detail: "12 horas para responder um lead que quer decidir em 48h.",
        },
      ],
    },
    needPayoff: {
      title: "4 agentes trabalhando pela sua construtora",
      subtitle: "Enquanto você está na obra, o VendorAI cuida do comercial.",
      agents: [
        {
          icon: "🤖",
          name: "SDR 24/7",
          desc: "Responde leads do WhatsApp e Instagram imediatamente, qualifica interesse e coleta dados da obra — sem você digitar nada, a qualquer hora.",
        },
        {
          icon: "📅",
          name: "Agendador de Visitas",
          desc: "Marca visitas técnicas e reuniões automaticamente, confirma horários com o cliente e envia lembretes para garantir que o compromisso aconteça.",
        },
        {
          icon: "📨",
          name: "Follow-up de Proposta",
          desc: "Acompanha cada proposta enviada. Envia o contato no momento certo — nem cedo demais, nem tarde demais — e avisa quando o cliente está pronto para decidir.",
        },
        {
          icon: "📊",
          name: "CRM de Obras",
          desc: "Pipeline visual com todas as oportunidades. Saiba exatamente onde está cada negociação, quem precisa de atenção e qual obra vai fechar essa semana.",
        },
      ],
    },
    obrasHub: {
      badge: "Módulo exclusivo · Obras Hub",
      title: "Gestão completa da obra no mesmo lugar que cuida do seu comercial",
      subtitle: "Enquanto o Vobi para na obra, o VendorAI começa nela — e vai até o fechamento do próximo contrato. CRM, WhatsApp, prospecção e gestão de obra integrados em um único Business OS.",
      features: [
        {
          icon: "📊",
          badge: "Curva ABC",
          title: "Priorização inteligente de itens de obra",
          problem: "Você não sabe quais itens concentram 80% do custo da obra sem montar uma planilha complexa do zero.",
          solution: "Cada item do orçamento recebe automaticamente um badge A, B ou C. Badge A = foco total. Sua equipe sabe exatamente onde concentrar atenção de compra e negociação sem análise manual.",
        },
        {
          icon: "🏛️",
          badge: "SINAPI integrado",
          title: "Base oficial de preços da construção civil",
          problem: "Orçamentos feitos no feeling ou com tabelas desatualizadas geram margem errada e propostas difíceis de defender para o cliente.",
          solution: "O catálogo SINAPI completo está integrado — os mesmos preços referenciais usados por engenheiros, prefeituras e financiadores. Orçamento defensável, com credibilidade técnica, em minutos.",
        },
        {
          icon: "📝",
          badge: "IA no diário",
          title: "Relatório de obra que se escreve sozinho",
          problem: "Registrar o diário de obra todo dia consome tempo que o engenheiro não tem — e quando não é feito, a documentação some.",
          solution: "Sua equipe registra o que aconteceu no dia. O Claude transforma esses registros em um relatório profissional formatado automaticamente — com resumo executivo, pendências e próximos passos.",
        },
        {
          icon: "📅",
          badge: "Gantt drag-to-edit",
          title: "Replanejamento do cronograma em segundos",
          problem: "Quando a obra atrasa — e sempre atrasa — reajustar o cronograma leva uma tarde inteira e exige reenviar documentos para o cliente.",
          solution: "Arraste qualquer tarefa no Gantt e o cronograma inteiro se recalcula. Datas persistidas no banco. Compartilhe o cronograma atualizado com o cliente sem sair do sistema.",
        },
        {
          icon: "📄",
          badge: "PDF profissional",
          title: "Orçamento e DRE prontos para assinar",
          problem: "Gerar um orçamento apresentável para o cliente ou um DRE para o financiador requer um contador, uma tarde e um Excel cheio de fórmulas.",
          solution: "Um clique gera o PDF do orçamento detalhado ou o DRE completo da obra — com logo, formatação profissional e todos os números calculados. Pronto para apresentar ou protocolar.",
        },
        {
          icon: "📷",
          badge: "Diário com fotos",
          title: "Documentação visual do progresso da obra",
          problem: "Disputas de garantia, prestação de contas ao incorporador e laudos de vistoria exigem evidência fotográfica — que raramente existe quando precisa.",
          solution: "Upload de fotos diretamente no diário de obra, vinculadas à data e à etapa. Histórico visual completo da execução. Evidência real de cada fase, acessível a qualquer momento.",
        },
      ],
      vsCallout: {
        title: "Por que não usar só o Vobi?",
        desc: "O Vobi resolve orçamento e cronograma. Mas quando o cliente some depois da proposta, você não tem agente SDR para fazer follow-up. Quando um lead novo chega pelo Instagram às 22h, não há resposta automática. Quando a obra termina e o cliente precisa de reforma, não há CRM para reativar. O VendorAI entrega o módulo de obras E todo o comercial integrado — no mesmo lugar, com os mesmos dados.",
      },
    },
    cta: {
      headline: "Veja como construtoras estão fechando 3× mais obras",
      sub: "Demonstração personalizada para Construção Civil. Sem compromisso, sem cartão.",
    },
    gtagConversionLabel: "lp_construcao_civil",
  },

  {
    slug: "materiais-construcao",
    vertical: "Materiais de Construção",
    emoji: "🧱",
    situation: {
      tag: "Para lojas de materiais de construção",
      headline: "Enquanto seu vendedor digita cotação no WhatsApp,\na concorrência já fechou o pedido.",
      subheadline:
        "Lojas de materiais que usam VendorAI respondem cotações em menos de 60 segundos — e aumentam o ticket médio sem contratar mais vendedores.",
    },
    problem: {
      title: "O dia a dia que você conhece bem",
      subtitle: "Catálogo complexo, dezenas de clientes ao mesmo tempo, margem apertada.",
      points: [
        {
          icon: "⏱️",
          title: "Cotações manuais que demoram horas",
          desc: "Seu vendedor pesquisa preço, disponibilidade e prazo de entrega manualmente para cada cliente. Enquanto isso, o cliente ligou para o concorrente e já tem resposta.",
        },
        {
          icon: "📦",
          title: "Pedidos recorrentes sem controle centralizado",
          desc: "Construtoras e pedreiros que compram toda semana pedem por WhatsApp pessoal, telefone e às vezes presencialmente. Sempre há risco de pedido perdido ou errado.",
        },
        {
          icon: "💸",
          title: "Inadimplência sem régua de cobrança ativa",
          desc: "Clientes B2B com prazo para pagar e nenhum processo automatizado de cobrança. O responsável pela cobrança manual é o mesmo que precisa vender.",
        },
      ],
    },
    implication: {
      title: "O que você perde a cada semana sem automação",
      stats: [
        {
          value: "63%",
          label: "das vendas B2B vão para quem responde a cotação primeiro",
          detail: "Seu concorrente com IA já está respondendo antes de você abrir o WhatsApp.",
        },
        {
          value: "R$18k",
          label: "ticket mensal médio de uma construtora fidelizada",
          detail: "Perder um cliente recorrente dói muito mais do que parece no mês seguinte.",
        },
        {
          value: "4,5h",
          label: "tempo médio de resposta para cotações sem automação",
          detail: "4 horas e meia para responder algo que o VendorAI resolve em 45 segundos.",
        },
      ],
    },
    needPayoff: {
      title: "VendorAI transforma sua operação comercial",
      subtitle: "Do primeiro contato à cobrança, tudo automatizado e no seu nome.",
      agents: [
        {
          icon: "🤖",
          name: "SDR de Captação B2B",
          desc: "Aborda construtoras, empreiteiros e pedreiros no WhatsApp automaticamente, qualifica o potencial de compra e agenda visita com representante.",
        },
        {
          icon: "📋",
          name: "Suporte Técnico de Produtos",
          desc: "Responde perguntas sobre especificações, disponibilidade e compatibilidade de produtos 24 horas por dia, sem ocupar seu vendedor.",
        },
        {
          icon: "💰",
          name: "Agente Financeiro",
          desc: "Emite boletos, controla vencimentos e faz a cobrança de inadimplentes automaticamente — com o tom certo para não prejudicar o relacionamento.",
        },
        {
          icon: "🔄",
          name: "Follow-up de Pedido",
          desc: "Confirma pedidos recorrentes, avisa sobre atualizações de prazo de entrega e mantém o cliente informado sem intervenção manual.",
        },
      ],
    },
    cta: {
      headline: "Veja como lojas de materiais dobram o volume de pedidos",
      sub: "Demonstração personalizada. Sem compromisso, sem cartão de crédito.",
    },
    gtagConversionLabel: "lp_materiais_construcao",
  },

  {
    slug: "saude-beleza",
    vertical: "Saúde e Beleza",
    emoji: "💆",
    situation: {
      tag: "Para clínicas · salões · spas · estúdios de estética",
      headline: "Sua agenda está sempre cheia.\nMas 30% dos seus clientes nunca voltam.",
      subheadline:
        "Clínicas e salões com VendorAI automatizam agendamentos, confirmações e pós-venda — e aumentam a taxa de retorno de pacientes em até 2× sem esforço manual.",
    },
    problem: {
      title: "O que acontece nos bastidores de toda clínica",
      subtitle: "Agenda cheia, equipe sobrecarregada, cliente que faz o procedimento e some.",
      points: [
        {
          icon: "📱",
          title: "Agendamentos pelo WhatsApp sem confirmação automática",
          desc: "Clientes marcam pelo Instagram ou WhatsApp e esquecem. Você gasta 20 minutos por dia confirmando e reconfirmando manualmente. No-show custa caro.",
        },
        {
          icon: "🌫️",
          title: "Pós-procedimento inexistente",
          desc: "O cliente saiu satisfeito. Três meses depois, foi para outra clínica que mandou mensagem perguntando como ele estava. Simples assim.",
        },
        {
          icon: "💤",
          title: "Base de clientes inativos sem reativação",
          desc: "Você tem centenas de clientes que não voltam há mais de 6 meses. Eles não foram embora definitivamente — só ninguém os chamou de volta na hora certa.",
        },
      ],
    },
    implication: {
      title: "O que cada cliente inativo custa para o seu negócio",
      stats: [
        {
          value: "71%",
          label: "dos pacientes voltam para clínicas com pós-venda estruturado",
          detail: "Os outros 29% vão para o concorrente que fez uma única mensagem de acompanhamento.",
        },
        {
          value: "R$380",
          label: "ticket médio por visita em clínicas de estética",
          detail: "Cada cliente inativo reativado é R$380+ de receita que você já não contava.",
        },
        {
          value: "6 meses",
          label: "sem contato = cliente perdido para sempre",
          detail: "Depois de 6 meses sem recontato, a taxa de recuperação cai para menos de 15%.",
        },
      ],
    },
    needPayoff: {
      title: "4 agentes cuidando dos seus clientes enquanto você atende",
      subtitle: "Agendamento, confirmação, pós-venda e reativação — tudo automático.",
      agents: [
        {
          icon: "📅",
          name: "Agendador Inteligente",
          desc: "Marca, confirma e lembra o cliente do horário automaticamente via WhatsApp — sem sua recepcionista precisar digitar uma única mensagem.",
        },
        {
          icon: "🤖",
          name: "SDR de Captação",
          desc: "Responde interessados do Instagram e WhatsApp instantaneamente, apresenta os procedimentos disponíveis e converte curiosos em agendamentos reais.",
        },
        {
          icon: "💬",
          name: "Pós-venda e Feedback",
          desc: "Manda mensagem de acompanhamento 48h e 15 dias após cada procedimento. Coleta feedback, resolve insatisfações e pede avaliação Google quando o cliente está feliz.",
        },
        {
          icon: "🔁",
          name: "Reativação de Inativos",
          desc: "Identifica clientes que não voltam há 60, 90 ou 180 dias e envia a mensagem certa com oferta personalizada para trazer cada um de volta.",
        },
      ],
    },
    cta: {
      headline: "Veja como clínicas aumentam a recorrência de pacientes com IA",
      sub: "Demonstração personalizada para Saúde e Beleza. Sem compromisso.",
    },
    gtagConversionLabel: "lp_saude_beleza",
  },

  {
    slug: "auto-pecas",
    vertical: "Auto Peças",
    emoji: "🔧",
    situation: {
      tag: "Para distribuidoras · lojas de auto peças · atacadistas",
      headline: "O mecânico ligou.\nVocê estava atendendo outro.\nEle comprou na distribuidora do lado.",
      subheadline:
        "Distribuidoras de auto peças com VendorAI atendem dezenas de mecânicos ao mesmo tempo — sem perder um único contato e sem aumentar equipe.",
    },
    problem: {
      title: "A realidade do atacado de auto peças",
      subtitle: "Demanda alta, catálogo complexo, cliente que não tem tempo a perder.",
      points: [
        {
          icon: "🚗",
          title: "Dezenas de mecânicos ao mesmo tempo no WhatsApp",
          desc: "Cada mecânico precisa de resposta rápida. Se demorar 10 minutos, ele já está ligando para outra distribuidora. Um vendedor humano não consegue atender todos ao mesmo tempo.",
        },
        {
          icon: "🔍",
          title: "Consultas técnicas que travam o atendimento",
          desc: "\"Essa peça serve no Golf 2019?\" — perguntas técnicas que o vendedor precisa pesquisar manualmente, enquanto outros 5 clientes aguardam na fila.",
        },
        {
          icon: "📉",
          title: "Sem fidelização de clientes recorrentes",
          desc: "Mecânicos compram toda semana, mas vão para quem responder primeiro. Sem CRM e sem relacionamento ativo, você compete por preço toda vez.",
        },
      ],
    },
    implication: {
      title: "Quanto custa perder um mecânico fidelizado",
      stats: [
        {
          value: "R$8k",
          label: "compra mensal média de um mecânico fidelizado",
          detail: "Perder um mecânico frequentador equivale a perder R$96k por ano em receita.",
        },
        {
          value: "2 min",
          label: "é o limite de paciência do mecânico esperando cotação",
          detail: "Depois de 2 minutos sem resposta, 67% ligam para outra distribuidora.",
        },
        {
          value: "85%",
          label: "das compras de peças são de clientes recorrentes",
          detail: "Sua base atual de mecânicos é o ativo mais valioso — e o mais frágil sem relacionamento ativo.",
        },
      ],
    },
    needPayoff: {
      title: "VendorAI serve sua distribuidora 24 horas por dia",
      subtitle: "Atendimento instantâneo para todos os mecânicos, ao mesmo tempo.",
      agents: [
        {
          icon: "🤖",
          name: "Atendimento SDR 24/7",
          desc: "Responde consultas de peças via WhatsApp imediatamente, coleta ano/modelo/versão do veículo e encaminha para o vendedor somente quando necessário.",
        },
        {
          icon: "🔧",
          name: "Suporte Técnico de Peças",
          desc: "Responde perguntas de compatibilidade, especificações e códigos de peças automaticamente — com base no catálogo da sua distribuidora.",
        },
        {
          icon: "📨",
          name: "Follow-up de Orçamento",
          desc: "Acompanha todos os orçamentos enviados, manda lembretes no momento certo e alerta quando o mecânico está pronto para comprar.",
        },
        {
          icon: "📊",
          name: "CRM de Clientes B2B",
          desc: "Histórico completo de cada mecânico: o que compra, com que frequência, ticket médio — para sua equipe focar nos clientes mais valiosos.",
        },
      ],
    },
    cta: {
      headline: "Veja como distribuidoras de auto peças eliminam a fila de espera no WhatsApp",
      sub: "Demonstração personalizada. Sem compromisso, sem cartão de crédito.",
    },
    gtagConversionLabel: "lp_auto_pecas",
  },

  {
    slug: "distribuidoras-alimentos",
    vertical: "Distribuidoras de Alimentos",
    emoji: "🥩",
    situation: {
      tag: "Para distribuidoras · atacadistas · food service",
      headline: "Pedidos por WhatsApp, telefonema, planilha e Instagram.\nAlgum vai escapar.",
      subheadline:
        "Distribuidoras de alimentos com VendorAI centralizam todos os pedidos, automatizam a cobrança e prospecção B2B — e crescem sem aumentar o time operacional.",
    },
    problem: {
      title: "O caos operacional que freia seu crescimento",
      subtitle: "Demanda existe. O problema é a operação que não acompanha.",
      points: [
        {
          icon: "📱",
          title: "Pedidos chegando por 4 canais diferentes sem controle",
          desc: "WhatsApp pessoal do vendedor, WhatsApp da empresa, Instagram, telefone — e planilha para consolidar tudo no fim do dia. Um pedido esquecido vira cliente perdido.",
        },
        {
          icon: "💸",
          title: "Inadimplência sem processo automatizado",
          desc: "Restaurantes e mercadinhos com prazo para pagar e ninguém para cobrar com consistência. A cobrança manual é desconfortável para o vendedor — e frequentemente negligenciada.",
        },
        {
          icon: "🎯",
          title: "Prospecção de novos clientes feita na mão",
          desc: "Crescer significa visitar novos restaurantes, padarias e varejos — tarefa manual que consome o vendedor que deveria estar cuidando da carteira atual.",
        },
      ],
    },
    implication: {
      title: "O que a desorganização comercial custa por mês",
      stats: [
        {
          value: "37%",
          label: "dos distribuidores perdem pedidos por falha de comunicação",
          detail: "Mais de um terço dos pedidos somem em distribuidoras sem sistema centralizado.",
        },
        {
          value: "R$9k",
          label: "ticket mensal médio de um restaurante fidelizado",
          detail: "Um único restaurante ativo vale mais de R$100k por ano. Perder um custa muito.",
        },
        {
          value: "3 meses",
          label: "para o cliente trocar de fornecedor após um problema de pedido",
          detail: "Sem um processo de recuperação, 82% dos clientes insatisfeitos não voltam.",
        },
      ],
    },
    needPayoff: {
      title: "VendorAI organiza e escala sua operação comercial",
      subtitle: "Do pedido recorrente à prospecção de novos clientes — automatizado.",
      agents: [
        {
          icon: "🤖",
          name: "SDR B2B de Prospecção",
          desc: "Aborda novos restaurantes, mercados e padarias no WhatsApp e Instagram automaticamente, qualifica interesse e agenda visita com seu representante.",
        },
        {
          icon: "💰",
          name: "Agente Financeiro",
          desc: "Gerencia vencimentos, emite boletos e realiza a régua de cobrança com o tom correto — sem desgastar o relacionamento comercial.",
        },
        {
          icon: "🔄",
          name: "Follow-up de Pedido",
          desc: "Confirma pedidos recorrentes, avisa sobre status de entrega e reativa clientes que param de pedir sem motivo aparente.",
        },
        {
          icon: "🎧",
          name: "Suporte ao Cliente",
          desc: "Resolve reclamações de entrega, prazo e produto — antes que o cliente ligue para o concorrente. Triage automática para sua equipe operacional.",
        },
      ],
    },
    cta: {
      headline: "Veja como distribuidoras eliminam pedidos perdidos e dobram a prospecção",
      sub: "Demonstração personalizada para food service e distribuição. Sem compromisso.",
    },
    gtagConversionLabel: "lp_distribuidoras_alimentos",
  },

  {
    slug: "moda",
    vertical: "Moda",
    emoji: "👗",
    situation: {
      tag: "Para lojas · marcas · ateliês · e-commerces de moda",
      headline: "Sua loja tem 50 mil seguidores.\nSeus DMs têm 300 mensagens sem resposta.",
      subheadline:
        "Marcas de moda com VendorAI convertem seguidores em compradores automaticamente — e recuperam clientes que compraram uma vez e nunca mais voltaram.",
    },
    problem: {
      title: "O funil de moda que nunca fecha",
      subtitle: "Audiência enorme, conversão pequena, pós-venda zero.",
      points: [
        {
          icon: "📸",
          title: "Instagram DMs sem atendimento no horário certo",
          desc: "\"Esse vestido tem no 38?\" — pergunta feita às 22h. Resposta às 10h do dia seguinte. Cliente já comprou na loja concorrente que tem IA respondendo 24h.",
        },
        {
          icon: "🛒",
          title: "Carrinho abandonado sem recuperação ativa",
          desc: "67% dos carrinhos de e-commerce são abandonados. Sem uma mensagem de recuperação no momento certo, você perde mais da metade das suas quase-vendas.",
        },
        {
          icon: "👻",
          title: "Clientes que compram uma vez e somem",
          desc: "A maior fonte de receita de qualquer loja de moda é o cliente que volta. Mas sem pós-venda e reativação estruturada, cada venda começa do zero.",
        },
      ],
    },
    implication: {
      title: "O dinheiro que sai pela sua loja sem você ver",
      stats: [
        {
          value: "80%",
          label: "de taxa de abertura de mensagem no Instagram DM",
          detail: "vs 21% de abertura de e-mail. O canal está lá — você só precisa usar com automação.",
        },
        {
          value: "67%",
          label: "dos carrinhos são recuperáveis com a mensagem certa no momento certo",
          detail: "Cada carrinho recuperado é receita pura sem custo de aquisição.",
        },
        {
          value: "5×",
          label: "mais revenue gera um cliente fidelizado vs um cliente novo",
          detail: "E o custo para manter um cliente existente é 7× menor do que adquirir um novo.",
        },
      ],
    },
    needPayoff: {
      title: "VendorAI vende moda enquanto você cria coleções",
      subtitle: "Atendimento, recuperação e fidelização rodando 24h por dia.",
      agents: [
        {
          icon: "🤖",
          name: "SDR via Instagram e WhatsApp",
          desc: "Responde DMs do Instagram e mensagens do WhatsApp instantaneamente — tira dúvidas de tamanho, cor e disponibilidade e converte interesse em venda.",
        },
        {
          icon: "🔁",
          name: "Recuperação de Carrinho",
          desc: "Detecta abandono e manda a mensagem certa no momento certo — com um empurrãozinho (ou uma oferta relâmpago) para fechar a venda.",
        },
        {
          icon: "💬",
          name: "Pós-venda e Fidelização",
          desc: "Pergunta como chegou o pedido, coleta feedback, sugere peças complementares — e transforma compradores ocasionais em clientes fiéis.",
        },
        {
          icon: "📣",
          name: "Campanhas Automáticas",
          desc: "Dispara campanhas segmentadas para sua base — liquidação, lançamento de coleção, aniversário do cliente — sem você precisar enviar uma a uma.",
        },
      ],
    },
    cta: {
      headline: "Veja como marcas de moda aumentam a recorrência e recuperam carrinhos com IA",
      sub: "Demonstração personalizada para Moda e Varejo. Sem compromisso.",
    },
    gtagConversionLabel: "lp_moda",
  },

  {
    slug: "servicos-profissionais",
    vertical: "Serviços Profissionais",
    emoji: "💼",
    situation: {
      tag: "Para consultorias · advocacia · contabilidade · agências",
      headline: "Proposta enviada. Três dias de silêncio.\nVocê soube que perdeu quando o cliente assinou com outro.",
      subheadline:
        "Escritórios e consultorias com VendorAI nunca perdem uma proposta por falta de follow-up — e cobram clientes sem o desconforto da abordagem manual.",
    },
    problem: {
      title: "O que trava o crescimento de prestadores de serviço",
      subtitle: "Você é bom no que faz. O problema está no processo comercial.",
      points: [
        {
          icon: "🤐",
          title: "Follow-up de proposta inconsistente ou inexistente",
          desc: "Você manda a proposta, espera 3 dias e manda um \"oi, tudo bem?\". O cliente não responde. Você desiste. A venda morreu por falta de processo, não por preço.",
        },
        {
          icon: "😬",
          title: "Cobrança de clientes é desconfortável e manual",
          desc: "Cobrar clientes pessoalmente constrange o relacionamento. Sem automação, você ou adia ou cobra de forma agressiva — nenhum dos dois é bom para a retenção.",
        },
        {
          icon: "😶",
          title: "Clientes de longo prazo sem relacionamento ativo",
          desc: "O cliente paga a mensalidade mas você só fala quando tem problema. Sem check-ins regulares, o contrato vira commodity — e a renovação fica em risco.",
        },
      ],
    },
    implication: {
      title: "O que propostas sem follow-up custam por ano",
      stats: [
        {
          value: "60%",
          label: "das propostas perdidas poderiam ser recuperadas com follow-up no momento certo",
          detail: "A maioria das perdas não é de preço — é de timing e consistência.",
        },
        {
          value: "R$36k",
          label: "ticket médio de contrato anual em serviços profissionais",
          detail: "Cada proposta que morre por falta de follow-up é R$36k que vai para o concorrente.",
        },
        {
          value: "7×",
          label: "mais caro adquirir um cliente novo do que reter um atual",
          detail: "Sua base atual de clientes é o ativo mais subexplorado do seu escritório.",
        },
      ],
    },
    needPayoff: {
      title: "VendorAI profissionaliza seu comercial sem tirar seu foco do serviço",
      subtitle: "Da prospecção ao pós-venda, tudo com o rigor que sua marca exige.",
      agents: [
        {
          icon: "🤖",
          name: "SDR de Prospecção",
          desc: "Aborda leads qualificados via LinkedIn, WhatsApp e Instagram — qualifica interesse, filtra por fit e agenda reunião de diagnóstico com você.",
        },
        {
          icon: "📨",
          name: "Follow-up de Proposta",
          desc: "Acompanha cada proposta com sequência estruturada de contatos — no dia 1, dia 3, dia 7 — e avisa exatamente quando o cliente está aquecido para decidir.",
        },
        {
          icon: "💰",
          name: "Agente Financeiro",
          desc: "Faz a cobrança de inadimplentes com o tom certo — firme, mas sem desgastar o relacionamento — e garante que o recebimento não comprometa a renovação.",
        },
        {
          icon: "🤝",
          name: "Customer Success",
          desc: "Faz check-ins regulares com clientes ativos, coleta NPS, identifica riscos de churn antes que vire problema e sugere expansão de escopo natural.",
        },
      ],
    },
    cta: {
      headline: "Veja como escritórios profissionais fecham 60% mais propostas com IA",
      sub: "Demonstração personalizada para Serviços Profissionais. Sem compromisso.",
    },
    gtagConversionLabel: "lp_servicos_profissionais",
  },

  {
    slug: "tecnologia-saas",
    vertical: "Tecnologia e SaaS",
    emoji: "🚀",
    situation: {
      tag: "Para SaaS · startups de tecnologia · plataformas B2B",
      headline: "Seu trial ativou 200 usuários este mês.\nQuantos vão realmente converter?",
      subheadline:
        "Empresas de tecnologia com VendorAI automatizam o onboarding de trials, antecipam churn e fazem upsell inteligente — sem escalar o time de customer success.",
    },
    problem: {
      title: "Os gargalos do crescimento SaaS",
      subtitle: "CAC sobe. Churn não cai. E o CS não consegue atender todo mundo.",
      points: [
        {
          icon: "🎯",
          title: "Onboarding de trial manual e sem escala",
          desc: "Cada novo usuário precisaria de um toque humano nas primeiras 72h para ativar. Mas seu time de CS não consegue fazer isso para centenas de trials ao mesmo tempo.",
        },
        {
          icon: "👻",
          title: "Churn silencioso sem sinal de alerta",
          desc: "O cliente para de usar, deixa de abrir o app, para de responder. Três meses depois, cancela. Sem monitoramento ativo, você descobre tarde demais.",
        },
        {
          icon: "📊",
          title: "Upsell e expansão de conta sem inteligência",
          desc: "Você sabe que o cliente está pronto para fazer upgrade — mas ninguém identificou o momento certo para abrir essa conversa. A expansão fica na mesa.",
        },
      ],
    },
    implication: {
      title: "O impacto do churn e da ativação baixa no seu ARR",
      stats: [
        {
          value: "73%",
          label: "dos trials que não ativam em 72h nunca convertem",
          detail: "As primeiras 72 horas definem se o usuário fica ou sai. Quem cuida desse momento?",
        },
        {
          value: "25–95%",
          label: "de aumento no LTV com apenas +5% de retenção",
          detail: "Reduzir churn é o investimento com maior retorno que um SaaS pode fazer.",
        },
        {
          value: "5×",
          label: "mais caro adquirir um novo cliente do que reter um atual",
          detail: "Enquanto você gasta em performance para trazer novos, está deixando a base sangrar.",
        },
      ],
    },
    needPayoff: {
      title: "VendorAI escala seu CS sem escalar o headcount",
      subtitle: "Ativação, retenção, expansão e reativação — automatizados e personalizados.",
      agents: [
        {
          icon: "🤖",
          name: "SDR de Prospecção Outbound",
          desc: "Aborda ICP ideal via LinkedIn e e-mail, qualifica fit técnico e de negócio — e entrega reuniões de demo para seu time de vendas pré-qualificadas.",
        },
        {
          icon: "🎓",
          name: "Onboarding e Suporte",
          desc: "Guia o usuário pelos primeiros passos do produto nas primeiras 72h, responde dúvidas técnicas e garante que ele atinja o primeiro valor antes de churn.",
        },
        {
          icon: "📈",
          name: "Customer Success Proativo",
          desc: "Monitora engajamento, faz check-ins em momentos-chave, identifica usuários em risco e abre a conversa de expansão quando o timing é certo.",
        },
        {
          icon: "🔁",
          name: "Reativação de Churnados",
          desc: "Identifica clientes que cancelaram, classifica motivo e dispara sequência de reativação personalizada — recuperando receita que parecia perdida.",
        },
      ],
    },
    cta: {
      headline: "Veja como SaaS brasileiros reduzem churn e dobram ativação de trials com IA",
      sub: "Demonstração personalizada para empresas de tecnologia. Sem compromisso.",
    },
    gtagConversionLabel: "lp_tecnologia_saas",
  },
];

export function getLpConfig(slug: string): LpConfig | undefined {
  return LP_CONFIGS.find((c) => c.slug === slug);
}
