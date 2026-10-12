export type JarvisDecisionMode =
  | "high_stakes"
  | "reversible"
  | "comparison"
  | "resource_allocation"
  | "people"
  | "commercial"
  | "general";

export type JarvisDecisionResolution = {
  mode: JarvisDecisionMode;
  label: string;
  maxOptions: number;
  requireEvidence: boolean;
  requireReversibilityCheck: boolean;
  requireStopCondition: boolean;
  requireExpectedOutcome: boolean;
  guidance: string[];
};

type DecisionModeConfig = Omit<JarvisDecisionResolution, "mode"> & { patterns: RegExp[] };

const MODES: Record<JarvisDecisionMode, DecisionModeConfig> = {
  high_stakes: {
    label: "decisão de alto impacto",
    maxOptions: 3,
    requireEvidence: true,
    requireReversibilityCheck: true,
    requireStopCondition: true,
    requireExpectedOutcome: true,
    guidance: [
      "Explicite o que torna a decisão de alto impacto: financeiro, jurídico, reputacional, operacional, pessoas, segurança ou irreversibilidade.",
      "Não transforme hipótese em fato e não esconda lacunas de informação relevantes.",
      "Prefira uma recomendação reversível ou faseada quando isso reduzir risco sem destruir valor.",
    ],
    patterns: [/alto impacto/, /milhao|milhões|milhoes/, /contrato/, /demitir|contratar/, /sociedade|socio/, /investir/, /financiamento|emprestimo/, /processo judicial|juridic/, /irreversivel/],
  },
  resource_allocation: {
    label: "alocação de recursos",
    maxOptions: 3,
    requireEvidence: true,
    requireReversibilityCheck: true,
    requireStopCondition: true,
    requireExpectedOutcome: true,
    guidance: [
      "Compare retorno esperado, tempo, capacidade disponível, dependências e custo de oportunidade.",
      "Diga explicitamente o que deixa de ser feito quando um recurso é priorizado.",
      "Quando possível, recomende teste limitado antes de comprometer todo o orçamento, equipe ou capacidade.",
    ],
    patterns: [/orcamento/, /budget/, /onde investir/, /alocar/, /equipe/, /contratar mais/, /priorizar recurso/, /tempo da equipe/, /capacidade/],
  },
  commercial: {
    label: "decisão comercial",
    maxOptions: 3,
    requireEvidence: true,
    requireReversibilityCheck: true,
    requireStopCondition: true,
    requireExpectedOutcome: true,
    guidance: [
      "Cruze cliente, estágio do negócio, proposta, margem, desconto, probabilidade, histórico e próxima ação quando esses dados existirem.",
      "Não recomende desconto apenas para aumentar chance de fechamento; considere margem, precedente e valor estratégico.",
      "Diferencie ganhar a venda de ganhar uma venda saudável.",
    ],
    patterns: [/cliente/, /lead/, /proposta/, /desconto/, /fechar/, /venda/, /negociacao/, /preco/, /margem/],
  },
  people: {
    label: "decisão sobre pessoas/equipe",
    maxOptions: 3,
    requireEvidence: true,
    requireReversibilityCheck: true,
    requireStopCondition: true,
    requireExpectedOutcome: true,
    guidance: [
      "Separe desempenho observado de interpretação sobre intenção, personalidade ou caráter.",
      "Considere impacto na equipe, continuidade operacional, custo de substituição e oportunidade de correção.",
      "Evite decisões definitivas baseadas em um único episódio quando não houver risco grave ou evidência suficiente.",
    ],
    patterns: [/vendedor/, /funcionario/, /colaborador/, /gestor/, /equipe/, /demitir/, /promover/, /contratar/, /desempenho/],
  },
  comparison: {
    label: "comparação para decisão",
    maxOptions: 3,
    requireEvidence: true,
    requireReversibilityCheck: false,
    requireStopCondition: false,
    requireExpectedOutcome: true,
    guidance: [
      "Defina de 3 a 5 critérios que realmente alteram a decisão.",
      "Evite somar critérios incomparáveis sem explicar pesos ou trade-offs.",
      "Se a melhor opção mudar conforme o critério principal, deixe essa sensibilidade explícita.",
    ],
    patterns: [/compare/, /comparar/, /versus|\bvs\b/, /qual e melhor/, /melhor opcao/, /entre .* e /],
  },
  reversible: {
    label: "decisão reversível/testável",
    maxOptions: 3,
    requireEvidence: false,
    requireReversibilityCheck: true,
    requireStopCondition: true,
    requireExpectedOutcome: true,
    guidance: [
      "Se a decisão puder ser testada com baixo custo, priorize experimento curto e mensurável em vez de debate prolongado.",
      "Defina prazo do teste, métrica de sucesso e condição de interromper ou escalar.",
      "A próxima ação deve reduzir incerteza, não apenas produzir atividade.",
    ],
    patterns: [/teste/, /experiment/, /piloto/, /validar/, /tentar/, /por uma semana/, /por um mes/, /a b|a\/b/],
  },
  general: {
    label: "decisão executiva geral",
    maxOptions: 3,
    requireEvidence: true,
    requireReversibilityCheck: true,
    requireStopCondition: true,
    requireExpectedOutcome: true,
    guidance: [
      "Defina a decisão em uma frase curta e identifique qual resultado o usuário está tentando otimizar.",
      "Use fatos disponíveis, explicite incerteza e compare no máximo três caminhos relevantes.",
      "Recomende um caminho e termine com a menor próxima ação que mova a decisão adiante.",
    ],
    patterns: [],
  },
};

const PRIORITY: JarvisDecisionMode[] = [
  "high_stakes",
  "people",
  "resource_allocation",
  "commercial",
  "comparison",
  "reversible",
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function resolveJarvisDecisionMode(text: string): JarvisDecisionResolution {
  const normalized = normalize(text);

  // high_stakes tem precedência por SEVERIDADE: qualquer sinal de alto risco
  // (demitir, contrato, investir, processo judicial, irreversível...) classifica a
  // decisão como alto risco, mesmo que padrões de outras categorias também casem.
  if (MODES.high_stakes.patterns.some((pattern) => pattern.test(normalized))) {
    const { patterns: _highStakesPatterns, ...highStakesConfig } = MODES.high_stakes;
    return { mode: "high_stakes", ...highStakesConfig };
  }

  let best: JarvisDecisionMode = "general";
  let score = 0;

  for (const mode of PRIORITY) {
    const current = MODES[mode].patterns.reduce((total, pattern) => total + (pattern.test(normalized) ? 1 : 0), 0);
    if (current > score) {
      score = current;
      best = mode;
    }
  }

  const { patterns: _patterns, ...config } = MODES[best];
  return { mode: best, ...config };
}

export function buildJarvisDecisionContext(text: string): string {
  const decision = resolveJarvisDecisionMode(text);
  return [
    "## Decision Engine do JARVIS",
    `- Modo decisório: ${decision.label} (${decision.mode}).`,
    `- Limite: compare no máximo ${decision.maxOptions} alternativas realmente relevantes.`,
    decision.requireEvidence
      ? "- Evidência: sustente a recomendação nos dados/contexto disponíveis e marque claramente lacunas relevantes."
      : "- Evidência: quando faltarem dados, proponha um teste que reduza incerteza antes de ampliar compromisso.",
    decision.requireReversibilityCheck
      ? "- Reversibilidade: diga se a decisão é reversível, parcialmente reversível ou difícil de reverter, e ajuste o nível de cautela."
      : null,
    decision.requireExpectedOutcome
      ? "- Resultado esperado: descreva o que deve mudar se a recomendação estiver correta e qual métrica observar."
      : null,
    decision.requireStopCondition
      ? "- Condição de parada: quando aplicável, defina o sinal que faria interromper, rever ou escalar o plano."
      : null,
    "- Decisão final: quando houver evidência suficiente, escolha um caminho. Não deixe o usuário com uma lista neutra de opções sem orientação.",
    "- Aprendizado: registre mentalmente o que deverá ser comparado depois entre resultado esperado e realizado; persistência formal depende do mecanismo de decisões/missões.",
    ...decision.guidance.map((item) => `- ${item}`),
  ].filter(Boolean).join("\n");
}
