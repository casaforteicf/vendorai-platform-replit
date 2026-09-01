import {
  MARKETING_MACROSEGMENTS,
  MARKETING_VERTICALS,
  OFFICIAL_TRIAL_5_DAYS,
  assertOfficialMarketingArchitecture,
  type MarketingMacrosegmentKey,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";
import { MACRO_BLUEPRINTS, type LaunchPack, type MacrosegmentKey } from "./verticalTypes";

assertOfficialMarketingArchitecture();

const MACRO_MAP: Record<MarketingMacrosegmentKey, MacrosegmentKey> = {
  retail: "varejo",
  clinics: "clinicas",
  dealerships: "concessionarias",
  distributors: "distribuidoras",
  services: "servicos",
  industries: "industrias",
};

const OFFICIAL_MACRO_BY_ID = Object.fromEntries(MARKETING_MACROSEGMENTS.map((macro) => [macro.id, macro]));

// A URL pública precisa ser única. O Vendor Brain pode reutilizar um slug semântico
// entre macrosegmentos; nesses casos, somente a URL recebe um namespace mais específico.
const SITE_SLUG_OVERRIDES: Record<string, string> = {
  "retail-building": "materiais-construcao-acabamentos",
  "industry-building": "industria-materiais-construcao",
};

function siteSlug(profile: MarketingVerticalProfile): string {
  return SITE_SLUG_OVERRIDES[profile.id] ?? profile.slug;
}

const SITE_SLUGS = MARKETING_VERTICALS.map(siteSlug);
if (new Set(SITE_SLUGS).size !== 50) {
  throw new Error("As 50 verticais oficiais precisam possuir 50 URLs públicas únicas.");
}

function compliance(profile: MarketingVerticalProfile): LaunchPack["compliance"] {
  if (profile.compliance === "health") return "healthcare";
  if (profile.compliance === "legal") return "legal";
  return "standard";
}

function emoji(profile: MarketingVerticalProfile): string {
  const byId: Record<string, string> = {
    "retail-fashion": "👗", "retail-home": "🛋️", "retail-building": "🧱", "retail-electronics": "📺",
    "retail-grocery": "🛒", "retail-pet": "🐾", "retail-optical": "👓", "retail-autoparts": "🔧",
    "retail-beauty": "💄", "retail-jewelry": "💎", "clinics-medical": "🩺", "clinics-dental": "🦷",
    "clinics-aesthetic": "✨", "clinics-dermatology": "🧴", "clinics-physio": "🧘", "clinics-psychology": "🧠",
    "clinics-nutrition": "🥗", "clinics-ophthalmology": "👁️", "clinics-orthopedics": "🦴", "clinics-vet": "🐶",
    "dealership-new": "🚗", "dealership-used": "🚙", "dealership-motorcycles": "🏍️", "dealership-commercial": "🚛",
    "dealership-machinery": "🚜", "dist-building": "🏗️", "dist-autoparts": "⚙️", "dist-food": "🥫",
    "dist-pharma": "🧴", "dist-agro": "🌱", "dist-mro": "🛠️", "dist-furniture-components": "🪵",
    "services-accounting": "🧾", "services-legal": "⚖️", "services-agency": "💼", "services-tech": "💻",
    "services-maintenance": "🧰", "services-insurance": "🛡️", "industry-food": "🏭", "industry-building": "🏢",
    "industry-metal": "⚙️", "industry-plastics": "🧪", "industry-furniture": "🪑", "industry-textile": "🧵",
    "industry-machinery": "🏗️", "industry-chemicals": "🧼", "industry-packaging": "📦", "industry-agro": "🌾",
    "industry-pvc-windows": "🪟", "industry-custom-furniture": "🪚",
  };
  return byId[profile.id] ?? "✦";
}

function agentDetail(name: string, profile: MarketingVerticalProfile): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("revenue scout")) return `Analisa ${profile.revenueScout.signals.slice(0, 4).join(", ")} e transforma sinais da carteira em oportunidade explicável.`;
  if (normalized.includes("closer")) return `Mantém negociação, objeções e próximos passos de ${profile.name} visíveis até existir uma decisão.`;
  if (normalized.includes("follow")) return "Organiza cadências com contexto do estágio para evitar oportunidades sem próxima ação.";
  if (normalized.includes("agenda")) return "Organiza compromissos, disponibilidade, confirmações e lembretes ligados à jornada.";
  if (normalized.includes("pós") || normalized.includes("customer success")) return "Mantém o relacionamento ativo após a entrega para retenção, satisfação e expansão.";
  if (normalized.includes("técn") || normalized.includes("tecn")) return "Preserva especificações e contexto técnico-comercial para reduzir retrabalho entre atendimento, proposta e revisão.";
  return `Atua na jornada de ${profile.name}, registrando contexto e garantindo uma Next Best Action clara.`;
}

function buildTimeline(profile: MarketingVerticalProfile) {
  return profile.journey.map((stage, index) => ({
    stage,
    detail:
      index === 0
        ? `Entrada registrada com origem, campanha e contexto da vertical ${profile.name}.`
        : index === profile.journey.length - 1
          ? "O histórico permanece ativo para retenção, atribuição e próxima oportunidade."
          : `O estágio “${stage}” registra contexto, responsável e Next Best Action antes do avanço.`,
  }));
}

function buildCreatives(profile: MarketingVerticalProfile): LaunchPack["creatives"] {
  const painSeeds = profile.lp.painMap.slice(0, 3);
  const journeyShort = profile.journey.slice(0, 5).join(" → ");
  return {
    pain: painSeeds.map((pain) => `${pain}: quanto isso custa hoje em ${profile.name}?`),
    demonstration: [
      `Veja o VendorAI acompanhar ${journeyShort}.`,
      `A oportunidade parou no meio da jornada. Veja a IA identificar a próxima ação.`,
      `Venda concluída não encerra a inteligência: veja o Revenue Scout procurar ${profile.revenueScout.signals.slice(0, 3).join(", ")}.`,
    ],
    result: [
      `Aproveite melhor as oportunidades que sua operação de ${profile.name} já gera.`,
      "Otimize marketing e vendas pela receita gerada — não apenas por clique ou lead.",
    ],
    comparison: [
      "Operação reativa e memória individual × histórico central + Next Best Action + IA.",
      "Venda isolada × jornada contínua com atribuição, pós-venda e Revenue Scout.",
    ],
  };
}

function buildFaq(profile: MarketingVerticalProfile): LaunchPack["faq"] {
  const complianceAnswer = profile.compliance === "health"
    ? "A IA fica limitada à jornada administrativa e comercial permitida, sem diagnóstico, prescrição ou promessa clínica. Campanhas e comunicações devem respeitar consentimento, legislação, regras das plataformas e normas profissionais aplicáveis."
    : profile.compliance === "legal"
      ? "A IA organiza atendimento administrativo e comercial permitido, sem aconselhamento jurídico automático nem promessa de resultado, respeitando as normas profissionais aplicáveis."
      : "O modo de automação pode operar como Observador, Assistido ou Autônomo dentro dos limites previamente autorizados pelo usuário.";

  return [
    { question: profile.lp.faq[0] ?? `O VendorAI funciona para ${profile.name}?`, answer: `Sim. O Vendor Brain mantém um perfil oficial para ${profile.name}, com jornada, pipeline, agentes, LP, Revenue Scout, intenção Google, criativos e KPIs próprios.` },
    { question: profile.lp.faq[1] ?? "Preciso trocar meus canais atuais?", answer: "Não necessariamente. O objetivo é preservar a origem e conectar os canais existentes ao histórico comercial e às próximas ações." },
    { question: profile.lp.faq[2] ?? "A IA pode acompanhar oportunidades automaticamente?", answer: `Sim, conforme o modo de automação autorizado e os guardrails. As próximas ações oficiais desta vertical incluem ${profile.revenueScout.nextBestActions.slice(0, 3).join(", ")}.` },
    { question: profile.lp.faq[3] ?? "Consigo medir qual campanha gerou a venda?", answer: "A arquitetura preserva origem, campanha, criativo, UTM e click ID para ligar aquisição a lead, trial, oportunidade, venda e receita quando esses dados estiverem disponíveis." },
    { question: "Existem limites de automação?", answer: complianceAnswer },
  ];
}

function buildPack(profile: MarketingVerticalProfile): LaunchPack {
  const macrosegment = MACRO_MAP[profile.macrosegment];
  const blueprint = MACRO_BLUEPRINTS[macrosegment];
  const officialMacro = OFFICIAL_MACRO_BY_ID[profile.macrosegment];
  const recurrence = profile.macrosegment === "retail" || profile.macrosegment === "distributors" || profile.id === "clinics-vet";
  return {
    slug: siteSlug(profile),
    macrosegment,
    macrosegmentLabel: officialMacro?.name ?? blueprint.label,
    vertical: profile.name,
    audience: profile.decisionMakers.length ? `${profile.name} · decisores: ${profile.decisionMakers.join(", ")}` : profile.name,
    emoji: emoji(profile),
    headline: profile.lp.headline,
    subheadline: profile.lp.subheadline,
    compliance: compliance(profile),
    pains: profile.lp.painMap.slice(0, 3).map((title, index) => ({
      title,
      detail: index === 0 ? profile.corePain : index === 1 ? profile.promise : `Sem inteligência contínua, “${title.toLowerCase()}” pode permanecer invisível até virar perda ou oportunidade esquecida.`,
    })),
    journey: [...profile.journey],
    timeline: buildTimeline(profile),
    outcomes: [
      { title: "Contexto comercial preservado", detail: `A jornada oficial de ${profile.name} permanece ligada à origem, estágio, pipeline e próxima ação.` },
      { title: "Oportunidades recuperáveis visíveis", detail: "Leads, propostas, pedidos ou contas paradas podem ser identificados antes de desaparecerem da operação." },
      { title: "Receita da carteira", detail: `Revenue Scout usa sinais como ${profile.revenueScout.signals.slice(0, 4).join(", ")} para procurar expansão de forma explicável.` },
    ],
    agents: profile.priorityAgents.map((name) => ({ name, detail: agentDetail(name, profile) })),
    calculator: {
      mode: recurrence ? "recurrence" : "pipeline",
      title: recurrence ? "Diagnóstico de receita da carteira" : "Calculadora de oportunidades sem acompanhamento",
      volumeLabel: recurrence ? "Clientes/contas ativos na base" : "Oportunidades geradas por mês",
      ticketLabel: recurrence ? "Ticket médio por compra/conta (R$)" : "Ticket médio da venda (R$)",
      conversionLabel: recurrence ? "Taxa atual de recompra/renovação (%)" : "Taxa atual de fechamento (%)",
      coverageLabel: "Percentual com acompanhamento estruturado (%)",
      resultLabel: "Volume financeiro que merece análise por falta de acompanhamento consistente",
    },
    revenueScout: {
      title: "Sua próxima venda pode já estar nos dados",
      signals: [...profile.revenueScout.signals],
      example: `${profile.promise} Próximas ações possíveis: ${profile.revenueScout.nextBestActions.join(", ")}.`,
    },
    creatives: buildCreatives(profile),
    googleKeywords: [...profile.googleIntentSeeds],
    faq: buildFaq(profile),
    kpis: [...new Set(profile.kpis)],
    trial: OFFICIAL_TRIAL_5_DAYS.map((day) => ({ day: day.day, title: day.label, detail: day.description })),
  };
}

export const CANONICAL_LAUNCH_PACKS: LaunchPack[] = MARKETING_VERTICALS.map(buildPack);

if (CANONICAL_LAUNCH_PACKS.length !== 50) {
  throw new Error(`Plano Mestre VendorAI exige exatamente 50 LPs oficiais; encontradas ${CANONICAL_LAUNCH_PACKS.length}.`);
}

export const MACROSEGMENT_COUNTS = CANONICAL_LAUNCH_PACKS.reduce<Record<string, number>>((acc, pack) => {
  acc[pack.macrosegment] = (acc[pack.macrosegment] ?? 0) + 1;
  return acc;
}, {});

const LEGACY_ALIASES: Record<string, string> = {
  // Compatibilidade com rotas de campanha anteriores e com a primeira implementação das 50 LPs.
  "moda-roupas-calcados": "moda",
  varejo: "moda",
  clinicas: "clinica-medica",
  automotivo: "automoveis-novos",
  distribuidoras: "distribuidora-materiais-construcao",
  "industrias-b2b": "alimentos-bebidas",
  "servicos-profissionais": "agencias-consultorias",
  "tecnologia-saas": "tecnologia-ti-software",
  "auto-pecas": "distribuidora-autopecas",
  "distribuidoras-alimentos": "distribuidora-alimentos-bebidas",
  "saude-beleza": "estetica",
  "moveis-decoracao-casa": "moveis-decoracao",
  "eletronicos-eletrodomesticos": "eletronicos",
  "supermercados-mercados-emporios": "supermercados",
  "autopecas-acessorios": "autopecas",
  "cosmeticos-perfumaria-beleza": "cosmeticos-perfumaria",
  "joias-presentes": "joias-presentes",
  "fabrica-esquadrias-pvc": "esquadrias-pvc",
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
