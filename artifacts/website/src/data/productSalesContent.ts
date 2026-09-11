export type ProductSalesContent = {
  positioning: string;
  technical: string[];
  opportunities: string[];
  improvements: string[];
  metrics: string[];
  commercialNote?: string;
};

const content: Record<string, ProductSalesContent> = {
  growth: {
    positioning: "O VendorAI Growth é a operação completa: aquisição, atendimento, CRM, vendas, pós-venda, inteligência, gestão e automação trabalhando sobre o mesmo contexto de cliente.",
    technical: [
      "Arquitetura multiempresa e multiusuário, com dados isolados por tenant e permissões por operação.",
      "CRM, agentes, marketing, omnichannel, agenda, analytics, automações e inteligência conectados ao mesmo histórico.",
      "Integrações oficiais e APIs/webhooks para conectar canais, sistemas e rotinas externas.",
      "Implantação padrão autoguiada pelo agente, com configuração progressiva conforme o segmento e a jornada da empresa."
    ],
    opportunities: [
      "Leads sem atendimento, follow-up ou próxima ação definida.",
      "Negócios parados, clientes inativos e oportunidades de recompra ou expansão.",
      "Campanhas que geram volume, mas não avançam até receita.",
      "Gargalos entre marketing, atendimento, vendas, agenda, financeiro e pós-venda."
    ],
    improvements: [
      "Substitui várias ferramentas desconectadas por uma operação única orientada à receita.",
      "Reduz perda de contexto entre canais, vendedores e etapas do funil.",
      "Aumenta a capacidade operacional sem exigir crescimento proporcional da equipe.",
      "Cria uma base de dados contínua para a IA aprender com a operação e melhorar priorização e execução."
    ],
    metrics: ["Tempo de resposta", "Conversão por etapa", "Receita por origem", "Follow-ups executados", "Oportunidades reativadas", "Receita da carteira"],
    commercialNote: "Growth: 5 dias grátis; R$ 497 pelos primeiros 30 dias pagos; R$ 990/mês pelos 5 meses seguintes; R$ 1.490/mês depois. Alternativamente, 5 dias grátis por mês e blocos adicionais de 5 dias por R$ 399. Usuários ilimitados."
  },
  crm: {
    positioning: "O Vendor CRM transforma leads, clientes, negócios e atividades em uma única memória comercial, com próxima ação, responsáveis e histórico por relacionamento.",
    technical: [
      "Pipeline visual com etapas configuráveis e registro de leads, contatos, empresas e oportunidades.",
      "Histórico 360° de conversas, tarefas, propostas, atividades e mudanças no negócio.",
      "Scoring, filtros, segmentação e próxima melhor ação conectados aos demais módulos do VendorAI.",
      "Distribuição de responsáveis e visão gerencial para acompanhar carteira e produtividade."
    ],
    opportunities: [
      "Negócios sem próxima ação ou parados há tempo acima do esperado.",
      "Leads sem responsável, sem retorno ou com histórico incompleto.",
      "Clientes com potencial de nova negociação a partir do histórico comercial.",
      "Etapas do funil com concentração anormal de oportunidades ou baixa conversão."
    ],
    improvements: [
      "Tira a operação da planilha e da memória individual do vendedor.",
      "Padroniza acompanhamento sem retirar flexibilidade da equipe.",
      "Melhora previsibilidade porque toda oportunidade passa a ter status e contexto.",
      "Permite que agentes e gestores trabalhem sobre o mesmo dado comercial."
    ],
    metrics: ["Conversão por etapa", "Tempo médio por etapa", "Negócios sem próxima ação", "Taxa de ganho", "Ticket médio", "Produtividade por vendedor"]
  },
  jarvis: {
    positioning: "O JARVIS é a camada executiva do VendorAI: consulta dados, cruza sinais e devolve prioridades para quem precisa decidir rapidamente.",
    technical: [
      "Consulta por texto ou voz sobre dados conectados do CRM, marketing, agenda, financeiro e Revenue Scout.",
      "Watchlists e radar de riscos/oportunidades para acompanhar temas, contas, equipes ou indicadores prioritários.",
      "Comparações e resumos executivos com contexto operacional, não apenas números isolados.",
      "Fila de aprovações para ações que exigem decisão humana antes da execução."
    ],
    opportunities: [
      "Mudanças relevantes que o gestor ainda não percebeu no funil ou na carteira.",
      "Campanhas, vendedores, regiões ou produtos com desempenho fora do padrão.",
      "Riscos de perda de receita, atrasos, oportunidades de expansão ou concentração excessiva.",
      "Decisões pendentes que bloqueiam tarefas, campanhas ou ações comerciais."
    ],
    improvements: [
      "Reduz o tempo gasto procurando informações em múltiplas telas.",
      "Traz gestão por exceção: o diretor olha primeiro para o que exige atenção.",
      "Ajuda reuniões executivas a começarem com contexto e prioridades já organizadas.",
      "Transforma indicadores em perguntas e decisões acionáveis."
    ],
    metrics: ["Alertas críticos", "Oportunidades detectadas", "Ações pendentes", "Variações de receita", "Conversão por equipe", "Riscos por carteira"]
  },
  "agentes-ia": {
    positioning: "O Vendor AI Team coloca agentes especializados em diferentes etapas da jornada, todos trabalhando com regras, contexto e conhecimento da empresa.",
    technical: [
      "Agentes especializados para recepção, SDR, closer, follow-up, cobrança, suporte, agendamento, reativação e pós-venda.",
      "Contexto compartilhado com CRM, canais e base de conhecimento para reduzir respostas desconectadas.",
      "Regras de atuação e autonomia configuráveis conforme o processo da empresa.",
      "Escalonamento para humano quando a conversa, regra ou decisão exigir intervenção."
    ],
    opportunities: [
      "Novo lead que precisa de resposta e qualificação imediata.",
      "Cliente que parou de responder ou está esperando retorno.",
      "Objeção, intenção de compra, pedido de agenda ou necessidade de suporte identificada na conversa.",
      "Cliente antigo apto a reativação, pós-venda ou nova abordagem."
    ],
    improvements: [
      "Aumenta cobertura de atendimento sem depender do horário da equipe.",
      "Padroniza abordagem e evita que cada vendedor conduza o processo de forma diferente.",
      "Libera vendedores para negociação e relacionamento de maior valor.",
      "Mantém continuidade entre atendimento, vendas e pós-venda."
    ],
    metrics: ["Tempo de primeira resposta", "Leads qualificados", "Transferências para humano", "Follow-ups executados", "Agendamentos", "Reativações"]
  },
  prospeccao: {
    positioning: "O Vendor Prospector transforma pesquisa de mercado em uma fila organizada de potenciais clientes para a equipe atacar com foco.",
    technical: [
      "Busca por segmento, região e critérios comerciais para formar listas de prospecção.",
      "Enriquecimento e qualificação de contatos antes do envio ao CRM.",
      "Fluxos configuráveis, perguntas de qualificação e cadências para organizar abordagem.",
      "Integração com CRM e agentes para transformar prospecção em processo acompanhado."
    ],
    opportunities: [
      "Empresas dentro do perfil ideal em novas cidades, regiões ou nichos.",
      "Contas ainda fora da carteira que atendem aos critérios comerciais definidos.",
      "Prospects com maior aderência ao ICP e prioridade de abordagem.",
      "Regiões ou segmentos com baixa cobertura comercial atual."
    ],
    improvements: [
      "Reduz pesquisa manual e tempo gasto montando listas.",
      "Cria prospecção previsível em vez de depender apenas de indicação ou inbound.",
      "Melhora foco da equipe ao priorizar quem faz mais sentido abordar.",
      "Mantém origem, histórico e resultado de cada prospecção dentro do CRM."
    ],
    metrics: ["Prospects descobertos", "Taxa de qualificação", "Conversão em oportunidade", "Custo por oportunidade", "Cobertura por região", "Resultado por fluxo"]
  },
  "revenue-scout": {
    positioning: "O Revenue Scout procura receita dentro dos dados que a empresa já possui, transformando sinais e regras comerciais em oportunidades priorizadas.",
    technical: [
      "Motor de regras configuráveis por cliente, segmento, produto, carteira e evento.",
      "Scores e sinais para ordenar oportunidades por prioridade e potencial comercial.",
      "Integração com CRM para criar fila, responsável, próxima ação e histórico da oportunidade.",
      "Sinais podem combinar comportamento, carteira, produto, crédito, Praça.ai e contexto de expansão."
    ],
    opportunities: [
      "Cliente que compra um item, mas ainda não compra itens complementares.",
      "Carteira com potencial de recompra, upsell, cross-sell ou reativação.",
      "Produto/serviço chegando ao momento natural de renovação ou nova necessidade.",
      "Sinais de expansão, limite disponível, risco competitivo ou oportunidade originada no ecossistema."
    ],
    improvements: [
      "Transforma a carteira existente em fonte ativa de receita.",
      "Evita que oportunidades dependam apenas da memória do vendedor.",
      "Ajuda a priorizar contas com melhor contexto antes de fazer contato.",
      "Cria processo repetível de expansão e recuperação de receita."
    ],
    metrics: ["Oportunidades detectadas", "Receita potencial", "Taxa de conversão das oportunidades", "Reativações", "Upsell/cross-sell", "Tempo até abordagem"]
  },
  omnichannel: {
    positioning: "O Vendor Omnichannel centraliza conversas e transforma canais de atendimento em uma única fila com contexto e continuidade.",
    technical: [
      "Inbox unificada para canais conectados, incluindo WhatsApp oficial e Instagram profissional.",
      "Histórico único por contato, compartilhado entre atendimento humano, agentes e CRM.",
      "Distribuição de conversas, responsáveis e transferência entre IA e equipe.",
      "Eventos de conversa alimentam qualificação, tarefas, oportunidades e automações."
    ],
    opportunities: [
      "Conversa sem resposta ou aguardando atendimento acima do tempo esperado.",
      "Cliente falando em mais de um canal sem continuidade de contexto.",
      "Contato comercial que precisa virar lead, oportunidade, tarefa ou agendamento.",
      "Conversas que indicam reclamação, compra, objeção ou necessidade de suporte."
    ],
    improvements: [
      "Reduz perda de conversas e duplicidade entre canais.",
      "Diminui tempo de resposta e melhora experiência do cliente.",
      "Facilita gestão de volume e produtividade da equipe de atendimento.",
      "Conecta conversa diretamente ao funil e ao histórico comercial."
    ],
    metrics: ["Tempo de primeira resposta", "Conversas em espera", "Atendimentos por agente", "Taxa de transferência", "Conversas convertidas em oportunidade", "SLA"]
  },
  marketing: {
    positioning: "Marketing IA é a visão integrada do conjunto de planejamento, conteúdo, criativos, anúncios, sites e rastreamento comercial do VendorAI.",
    technical: [
      "Planejamento de conteúdo e mídia conectado ao contexto da empresa e às campanhas.",
      "Produção de textos, imagens e formatos de campanha com IA.",
      "Rastreamento da origem do lead até oportunidade e venda quando os canais estão conectados.",
      "Integração com CRM para avaliar campanha pelo resultado comercial, não apenas por clique ou CPL."
    ],
    opportunities: [
      "Campanha com CPL baixo, mas baixa progressão comercial.",
      "Canais ou conteúdos sem consistência, frequência ou objetivo definido.",
      "Públicos e campanhas que geram receita acima da média.",
      "Lacunas de presença digital, remarketing e nutrição."
    ],
    improvements: [
      "Conecta marketing e vendas numa mesma leitura de resultado.",
      "Reduz tempo para planejar, criar e publicar campanhas.",
      "Evita decisões baseadas apenas em métricas de vaidade.",
      "Aumenta capacidade de testar mensagens, públicos e formatos."
    ],
    metrics: ["CPL", "CAC", "Conversão por campanha", "Receita por origem", "Conteúdos publicados", "ROI de mídia"],
    commercialNote: "Esta página representa o conjunto de marketing. Os produtos Content Planner, Content Studio, Creative Studio, Ads e Sites & Autopilot possuem preços individuais no catálogo."
  },
  "agenda-inteligente": {
    positioning: "A Agenda Inteligente conecta compromissos, visitas, retornos e disponibilidade ao CRM e aos agentes para que cada oportunidade tenha continuidade.",
    technical: [
      "Agenda por usuário com compromissos vinculados a lead, cliente ou oportunidade.",
      "Integração com Google Calendar e bloqueio de horários indisponíveis.",
      "Agentes podem sugerir e registrar horários conforme regras de disponibilidade.",
      "Tarefas e retornos podem ser criados a partir de conversas e eventos do CRM."
    ],
    opportunities: [
      "Lead qualificado sem reunião ou retorno agendado.",
      "Horários disponíveis que podem receber demonstrações, visitas ou atendimentos.",
      "Compromissos sem confirmação ou atividades vencidas.",
      "Conflitos e lacunas na agenda comercial."
    ],
    improvements: [
      "Reduz esquecimentos e retrabalho de marcação.",
      "Aumenta disciplina de retorno e previsibilidade da rotina comercial.",
      "Permite que IA e equipe usem a mesma disponibilidade.",
      "Vincula agenda ao resultado comercial, não apenas ao calendário."
    ],
    metrics: ["Agendamentos", "No-show", "Tempo até reunião", "Atividades vencidas", "Ocupação por vendedor", "Conversão de reunião em venda"]
  },
  "catalogo-propostas": {
    positioning: "Catálogo e Propostas conecta produto, preço, margem e negociação para transformar oportunidade em oferta comercial consistente.",
    technical: [
      "Catálogo com categorias, produtos, fornecedores, regras de preço e informações técnicas.",
      "Geração de propostas vinculadas ao cliente e à oportunidade no CRM.",
      "Suporte a comissões, estoque e composição de preço conforme a operação.",
      "Aprovação e histórico comercial preservados dentro da jornada da venda."
    ],
    opportunities: [
      "Oportunidade pronta para proposta, mas ainda sem oferta registrada.",
      "Produtos complementares que podem elevar ticket e margem.",
      "Diferenças de preço, margem ou comissão fora da regra definida.",
      "Propostas enviadas que precisam de acompanhamento comercial."
    ],
    improvements: [
      "Acelera preparação de proposta e reduz erro manual.",
      "Mantém preço e regras comerciais mais consistentes entre vendedores.",
      "Conecta proposta, negociação e resultado ao CRM.",
      "Facilita análise de mix, ticket e margem por venda."
    ],
    metrics: ["Propostas emitidas", "Taxa de aprovação", "Tempo até proposta", "Ticket médio", "Margem", "Conversão proposta→venda"]
  },
  financeiro: {
    positioning: "Vendor Financeiro + ERP Hub liga venda, cobrança, comissão e controle administrativo para reduzir a distância entre faturar e receber.",
    technical: [
      "Contas a pagar e receber vinculadas à operação comercial quando aplicável.",
      "Cobranças, conciliação, comissões e indicadores financeiros em fluxo integrado.",
      "Integração com ERP e demais módulos para evitar redigitação de informações.",
      "Estrutura preparada para rotinas específicas de segmentos, inclusive financeiro de obra."
    ],
    opportunities: [
      "Recebimentos em atraso e clientes que precisam de cobrança ou acompanhamento.",
      "Vendas com comissão pendente de cálculo ou conferência.",
      "Diferença entre vendas registradas e movimentos financeiros esperados.",
      "Custos, contas ou compromissos financeiros que exigem atenção gerencial."
    ],
    improvements: [
      "Reduz retrabalho entre comercial e financeiro.",
      "Melhora rastreabilidade de cobrança e comissão.",
      "Dá ao gestor visão financeira conectada ao desempenho de vendas.",
      "Facilita conciliação e tomada de decisão sobre caixa e rentabilidade."
    ],
    metrics: ["Recebimentos", "Inadimplência", "Comissões", "Margem", "Contas vencidas", "Receita por vendedor/produto"]
  },
  "sites-lp-ecommerce": {
    positioning: "Sites & Autopilot transforma presença digital em canal de aquisição conectado ao CRM, às campanhas e ao conteúdo.",
    technical: [
      "Criação de sites e landing pages com formulários integrados à captura de leads.",
      "Tracking de origem, campanha e conversão para preservar atribuição comercial.",
      "Blog e Content Autopilot para pesquisa, produção e publicação de conteúdo SEO.",
      "Integração com catálogo, campanhas e CRM para manter a jornada conectada."
    ],
    opportunities: [
      "Páginas com tráfego, mas baixa geração de leads.",
      "Origem de lead sem rastreamento suficiente para avaliar campanha.",
      "Temas e palavras-chave que podem aumentar presença orgânica.",
      "Produtos ou campanhas que precisam de uma landing page específica."
    ],
    improvements: [
      "Reduz dependência de ferramentas separadas para site, LP e CRM.",
      "Acelera lançamento de campanhas e páginas por produto/segmento.",
      "Melhora rastreabilidade da aquisição até o funil.",
      "Cria rotina contínua de presença e conteúdo digital."
    ],
    metrics: ["Conversão de página", "Leads por origem", "Custo por lead", "Tráfego orgânico", "Conteúdos publicados", "Receita por campanha"]
  },
  "knowledge-hub": {
    positioning: "Vendor Knowledge AI transforma documentos, regras e informações da empresa em contexto utilizável pela equipe e pelos agentes.",
    technical: [
      "Base de conhecimento formada por documentos, manuais, políticas, catálogo e perguntas frequentes.",
      "Contexto isolado por tenant para evitar mistura de informação entre empresas.",
      "Agentes e JARVIS consultam a base para responder com maior aderência às regras da operação.",
      "Permissões e fontes organizadas para manter governança do conhecimento."
    ],
    opportunities: [
      "Perguntas repetidas que consomem tempo de suporte ou vendas.",
      "Informação importante espalhada em documentos e pessoas diferentes.",
      "Lacunas de conhecimento que geram resposta inconsistente.",
      "Conteúdo operacional que deve alimentar agentes, onboarding ou atendimento."
    ],
    improvements: [
      "Reduz dependência do conhecimento informal da equipe.",
      "Melhora consistência das respostas da IA e das pessoas.",
      "Acelera onboarding de novos usuários e agentes.",
      "Preserva conhecimento institucional mesmo quando pessoas mudam."
    ],
    metrics: ["Consultas à base", "Documentos ativos", "Perguntas sem resposta", "Uso por agente", "Taxa de resolução", "Conteúdo atualizado"]
  },
  analytics: {
    positioning: "Vendor BI & Analytics transforma eventos dos módulos em visão gerencial para comparar desempenho, gargalos e evolução.",
    technical: [
      "Dashboards e KPIs consolidados a partir de CRM, marketing, receita, operação e uso da IA.",
      "Comparativos por período, equipe, vendedor, origem, produto ou unidade quando os dados estiverem disponíveis.",
      "Indicadores alimentam análises executivas e podem ser usados pelo JARVIS.",
      "Visão orientada a tendência e exceção, não apenas a volume bruto."
    ],
    opportunities: [
      "Queda de conversão ou aumento de tempo em determinada etapa.",
      "Vendedor, campanha, produto ou região com desempenho acima ou abaixo da média.",
      "Crescimento de volume sem crescimento proporcional de receita.",
      "Gargalos que se repetem ao longo do tempo."
    ],
    improvements: [
      "Torna reuniões de gestão mais objetivas e baseadas em dados.",
      "Ajuda a localizar o ponto exato onde a operação perde eficiência.",
      "Permite comparar evolução antes e depois de mudanças de processo.",
      "Cria uma visão comum para comercial, marketing e gestão."
    ],
    metrics: ["Receita", "Conversão", "CAC/CPL", "Tempo por etapa", "Produtividade", "Retenção e expansão"]
  },
  automacoes: {
    positioning: "Vendor Automations conecta eventos, regras e sistemas para executar tarefas sem depender de ação manual repetitiva.",
    technical: [
      "Webhooks, APIs, gatilhos e integrações com ferramentas externas e módulos internos.",
      "Fluxos com n8n, Typebot e eventos do próprio VendorAI quando configurados.",
      "Ações podem criar tarefas, atualizar dados, notificar pessoas ou iniciar processos.",
      "Regras permitem limitar quando e como cada automação pode executar."
    ],
    opportunities: [
      "Tarefa repetitiva que ocorre sempre após o mesmo evento.",
      "Informação digitada em mais de um sistema.",
      "Atrasos causados por dependência de aviso manual.",
      "Processos que precisam de integração entre VendorAI, ERP, formulários ou ferramentas externas."
    ],
    improvements: [
      "Reduz trabalho operacional e erros de digitação.",
      "Acelera passagem de informação entre áreas e sistemas.",
      "Aumenta escala sem criar mais etapas manuais.",
      "Padroniza rotinas críticas e cria rastreabilidade de execução."
    ],
    metrics: ["Execuções automáticas", "Falhas por fluxo", "Tempo economizado", "Eventos processados", "Ações manuais eliminadas", "SLA do processo"]
  },
  "arqdor-ai": {
    positioning: "Arqdor.ai é a vertical para arquitetura e interiores, conectando projeto, render, materiais, orçamento e cliente dentro da mesma jornada.",
    technical: [
      "Gestão de projetos, ambientes e cenas com histórico por projeto.",
      "Renderização e ajustes assistidos por IA com biblioteca de materiais e componentes.",
      "Orçamento técnico ligado ao projeto e às especificações selecionadas.",
      "Portal do cliente para visualização, acompanhamento e aprovações."
    ],
    opportunities: [
      "Ambientes que precisam de nova apresentação visual ou revisão de material.",
      "Itens e materiais que precisam entrar no orçamento do projeto.",
      "Aprovações do cliente que estão bloqueando próxima etapa.",
      "Projetos com potencial de nova proposta, ambiente ou serviço complementar."
    ],
    improvements: [
      "Reduz troca dispersa de arquivos e mensagens com o cliente.",
      "Acelera apresentação de alternativas e revisões.",
      "Conecta criação, especificação e orçamento.",
      "Cria histórico visual e comercial de cada projeto."
    ],
    metrics: ["Projetos ativos", "Renders/revisões", "Tempo de aprovação", "Orçamentos", "Ticket por projeto", "Etapas pendentes"],
    commercialNote: "Arqdor.ai é uma solução vertical. O valor depende do escopo e da composição comercial aplicada ao projeto/tenant."
  },
  "content-planner": {
    positioning: "Vendor Content Planner transforma objetivos comerciais em calendário editorial executável, com temas, canais, frequência e responsáveis.",
    technical: [
      "Calendário editorial com planejamento por canal, data, objetivo e campanha.",
      "Temas e pautas conectados ao contexto do negócio e às ações de marketing.",
      "Responsáveis e prazos para transformar estratégia em execução.",
      "Integração com Content Studio, Creative Studio e Ads."
    ],
    opportunities: [
      "Períodos sem conteúdo ou excesso de publicações sem objetivo claro.",
      "Datas sazonais e campanhas que ainda não possuem plano de conteúdo.",
      "Produtos ou serviços com baixa presença editorial.",
      "Necessidade de alinhar conteúdo orgânico com campanha paga."
    ],
    improvements: [
      "Reduz improviso e aumenta consistência de comunicação.",
      "Dá visibilidade do que será publicado e por quê.",
      "Facilita coordenação entre estratégia, criação e mídia.",
      "Ajuda a manter cadência mesmo com equipe pequena."
    ],
    metrics: ["Conteúdos planejados", "Conteúdos publicados", "Atrasos", "Cobertura por canal", "Campanhas atendidas", "Frequência editorial"]
  },
  "content-studio": {
    positioning: "Vendor Content Studio produz textos e formatos comerciais com IA a partir do contexto real da empresa e do planejamento aprovado.",
    technical: [
      "Geração de legendas, copies, roteiros, carrosséis e variações de conteúdo.",
      "Contexto da marca, produto e objetivo usado para orientar a criação.",
      "Reaproveitamento de conteúdo entre formatos e canais.",
      "Integração com Planner, Creative Studio, Ads e Knowledge Hub."
    ],
    opportunities: [
      "Campanha planejada ainda sem copy ou roteiro.",
      "Conteúdo que pode ser transformado em novos formatos.",
      "Necessidade de variações para teste de mensagem ou público.",
      "Pontos da jornada que precisam de conteúdo de nutrição ou conversão."
    ],
    improvements: [
      "Reduz tempo de produção e dependência de texto começando do zero.",
      "Aumenta volume de testes sem perder contexto de marca.",
      "Conecta criação de conteúdo com objetivo comercial.",
      "Facilita execução contínua do calendário editorial."
    ],
    metrics: ["Peças produzidas", "Tempo de produção", "Variações por campanha", "Aprovações", "Conteúdo reaproveitado", "Resultado por CTA"]
  },
  "creative-studio": {
    positioning: "Vendor Creative Studio concentra criação visual e audiovisual com IA para acelerar campanhas, produtos e comunicação digital.",
    technical: [
      "Geração e edição de imagens para peças, produtos e campanhas.",
      "Fluxos de vídeo, avatar, produto, edição, legenda, clipes e processamento em lote conforme os módulos disponíveis.",
      "Biblioteca de mídia para organizar ativos e reutilização.",
      "Integração com Content Studio, Ads, catálogo e canais de marketing."
    ],
    opportunities: [
      "Campanhas sem criativos suficientes para testar mensagens e formatos.",
      "Produtos que precisam de apresentação visual mais profissional.",
      "Vídeos que precisam de legenda, recorte, variação ou reaproveitamento.",
      "Conteúdo visual que pode ser adaptado para Feed, Stories, Reels ou anúncios."
    ],
    improvements: [
      "Aumenta velocidade de produção visual.",
      "Reduz troca entre várias ferramentas criativas.",
      "Permite testar mais versões de campanha em menor tempo.",
      "Aproxima criação de mídia do catálogo e do objetivo comercial."
    ],
    metrics: ["Ativos gerados", "Vídeos processados", "Variações por campanha", "Tempo de criação", "Reaproveitamento", "Criativos em uso"]
  },
  ads: {
    positioning: "Vendor Ads conecta planejamento de mídia, criativos, públicos e resultado comercial para transformar anúncio em receita acompanhável.",
    technical: [
      "Estrutura de campanhas, públicos, orçamento, textos e criativos em fluxo único.",
      "Integração com Meta e suporte à operação de mídia conectada ao CRM.",
      "Ativação/pausa de campanhas conforme permissões e nível de autonomia configurado.",
      "Comparação de campanha pelo avanço comercial e receita quando a atribuição está disponível."
    ],
    opportunities: [
      "Campanha com CPL bom, mas baixa conversão em oportunidade ou venda.",
      "Campanha com custo maior, porém receita e qualidade superiores.",
      "Públicos, regiões ou criativos que justificam teste ou redistribuição de verba.",
      "Anúncios sem continuidade de follow-up após a entrada do lead."
    ],
    improvements: [
      "Tira a decisão de mídia do indicador isolado de clique ou CPL.",
      "Conecta campanha ao CRM e à receita.",
      "Acelera criação e teste de anúncios.",
      "Permite governança de automação com modo observador, assistido ou autônomo conforme configuração."
    ],
    metrics: ["Investimento", "CPL", "CAC", "Conversão em oportunidade", "Receita por campanha", "ROAS/ROI"]
  },
  gestao: {
    positioning: "Vendor Gestão reúne rotinas administrativas ligadas à operação comercial, incluindo financeiro, estoque, compras, fornecedores e controles por segmento.",
    technical: [
      "Módulos administrativos conectados ao mesmo tenant e aos dados comerciais.",
      "Estoque, compras, fornecedores e financeiro podem se relacionar ao catálogo e às vendas.",
      "Recursos específicos por segmento aparecem conforme a configuração da empresa.",
      "Indicadores gerenciais podem alimentar Analytics e JARVIS."
    ],
    opportunities: [
      "Estoque baixo, necessidade de compra ou item sem disponibilidade.",
      "Fornecedor, custo ou prazo que afeta a venda e a margem.",
      "Conta, cobrança ou compromisso administrativo que exige ação.",
      "Processos duplicados entre comercial e backoffice."
    ],
    improvements: [
      "Reduz a distância entre vender e executar a operação.",
      "Evita duplicação de dados entre áreas.",
      "Dá mais contexto de margem, disponibilidade e capacidade à equipe comercial.",
      "Aumenta visibilidade gerencial da empresa."
    ],
    metrics: ["Estoque", "Compras", "Prazo de fornecedor", "Contas", "Margem", "Eficiência operacional"],
    commercialNote: "Vendor Gestão é uma visão agregada dos módulos operacionais. Produtos como Financeiro + ERP Hub possuem preço individual no catálogo."
  },
  "praca-ai": {
    positioning: "Praça.ai cria um canal de venda conectado ao catálogo, pagamento, reputação e logística do ecossistema VendorAI.",
    technical: [
      "Vitrine de produtos conectada ao catálogo do vendedor.",
      "Fluxo de pedido, pagamento/split, avaliação e acompanhamento.",
      "Logística com coleta, rastreio, evidências e operação de entregadores conforme configuração.",
      "Painel executivo para acompanhar operação e origem das vendas do marketplace."
    ],
    opportunities: [
      "Produtos aptos a ganhar novo canal de exposição e venda.",
      "Pedidos com gargalo de pagamento, separação ou entrega.",
      "Vendedores/produtos com avaliação que exige melhoria de experiência.",
      "Combinações entre compradores, vendedores, logística e parceiros."
    ],
    improvements: [
      "Cria novo canal sem separar catálogo e relacionamento do VendorAI.",
      "Aumenta rastreabilidade da entrega e da reputação.",
      "Conecta venda, pagamento, atendimento e logística.",
      "Permite aprender com comportamento e avaliações do marketplace."
    ],
    metrics: ["GMV/vendas", "Pedidos", "Ticket médio", "Prazo de entrega", "Avaliação", "Taxa de disputa/cancelamento"]
  },
  "app-builder": {
    positioning: "Vendor App Builder acelera criação de aplicativos ligados aos dados e processos do tenant sem começar cada projeto do zero.",
    technical: [
      "Templates e fluxos guiados para estruturar experiência mobile.",
      "Configuração por tenant, identidade e integrações com APIs/serviços.",
      "Preview e controle de versões durante evolução do aplicativo.",
      "Integração com módulos VendorAI conforme o caso de uso do app."
    ],
    opportunities: [
      "Processo recorrente que pode sair do WhatsApp/planilha para uma experiência própria.",
      "Portal de cliente, parceiro ou equipe que precisa de acesso mobile dedicado.",
      "Serviço digital que pode ser distribuído como aplicativo.",
      "Operação de nicho que precisa de interface simplificada para o usuário final."
    ],
    improvements: [
      "Reduz tempo de estruturação de um app conectado ao ecossistema.",
      "Evita reconstruir autenticação, dados e integrações básicas do zero.",
      "Mantém aplicativo e operação central alinhados.",
      "Permite evolução por versões conforme uso real."
    ],
    metrics: ["Usuários ativos", "Acessos", "Ações concluídas", "Versões publicadas", "Uso por funcionalidade", "Conversões do app"]
  },
  reputation: {
    positioning: "Vendor Reputation transforma avaliações e sinais de experiência em alertas para retenção, melhoria e proteção da marca.",
    technical: [
      "Registro de avaliações, notas, fotos/evidências e histórico por cliente quando disponível.",
      "Sinais podem ser ligados a atendimento, pós-venda, Praça.ai e Customer Intelligence.",
      "Alertas e indicadores ajudam a priorizar casos que exigem ação.",
      "Integração com CRM mantém contexto de relacionamento e histórico."
    ],
    opportunities: [
      "Cliente insatisfeito que precisa de recuperação rápida.",
      "Tema recorrente em avaliações que aponta falha de processo ou produto.",
      "Cliente satisfeito que pode gerar indicação, nova compra ou prova social.",
      "Queda de reputação em produto, equipe, unidade ou etapa da jornada."
    ],
    improvements: [
      "Transforma feedback em processo, não apenas em comentário isolado.",
      "Ajuda a reduzir churn por resposta mais rápida a sinais negativos.",
      "Cria aprendizado contínuo para atendimento, produto e operação.",
      "Aumenta visibilidade da experiência real do cliente."
    ],
    metrics: ["Nota média", "Avaliações novas", "Casos críticos", "Tempo de resposta", "Recorrência de reclamações", "Retenção pós-atendimento"]
  },
  "app-personalizado": {
    positioning: "App Personalizado entrega uma experiência mobile com marca própria, mantendo o VendorAI como infraestrutura de dados e operação.",
    technical: [
      "Personalização de nome, identidade, ícone, splash e configuração do tenant.",
      "Build dedicado a partir da base homologada do ecossistema VendorAI.",
      "Integração com autenticação, notificações e APIs conforme escopo contratado.",
      "Preparação técnica para distribuição conforme requisitos do projeto."
    ],
    opportunities: [
      "Empresa que quer oferecer portal ou experiência própria ao cliente.",
      "Rede, franquia ou operação que precisa fortalecer marca no canal mobile.",
      "Fluxos recorrentes que ganham aderência com aplicativo dedicado.",
      "Projetos white-label apoiados pela infraestrutura VendorAI."
    ],
    improvements: [
      "Eleva percepção de marca e profissionalização do canal digital.",
      "Aproxima cliente, operação e serviços em uma experiência dedicada.",
      "Evita reconstruir todo o backend para ter um app de marca própria.",
      "Permite evoluir o aplicativo junto com os dados do VendorAI."
    ],
    metrics: ["Instalações", "Usuários ativos", "Retenção", "Ações no app", "Conversões", "Uso por serviço"]
  },
  implantacao: {
    positioning: "A Implantação VendorAI é o serviço humano opcional para empresas que querem acelerar parametrização, integrações, treinamento e entrada em operação.",
    technical: [
      "Diagnóstico inicial da operação e definição do escopo de configuração.",
      "Parametrização de usuários, regras, módulos e integrações previstas no escopo.",
      "Apoio à carga inicial de informações e organização do conhecimento necessário.",
      "Treinamento e validação da operação antes da entrada assistida em produção."
    ],
    opportunities: [
      "Empresa com pouco tempo interno para configurar a plataforma.",
      "Operação com várias integrações ou regras comerciais específicas.",
      "Equipe que precisa de treinamento coordenado.",
      "Implantação em que reduzir risco de configuração incorreta é prioridade."
    ],
    improvements: [
      "Acelera o tempo até a operação estar utilizável.",
      "Reduz retrabalho de parametrização inicial.",
      "Cria alinhamento entre gestores, equipe e configuração do sistema.",
      "Complementa o onboarding autoguiado quando a empresa deseja apoio humano."
    ],
    metrics: ["Tempo de implantação", "Usuários treinados", "Integrações validadas", "Pendências", "Adoção inicial", "Tempo até primeira operação"]
  }
};

export function getProductSalesContent(slug: string): ProductSalesContent | null {
  return content[slug] ?? null;
}
