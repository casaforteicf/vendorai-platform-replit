import { MACRO_BLUEPRINTS, type LaunchPack, type VerticalSeed } from "./verticalTypes";
import { RETAIL_VERTICALS } from "./verticals/retail";
import { CLINIC_VERTICALS } from "./verticals/clinics";
import { DEALERSHIP_VERTICALS } from "./verticals/dealerships";
import { DISTRIBUTOR_VERTICALS } from "./verticals/distributors";
import { SERVICE_VERTICALS } from "./verticals/services";
import { INDUSTRY_VERTICALS } from "./verticals/industries";

const ALL_SEEDS: VerticalSeed[] = [
  ...RETAIL_VERTICALS,
  ...CLINIC_VERTICALS,
  ...DEALERSHIP_VERTICALS,
  ...DISTRIBUTOR_VERTICALS,
  ...SERVICE_VERTICALS,
  ...INDUSTRY_VERTICALS,
];

if (ALL_SEEDS.length !== 50) {
  throw new Error(`Plano Mestre VendorAI exige exatamente 50 subnichos; encontrados ${ALL_SEEDS.length}.`);
}

function agentDetail(name: string, vertical: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("revenue scout")) return `Analisa sinais da carteira de ${vertical} para sugerir recompra, expansão, renovação ou cross-sell com motivo e próxima ação.`;
  if (normalized.includes("closer")) return `Mantém negociação, objeções e próximos passos comerciais de ${vertical} visíveis até existir uma decisão.`;
  if (normalized.includes("follow-up")) return `Executa ou recomenda cadências de acompanhamento com contexto do estágio, evitando oportunidades esquecidas.`;
  if (normalized.includes("agend")) return `Organiza disponibilidade, compromissos, confirmações e lembretes associados à jornada comercial.`;
  if (normalized.includes("pós")) return `Mantém a jornada ativa depois da entrega para satisfação, retenção, indicação e próxima oportunidade.`;
  if (normalized.includes("cobran")) return `Organiza rotinas financeiras e avisos conforme as regras autorizadas da operação.`;
  if (normalized.includes("técnic") || normalized.includes("tecnico")) return `Preserva especificações e contexto técnico-comercial para reduzir retrabalho entre atendimento, proposta e revisão.`;
  if (normalized.includes("customer success")) return `Acompanha ativação, uso, risco e expansão da conta ao longo do relacionamento.`;
  if (normalized.includes("recomend")) return `Usa contexto comercial e preferências disponíveis para apoiar recomendações aderentes ao cliente.`;
  return `Atua no contexto de ${vertical}, registrando dados, qualificando intenção e garantindo uma próxima ação clara.`;
}

function buildTimeline(seed: VerticalSeed) {
  return seed.journey.map((stage, index) => ({
    stage,
    detail:
      index === 0
        ? `Entrada registrada com origem, campanha e contexto de ${seed.vertical}.`
        : index === seed.journey.length - 1
          ? `A jornada continua com histórico preservado e possibilidade de nova oportunidade.`
          : `VendorAI registra o estágio “${stage}”, contexto e Next Best Action antes de avançar.`,
  }));
}

function buildCreatives(seed: VerticalSeed) {
  const pain = seed.pains.slice(0, 3).map(([title]) => title);
  const journeyShort = seed.journey.slice(0, 5).join(" → ");
  const scout = seed.revenueSignals.slice(0, 3).join(", ");
  return {
    pain,
    demonstration: [
      `Veja o VendorAI acompanhar ${journeyShort}.`,
      `A oportunidade parou no meio da jornada. Veja a IA identificar a próxima ação em ${seed.vertical}.`,
      `Venda concluída não encerra a inteligência: veja o Revenue Scout procurar ${scout}.`,
    ],
    result: [
      `Aproveite melhor as oportunidades que sua operação de ${seed.vertical} já gera.`,
      `Otimize marketing e vendas pela receita gerada — não apenas por clique ou lead.`,
    ],
    comparison: [
      `Operação reativa e memória individual × histórico central + Next Best Action + IA.`,
      `Venda isolada × jornada contínua com atribuição, pós-venda e Revenue Scout.`,
    ],
  };
}

function buildFaq(seed: VerticalSeed) {
  const complianceAnswer = seed.compliance === "healthcare"
    ? "A IA fica limitada à jornada administrativa e comercial permitida, sem diagnóstico, prescrição ou promessa clínica. Campanhas devem respeitar legislação, consentimento, plataforma e normas profissionais aplicáveis."
    : seed.compliance === "legal"
      ? "A IA organiza atendimento administrativo e comercial permitido, sem aconselhamento jurídico automático nem promessa de resultado. A operação deve respeitar as normas profissionais aplicáveis."
      : "Sim. O perfil vertical define jornada, eventos, linguagem e limites, e depois o VendorAI aprende o comportamento específico do tenant.";

  return [
    {
      question: `O VendorAI foi configurado especificamente para ${seed.vertical}?`,
      answer: "Sim. Esta vertical possui dor, jornada, pipeline, agentes prioritários, palavras-chave, criativos, KPIs e sinais de Revenue Scout próprios.",
    },
    {
      question: "Preciso trocar meu processo atual?",
      answer: "Não necessariamente. A arquitetura foi desenhada para mapear o processo real, registrar estágios e automatizar próximas ações sem obrigar a empresa a adotar um funil genérico.",
    },
    {
      question: "Consigo saber qual anúncio gerou uma venda?",
      answer: "A arquitetura preserva origem, campanha, criativo, UTM e click ID para ligar aquisição a lead, trial, oportunidade, venda e receita quando os dados estiverem disponíveis.",
    },
    {
      question: "Como funciona o Revenue Scout?",
      answer: `Ele procura sinais como ${seed.revenueSignals.slice(0, 4).join(", ")} e transforma o achado em oportunidade explicável: quem abordar, por quê, quando e com qual próxima ação.`,
    },
    {
      question: "Existem limites de automação?",
      answer: complianceAnswer,
    },
  ];
}

function buildTrial(seed: VerticalSeed) {
  const firstAction = seed.journey.slice(0, 3).join(" → ");
  return [
    { day: 1, title: "Primeiro valor", detail: `Simular ou receber uma oportunidade real e visualizar ${firstAction}.` },
    { day: 2, title: "Automação", detail: "Ativar atendimento, qualificação, agenda ou follow-up prioritário desta vertical." },
    { day: 3, title: "Comercial", detail: `Visualizar pipeline, estágio atual e Next Best Action de ${seed.vertical}.` },
    { day: 4, title: "Inteligência", detail: `Analisar oportunidades paradas, Revenue Recovered by AI e sinais de Revenue Scout.` },
    { day: 5, title: "Resultado", detail: "Receber resumo de leads, interações, follow-ups, oportunidades e receita potencial/atribuída disponível." },
  ];
}

function buildPack(seed: VerticalSeed): LaunchPack {
  const macro = MACRO_BLUEPRINTS[seed.macrosegment];
  const mode = seed.calculatorMode ?? macro.calculatorMode;
  const agents = seed.agents ?? macro.agents;
  return {
    slug: seed.slug,
    macrosegment: seed.macrosegment,
    macrosegmentLabel: macro.label,
    vertical: seed.vertical,
    audience: seed.audience,
    emoji: seed.emoji,
    headline: seed.headline,
    subheadline: seed.subheadline,
    compliance: seed.compliance ?? "standard",
    pains: seed.pains.map(([title, detail]) => ({ title, detail })),
    journey: [...seed.journey],
    timeline: buildTimeline(seed),
    outcomes: macro.outcomes.map((title, index) => ({
      title,
      detail:
        index === 0
          ? `O contexto de ${seed.vertical} permanece ligado à origem, estágio e próxima ação.`
          : index === 1
            ? "Leads, propostas, pedidos ou contas paradas podem ser identificados antes de desaparecerem da operação."
            : `Revenue Scout usa sinais da carteira para procurar receita adicional de forma explicável e controlada.`,
    })),
    agents: agents.map((name) => ({ name, detail: agentDetail(name, seed.vertical) })),
    calculator: {
      mode,
      title: mode === "recurrence" ? "Diagnóstico de receita da carteira" : "Calculadora de oportunidades sem acompanhamento",
      volumeLabel: mode === "recurrence" ? "Clientes/contas ativos na base" : "Oportunidades geradas por mês",
      ticketLabel: mode === "recurrence" ? "Ticket médio por compra/conta (R$)" : "Ticket médio da venda (R$)",
      conversionLabel: mode === "recurrence" ? "Taxa atual de recompra/renovação (%)" : "Taxa atual de fechamento (%)",
      coverageLabel: "Percentual com acompanhamento estruturado (%)",
      resultLabel: "Volume financeiro que merece análise por falta de acompanhamento consistente",
    },
    revenueScout: {
      title: "Sua próxima venda pode já estar nos dados",
      signals: [...seed.revenueSignals],
      example: seed.revenueExample,
    },
    creatives: buildCreatives(seed),
    googleKeywords: [...seed.keywords],
    faq: buildFaq(seed),
    kpis: [macro.primaryMetric, ...seed.kpis.filter((k) => k !== macro.primaryMetric)],
    trial: buildTrial(seed),
  };
}

export const CANONICAL_LAUNCH_PACKS: LaunchPack[] = ALL_SEEDS.map(buildPack);

export const MACROSEGMENT_COUNTS = CANONICAL_LAUNCH_PACKS.reduce<Record<string, number>>((acc, pack) => {
  acc[pack.macrosegment] = (acc[pack.macrosegment] ?? 0) + 1;
  return acc;
}, {});

const LEGACY_ALIASES: Record<string, string> = {
  moda: "moda-roupas-calcados",
  varejo: "moda-roupas-calcados",
  clinicas: "clinica-medica",
  automotivo: "automoveis-novos",
  distribuidoras: "distribuidora-materiais-construcao",
  "industrias-b2b": "industria-materiais-construcao",
  "servicos-profissionais": "agencias-consultorias",
  "tecnologia-saas": "tecnologia-ti-software",
  "auto-pecas": "distribuidora-autopecas",
  "distribuidoras-alimentos": "distribuidora-alimentos-bebidas",
  "materiais-construcao": "materiais-construcao-acabamentos",
  "saude-beleza": "estetica",
};

export function getCanonicalLaunchPack(slug: string): LaunchPack | undefined {
  const canonicalSlug = LEGACY_ALIASES[slug] ?? slug;
  return CANONICAL_LAUNCH_PACKS.find((pack) => pack.slug === canonicalSlug);
}

export function getLaunchPacksByMacrosegment(macrosegment: string): LaunchPack[] {
  return CANONICAL_LAUNCH_PACKS.filter((pack) => pack.macrosegment === macrosegment);
}

export { MACRO_BLUEPRINTS } from "./verticalTypes";
export type { LaunchPack, MacrosegmentKey } from "./verticalTypes";
