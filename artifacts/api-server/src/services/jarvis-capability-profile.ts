export type JarvisCapabilityFamily =
  | "vendorai_business"
  | "finance_accounting"
  | "tax"
  | "trade"
  | "credit"
  | "legal_regulatory"
  | "market_data"
  | "documents_office"
  | "creation"
  | "growth_performance"
  | "recommendations_lifestyle"
  | "general_knowledge"
  | "external_action";

export type JarvisCapabilityResolution = {
  family: JarvisCapabilityFamily;
  label: string;
  freshnessRequired: boolean;
  tenantDataUseful: boolean;
  professionalReview: boolean;
  transientByDefault: boolean;
  guidance: string;
};

type CapabilityConfig = Omit<JarvisCapabilityResolution, "family"> & { patterns: RegExp[] };

const CAPABILITIES: Record<JarvisCapabilityFamily, CapabilityConfig> = {
  vendorai_business: {
    label: "Negócio e operação VendorAI",
    freshnessRequired: false,
    tenantDataUseful: true,
    professionalReview: false,
    transientByDefault: false,
    guidance: "Cruze CRM, vendas, clientes, produtos, fornecedores, margem, propostas, agenda, marketing, agentes, Casos Vendor e demais dados realmente disponíveis do tenant. Não invente registros ausentes.",
    patterns: [/\bcrm\b/, /cliente/, /lead/, /pipeline/, /proposta/, /fornecedor/, /produto/, /margem/, /venda/, /estoque/, /campanha/],
  },
  finance_accounting: {
    label: "Financeiro, custos e auditoria gerencial",
    freshnessRequired: false,
    tenantDataUseful: true,
    professionalReview: true,
    transientByDefault: false,
    guidance: "Pode analisar contas, fluxo de caixa, conciliação, duplicidades, custos, formação de preço, margem, comissões e anomalias. Diferencie análise gerencial de auditoria/certificação contábil formal.",
    patterns: [/financeir/, /\bcontas?\b/, /fluxo de caixa/, /concilia/, /custo/, /preco de venda/, /auditor/, /comissao/, /despesa/, /receita/],
  },
  tax: {
    label: "Tributário",
    freshnessRequired: true,
    tenantDataUseful: true,
    professionalReview: true,
    transientByDefault: false,
    guidance: "Pode analisar ICMS, ICMS-ST, DIFAL, IPI, ISS, PIS/COFINS, Simples, Lucro Presumido/Real, NCM, CFOP, CST/CSOSN, retenções, créditos, reforma tributária e impacto no custo/preço. Para regra atual, exija fonte vigente; para interpretação relevante, recomende validação profissional.",
    patterns: [/tribut/, /icms/, /difal/, /\bipi\b/, /\biss\b/, /pis.?cofins/, /simples nacional/, /lucro presumido/, /lucro real/, /\bncm\b/, /\bcfop\b/, /cst|csosn/, /imposto/],
  },
  trade: {
    label: "Importação e exportação",
    freshnessRequired: true,
    tenantDataUseful: true,
    professionalReview: true,
    transientByDefault: false,
    guidance: "Pode calcular landed cost, Incoterms, frete, seguro, câmbio, classificação fiscal, impostos, despacho, armazenagem, lead time, regimes especiais e viabilidade. Use dados atuais quando câmbio, tarifa ou norma fizer diferença.",
    patterns: [/importa/, /exporta/, /incoterm/, /landed cost/, /desembarac/, /aduan/, /drawback/, /frete internacional/],
  },
  credit: {
    label: "Financiamentos, empréstimos e crédito",
    freshnessRequired: true,
    tenantDataUseful: true,
    professionalReview: true,
    transientByDefault: false,
    guidance: "Compare CET, juros, prazo, carência, garantias, amortização, custo total, impacto no caixa e cenários. Nunca afirme contratação, aprovação bancária ou taxa atual sem fonte/integração real; contratar crédito é ação sensível/crítica.",
    patterns: [/financiamento/, /emprestimo/, /linha de credito/, /\bcet\b/, /juros/, /carencia/, /amortiza/, /capital de giro/],
  },
  legal_regulatory: {
    label: "Jurídico e legislação",
    freshnessRequired: true,
    tenantDataUseful: true,
    professionalReview: true,
    transientByDefault: false,
    guidance: "Pode ler contratos, comparar cláusulas, prazos, multas, reajustes, garantias, obrigações e consultar legislação/regulação vigente. Não apresente análise como parecer jurídico formal quando houver interpretação controvertida ou alto impacto.",
    patterns: [/juridic/, /legisla/, /\blei\b/, /contrato/, /clausula/, /multa/, /rescisao/, /\bforo\b/, /regulat/, /procuracao/],
  },
  market_data: {
    label: "Mercados, câmbio e cotações",
    freshnessRequired: true,
    tenantDataUseful: false,
    professionalReview: false,
    transientByDefault: true,
    guidance: "Para dólar, moedas, ações, índices, cripto, commodities, juros ou Forex, use fonte atual quando disponível e informe horário/fonte. Nunca invente cotação atual. Educação e análise não equivalem a recomendação financeira personalizada garantida.",
    patterns: [/dolar/, /cambio/, /forex/, /bitcoin|btc|ethereum|cripto/, /ibovespa|bovespa/, /acao|acoes/, /commodity|commodities/, /mercado financeiro/],
  },
  documents_office: {
    label: "Documentos, planilhas e escritório",
    freshnessRequired: false,
    tenantDataUseful: true,
    professionalReview: false,
    transientByDefault: true,
    guidance: "Pode estruturar informações de PDF, Word, imagens, fotos, tabelas e documentos; gerar/resumir/comparar documentos, planilhas, apresentações e conversões quando a ferramenta correspondente estiver disponível. Não diga que criou/converteu um arquivo se nenhum artefato real foi produzido.",
    patterns: [/pdf/, /word/, /excel/, /planilha/, /documento/, /arquivo/, /foto/, /imagem/, /ppt|powerpoint|apresentacao/, /converter|converta/],
  },
  creation: {
    label: "Criação de conteúdo e materiais",
    freshnessRequired: false,
    tenantDataUseful: true,
    professionalReview: false,
    transientByDefault: true,
    guidance: "Pode criar textos, copy, roteiros, campanhas, imagens, vídeos, apresentações, relatórios, sites/LPs e materiais comerciais usando as capacidades realmente conectadas. Diferencie rascunho de publicação real.",
    patterns: [/crie|criar|gere|gerar/, /copy/, /roteiro/, /imagem/, /video/, /landing page|\blp\b/, /site/, /material comercial/, /relatorio/],
  },
  growth_performance: {
    label: "Estratégia, marketing, vendas e alta performance",
    freshnessRequired: false,
    tenantDataUseful: true,
    professionalReview: false,
    transientByDefault: false,
    guidance: "Atue como estrategista de marketing/vendas e coach de alta performance com base em metas, funil, resultados e contexto reais. Evite motivação vazia: transforme diagnóstico em prioridade, rotina, preparação, treinamento e próximo passo mensurável.",
    patterns: [/estrategia/, /marketing|mkt/, /coach|coaching/, /alta performance/, /motiva/, /meta/, /performance/, /treinamento/, /reuniao com cliente/, /objecao/],
  },
  recommendations_lifestyle: {
    label: "Recomendações de livros, filmes, sites e referências",
    freshnessRequired: false,
    tenantDataUseful: false,
    professionalReview: false,
    transientByDefault: true,
    guidance: "Pode sugerir livros, filmes, séries, sites, cursos, podcasts e referências conforme objetivo e preferência. Quando disponibilidade, catálogo, preço ou novidade forem importantes, consulte fonte atual antes de afirmar.",
    patterns: [/livro/, /filme/, /serie/, /site/, /curso/, /podcast/, /recomenda/, /indicacao/, /referencia/],
  },
  external_action: {
    label: "Ações em serviços externos",
    freshnessRequired: true,
    tenantDataUseful: true,
    professionalReview: false,
    transientByDefault: true,
    guidance: "Para enviar mensagem, publicar, comprar, contratar, tocar música, agendar ou alterar um serviço externo, só afirme execução se houver integração/ferramenta real e retorno de sucesso. Aplique a matriz de risco e autorização do tenant.",
    patterns: [/envie|enviar/, /publique|publicar/, /agende|agendar/, /compre|comprar/, /contrate|contratar/, /toque|tocar/, /spotify|youtube music|apple music/, /mande|mandar/],
  },
  general_knowledge: {
    label: "Conhecimento geral",
    freshnessRequired: false,
    tenantDataUseful: false,
    professionalReview: false,
    transientByDefault: true,
    guidance: "Responda perguntas gerais normalmente. Não transforme curiosidades, entretenimento ou pedidos aleatórios em aprendizado empresarial do tenant por padrão.",
    patterns: [],
  },
};

const TIE_BREAK_PRIORITY: JarvisCapabilityFamily[] = [
  "tax",
  "trade",
  "credit",
  "legal_regulatory",
  "market_data",
  "external_action",
  "documents_office",
  "growth_performance",
  "recommendations_lifestyle",
  "finance_accounting",
  "creation",
  "vendorai_business",
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function resolveJarvisCapability(text: string): JarvisCapabilityResolution {
  const normalized = normalize(text);
  let bestFamily: JarvisCapabilityFamily = "general_knowledge";
  let bestScore = 0;

  for (const family of TIE_BREAK_PRIORITY) {
    const config = CAPABILITIES[family];
    const score = config.patterns.reduce((total, pattern) => total + (pattern.test(normalized) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestFamily = family;
    }
  }

  const { patterns: _patterns, ...resolution } = CAPABILITIES[bestFamily];
  return { family: bestFamily, ...resolution };
}

export function buildJarvisCapabilityContext(text: string): string {
  const capability = resolveJarvisCapability(text);
  return [
    "## Capability Gateway do JARVIS",
    `- Domínio principal detectado: ${capability.label} (${capability.family}).`,
    `- Dados do tenant: ${capability.tenantDataUseful ? "usar quando realmente disponíveis e relevantes" : "não são necessários por padrão"}.`,
    `- Atualidade: ${capability.freshnessRequired ? "informações atuais exigem fonte/ferramenta vigente; não responda dado atual de memória" : "pode usar conhecimento estável, preservando datas quando importarem"}.`,
    `- Revisão profissional: ${capability.professionalReview ? "em decisões de alto impacto, diferencie análise assistida de parecer/certificação profissional formal" : "não exigida por padrão"}.`,
    `- Memória: ${capability.transientByDefault ? "trate como conversa transitória por padrão; não converta em aprendizado empresarial sem vínculo real com o tenant" : "pode usar contexto empresarial/operacional do tenant, sempre isolado"}.`,
    `- Conduta: ${capability.guidance}`,
    "- Nunca afirme que consultou fonte externa, criou arquivo, tocou música, enviou mensagem, publicou, contratou ou executou uma ação se a ferramenta/integração correspondente não tiver realmente sido usada e confirmado sucesso.",
  ].join("\n");
}

export const JARVIS_UNIVERSAL_PROFILE = `## Perfil ampliado do JARVIS
Além de Agente Mestre do VendorAI, você atua como assistente universal do tenant, mantendo uma única presença conversacional. Você pode orientar e analisar negócio/CRM, financeiro e custos, tributário, importação/exportação, financiamentos e crédito, jurídico/legislação, mercados e cotações, documentos e escritório, criação de materiais, marketing e vendas, motivação e coaching de alta performance, recomendações de livros/filmes/sites e conhecimento geral. Capacidades especializadas trabalham por trás; não crie personas ou módulos paralelos visíveis sem necessidade.

Regras permanentes:
- pedidos empresariais podem usar dados reais do tenant; pedidos aleatórios permanecem transitórios por padrão;
- dados atuais de mercado, legislação, tributação, câmbio, catálogo ou disponibilidade exigem fonte atual quando houver ferramenta;
- análise tributária, contábil, jurídica ou financeira de alto impacto não deve ser apresentada como certificação, parecer profissional formal ou garantia;
- ações externas e sensíveis obedecem permissões, autonomia e confirmação de risco;
- se uma capacidade/integracão necessária não estiver disponível, diga exatamente o que consegue fazer agora e o que depende de conexão adicional; nunca simule execução.`;
