export type MacrosegmentKey =
  | "varejo"
  | "clinicas"
  | "concessionarias"
  | "distribuidoras"
  | "servicos"
  | "industrias";

export type ComplianceProfile = "standard" | "healthcare" | "legal";
export type CalculatorMode = "pipeline" | "recurrence";

export type PainSeed = readonly [title: string, detail: string];

export interface VerticalSeed {
  slug: string;
  macrosegment: MacrosegmentKey;
  vertical: string;
  audience: string;
  emoji: string;
  headline: string;
  subheadline: string;
  pains: readonly PainSeed[];
  journey: readonly string[];
  revenueSignals: readonly string[];
  revenueExample: string;
  keywords: readonly string[];
  kpis: readonly string[];
  agents?: readonly string[];
  compliance?: ComplianceProfile;
  calculatorMode?: CalculatorMode;
}

export interface MacroBlueprint {
  key: MacrosegmentKey;
  label: string;
  description: string;
  calculatorMode: CalculatorMode;
  agents: readonly string[];
  outcomes: readonly string[];
  primaryMetric: string;
}

export interface LaunchPack {
  slug: string;
  macrosegment: MacrosegmentKey;
  macrosegmentLabel: string;
  vertical: string;
  audience: string;
  emoji: string;
  headline: string;
  subheadline: string;
  compliance: ComplianceProfile;
  pains: Array<{ title: string; detail: string }>;
  journey: string[];
  timeline: Array<{ stage: string; detail: string }>;
  outcomes: Array<{ title: string; detail: string }>;
  agents: Array<{ name: string; detail: string }>;
  calculator: {
    mode: CalculatorMode;
    title: string;
    volumeLabel: string;
    ticketLabel: string;
    conversionLabel: string;
    coverageLabel: string;
    resultLabel: string;
  };
  revenueScout: {
    title: string;
    signals: string[];
    example: string;
  };
  creatives: {
    pain: string[];
    demonstration: string[];
    result: string[];
    comparison: string[];
  };
  googleKeywords: string[];
  faq: Array<{ question: string; answer: string }>;
  kpis: string[];
  trial: Array<{ day: number; title: string; detail: string }>;
}

export const MACRO_BLUEPRINTS: Record<MacrosegmentKey, MacroBlueprint> = {
  varejo: {
    key: "varejo",
    label: "Lojas / Varejo",
    description: "Descoberta → interesse → produto → atendimento → compra → recompra.",
    calculatorMode: "recurrence",
    agents: ["Atendimento IA", "Recomendação IA", "Follow-up IA", "Pós-venda", "Revenue Scout"],
    outcomes: ["Mais contexto por cliente", "Mais oportunidades recuperadas", "Mais receita da carteira"],
    primaryMetric: "Receita por cliente",
  },
  clinicas: {
    key: "clinicas",
    label: "Clínicas",
    description: "Contato → agendamento → comparecimento → atendimento → retorno → continuidade.",
    calculatorMode: "pipeline",
    agents: ["Recepção IA", "Agendador", "Confirmação", "Follow-up administrativo", "Pós-atendimento"],
    outcomes: ["Menos vazamento até a agenda", "Mais organização da jornada", "Retornos administrativos acompanhados"],
    primaryMetric: "Contato → comparecimento",
  },
  concessionarias: {
    key: "concessionarias",
    label: "Concessionárias",
    description: "Lead → necessidade → produto → condição → demonstração/test-drive → proposta → venda → pós-venda.",
    calculatorMode: "pipeline",
    agents: ["SDR IA", "Especialista de produto", "Agendador", "Follow-up IA", "Closer", "Revenue Scout"],
    outcomes: ["Resposta e qualificação rápidas", "Próxima ação sempre definida", "Mais receita por lead e por conta"],
    primaryMetric: "Lead → venda",
  },
  distribuidoras: {
    key: "distribuidoras",
    label: "Distribuidoras",
    description: "Carteira → cotação → pedido → entrega → frequência → recompra → expansão de mix.",
    calculatorMode: "recurrence",
    agents: ["SDR B2B", "Cotação e Follow-up", "Atendimento de carteira", "Cobrança", "Revenue Scout"],
    outcomes: ["Mais previsibilidade de recompra", "Mais share of wallet", "Menos clientes em queda silenciosa"],
    primaryMetric: "Receita por conta",
  },
  servicos: {
    key: "servicos",
    label: "Empresas de Serviços",
    description: "Lead → diagnóstico → proposta → contrato → execução → renovação/expansão.",
    calculatorMode: "pipeline",
    agents: ["SDR IA", "Agendador", "Follow-up de proposta", "Closer", "Customer Success", "Revenue Scout"],
    outcomes: ["Mais propostas acompanhadas", "Mais contratos convertidos", "Mais expansão da base"],
    primaryMetric: "Proposta → contrato",
  },
  industrias: {
    key: "industrias",
    label: "Indústrias",
    description: "Lead B2B → especificação → cotação/projeto → negociação → pedido → produção → entrega → próxima oportunidade.",
    calculatorMode: "pipeline",
    agents: ["SDR Industrial", "Atendimento técnico", "Follow-up B2B", "Closer", "Pós-venda", "Revenue Scout"],
    outcomes: ["Memória comercial em ciclos longos", "Mais cotações com próxima ação", "Expansão e recompra por conta"],
    primaryMetric: "Cotação → pedido",
  },
};
