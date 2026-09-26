import type { ClientBrief, ClientVision } from "./conceptClientBrief";
import type { ConceptTypology, LayoutPreferenceKey } from "./conceptTemplates";

export type ArchitecturalPatternId =
  | "br_narrow_lot"
  | "br_compact_economic"
  | "br_family_single_story"
  | "br_leisure_integration"
  | "br_home_office"
  | "br_multi_suite"
  | "br_two_story_family"
  | "br_future_flexibility";

export type ArchitecturalPattern = {
  id: ArchitecturalPatternId;
  title: string;
  rationale: string;
  minLotWidth?: number;
  maxLotWidth?: number;
  floors?: 1 | 2;
  minBedrooms?: number;
  maxBedrooms?: number;
  requires?: Array<"gourmet" | "pool" | "office">;
  preferredTypologies: ConceptTypology[];
  preferenceOverrides: Partial<Record<LayoutPreferenceKey, boolean>>;
  designRules: string[];
};

export type PatternRecommendation = {
  pattern: ArchitecturalPattern;
  score: number;
  reasons: string[];
};

export const ARCHITECTURAL_PATTERN_LIBRARY: ArchitecturalPattern[] = [
  {
    id: "br_narrow_lot",
    title: "Lote urbano estreito",
    rationale: "Organiza a casa longitudinalmente, preservando circulação clara e iluminação nas fachadas disponíveis.",
    maxLotWidth: 10,
    preferredTypologies: ["terrea_estreita", "sobrado_estreito", "sobrado_3suites"],
    preferenceOverrides: { privateAwaySocial: true, livingIntegratedKitchen: true },
    designRules: [
      "Evitar corredor longo sem iluminação.",
      "Concentrar áreas molhadas para liberar fachadas aos dormitórios.",
      "Preservar eixo social contínuo quando o lote limitar aberturas laterais.",
    ],
  },
  {
    id: "br_compact_economic",
    title: "Casa compacta e econômica",
    rationale: "Prioriza compacidade, poucos recortes, áreas molhadas próximas e circulação reduzida.",
    floors: 1,
    maxBedrooms: 2,
    preferredTypologies: ["terrea_economica", "terrea_2q"],
    preferenceOverrides: { livingIntegratedKitchen: true, kitchenNearGourmet: true },
    designRules: [
      "Minimizar perímetro externo por metro quadrado útil.",
      "Evitar ambientes residuais e circulação excessiva.",
      "Concentrar cozinha, banheiro e lavanderia.",
    ],
  },
  {
    id: "br_family_single_story",
    title: "Térrea familiar brasileira",
    rationale: "Separa área íntima da social mantendo cozinha, estar e apoio de serviço com relações diretas.",
    floors: 1,
    minBedrooms: 3,
    preferredTypologies: ["terrea_3q", "terrea_home_office", "terrea_suites"],
    preferenceOverrides: { masterRear: true, privateAwaySocial: true, livingIntegratedKitchen: true },
    designRules: [
      "Criar hall íntimo quando houver múltiplos dormitórios.",
      "Evitar acesso a quartos atravessando sala ou cozinha.",
      "Manter suíte principal protegida das zonas mais ruidosas.",
    ],
  },
  {
    id: "br_leisure_integration",
    title: "Casa com lazer integrado",
    rationale: "Conecta cozinha, gourmet e piscina como sequência de uso, sem expor excessivamente a área íntima.",
    requires: ["gourmet"],
    preferredTypologies: ["terrea_lazer", "sobrado_master", "sobrado_3q"],
    preferenceOverrides: { kitchenNearGourmet: true, gourmetNearPool: true, privateAwaySocial: true },
    designRules: [
      "Manter cozinha e gourmet próximos.",
      "Conectar visualmente gourmet e piscina quando houver piscina.",
      "Criar barreira espacial/acústica entre lazer e dormitórios.",
    ],
  },
  {
    id: "br_home_office",
    title: "Residência com home office",
    rationale: "Posiciona escritório com acesso prático, iluminação natural e menor interferência na rotina íntima.",
    requires: ["office"],
    preferredTypologies: ["terrea_home_office", "sobrado_3q"],
    preferenceOverrides: { privateAwaySocial: true },
    designRules: [
      "Evitar escritório como passagem para quartos.",
      "Preferir acesso próximo ao social/entrada.",
      "Proteger o ambiente de ruído de gourmet e garagem.",
    ],
  },
  {
    id: "br_multi_suite",
    title: "Residência com múltiplas suítes",
    rationale: "Organiza núcleo íntimo com banheiros vinculados, prumadas coerentes e boa privacidade.",
    minBedrooms: 3,
    preferredTypologies: ["terrea_suites", "sobrado_3suites", "sobrado_master", "terrea_lazer"],
    preferenceOverrides: { privateAwaySocial: true, masterRear: true },
    designRules: [
      "Cada banheiro de suíte deve ter vínculo estrutural explícito com seu dormitório.",
      "Agrupar prumadas sempre que possível.",
      "Evitar portas de suítes diretamente voltadas para áreas sociais.",
    ],
  },
  {
    id: "br_two_story_family",
    title: "Sobrado familiar",
    rationale: "Mantém uso social no térreo e núcleo íntimo no superior, com escada central e prumadas alinhadas.",
    floors: 2,
    minBedrooms: 3,
    preferredTypologies: ["sobrado_3q", "sobrado_master", "sobrado_3suites"],
    preferenceOverrides: { privateAwaySocial: true, masterRear: true },
    designRules: [
      "Alinhar escada entre pavimentos.",
      "Aproximar áreas molhadas superiores das inferiores.",
      "Evitar grandes balanços e desalinhamentos estruturais.",
    ],
  },
  {
    id: "br_future_flexibility",
    title: "Casa preparada para mudanças familiares",
    rationale: "Favorece ambientes adaptáveis e distribuição que aceite mudanças de uso sem reforma estrutural pesada.",
    preferredTypologies: ["terrea_3q", "terrea_home_office", "sobrado_3q"],
    preferenceOverrides: { livingIntegratedKitchen: true },
    designRules: [
      "Preferir ambientes regulares e mobiliáveis.",
      "Evitar dependências excessivamente especializadas.",
      "Permitir que escritório/quarto extra troque de função no futuro.",
    ],
  },
];

function requirementMatches(
  pattern: ArchitecturalPattern,
  brief: ClientBrief,
) {
  return (pattern.requires ?? []).every((requirement) =>
    requirement === "gourmet" ? brief.gourmet
      : requirement === "pool" ? brief.pool
        : brief.office
  );
}

export function recommendArchitecturalPatterns(
  brief: ClientBrief,
  lotWidth: number,
  vision?: ClientVision,
): PatternRecommendation[] {
  return ARCHITECTURAL_PATTERN_LIBRARY
    .map((pattern) => {
      let score = 0;
      const reasons: string[] = [];

      if (pattern.minLotWidth && lotWidth >= pattern.minLotWidth) score += 8;
      if (pattern.maxLotWidth && lotWidth <= pattern.maxLotWidth) {
        score += 22;
        reasons.push(`largura do lote (${lotWidth.toFixed(1)} m)`);
      }
      if (pattern.floors === brief.floors) {
        score += 18;
        reasons.push(`${brief.floors} pavimento(s)`);
      }
      if (pattern.minBedrooms && brief.bedrooms >= pattern.minBedrooms) score += 10;
      if (pattern.maxBedrooms && brief.bedrooms <= pattern.maxBedrooms) score += 10;
      if (requirementMatches(pattern, brief) && pattern.requires?.length) {
        score += 24;
        reasons.push("programa de necessidades");
      } else if (pattern.requires?.length) {
        score -= 30;
      }

      if (pattern.id === "br_multi_suite" && brief.suites >= 2) {
        score += 28;
        reasons.push(`${brief.suites} suítes`);
      }
      if (pattern.id === "br_leisure_integration" && brief.pool) {
        score += 12;
        reasons.push("piscina + lazer");
      }
      if (pattern.id === "br_future_flexibility" && vision?.priorities.includes("flexibilidade")) {
        score += 30;
        reasons.push("flexibilidade futura");
      }
      if (pattern.id === "br_compact_economic" && vision?.budgetStrategy === "otimizar") {
        score += 18;
        reasons.push("prioridade de otimização");
      }
      if (pattern.id === "br_leisure_integration" && vision?.lifestyle === "receber") {
        score += 18;
        reasons.push("estilo de vida voltado a receber");
      }

      return { pattern, score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export function typologyPatternAffinity(
  typology: ConceptTypology,
  recommendations: PatternRecommendation[],
) {
  return recommendations.reduce((score, recommendation, index) => {
    if (!recommendation.pattern.preferredTypologies.includes(typology)) return score;
    return score + Math.max(2, (4 - index) * 3) + recommendation.score / 20;
  }, 0);
}

export function mergePatternPreferences(
  recommendations: PatternRecommendation[],
) {
  const merged: Partial<Record<LayoutPreferenceKey, boolean>> = {};
  for (const recommendation of [...recommendations].reverse()) {
    Object.assign(merged, recommendation.pattern.preferenceOverrides);
  }
  return merged;
}
