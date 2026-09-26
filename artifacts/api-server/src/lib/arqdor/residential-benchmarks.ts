export type ArqdorBenchmarkCase = {
  id: string;
  title: string;
  tags: string[];
  brief: {
    lotWidth: number;
    lotDepth: number;
    floors: 1 | 2;
    desiredArea: number;
    bedrooms: number;
    suites: number;
    garageSpaces: number;
    region?: "norte" | "nordeste" | "centro_oeste" | "sudeste" | "sul";
    lotContext?: "urbano" | "condominio" | "rural" | "litoral" | "serra";
    lifeCycle?: "atual" | "familia_crescendo" | "multigeracional" | "envelhecer_na_casa" | "investimento";
    budgetStrategy?: "otimizar" | "equilibrar" | "priorizar_experiencia";
    vehicleProfile?: "compacto" | "sedan" | "suv" | "pickup" | "misto";
  };
  requiredDimensions: Array<
    "function" | "circulation" | "privacy" | "ergonomics" | "climate" | "constructability" | "cost" | "futureFit" | "identity"
  >;
  invariants: string[];
  forbiddenFailurePatterns: string[];
};

export const ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS: ArqdorBenchmarkCase[] = [
  {
    id: "urban-narrow-south",
    title: "Lote urbano estreito · Sul",
    tags: ["lote-estreito", "urbano", "sul", "privacidade"],
    brief: { lotWidth: 8, lotDepth: 25, floors: 2, desiredArea: 150, bedrooms: 3, suites: 1, garageSpaces: 1, region: "sul", lotContext: "urbano", budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","circulation","privacy","climate","constructability","cost"],
    invariants: [
      "circulação íntima não atravessa garagem",
      "dormitórios preservam privacidade em relação à rua",
      "implantação usa profundidade do lote sem criar corredor residual excessivo",
    ],
    forbiddenFailurePatterns: ["quarto sem acesso", "garagem abre para suíte", "planta fragmentada"],
  },
  {
    id: "growing-family",
    title: "Família crescendo · casa evolutiva",
    tags: ["familia", "expansao", "flexibilidade"],
    brief: { lotWidth: 12, lotDepth: 30, floors: 1, desiredArea: 170, bedrooms: 3, suites: 1, garageSpaces: 2, lifeCycle: "familia_crescendo", budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","ergonomics","futureFit","cost","identity"],
    invariants: [
      "há estratégia de expansão futura sem bloquear iluminação",
      "um ambiente pode mudar de função sem destruir circulação",
    ],
    forbiddenFailurePatterns: ["expansão futura inviável", "quarto apertado"],
  },
  {
    id: "multigenerational-ground-floor",
    title: "Residência multigeracional",
    tags: ["multigeracional", "acessibilidade", "terreo"],
    brief: { lotWidth: 14, lotDepth: 28, floors: 2, desiredArea: 230, bedrooms: 4, suites: 2, garageSpaces: 2, lifeCycle: "multigeracional", budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","circulation","privacy","ergonomics","futureFit"],
    invariants: [
      "há dormitório e banheiro completo funcionais no térreo",
      "setor térreo permite autonomia sem isolamento da vida social",
    ],
    forbiddenFailurePatterns: ["sem banheiro térreo", "idoso depende de escada"],
  },
  {
    id: "ageing-in-place",
    title: "Envelhecer na casa",
    tags: ["ageing-in-place", "acessibilidade", "futuro"],
    brief: { lotWidth: 12, lotDepth: 25, floors: 2, desiredArea: 190, bedrooms: 3, suites: 1, garageSpaces: 2, lifeCycle: "envelhecer_na_casa", budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","circulation","ergonomics","futureFit"],
    invariants: [
      "existe alternativa de dormir e usar banheiro completo no térreo",
      "circulação principal evita barreiras desnecessárias",
    ],
    forbiddenFailurePatterns: ["dependência obrigatória de escada", "banheiro inacessível"],
  },
  {
    id: "compact-budget",
    title: "Casa compacta com orçamento otimizado",
    tags: ["custo", "compacta", "value-engineering"],
    brief: { lotWidth: 10, lotDepth: 25, floors: 1, desiredArea: 110, bedrooms: 2, suites: 1, garageSpaces: 1, budgetStrategy: "otimizar" },
    requiredDimensions: ["function","ergonomics","constructability","cost"],
    invariants: [
      "perímetro é racional para a área construída",
      "áreas molhadas são agrupadas quando possível",
      "não há recortes volumétricos gratuitos",
    ],
    forbiddenFailurePatterns: ["complexidade sem benefício", "cobertura fragmentada"],
  },
  {
    id: "premium-indoor-outdoor",
    title: "Residência com experiência interior-exterior",
    tags: ["gourmet", "piscina", "experiencia", "jardim"],
    brief: { lotWidth: 18, lotDepth: 35, floors: 1, desiredArea: 260, bedrooms: 3, suites: 2, garageSpaces: 2, budgetStrategy: "priorizar_experiencia" },
    requiredDimensions: ["function","circulation","privacy","climate","identity"],
    invariants: [
      "sala, gourmet e jardim/piscina formam relação espacial coerente",
      "área íntima não perde privacidade para o lazer",
    ],
    forbiddenFailurePatterns: ["gourmet isolado", "piscina desconectada da área social"],
  },
  {
    id: "sloped-site",
    title: "Terreno em aclive/declive",
    tags: ["topografia", "movimentacao-terra", "implantacao"],
    brief: { lotWidth: 14, lotDepth: 32, floors: 2, desiredArea: 210, bedrooms: 3, suites: 1, garageSpaces: 2, budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","climate","constructability","cost"],
    invariants: [
      "implantação admite níveis sem gerar volumes arbitrários",
      "garagem e acesso são compatíveis com a topografia",
    ],
    forbiddenFailurePatterns: ["movimentação de terra gratuita", "volume sem apoio"],
  },
  {
    id: "coastal-house",
    title: "Residência litorânea",
    tags: ["litoral", "ventilacao", "manutencao"],
    brief: { lotWidth: 15, lotDepth: 30, floors: 2, desiredArea: 200, bedrooms: 3, suites: 2, garageSpaces: 2, region: "sul", lotContext: "litoral", budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","climate","constructability","identity"],
    invariants: [
      "ventilação e sombreamento são considerados no partido",
      "materialidade evita complexidade de manutenção gratuita",
    ],
    forbiddenFailurePatterns: ["vidro sem proteção", "fachada puramente decorativa"],
  },
  {
    id: "pickup-garage",
    title: "Garagem para pickup/SUV",
    tags: ["garagem", "pickup", "suv"],
    brief: { lotWidth: 12, lotDepth: 28, floors: 1, desiredArea: 160, bedrooms: 3, suites: 1, garageSpaces: 2, vehicleProfile: "pickup", budgetStrategy: "equilibrar" },
    requiredDimensions: ["function","ergonomics","circulation"],
    invariants: [
      "garagem comporta envelope realista de pickup, abertura de portas e passagem",
      "garagem conecta social/serviço sem abrir em dormitório",
    ],
    forbiddenFailurePatterns: ["vaga curta", "acesso garagem-quarto"],
  },
  {
    id: "two-storey-wet-stack",
    title: "Sobrado com prumadas racionalizadas",
    tags: ["sobrado", "hidraulica", "estrutura"],
    brief: { lotWidth: 11, lotDepth: 27, floors: 2, desiredArea: 190, bedrooms: 3, suites: 2, garageSpaces: 2, budgetStrategy: "otimizar" },
    requiredDimensions: ["function","constructability","cost","circulation"],
    invariants: [
      "áreas molhadas superiores têm alinhamento plausível com pavimento inferior",
      "pavimento superior possui apoio razoável",
    ],
    forbiddenFailurePatterns: ["prumada dispersa", "grande balanço sem motivo"],
  },
  {
    id: "investment-flex",
    title: "Residência para investimento",
    tags: ["investimento", "flexibilidade", "manutencao"],
    brief: { lotWidth: 10, lotDepth: 25, floors: 1, desiredArea: 125, bedrooms: 3, suites: 1, garageSpaces: 1, lifeCycle: "investimento", budgetStrategy: "otimizar" },
    requiredDimensions: ["function","cost","constructability","futureFit"],
    invariants: [
      "ambientes têm uso flexível e dimensões comercialmente robustas",
      "solução reduz manutenção e especificidades difíceis de revender",
    ],
    forbiddenFailurePatterns: ["ambiente residual", "customização excessivamente específica"],
  },
  {
    id: "condominium-signature",
    title: "Condomínio · arquitetura autoral controlada",
    tags: ["condominio", "assinatura", "fachada"],
    brief: { lotWidth: 16, lotDepth: 32, floors: 2, desiredArea: 280, bedrooms: 4, suites: 3, garageSpaces: 2, lotContext: "condominio", budgetStrategy: "priorizar_experiencia" },
    requiredDimensions: ["function","privacy","climate","constructability","identity"],
    invariants: [
      "há um gesto arquitetônico principal reconhecível",
      "identidade não depende de empilhar elementos decorativos",
      "fachada deriva da planta e volumetria",
    ],
    forbiddenFailurePatterns: ["fachada genérica", "excesso de gestos", "render inventa geometria"],
  },
];

export type BenchmarkResult = {
  multiObjective?: {
    utilityScore?: number;
    vector?: Partial<Record<ArqdorBenchmarkCase["requiredDimensions"][number], number>>;
  };
  hardBlockers?: string[];
  qualityIssues?: string[];
};

export function evaluateBenchmarkResult(benchmark: ArqdorBenchmarkCase, result: BenchmarkResult) {
  const vector = result.multiObjective?.vector ?? {};
  const missingDimensions = benchmark.requiredDimensions.filter((dimension) => !Number.isFinite(Number(vector[dimension])));
  const weakDimensions = benchmark.requiredDimensions.filter((dimension) => Number(vector[dimension] ?? 0) < 62);
  const text = [...(result.hardBlockers ?? []), ...(result.qualityIssues ?? [])].join(" ").toLocaleLowerCase("pt-BR");
  const forbiddenMatches = benchmark.forbiddenFailurePatterns.filter((pattern) => text.includes(pattern.toLocaleLowerCase("pt-BR")));
  const utilityScore = Number(result.multiObjective?.utilityScore ?? 0);

  return {
    passed: missingDimensions.length === 0 && weakDimensions.length === 0 && forbiddenMatches.length === 0 && utilityScore >= 78,
    utilityScore,
    missingDimensions,
    weakDimensions,
    forbiddenMatches,
  };
}

export function benchmarkCoverageSummary(cases = ARQDOR_BRAZILIAN_RESIDENTIAL_BENCHMARKS) {
  const tagSet = new Set(cases.flatMap((item) => item.tags));
  const dimensionSet = new Set(cases.flatMap((item) => item.requiredDimensions));
  return {
    cases: cases.length,
    tags: [...tagSet].sort(),
    dimensions: [...dimensionSet].sort(),
  };
}
