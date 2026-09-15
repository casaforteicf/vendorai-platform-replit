export type ProductDeepDiveSection = {
  title: string;
  intro: string;
  items: { title: string; pain: string; execution: string; benefit: string }[];
};

export type ProductDeepDiveContent = {
  headline: string;
  intro: string;
  why: string;
  journey: string[];
  sections: ProductDeepDiveSection[];
  outcome: string;
};

const deepDive: Record<string, ProductDeepDiveContent> = {
  marketing: {
    headline: "Marketing que não termina na publicação: planeja, produz, distribui e mede até a venda",
    intro: "O Marketing IA do VendorAI existe para resolver um problema comum: empresas publicam, impulsionam e anunciam, mas não conseguem ligar o trabalho de marketing à geração real de oportunidades e receita. Por isso o módulo conecta planejamento, produção de conteúdo, criativos, canais, campanhas e CRM na mesma jornada.",
    why: "A função central não é apenas produzir posts. É transformar objetivo comercial em plano de comunicação executável e acompanhar se esse plano realmente gerou conversa, lead, oportunidade e venda.",
    journey: [
      "Definir objetivo comercial, público, oferta, canal e resultado esperado.",
      "Transformar o objetivo em temas, campanhas, calendário e formatos por canal.",
      "Produzir textos, imagens, vídeos e peças coerentes com marca e oferta.",
      "Publicar ou preparar conteúdos e campanhas nos canais conectados.",
      "Acompanhar origem do lead, interação, oportunidade e resultado no CRM.",
      "Usar o desempenho para ajustar os próximos conteúdos e campanhas."
    ],
    sections: [
      {
        title: "Instagram e redes sociais",
        intro: "A presença social precisa ter objetivo, frequência, formato e mensagem — não apenas volume de postagem.",
        items: [
          { title: "Planejamento por objetivo", pain: "A empresa publica sem saber se quer alcance, relacionamento, geração de lead ou venda.", execution: "O VendorAI organiza campanha, tema, público, CTA e canal antes de iniciar a produção.", benefit: "Cada conteúdo nasce ligado a um objetivo mensurável e deixa de ser uma postagem isolada." },
          { title: "Consistência de comunicação", pain: "O perfil muda de linguagem, visual e foco a cada publicação.", execution: "O sistema usa contexto da empresa, posicionamento, produtos, campanhas e biblioteca de mídia para manter continuidade.", benefit: "Marca mais reconhecível e menos retrabalho para revisar cada conteúdo." },
          { title: "Ligação com vendas", pain: "Curtidas e visualizações não mostram o que realmente virou oportunidade.", execution: "Quando canais e CRM estão conectados, origem e campanha podem acompanhar o lead dentro da jornada comercial.", benefit: "Marketing passa a ser avaliado por avanço comercial, e não somente por métricas de vaidade." }
        ]
      }
    ],
    outcome: "O resultado esperado é uma operação de marketing contínua: planejamento orienta produção, produção alimenta canais, canais geram sinais e leads, e o CRM devolve o que realmente funcionou."
  },
  "content-planner": {
    headline: "Planejador de Mídias e Conteúdo: saber o que publicar, por que publicar e o que fazer depois",
    intro: "O Content Planner foi criado para substituir o improviso. Ele transforma metas de negócio em calendário de mídia e conteúdo, organizando temas, campanhas, canais, frequência, formatos e responsáveis antes da criação começar.",
    why: "Sem planejamento, a equipe tende a produzir conteúdo repetitivo, publicar apenas quando sobra tempo e perder conexão entre Instagram, campanhas, lançamentos, datas comerciais e objetivos de vendas.",
    journey: [
      "Ler contexto da empresa, segmento, ofertas e objetivos comerciais.",
      "Definir campanha ou linha editorial e o papel de cada canal.",
      "Distribuir temas no calendário conforme frequência e prioridade.",
      "Definir o formato de cada entrega: post, carrossel, vídeo, story, anúncio ou peça de apoio.",
      "Encaminhar cada item para produção no Content Studio ou Creative Studio.",
      "Acompanhar execução e ajustar o plano conforme resultado e campanhas ativas."
    ],
    sections: [
      {
        title: "Por que o planejador existe",
        intro: "A dor não é falta de ideias. É falta de uma sequência coerente que conecte conteúdo com objetivo comercial.",
        items: [
          { title: "Calendário editorial", pain: "Postagens acontecem de forma irregular e sem visão das próximas semanas.", execution: "Organiza data, canal, tema, objetivo e campanha em uma visão única.", benefit: "A equipe sabe antecipadamente o que precisa produzir e publicar." },
          { title: "Planejamento multicanal", pain: "A mesma peça é repetida em todos os canais, sem respeitar comportamento e formato de cada rede.", execution: "O plano distribui temas e formatos conforme Instagram, TikTok, Facebook, LinkedIn e demais canais habilitados.", benefit: "A mensagem permanece consistente, mas o formato se adapta ao canal." },
          { title: "Campanhas coordenadas", pain: "Anúncio, conteúdo orgânico, LP e abordagem comercial funcionam separados.", execution: "O planejador organiza as entregas dentro da mesma campanha e objetivo.", benefit: "Cada ponto de contato reforça a mesma oferta e aumenta coerência da jornada." },
          { title: "Produção automática a partir do plano", pain: "Planejar não adianta se alguém precisar recriar todo o briefing na etapa seguinte.", execution: "O item planejado leva contexto, objetivo e canal para os módulos de produção.", benefit: "Menos retrabalho entre planejamento, texto, imagem e vídeo." }
        ]
      }
    ],
    outcome: "O benefício principal é previsibilidade: a empresa deixa de perguntar 'o que vamos postar hoje?' e passa a operar uma agenda de comunicação ligada às metas comerciais."
  },
  "content-studio": {
    headline: "Geração de conteúdo para Instagram e outros canais com contexto da empresa",
    intro: "O Content Studio transforma um plano, uma campanha ou uma ideia em conteúdo publicável. Ele produz texto, legenda, copy, roteiro e estrutura de peças sem começar do zero a cada publicação.",
    why: "Gerar texto com IA é simples; gerar conteúdo coerente com produto, público, objetivo, marca, campanha e próxima ação é o que evita posts genéricos que parecem iguais aos de qualquer concorrente.",
    journey: [
      "Receber tema e objetivo vindos do planejamento ou de uma solicitação direta.",
      "Considerar contexto da empresa, oferta, público e posicionamento.",
      "Escolher canal e formato adequado.",
      "Gerar texto principal, legenda, CTA, hashtags quando aplicáveis e roteiro para vídeo/carrossel.",
      "Encaminhar o briefing visual ao Creative Studio e usar mídia já disponível na biblioteca.",
      "Guardar a peça na operação de conteúdo para publicação, revisão ou campanha."
    ],
    sections: [
      {
        title: "O que o gerador de conteúdo resolve",
        intro: "A produção precisa ganhar velocidade sem perder relevância e intenção comercial.",
        items: [
          { title: "Posts e legendas", pain: "A equipe perde tempo pensando em texto e acaba repetindo mensagens.", execution: "Gera variações de copy considerando tema, objetivo, produto e linguagem da marca.", benefit: "Mais velocidade e maior consistência entre publicações." },
          { title: "Carrosséis", pain: "O conteúdo fica raso porque não existe estrutura para desenvolver uma ideia em etapas.", execution: "Organiza gancho, sequência de slides, argumento e chamada final.", benefit: "Conteúdo educativo e comercial com começo, desenvolvimento e CTA." },
          { title: "Roteiros de vídeo", pain: "Vídeos são adiados porque ninguém sabe o que falar ou como estruturar a gravação.", execution: "Cria roteiro com abertura, desenvolvimento, prova, oferta e fechamento conforme duração e canal.", benefit: "A produção audiovisual começa com mensagem pronta, reduzindo tempo de preparação." },
          { title: "Conteúdo conectado à campanha", pain: "O post fala de uma coisa enquanto anúncio e landing page vendem outra.", execution: "O conteúdo pode partir do mesmo objetivo e oferta definidos no planejamento.", benefit: "Mais coerência entre conteúdo orgânico, tráfego pago e abordagem comercial." }
        ]
      }
    ],
    outcome: "O resultado esperado é aumentar a capacidade de produção sem transformar o perfil em conteúdo genérico: mais peças, mais formatos e maior conexão com campanha e venda."
  },
  "creative-studio": {
    headline: "Fotos, vídeos, voz e Dublê Digital: produção criativa sem depender de uma gravação nova para cada peça",
    intro: "O Creative Studio é a camada visual e audiovisual do VendorAI. Ele transforma briefing e conteúdo em imagens, vídeos, voz, dublagem, mockups e materiais para campanhas. Dentro dessa jornada, o Dublê Digital permite criar uma identidade audiovisual autorizada para novas produções.",
    why: "A dor é operacional: boas ideias param porque faltam foto, vídeo, locução, edição ou disponibilidade da pessoa que deveria aparecer. O Creative Studio reduz essa dependência e organiza a produção em um único fluxo.",
    journey: [
      "Receber roteiro, briefing ou objetivo vindo do Content Planner/Studio.",
      "Selecionar imagens e materiais existentes na biblioteca ou gerar novos ativos.",
      "Criar peça visual, mockup, imagem de produto ou composição para campanha.",
      "Gerar vídeo com roteiro, cenas, voz, música e formato adequado ao canal.",
      "Quando autorizado, usar Dublê Digital para produzir uma apresentação com identidade audiovisual cadastrada.",
      "Validar qualidade e salvar o resultado na biblioteca para reutilização em campanhas."
    ],
    sections: [
      {
        title: "Geração e edição de fotos",
        intro: "A empresa precisa transformar produto, serviço e mensagem em imagens utilizáveis nos canais de venda.",
        items: [
          { title: "Imagem de campanha", pain: "Toda publicação depende de designer ou banco de imagens genérico.", execution: "O módulo gera e compõe imagens orientadas pelo briefing da campanha e pelos ativos disponíveis.", benefit: "Produção visual mais rápida e mais próxima da oferta real." },
          { title: "Variações e formatos", pain: "Uma mesma arte precisa ser refeita manualmente para diferentes canais.", execution: "A peça pode ser adaptada para diferentes proporções e necessidades de campanha.", benefit: "Menos retrabalho e maior aproveitamento do material criado." },
          { title: "Biblioteca como banco de mídia", pain: "Fotos, logos, produtos e criativos ficam espalhados em pastas e conversas.", execution: "Ativos podem ser reutilizados pela produção para novos conteúdos e campanhas.", benefit: "O sistema passa a trabalhar com o patrimônio visual da empresa, e não começar do zero." }
        ]
      },
      {
        title: "Vídeos com texto, voz, áudio e acabamento",
        intro: "Vídeo exige mais do que gerar cenas. Precisa de roteiro, locução, ritmo e elementos que façam sentido para o canal.",
        items: [
          { title: "Roteiro para produção", pain: "A equipe sabe que precisa fazer Reels e vídeos, mas não tem estrutura narrativa.", execution: "O roteiro define gancho, fala, cenas e CTA antes da geração.", benefit: "Vídeos mais objetivos e menos tempo perdido em tentativas." },
          { title: "Locução e voz", pain: "O vídeo é produzido sem áudio adequado ou depende de gravação manual para cada versão.", execution: "A produção pode trabalhar com voz e locução dentro do fluxo audiovisual.", benefit: "Mais formatos de vídeo e maior consistência na entrega." },
          { title: "Música e trilha", pain: "A peça fica visualmente pronta, mas sem acabamento audiovisual.", execution: "Áudio e trilha podem compor o material final conforme objetivo e formato.", benefit: "Conteúdo mais completo para redes sociais e campanhas." }
        ]
      },
      {
        title: "Dublê Digital autorizado",
        intro: "O Dublê Digital existe para permitir que uma pessoa autorizada participe de novas produções sem precisar gravar cada conteúdo do zero.",
        items: [
          { title: "Captura guiada", pain: "A criação de um avatar costuma falhar porque as referências de foto, áudio e vídeo são insuficientes ou inconsistentes.", execution: "O VendorAI guia captura de fotos, voz e vídeo, inclusive por fluxo móvel, e registra a identidade audiovisual autorizada.", benefit: "Base mais completa para gerar conteúdos posteriores com maior consistência." },
          { title: "Fidelity Score", pain: "É difícil saber se o material de referência está bom antes de iniciar a produção.", execution: "O sistema avalia cobertura e qualidade observável de enquadramento, expressão, olhar, boca, gestos, postura e naturalidade.", benefit: "Ajuda a identificar o que precisa ser melhorado antes de gerar novas peças." },
          { title: "Produção com identidade audiovisual", pain: "Executivos, vendedores e especialistas não conseguem gravar toda semana.", execution: "Depois de autorizado e validado, o Dublê Digital pode ser usado em produções de vídeo dentro das regras do sistema.", benefit: "Escala presença em conteúdo sem exigir nova sessão de gravação para cada roteiro." },
          { title: "Controle de qualidade", pain: "Um vídeo pode sair com baixa naturalidade ou problemas de sincronia.", execution: "O fluxo possui análise de fidelidade e quality gate audiovisual para revisar qualidade observável da produção.", benefit: "Reduz a chance de aprovar material inconsistente com a referência cadastrada." }
        ]
      }
    ],
    outcome: "O ganho não é somente 'gerar uma imagem'. É criar uma fábrica de mídia conectada ao planejamento e à mensagem comercial, com ativos reaproveitáveis e produção audiovisual escalável."
  },
  ads: {
    headline: "Anúncios conectados ao restante do marketing e ao CRM",
    intro: "Vendor Ads existe para evitar que mídia paga seja uma ilha. Campanha precisa nascer de uma oferta e de um planejamento, usar criativos coerentes e depois ser avaliada pelo que acontece com os leads gerados.",
    why: "CPL isolado não mostra qualidade. Uma campanha barata pode gerar leads que nunca avançam, enquanto outra aparentemente mais cara pode produzir mais oportunidades e receita.",
    journey: [
      "Partir de objetivo, oferta, público e campanha definidos.",
      "Usar conteúdo e criativos produzidos no ecossistema de marketing.",
      "Preparar campanha e canais de mídia conectados.",
      "Acompanhar geração de leads e origem.",
      "Cruzar resultado de mídia com avanço no CRM.",
      "Otimizar mensagens e criativos usando resultado comercial como referência."
    ],
    sections: [
      {
        title: "Da mídia ao resultado",
        intro: "O objetivo é aproximar investimento de marketing da receita gerada.",
        items: [
          { title: "Campanha coerente", pain: "Anúncios são criados sem relação clara com conteúdo, LP e abordagem do vendedor.", execution: "Campanha, criativo e conteúdo partem da mesma oferta e objetivo.", benefit: "Menos ruptura na jornada do usuário." },
          { title: "Origem do lead", pain: "Depois que o lead entra, ninguém sabe exatamente de qual campanha veio.", execution: "Quando integrações e rastreamento estão ativos, origem acompanha o lead no CRM.", benefit: "Permite comparar campanhas pela qualidade do negócio gerado." },
          { title: "Otimização por receita", pain: "A equipe pausa ou escala campanhas olhando somente clique e CPL.", execution: "O desempenho pode ser lido em conjunto com oportunidade, conversão e receita por origem.", benefit: "Orçamento tende a ser direcionado para campanhas que contribuem com resultado comercial." }
        ]
      }
    ],
    outcome: "O objetivo final é reduzir a distância entre 'anunciar' e 'vender', usando o CRM para devolver ao marketing quais campanhas realmente movimentaram o funil."
  }
};

export function getProductDeepDiveContent(slug: string): ProductDeepDiveContent | null {
  return deepDive[slug] ?? null;
}
