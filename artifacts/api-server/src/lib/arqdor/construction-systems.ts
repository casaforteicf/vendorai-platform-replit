export type ArqdorConstructionMethod =
  | "nao_definido"
  | "icf"
  | "alvenaria"
  | "alvenaria_estrutural"
  | "steel_frame"
  | "wood_frame"
  | "concreto"
  | "pre_fabricado"
  | "hibrido";

export type ConstructionSystemProfile = {
  id: ArqdorConstructionMethod;
  label: string;
  planningModuleM: number | null;
  openingModuleM: number | null;
  preferredSpanM: number;
  cautionSpanM: number;
  maxConceptualCantileverM: number;
  wallAlignmentImportance: "low" | "medium" | "high";
  wetStackImportance: "medium" | "high";
  rules: string[];
};

export const CONSTRUCTION_SYSTEM_PROFILES: Record<ArqdorConstructionMethod, ConstructionSystemProfile> = {
  nao_definido: {
    id: "nao_definido",
    label: "Sistema não definido",
    planningModuleM: null,
    openingModuleM: null,
    preferredSpanM: 4.5,
    cautionSpanM: 6.0,
    maxConceptualCantileverM: 1.2,
    wallAlignmentImportance: "medium",
    wetStackImportance: "medium",
    rules: [
      "Mantenha geometria racional até o sistema construtivo ser definido.",
      "Evite grandes vãos e balanços que restrinjam opções estruturais futuras.",
    ],
  },
  icf: {
    id: "icf",
    label: "ICF",
    planningModuleM: 0.05,
    openingModuleM: 0.05,
    preferredSpanM: 4.5,
    cautionSpanM: 6.0,
    maxConceptualCantileverM: 1.0,
    wallAlignmentImportance: "high",
    wetStackImportance: "high",
    rules: [
      "Favoreça continuidade e alinhamento vertical de paredes portantes.",
      "Evite recortes frequentes e paredes curtas residuais.",
      "Concentre aberturas e vergas em uma lógica repetível e coordenada.",
      "Agrupe áreas molhadas e instalações para reduzir interferências em paredes.",
    ],
  },
  alvenaria: {
    id: "alvenaria",
    label: "Alvenaria convencional",
    planningModuleM: 0.10,
    openingModuleM: 0.10,
    preferredSpanM: 4.5,
    cautionSpanM: 6.5,
    maxConceptualCantileverM: 1.2,
    wallAlignmentImportance: "medium",
    wetStackImportance: "medium",
    rules: [
      "Use vãos e eixos de paredes compatíveis com estrutura independente racional.",
      "Evite quebras desnecessárias de parede e excesso de recortes.",
    ],
  },
  alvenaria_estrutural: {
    id: "alvenaria_estrutural",
    label: "Alvenaria estrutural",
    planningModuleM: 0.20,
    openingModuleM: 0.20,
    preferredSpanM: 4.0,
    cautionSpanM: 5.5,
    maxConceptualCantileverM: 0.6,
    wallAlignmentImportance: "high",
    wetStackImportance: "high",
    rules: [
      "Paredes estruturais devem manter alinhamento vertical entre pavimentos.",
      "Modulação e repetição de vãos são prioritárias.",
      "Evite balanços e grandes aberturas que interrompam painéis portantes.",
      "Evite alterações futuras que dependam da remoção de paredes estruturais.",
    ],
  },
  steel_frame: {
    id: "steel_frame",
    label: "Light Steel Frame",
    planningModuleM: 0.40,
    openingModuleM: 0.40,
    preferredSpanM: 4.5,
    cautionSpanM: 6.0,
    maxConceptualCantileverM: 1.0,
    wallAlignmentImportance: "high",
    wetStackImportance: "medium",
    rules: [
      "Favoreça modulação repetitiva e alinhamento de montantes/paredes.",
      "Coordene aberturas com painéis e reforços, evitando exceções excessivas.",
      "Reduza geometrias quebradas que multiplicam perfis e encontros especiais.",
    ],
  },
  wood_frame: {
    id: "wood_frame",
    label: "Wood Frame",
    planningModuleM: 0.40,
    openingModuleM: 0.40,
    preferredSpanM: 4.2,
    cautionSpanM: 5.5,
    maxConceptualCantileverM: 0.9,
    wallAlignmentImportance: "high",
    wetStackImportance: "medium",
    rules: [
      "Use malha modular e repetição de painéis.",
      "Concentre instalações para reduzir perfurações e conflitos.",
      "Proteja fachadas e detalhes expostos à água desde o conceito.",
    ],
  },
  concreto: {
    id: "concreto",
    label: "Concreto armado",
    planningModuleM: 0.10,
    openingModuleM: null,
    preferredSpanM: 5.5,
    cautionSpanM: 7.5,
    maxConceptualCantileverM: 1.8,
    wallAlignmentImportance: "medium",
    wetStackImportance: "high",
    rules: [
      "Organize uma malha plausível de pilares/vigas sem colidir com circulação e aberturas.",
      "Concentre grandes vãos em poucos gestos arquitetônicos.",
      "Alinhe núcleos e prumadas para simplificar estrutura e instalações.",
    ],
  },
  pre_fabricado: {
    id: "pre_fabricado",
    label: "Pré-fabricado",
    planningModuleM: 0.50,
    openingModuleM: 0.50,
    preferredSpanM: 6.0,
    cautionSpanM: 8.0,
    maxConceptualCantileverM: 1.2,
    wallAlignmentImportance: "high",
    wetStackImportance: "medium",
    rules: [
      "Priorize repetição, eixos e dimensões compatíveis com componentes industrializados.",
      "Evite peças únicas e encontros excepcionais sem ganho arquitetônico real.",
      "Favoreça montagem, transporte e racionalização de interfaces.",
    ],
  },
  hibrido: {
    id: "hibrido",
    label: "Sistema híbrido",
    planningModuleM: 0.10,
    openingModuleM: null,
    preferredSpanM: 5.0,
    cautionSpanM: 7.0,
    maxConceptualCantileverM: 1.4,
    wallAlignmentImportance: "medium",
    wetStackImportance: "high",
    rules: [
      "Defina claramente onde muda o sistema construtivo.",
      "Use transições em eixos simples e coordenados.",
      "Evite interfaces híbridas espalhadas sem necessidade.",
    ],
  },
};

export function getConstructionSystemProfile(method?: string | null) {
  const key = (method && method in CONSTRUCTION_SYSTEM_PROFILES
    ? method
    : "nao_definido") as ArqdorConstructionMethod;
  return CONSTRUCTION_SYSTEM_PROFILES[key];
}

export function distanceToModule(value: number, moduleM: number) {
  if (!Number.isFinite(value) || !Number.isFinite(moduleM) || moduleM <= 0) return 0;
  const nearest = Math.round(value / moduleM) * moduleM;
  return Math.abs(value - nearest);
}
