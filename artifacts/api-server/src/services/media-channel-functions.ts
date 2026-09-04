import type { MediaPlanCampaignChannel } from "@workspace/db";

export const MEDIA_FUNCTION_VERSION = 2;

export interface MediaFormatFunction {
  formato: string;
  funcao: string;
}

interface MediaChannelFunctionDefinition {
  canal: string;
  aliases: string[];
  funcao: string;
  etapaFunil: string;
  frequencia: string;
  kpiPrincipal: string;
  formatos: MediaFormatFunction[];
  variants?: {
    aquisicao?: string;
    consideracao?: string;
    conversao?: string;
    remarketing?: string;
    retencao?: string;
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const DEFINITIONS: MediaChannelFunctionDefinition[] = [
  {
    canal: "Instagram",
    aliases: ["instagram"],
    funcao: "Descoberta, relacionamento e prova social",
    etapaFunil: "descoberta/consideração",
    frequencia: "4–6 ações orgânicas por semana, combinando alcance, educação, prova e relacionamento",
    kpiPrincipal: "alcance qualificado, retenção, salvamentos, DMs e visitas ao perfil",
    formatos: [
      { formato: "Reels", funcao: "Alcance e descoberta: ganhar atenção de novos públicos com vídeo curto e linguagem nativa" },
      { formato: "Carrossel", funcao: "Educação e consideração: explicar problema, método, comparação, passo a passo e benefício" },
      { formato: "Stories", funcao: "Relacionamento e ação: bastidores, interação, prova rápida, urgência e CTA" },
      { formato: "Feed", funcao: "Posicionamento e prova: reforçar marca, produto, caso real e credibilidade" },
    ],
    variants: {
      aquisicao: "Descoberta e geração de interesse com conteúdo nativo, visual e compartilhável",
      consideracao: "Educação, prova social e aprofundamento para transformar atenção em consideração",
      conversao: "Prova, oferta e CTA para levar o público a WhatsApp, site ou landing page",
      remarketing: "Reforço de prova, diferenciação e lembrança para públicos que já interagiram",
      retencao: "Relacionamento, bastidores, novidades e valorização da comunidade/clientes",
    },
  },
  {
    canal: "Facebook",
    aliases: ["facebook"],
    funcao: "Distribuição, comunidade, prova e reforço de alcance",
    etapaFunil: "descoberta/consideração",
    frequencia: "2–4 publicações por semana; reforçar conteúdos de prova, comunidade e ofertas relevantes",
    kpiPrincipal: "alcance qualificado, engajamento, cliques e conversas iniciadas",
    formatos: [
      { formato: "Feed", funcao: "Distribuição e prova: publicar casos, ofertas, novidades e conteúdo útil" },
      { formato: "Vídeo", funcao: "Atenção e explicação: demonstrar produto, transformação ou caso real" },
      { formato: "Carrossel", funcao: "Consideração: organizar benefícios, comparações e catálogo visual" },
      { formato: "Stories", funcao: "Lembrete e CTA: reforçar campanha, prazo, evento ou contato" },
    ],
  },
  {
    canal: "Meta Ads",
    aliases: ["meta ads", "facebook ads", "instagram ads"],
    funcao: "Gerar demanda paga, prospectar públicos e fazer remarketing",
    etapaFunil: "aquisição/remarketing/conversão",
    frequencia: "Sempre ativo quando houver verba; revisar desempenho semanalmente e renovar criativos por fadiga/performance",
    kpiPrincipal: "CPL, CPA, taxa de conversão e ROAS",
    formatos: [
      { formato: "Vídeo vertical", funcao: "Prospecção: interromper atenção e apresentar dor, benefício ou transformação" },
      { formato: "Imagem", funcao: "Oferta e prova: comunicar benefício central, condição e CTA com leitura rápida" },
      { formato: "Carrossel", funcao: "Consideração: mostrar variedade, etapas, comparações, provas ou benefícios" },
      { formato: "Lead Ads", funcao: "Captura: reduzir fricção e transformar interesse em lead dentro da plataforma" },
      { formato: "Stories Ads", funcao: "Ação rápida: reforçar oferta, urgência e CTA em tela cheia" },
    ],
    variants: {
      aquisicao: "Prospecção paga para gerar nova demanda e novos leads em públicos frios ou semelhantes",
      consideracao: "Reforço de benefício, prova e diferenciação para públicos engajados",
      conversao: "Campanhas orientadas a lead, venda, agendamento ou conversa com CTA direto",
      remarketing: "Recuperação de visitantes e engajados com prova, objeções, oferta e CTA",
    },
  },
  {
    canal: "Google Search",
    aliases: ["google search", "pesquisa google", "search ads", "google pesquisa"],
    funcao: "Capturar demanda existente de alta intenção",
    etapaFunil: "intenção/conversão",
    frequencia: "Sempre ativo quando houver demanda; otimizar termos de busca, negativas, anúncios e lances semanalmente",
    kpiPrincipal: "conversões, CPL/CPA, taxa de conversão e participação de impressão",
    formatos: [
      { formato: "Anúncio de pesquisa", funcao: "Captura de intenção: responder diretamente ao que o usuário já está procurando" },
      { formato: "Extensões/ativos", funcao: "Redução de fricção: destacar telefone, localização, benefícios, preços e links úteis" },
      { formato: "Variações de headline", funcao: "Otimização: testar intenção, dor, benefício, prova e oferta para melhorar CTR e conversão" },
    ],
    variants: {
      aquisicao: "Captura de pessoas que já demonstram intenção explícita de compra ou contratação",
      conversao: "Interceptar buscas de alta intenção e levar diretamente à ação comercial",
      remarketing: "Recapturar intenção por termos de marca, solução e concorrência quando aplicável",
    },
  },
  {
    canal: "Google Display",
    aliases: ["google display", "display"],
    funcao: "Remarketing visual, lembrança e reforço de consideração",
    etapaFunil: "consideração/remarketing",
    frequencia: "Sempre ativo em públicos elegíveis; controlar frequência e renovar criativos por fadiga",
    kpiPrincipal: "conversões assistidas, CPA, CTR e alcance/frequência",
    formatos: [
      { formato: "Display responsivo", funcao: "Remarketing: lembrar oferta e marca para visitantes e públicos engajados" },
      { formato: "Banner", funcao: "Reforço visual: consolidar benefício, prova ou oferta com leitura imediata" },
    ],
  },
  {
    canal: "Performance Max",
    aliases: ["performance max", "pmax"],
    funcao: "Escalar conversões usando sinais, inventário e ativos multiformato do Google",
    etapaFunil: "aquisição/conversão/remarketing",
    frequencia: "Sempre ativo após configuração; revisar ativos, sinais, conversões e qualidade de feed semanalmente",
    kpiPrincipal: "valor de conversão, ROAS, CPA e volume de conversões",
    formatos: [
      { formato: "Grupo de ativos", funcao: "Cobertura multicanal: combinar mensagem, imagens, vídeos e ofertas por tema de intenção" },
      { formato: "Vídeo", funcao: "Atenção e consideração dentro do inventário Google/YouTube" },
      { formato: "Imagem", funcao: "Reconhecimento, produto e prova em inventários visuais" },
      { formato: "Headlines", funcao: "Intenção e conversão: adaptar argumento ao contexto e à consulta" },
    ],
  },
  {
    canal: "YouTube",
    aliases: ["youtube"],
    funcao: "Construir atenção, educação, demonstração e prova em vídeo",
    etapaFunil: "descoberta/consideração",
    frequencia: "1–2 vídeos principais por semana quando houver capacidade; Shorts podem complementar com maior frequência",
    kpiPrincipal: "retenção, tempo de exibição, visualizações qualificadas, cliques e conversões assistidas",
    formatos: [
      { formato: "YouTube Short", funcao: "Descoberta: ganhar alcance com promessa, dor, curiosidade ou demonstração curta" },
      { formato: "YouTube Vídeo", funcao: "Educação e prova: explicar, demonstrar, comparar e aprofundar confiança" },
      { formato: "In-stream", funcao: "Aquisição paga: gerar atenção e encaminhar o público ao próximo passo" },
    ],
  },
  {
    canal: "TikTok",
    aliases: ["tiktok"],
    funcao: "Descoberta e atenção com linguagem nativa, humana e de alto ritmo",
    etapaFunil: "descoberta/consideração",
    frequencia: "3–5 vídeos curtos por semana quando o público estiver presente na plataforma",
    kpiPrincipal: "retenção, conclusão, compartilhamentos, visitas ao perfil, cliques e leads",
    formatos: [
      { formato: "Vídeo curto", funcao: "Descoberta: usar gancho forte, contexto rápido e linguagem nativa" },
      { formato: "UGC", funcao: "Prova e identificação: demonstrar uso, experiência, problema e transformação de forma humana" },
      { formato: "Spark Ads", funcao: "Amplificação: transformar conteúdo orgânico validado em distribuição paga" },
    ],
  },
  {
    canal: "LinkedIn",
    aliases: ["linkedin"],
    funcao: "Autoridade B2B, prova institucional e geração de demanda qualificada",
    etapaFunil: "descoberta/consideração B2B",
    frequencia: "2–3 publicações por semana para negócios B2B ou decisões de maior ticket",
    kpiPrincipal: "engajamento qualificado, visitas de decisores, leads B2B e oportunidades",
    formatos: [
      { formato: "Post", funcao: "Autoridade: opinião, aprendizado, bastidor de negócio, tese e prova" },
      { formato: "Documento/Carrossel", funcao: "Educação: aprofundar processo, comparação, estudo e framework" },
      { formato: "Vídeo", funcao: "Confiança: humanizar especialista, demonstrar solução e apresentar caso" },
    ],
  },
  {
    canal: "WhatsApp",
    aliases: ["whatsapp", "whats app"],
    funcao: "Qualificar, atender, acompanhar, recuperar e converter conversas",
    etapaFunil: "consideração/conversão/relacionamento",
    frequencia: "Acionamento por comportamento e estágio do lead; evitar disparos genéricos repetitivos",
    kpiPrincipal: "taxa de resposta, qualificação, agendamentos, conversão e tempo até resposta",
    formatos: [
      { formato: "Abordagem", funcao: "Iniciar conversa contextualizada a partir da origem e intenção do lead" },
      { formato: "Qualificação", funcao: "Entender necessidade, momento, perfil e próximo passo comercial" },
      { formato: "Follow-up", funcao: "Dar continuidade sem perder timing, contexto ou objeções já tratadas" },
      { formato: "Recuperação", funcao: "Reativar oportunidade parada com novo contexto, prova, oferta ou pergunta útil" },
    ],
    variants: {
      conversao: "Conduzir a conversa até agendamento, proposta, compra ou próximo compromisso objetivo",
      remarketing: "Reativar leads e oportunidades que esfriaram usando o histórico e o motivo da pausa",
      retencao: "Pós-venda, relacionamento, suporte proativo e novas oportunidades na base existente",
    },
  },
  {
    canal: "E-mail",
    aliases: ["e-mail", "email"],
    funcao: "Nutrir, educar, reativar e converter a base própria",
    etapaFunil: "nutrição/consideração/conversão",
    frequencia: "1–2 envios por semana em fluxos editoriais; automações devem responder a comportamento e estágio",
    kpiPrincipal: "cliques, respostas, conversões, receita atribuída e descadastros",
    formatos: [
      { formato: "Nutrição", funcao: "Educação e confiança: entregar contexto útil até o lead estar pronto para avançar" },
      { formato: "Oferta", funcao: "Conversão: apresentar proposta, benefício, prova e CTA objetivo" },
      { formato: "Reativação", funcao: "Recuperação: retomar interesse com novo motivo, prova ou condição relevante" },
      { formato: "Automação", funcao: "Timing: responder a cadastro, visita, abandono, compra ou mudança de estágio" },
    ],
  },
  {
    canal: "Blog/SEO",
    aliases: ["blog/seo", "blog", "seo", "seo organico", "seo orgânico"],
    funcao: "Capturar busca orgânica e construir autoridade acumulativa",
    etapaFunil: "descoberta/intenção/consideração",
    frequencia: "1–2 conteúdos estratégicos por semana ou conforme oportunidade de busca e capacidade de qualidade",
    kpiPrincipal: "cliques orgânicos, posições, leads orgânicos, conversões e crescimento de páginas ranqueadas",
    formatos: [
      { formato: "Artigo", funcao: "Educação e intenção: responder dúvidas reais e preparar o leitor para a solução" },
      { formato: "Página local", funcao: "Intenção geográfica: capturar buscas por serviço/produto + local quando houver demanda" },
      { formato: "Comparativo", funcao: "Consideração: tratar alternativas, critérios, objeções e diferenciação" },
    ],
  },
  {
    canal: "Site",
    aliases: ["site", "website"],
    funcao: "Centralizar confiança, produto, prova e caminhos de conversão",
    etapaFunil: "consideração/conversão",
    frequencia: "Base permanente; atualizar oferta, prova, páginas e CTAs sempre que a campanha ou aprendizado mudar",
    kpiPrincipal: "taxa de conversão, cliques em CTA, geração de leads e jornada até conversão",
    formatos: [
      { formato: "Página institucional/produto", funcao: "Confiança e consideração: explicar solução, benefícios, prova e diferenciais" },
      { formato: "Bloco de prova", funcao: "Redução de risco: evidenciar casos, números, garantias, avaliações e credenciais" },
      { formato: "CTA/Formulário", funcao: "Conversão: transformar visita em conversa, lead, orçamento, cadastro ou compra" },
    ],
  },
  {
    canal: "Landing Page",
    aliases: ["landing page", "landing", "lp"],
    funcao: "Converter tráfego de uma campanha com mensagem única, prova e CTA sem dispersão",
    etapaFunil: "conversão",
    frequencia: "Uma LP principal por oferta/campanha relevante, com testes A/B quando houver volume suficiente",
    kpiPrincipal: "taxa de conversão, CPL/CPA, abandono de formulário e qualidade do lead",
    formatos: [
      { formato: "Landing Page", funcao: "Conversão: alinhar promessa do anúncio, prova, oferta e CTA em uma única jornada" },
      { formato: "Headline A/B", funcao: "Otimização: testar promessa, dor, benefício e especificidade para aumentar conversão" },
      { formato: "Formulário/CTA", funcao: "Redução de fricção: pedir apenas o necessário para o próximo passo comercial" },
    ],
  },
  {
    canal: "SMS",
    aliases: ["sms"],
    funcao: "Lembretes e CTAs curtos de alta urgência para uma base com consentimento",
    etapaFunil: "conversão/relacionamento",
    frequencia: "Somente em gatilhos importantes; evitar uso recorrente como mídia de descoberta",
    kpiPrincipal: "entrega, cliques, respostas e conversões por disparo",
    formatos: [
      { formato: "Lembrete", funcao: "Reduzir ausência ou esquecimento de compromisso, prazo, pagamento ou evento" },
      { formato: "CTA urgente", funcao: "Ação imediata: comunicar prazo curto, confirmação ou oportunidade objetiva" },
    ],
  },
];

export function resolveMediaChannelFunction(canal: string): MediaChannelFunctionDefinition | null {
  const key = normalize(canal);
  // Mais específicos primeiro para evitar que Google Display/PMax caiam em regras genéricas.
  return DEFINITIONS.find((definition) => definition.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return key === normalizedAlias || key.includes(normalizedAlias);
  })) ?? null;
}

function phaseVariant(phase: string, objective = ""): keyof NonNullable<MediaChannelFunctionDefinition["variants"]> | null {
  const key = normalize(`${phase} ${objective}`);
  if (key.includes("remarketing") || key.includes("recuper") || key.includes("reativ")) return "remarketing";
  if (key.includes("retenc") || key.includes("pos-venda") || key.includes("fidel")) return "retencao";
  if (key.includes("convers") || key.includes("venda") || key.includes("agend") || key.includes("proposta")) return "conversao";
  if (key.includes("consider") || key.includes("educ") || key.includes("prova") || key.includes("autoridade")) return "consideracao";
  if (key.includes("aquis") || key.includes("descob") || key.includes("alcance") || key.includes("capt")) return "aquisicao";
  return null;
}

export function alignMediaChannelFunction(
  channel: MediaPlanCampaignChannel,
  context: { phase?: string; objective?: string } = {},
): MediaPlanCampaignChannel {
  const definition = resolveMediaChannelFunction(channel.canal);
  if (!definition) return channel;
  const variantKey = phaseVariant(context.phase ?? "", context.objective ?? "");
  const variant = variantKey ? definition.variants?.[variantKey] : undefined;
  const formatFunctions = definition.formatos.map((item) => `${item.formato}: ${item.funcao}`).join(" | ");

  return {
    ...channel,
    canal: definition.canal,
    // A função inclui o papel do canal e o papel de cada mídia/formato para que
    // Planejador e Gerador não tratem Reels, Stories, Search, LP etc. como equivalentes.
    funcao: `${variant ?? definition.funcao}. Função por mídia: ${formatFunctions}`,
    etapaFunil: definition.etapaFunil,
    formatos: definition.formatos.map((item) => item.formato),
    frequencia: definition.frequencia,
    kpiPrincipal: definition.kpiPrincipal,
  };
}

export function mediaActionFunction(canal: string, formato: string, index = 0): { pilar: string; funcao: string } {
  const definition = resolveMediaChannelFunction(canal);
  if (!definition) return { pilar: "conteúdo", funcao: "Apoiar o objetivo da campanha" };
  const normalizedFormat = normalize(formato);
  const format = definition.formatos.find((item) => {
    const key = normalize(item.formato);
    return normalizedFormat === key || normalizedFormat.includes(key) || key.includes(normalizedFormat);
  }) ?? definition.formatos[index % definition.formatos.length];

  const functionText = format?.funcao ?? definition.funcao;
  const normalizedFunction = normalize(functionText);
  let pilar = "consideração";
  if (normalizedFunction.includes("descob") || normalizedFunction.includes("alcance") || normalizedFunction.includes("atenc")) pilar = "descoberta";
  else if (normalizedFunction.includes("educ") || normalizedFunction.includes("explic") || normalizedFunction.includes("autoridade")) pilar = "educação";
  else if (normalizedFunction.includes("prova") || normalizedFunction.includes("confian") || normalizedFunction.includes("risco")) pilar = "prova";
  else if (normalizedFunction.includes("remarketing") || normalizedFunction.includes("recuper") || normalizedFunction.includes("reativ")) pilar = "remarketing";
  else if (normalizedFunction.includes("convers") || normalizedFunction.includes("captura") || normalizedFunction.includes("acao") || normalizedFunction.includes("cta")) pilar = "conversão";
  else if (normalizedFunction.includes("relacion") || normalizedFunction.includes("comunidade")) pilar = "relacionamento";
  else if (normalizedFunction.includes("otimiz") || normalizedFunction.includes("teste")) pilar = "otimização";
  else if (normalizedFunction.includes("intenc")) pilar = "intenção";

  return { pilar, funcao: functionText };
}

export function mediaFunctionCatalogForPrompt(): string {
  return DEFINITIONS.map((definition) =>
    `${definition.canal}: ${definition.funcao}; etapa=${definition.etapaFunil}; frequência=${definition.frequencia}; mídias=${definition.formatos.map((item) => `${item.formato}→${item.funcao}`).join(", ")}; KPI=${definition.kpiPrincipal}`,
  ).join("\n");
}
