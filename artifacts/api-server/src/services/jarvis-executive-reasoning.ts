export type JarvisExecutiveIntent =
  | "business_status"
  | "client_context"
  | "decision_support"
  | "blind_spots"
  | "changes"
  | "priorities"
  | "agenda"
  | "comparison"
  | "scenario"
  | "action_request"
  | "coaching"
  | "general";

type ExecutiveIntentConfig = {
  label: string;
  patterns: RegExp[];
  responseContract: string[];
};

const INTENTS: Record<JarvisExecutiveIntent, ExecutiveIntentConfig> = {
  business_status: {
    label: "visão executiva do negócio",
    patterns: [/como estamos/, /como esta(?:mos)? o negocio/, /visao geral/, /resumo executivo/, /situacao da empresa/, /status do negocio/],
    responseContract: [
      "Comece pelo que mais merece atenção agora, não por uma saudação genérica.",
      "Sintetize situação atual, sinais relevantes, riscos/oportunidades e pontos cegos.",
      "Feche com uma única próxima ação recomendada, priorizada por impacto e urgência.",
    ],
  },
  client_context: {
    label: "visão 360º de cliente/negócio",
    patterns: [/este cliente/, /esse cliente/, /sobre o cliente/, /como esta esse lead/, /como esta este lead/, /o que preciso saber.*cliente/, /o que sabe.*cliente/],
    responseContract: [
      "Use primeiro a entidade verificada da tela e o mapa de relações CRM.",
      "Cruze cliente, negócio, proposta, próxima ação, agenda, riscos e sinais somente quando houver vínculo explícito.",
      "Diga claramente o que falta quando a cobertura estiver incompleta.",
    ],
  },
  decision_support: {
    label: "apoio à decisão executiva",
    patterns: [/o que voce faria/, /o que devo fazer/, /qual decisao/, /decidir/, /vale a pena/, /recomenda/, /melhor caminho/, /qual opcao/],
    responseContract: [
      "Defina a decisão real antes de recomendar.",
      "Separe fatos, hipóteses, riscos, trade-offs e lacunas de informação.",
      "Quando houver alternativas, compare no máximo 3 opções e recomende uma com justificativa verificável.",
      "Não transforme cenário em certeza; indique confiança quando a evidência permitir.",
    ],
  },
  blind_spots: {
    label: "pontos cegos e segunda visão",
    patterns: [/nao estou vendo/, /ponto cego/, /o que estou esquecendo/, /o que pode dar errado/, /risco escondido/, /segunda visao/],
    responseContract: [
      "Procure primeiro lacunas verificáveis, sinais contraditórios e dependências não cobertas.",
      "Não invente ameaça específica a partir de ausência de dados.",
      "Priorize até 3 pontos cegos com consequência provável e próximo passo de validação.",
    ],
  },
  changes: {
    label: "mudanças relevantes",
    patterns: [/o que mudou/, /mudou hoje/, /novidade no negocio/, /desde ontem/, /ultimas 24/],
    responseContract: [
      "Use primeiro mudanças persistidas e diferencie novo, atualizado, resolvido e descartado.",
      "Destaque apenas mudanças que alteram decisão, risco, oportunidade ou execução.",
    ],
  },
  priorities: {
    label: "priorização executiva",
    patterns: [/prioridade/, /mais importante/, /o que fazer primeiro/, /urgente/, /o que merece atencao/],
    responseContract: [
      "Ordene por impacto, urgência, confiança e dependência.",
      "Mostre no máximo 3 prioridades antes de oferecer detalhes adicionais.",
      "Cada prioridade deve terminar em uma próxima ação concreta.",
    ],
  },
  agenda: {
    label: "agenda e preparação executiva",
    patterns: [/agenda/, /compromisso/, /reuniao/, /o que tenho hoje/, /preparar.*reuniao/, /proximo compromisso/],
    responseContract: [
      "Use compromissos persistidos e diferencie agendado de confirmado.",
      "Para preparação, cruze entidade/negócio e sinais disponíveis; não invente briefing quando faltarem dados.",
    ],
  },
  comparison: {
    label: "comparação orientada a decisão",
    patterns: [/compare/, /comparar/, /qual e melhor/, /melhor fornecedor/, /melhor produto/, /versus|\bvs\b/],
    responseContract: [
      "Defina o critério da comparação e use apenas atributos comparáveis presentes nos dados.",
      "Não declare vencedor genérico quando os critérios necessários estiverem ausentes.",
      "Conclua com o que muda na decisão prática.",
    ],
  },
  scenario: {
    label: "cenários e previsão condicionada",
    patterns: [/cenario/, /previsao/, /o que pode acontecer/, /se acontecer/, /projecao/, /simule/],
    responseContract: [
      "Separe dado observado, premissa e resultado do cenário.",
      "Use cenários como testes condicionais, não como previsão garantida.",
      "Explique quais variáveis mais mudam o resultado e qual delas deve ser monitorada primeiro.",
    ],
  },
  action_request: {
    label: "execução/orquestração",
    patterns: [/faz isso/, /faca isso/, /execute/, /envie/, /publique/, /agende/, /crie a tarefa/, /resolve isso/, /corrige isso/],
    responseContract: [
      "Antes de afirmar execução, verifique se há rota/ferramenta real e autorização suficiente.",
      "Se puder executar, descreva de forma curta o que será feito e siga o nível de autonomia aplicável.",
      "Se não puder, entregue a melhor preparação possível sem simular sucesso.",
    ],
  },
  coaching: {
    label: "coach executivo de alta performance",
    patterns: [/coach/, /coaching/, /me cobre/, /me ajuda a focar/, /estou travado/, /nao sei por onde comecar/, /alta performance/, /produtividade/],
    responseContract: [
      "Evite motivação genérica; use contexto real, objetivo, obstáculos e compromissos.",
      "Desafie premissas quando necessário, com respeito e evidência.",
      "Converta reflexão em uma decisão ou ação mensurável de curto prazo.",
    ],
  },
  general: {
    label: "resposta geral",
    patterns: [],
    responseContract: [
      "Responda diretamente ao pedido.",
      "Quando houver contexto empresarial relevante, conecte a resposta ao objetivo atual sem forçar análise executiva desnecessária.",
    ],
  },
};

const INTENT_PRIORITY: JarvisExecutiveIntent[] = [
  "business_status",
  "client_context",
  "blind_spots",
  "changes",
  "priorities",
  "agenda",
  "comparison",
  "scenario",
  "action_request",
  "decision_support",
  "coaching",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function resolveJarvisExecutiveIntent(text: string): JarvisExecutiveIntent {
  const normalized = normalize(text);
  let best: JarvisExecutiveIntent = "general";
  let bestScore = 0;

  for (const intent of INTENT_PRIORITY) {
    const score = INTENTS[intent].patterns.reduce((sum, pattern) => sum + (pattern.test(normalized) ? 1 : 0), 0);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return best;
}

export function buildJarvisExecutiveReasoningContext(text: string): string {
  const intent = resolveJarvisExecutiveIntent(text);
  const config = INTENTS[intent];
  const lines = [
    "## Executive Reasoning Engine do JARVIS",
    `- Intenção executiva detectada: ${config.label} (${intent}).`,
    "- Antes de responder, faça internamente esta sequência: objetivo real → fatos disponíveis → sinais relevantes → riscos/oportunidades → pontos cegos/lacunas → alternativas → recomendação → próxima ação.",
    "- Não exponha raciocínio interno passo a passo. Entregue apenas a síntese executiva útil ao usuário.",
    "- Diferencie fato persistido, inferência, hipótese e recomendação. Não preencha lacunas com invenção.",
    "- Não repita todos os dados recebidos: selecione somente os que mudam decisão ou execução.",
    "- Quando a evidência for fraca ou conflitante, diga isso e reduza a confiança da recomendação.",
    "- Se houver uma ação claramente melhor e autorizada, termine com uma próxima ação concreta em vez de uma pergunta genérica como 'como posso ajudar?'.",
    "### Contrato de resposta para esta intenção",
    ...config.responseContract.map((rule) => `- ${rule}`),
  ];
  return lines.join("\n");
}
