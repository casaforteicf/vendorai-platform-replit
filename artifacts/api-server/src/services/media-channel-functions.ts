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
      { formato: "Reels", funcao: "Alcance e descoberta: ganhar atenção de novos públicos" },
      { formato: "Carrossel", funcao: "Educação e consideração: explicar problema, método, comparação e benefício" },
      { formato: "Stories", funcao: "Relacionamento e ação: bastidores, interação, urgência e CTA" },
      { formato: "Feed", funcao: "Posicionamento e prova: reforçar marca, produto, caso real e credibilidade" },
    ],
    variants: {
      aquisicao: "Descoberta e geração de interesse com conteúdo nativo e compartilhável",
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
    frequencia: "2–4 publicações por semana, priorizando prova, comunidade, utilidade e ofertas relevantes",
    kpiPrincipal: "alcance qualificado, engajamento, cliques e conversas iniciadas",
    formatos: [
      { formato: "Feed", funcao: "Distribuição e prova: casos, ofertas, novidades e conteúdo útil" },
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
    frequencia: "Sempre ativo quando houver verba; revisar semanalmente e renovar criativos por fadiga/performance",
    kpiPrincipal: "CPL, CPA, taxa de conversão e ROAS",
    formatos: [
      { formato: "Vídeo vertical", funcao: "Prospecção e descoberta: interromper atenção e apresentar dor, benefício ou transformação" },
      { formato: "Imagem", funcao: "Oferta e prova: comunicar benefício central, condição e CTA rapidamente" },
      { formato: "Carrossel", funcao: "Consideração: mostrar variedade, etapas, comparações, provas ou benefícios" },
      { formato: "Lead Ads", funcao: "Captura e conversão: transformar interesse em lead dentro da plataforma" },
      { formato: "Stories Ads", funcao: "Conversão rápida: reforçar oferta, urgência e CTA em tela cheia" },
    ],
    variants: {
      aquisicao: "Prospecção paga para gerar nova demanda e novos leads",
      consideracao: "Reforço de benefício, prova e diferenciação para públicos engajados",
      conversao: "Campanhas orientadas a lead, venda, agendamento ou conversa com CTA direto",
      remarketing: "Recuperação de visitantes e engajados com prova, objeções, oferta e CTA",
    },
  },
  {
    canal: "Google Search",
    aliases: ["google search", "pesquisa google", "search ads", "google pesquisa", "google ads"],
    funcao: "Capturar demanda existente de alta intenção",
    etapaFunil: "intenção/conversão",
    frequencia: "Sempre ativo quando houver demanda; otimizar termos, negativas, anúncios e lances semanalmente",
    kpiPrincipal: "conversões, CPL/CPA, taxa de conversão e participação de impressão",
    formatos: [
      { formato: "Anúncio de pesquisa", funcao: "Intenção: responder diretamente ao que o usuário já está procurando" },
      { formato: "Extensões/ativos", funcao: "Conversão: reduzir fricção com telefone, localização, benefícios e links úteis" },
      { formato: "Variações de headline", funcao: "Otimização: testar intenção, dor, benefício, prova e oferta" },
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
      { formato: "Banner", funcao: "Prova e lembrança: consolidar benefício, credibilidade ou oferta" },
    ],
  },
  {
    canal: "Performance Max",
    aliases: ["performance max", "pmax"],
    funcao: "Escalar conversões usando sinais, inventário e ativos multiformato do Google",
    etapaFunil: "aquisição/conversão/remarketing",
    frequencia: "Sempre ativo após configuração; revisar ativos, sinais, conversões e feed semanalmente",
    kpiPrincipal: "valor de conversão, ROAS, CPA e volume de conversões",
    formatos: [
      { formato: "Grupo de ativos", funcao: "Consideração multicanal: combinar mensagem, imagens, vídeos e ofertas por intenção" },
      { formato: "Vídeo", funcao: "Descoberta: gerar atenção dentro do inventário Google/YouTube" },
      { formato: "Imagem", funcao: "Prova e reconhecimento: apresentar produto, benefício e credibilidade" },
      { formato: "Headlines", funcao: "Intenção: adaptar argumento ao contexto e à consulta" },
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
      { formato: "In-stream", funcao: "Aquisição: gerar atenção e encaminhar o público ao próximo passo" },
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
      { formato: "UGC", funcao: "Prova e identificação: demonstrar uso, experiência, problema e transformação" },
      { formato: "Spark Ads", funcao: "Aquisição: amplificar conteúdo orgânico validado com distribuição paga" },
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
      { formato: "Post", funcao: "Autoridade e prova: opinião, aprendizado, tese, bastidor e caso" },
      { formato: "Documento/Carrossel", funcao: "Educação: aprofundar processo, comparação, estudo e framework" },
      { formato: "Vídeo", funcao: "Prova e confiança: humanizar especialista e demonstrar solução" },
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
      { formato: "Abordagem", funcao: "Relacionamento: iniciar conversa contextualizada à origem e intenção do lead" },
      { formato: "Qualificação", funcao: "Qualificação: entender necessidade, momento, perfil e próximo passo comercial" },
      { formato: "Follow-up", funcao: "Relacionamento: dar continuidade sem perder timing, contexto ou objeções" },
      { formato: "Recuperação", funcao: "Remarketing: reativar oportunidade parada com novo contexto, prova ou oferta" },
    ],
    variants: {
      conversao: "Conduzir a conversa até agendamento, proposta, compra ou próximo compromisso objetivo",
      remarketing: "Reativar leads e oportunidades que esfriaram usando histórico e motivo da pausa",
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
      { formato: "Nutrição", funcao: "Educação: entregar contexto útil até o lead estar pronto para avançar" },
      { formato: "Oferta", funcao: "Conversão: apresentar proposta, benefício, prova e CTA objetivo" },
      { formato: "Reativação", funcao: "Remarketing: retomar interesse com novo motivo, prova ou condição relevante" },
      { formato: "Automação", funcao: "Relacionamento: responder a cadastro, visita, abandono, compra ou mudança de estágio" },
    ],
  },
  {
    canal: "Blog/SEO",
    aliases: ["blog/seo", "blog", "seo", "seo organico", "seo orgânico"],
    funcao: "Capturar busca orgânica e construir autoridade acumulativa",
    etapaFunil: "descoberta/intenção/consideração",
    frequencia: "1–2 conteúdos estratégicos por semana ou conforme oportunidade de busca e capacidade de qualidade",
    kpiPrincipal: "cliques orgânicos, posições, leads orgânicos, conversões e páginas ranqueadas",
    formatos: [
      { formato: "Artigo", funcao: "Educação: responder dúvidas reais e preparar o leitor para a solução" },
      { formato: "Página local", funcao: "Intenção: capturar buscas por serviço/produto + local quando houver demanda" },
      { formato: "Comparativo", funcao: "Consideração: tratar alternativas, critérios, objeções e diferenciação" },
    ],
  },
  {
    canal: "Site",
    aliases: ["site", "website"],
    funcao: "Centralizar confiança, produto, prova e caminhos de conversão",
    etapaFunil: "consideração/conversão",
    frequencia: "Base permanente; atualizar oferta, prova, páginas e CTAs quando a campanha ou aprendizado mudar",
    kpiPrincipal: "taxa de conversão, cliques em CTA, geração de leads e jornada até conversão",
    formatos: [
      { formato: "Página institucional/produto", funcao: "Consideração: explicar solução, benefícios, prova e diferenciais" },
      { formato: "Bloco de prova", funcao: "Prova: reduzir risco com casos, números, garantias, avaliações e credenciais" },
      { formato: "CTA/Formulário", funcao: "Conversão: transformar visita em conversa, lead, orçamento, cadastro ou compra" },
    ],
  },
  {
    canal: "Landing Page",
    aliases: ["landing page", "landing", "lp"],
    funcao: "Converter tráfego de campanha com mensagem única, prova e CTA sem dispersão",
    etapaFunil: "conversão",
    frequencia: "Uma LP principal por oferta/campanha relevante, com testes A/B quando houver volume suficiente",
    kpiPrincipal: "taxa de conversão, CPL/CPA, abandono de formulário e qualidade do lead",
    formatos: [
      { formato: "Landing Page", funcao: "Conversão: alinhar promessa do anúncio, prova, oferta e CTA em uma única jornada" },
      { formato: "Headline A/B", funcao: "Otimização: testar promessa, dor, benefício e especificidade" },
      { formato: "Formulário/CTA", funcao: "Conversão: reduzir fricção e pedir apenas o necessário para o próximo passo" },
    ],
  },
  {
    canal: "SMS",
    aliases: ["sms"],
    funcao: "Lembretes e CTAs curtos de alta urgência para uma base com consentimento",
    etapaFunil: "conversão/relacionamento",
    frequencia: "Somente em gatilhos importantes; não usar como mídia recorrente de descoberta",
    kpiPrincipal: "entrega, cliques, respostas e conversões por disparo",
    formatos: [
      { formato: "Lembrete", funcao: "Relacionamento: reduzir ausência ou esquecimento de compromisso, prazo ou evento" },
      { formato: "CTA urgente", funcao: "Conversão: comunicar prazo curto, confirmação ou oportunidade objetiva" },
    ],
  },
];

export function resolveMediaChannelFunction(canal: string): MediaChannelFunctionDefinition | null {
  const key = normalize(canal);
  const matches = DEFINITIONS.flatMap((definition) =>
    definition.aliases.map((alias) => ({ definition, alias: normalize(alias) })),
  )
    .filter(({ alias }) => key === alias || key.includes(alias))
    .sort((a, b) => b.alias.length - a.alias.length);
  return matches[0]?.definition ?? null;
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

  return {
    ...channel,
    canal: definition.canal,
    funcao: variant ?? definition.funcao,
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
  const value = normalize(functionText);
  let pilar = "consideração";
  if (value.startsWith("convers")) pilar = "conversão";
  else if (value.includes("descob") || value.includes("alcance") || value.includes("atenc") || value.includes("prospecc")) pilar = "descoberta";
  else if (value.includes("educ") || value.includes("explic") || value.includes("autoridade")) pilar = "educação";
  else if (value.includes("remarketing") || value.includes("recuper") || value.includes("reativ")) pilar = "remarketing";
  else if (value.includes("relacion") || value.includes("comunidade") || value.includes("follow-up")) pilar = "relacionamento";
  else if (value.includes("qualific")) pilar = "qualificação";
  else if (value.includes("prova") || value.includes("confian") || value.includes("risco")) pilar = "prova";
  else if (value.includes("otimiz") || value.includes("teste")) pilar = "otimização";
  else if (value.includes("intenc")) pilar = "intenção";
  else if (value.includes("convers") || value.includes("captura") || value.includes("cta")) pilar = "conversão";

  return { pilar, funcao: functionText };
}

export function mediaFunctionCatalogForPrompt(): string {
  return DEFINITIONS.map((definition) =>
    `${definition.canal}: ${definition.funcao}; etapa=${definition.etapaFunil}; frequência=${definition.frequencia}; mídias=${definition.formatos.map((item) => `${item.formato}→${item.funcao}`).join(", ")}; KPI=${definition.kpiPrincipal}`,
  ).join("\n");
}
