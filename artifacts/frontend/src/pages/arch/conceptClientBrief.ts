import {
  CONCEPT_TYPOLOGIES,
  DEFAULT_LAYOUT_PREFERENCES,
  buildTypologyPlan,
  buildTypologyRooms,
  type ConceptTypology,
  type LayoutPreferences,
} from "./conceptTemplates";
import { validateConceptLayout } from "./conceptGeometry";
import { generateTypologyLayout } from "./conceptTypologyLayout";

export type ClientRoomRequestKind =
  | "sala"
  | "cozinha"
  | "suite"
  | "quarto"
  | "banheiro"
  | "lavanderia"
  | "garagem"
  | "gourmet"
  | "piscina"
  | "outro";

export type ClientRoomRequest = {
  id: string;
  kind: ClientRoomRequestKind;
  label: string;
  quantity: number;
  targetArea: number;
  preferredWidth?: number;
  preferredDepth?: number;
  floorPreference?: "terreo" | "superior" | "qualquer";
  required?: boolean;
  notes?: string;
};

export type ClientAdjacencyRelation = "direct" | "near" | "away";

export type ClientAdjacencyRule = {
  id: string;
  fromRequestId: string;
  toRequestId: string;
  relation: ClientAdjacencyRelation;
  required: boolean;
};

export type ClientAccessRuleMode = "required_direct" | "forbidden_direct";

export type ClientAccessRule = {
  id: string;
  fromRequestId: string;
  toRequestId: string;
  mode: ClientAccessRuleMode;
  required: boolean;
  reason?: string;
};

export type ClientBrief = {
  bedrooms: 2 | 3 | 4;
  suites: 0 | 1 | 2;
  floors: 1 | 2;
  garageSpaces: 1 | 2 | 3;
  gourmet: boolean;
  pool: boolean;
  office: boolean;
  integratedKitchen: boolean;
  privateAwaySocial: boolean;
  desiredAreaTotal?: number;
  roomProgram?: ClientRoomRequest[];
  adjacencyRules?: ClientAdjacencyRule[];
  accessRules?: ClientAccessRule[];
};

export type ClientVision = {
  lifestyle: "familia" | "receber" | "tranquilidade" | "praticidade" | "misto";
  protagonist: "social" | "cozinha" | "gourmet" | "suite" | "jardim";
  priorities: Array<"luz_natural" | "privacidade" | "integracao" | "natureza" | "armazenamento" | "flexibilidade">;
  budgetStrategy: "otimizar" | "equilibrar" | "priorizar_experiencia";
  futureNeeds: string;
  mustHave: string;
  avoid: string;
  aestheticReferences?: string;
  preferredMaterials?: string;
  maintenancePreference?: "baixa" | "equilibrada" | "aceita_maior";
  constructionMethod?: "nao_definido" | "icf" | "alvenaria" | "alvenaria_estrutural" | "steel_frame" | "wood_frame" | "concreto" | "pre_fabricado" | "hibrido";
  budgetTarget?: number;
};

export type HouseholdContext = {
  residents?: number;
  children?: number;
  elderly?: number;
  pets?: boolean;
  accessibilityNeeds?: boolean;
  workFromHome?: "nao" | "ocasional" | "frequente";
  hostingFrequency?: "baixa" | "media" | "alta";
  cookingProfile?: "pratico" | "cotidiano" | "intenso";
  routineNotes?: string;
};

export type ProjectSiteContext = {
  frontSide?: "top" | "bottom" | "left" | "right";
  northSide?: "top" | "bottom" | "left" | "right" | "nao_informado";
  topography?: "plano" | "declive" | "aclive" | "irregular" | "nao_informado";
  desiredViews?: string;
  avoidViews?: string;
  privacyNotes?: string;
  existingElements?: string;
  climateNotes?: string;
};

const MIN_ROOM_AREAS: Record<ClientRoomRequestKind, number> = {
  sala: 18,
  cozinha: 8,
  suite: 11,
  quarto: 8,
  banheiro: 2.4,
  lavanderia: 3.5,
  garagem: 12,
  gourmet: 10,
  piscina: 8,
  outro: 5,
};

export function rebalanceClientRoomProgramToDesiredArea(brief: ClientBrief): ClientRoomRequest[] {
  const program = Array.isArray(brief.roomProgram) ? brief.roomProgram : [];
  const desiredArea = Number(brief.desiredAreaTotal);
  if (!program.length || !Number.isFinite(desiredArea) || desiredArea < 40) return program;

  const targetNetArea = desiredArea / 1.14;
  const fixedArea = program.reduce((sum, item) => {
    if (item.kind === "piscina") return sum;
    const hasFixedDimensions = Number(item.preferredWidth) >= 1.2 && Number(item.preferredDepth) >= 1.2;
    return hasFixedDimensions
      ? sum + item.quantity * Number(item.preferredWidth) * Number(item.preferredDepth)
      : sum;
  }, 0);

  const flexible = program.filter((item) => {
    if (item.kind === "piscina") return false;
    return !(Number(item.preferredWidth) >= 1.2 && Number(item.preferredDepth) >= 1.2);
  });
  const flexibleCurrent = flexible.reduce((sum, item) => sum + item.quantity * item.targetArea, 0);
  const availableFlexible = Math.max(0, targetNetArea - fixedArea);
  const factor = flexibleCurrent > 0 ? availableFlexible / flexibleCurrent : 1;

  return program.map((item) => {
    const hasFixedDimensions = Number(item.preferredWidth) >= 1.2 && Number(item.preferredDepth) >= 1.2;
    if (item.kind === "piscina") return item;
    if (hasFixedDimensions) {
      const area = Number(item.preferredWidth) * Number(item.preferredDepth);
      return { ...item, targetArea: Math.round(area * 2) / 2 };
    }
    const minimum = MIN_ROOM_AREAS[item.kind] ?? 5;
    const scaled = Math.max(minimum, item.targetArea * factor);
    return { ...item, targetArea: Math.round(scaled * 2) / 2 };
  });
}

export type ClientProgramValidation = {
  status: "ok" | "warning" | "blocked";
  errors: string[];
  warnings: string[];
  netProgramArea: number;
  estimatedBuiltArea: number;
  desiredArea: number | null;
};

export function validateClientRoomProgram(
  brief: ClientBrief,
  lot?: {
    width: number;
    depth: number;
    setbacks?: { top: number; bottom: number; left: number; right: number };
  },
): ClientProgramValidation {
  const program = Array.isArray(brief.roomProgram) ? brief.roomProgram : [];
  const adjacencyRules = Array.isArray(brief.adjacencyRules) ? brief.adjacencyRules : [];
  const accessValidation = validateClientAccessRules(brief);
  const errors: string[] = [...accessValidation.errors];
  const warnings: string[] = [...accessValidation.warnings];

  if (!program.length) {
    errors.push("Informe pelo menos um ambiente antes de desenvolver o projeto.");
  }

  for (const item of program) {
    if (!item.label.trim()) errors.push("Existe um ambiente sem nome.");
    if (!Number.isFinite(item.quantity) || item.quantity < 1) {
      errors.push(`${item.label || "Ambiente"} precisa ter quantidade mínima de 1.`);
    }
    if (!Number.isFinite(item.targetArea) || item.targetArea < 2.4) {
      errors.push(`${item.label || "Ambiente"} precisa ter uma metragem válida.`);
    }
    const preferredWidth = Number(item.preferredWidth);
    const preferredDepth = Number(item.preferredDepth);
    if (Number.isFinite(preferredWidth) && preferredWidth > 0 && preferredWidth < 1.2) {
      errors.push(`${item.label}: largura desejada muito pequena (${preferredWidth.toFixed(2)} m).`);
    }
    if (Number.isFinite(preferredDepth) && preferredDepth > 0 && preferredDepth < 1.2) {
      errors.push(`${item.label}: profundidade desejada muito pequena (${preferredDepth.toFixed(2)} m).`);
    }
    if (Number.isFinite(preferredWidth) && preferredWidth > 0 && Number.isFinite(preferredDepth) && preferredDepth > 0) {
      const dimensionArea = preferredWidth * preferredDepth;
      if (Math.abs(dimensionArea - item.targetArea) / Math.max(1, item.targetArea) > 0.22) {
        warnings.push(
          `${item.label}: ${preferredWidth.toFixed(2)} × ${preferredDepth.toFixed(2)} m resulta em ${dimensionArea.toFixed(1)} m², diferente da meta de ${item.targetArea.toFixed(1)} m².`,
        );
      }
    }
  }

  const requestIds = new Set(program.map((item) => item.id));
  const relationByPair = new Map<string, Set<ClientAdjacencyRelation>>();
  for (const rule of adjacencyRules) {
    if (!requestIds.has(rule.fromRequestId) || !requestIds.has(rule.toRequestId)) {
      errors.push("Existe uma relação entre ambientes que aponta para um ambiente removido.");
      continue;
    }
    if (rule.fromRequestId === rule.toRequestId) {
      errors.push("Uma relação de proximidade não pode usar o mesmo ambiente nos dois lados.");
      continue;
    }
    const pair = [rule.fromRequestId, rule.toRequestId].sort().join("::");
    const set = relationByPair.get(pair) ?? new Set<ClientAdjacencyRelation>();
    set.add(rule.relation);
    relationByPair.set(pair, set);
  }
  for (const relations of relationByPair.values()) {
    if (relations.has("away") && (relations.has("near") || relations.has("direct"))) {
      errors.push("Há ambientes configurados ao mesmo tempo para ficar próximos/conectados e afastados.");
    }
  }

  const requiredSuites = program
    .filter((item) => item.kind === "suite" && item.required !== false)
    .reduce((sum, item) => sum + item.quantity, 0);
  const suiteBaths = program
    .filter((item) => item.kind === "banheiro" && /su[ií]te|master/i.test(item.label))
    .reduce((sum, item) => sum + item.quantity, 0);
  if (requiredSuites > suiteBaths) {
    errors.push(`O programa tem ${requiredSuites} suíte(s), mas apenas ${suiteBaths} banheiro(s) de suíte.`);
  }

  const nonPoolProgram = program.filter((item) => item.kind !== "piscina");
  const netProgramArea = nonPoolProgram.reduce(
    (sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.targetArea),
    0,
  );
  // Aproximação para paredes, circulação técnica e pequenos ajustes de projeto.
  const estimatedBuiltArea = Math.round(netProgramArea * 1.14);
  const desiredArea = Number.isFinite(Number(brief.desiredAreaTotal))
    ? Number(brief.desiredAreaTotal)
    : null;

  if (desiredArea) {
    if (netProgramArea > desiredArea * 1.02) {
      errors.push(
        `Os ambientes somam cerca de ${Math.round(netProgramArea)} m² úteis, acima da área total desejada de ${Math.round(desiredArea)} m².`,
      );
    } else if (estimatedBuiltArea > desiredArea * 1.12) {
      warnings.push(
        `Com paredes e circulação, o programa tende a chegar perto de ${estimatedBuiltArea} m², acima da meta de ${Math.round(desiredArea)} m².`,
      );
    } else if (estimatedBuiltArea < desiredArea * 0.65) {
      warnings.push(
        `O programa ocupa cerca de ${estimatedBuiltArea} m² estimados; ainda existe bastante área sem destino em relação à meta de ${Math.round(desiredArea)} m².`,
      );
    }
  }

  if (lot) {
    const setbacks = lot.setbacks ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const usableWidth = Math.max(0, lot.width - setbacks.left - setbacks.right);
    const usableDepth = Math.max(0, lot.depth - setbacks.top - setbacks.bottom);
    const grossCapacity = usableWidth * usableDepth * Math.max(1, brief.floors);
    if (desiredArea && desiredArea > grossCapacity * 0.96) {
      errors.push(
        `A meta de ${Math.round(desiredArea)} m² não cabe fisicamente na área disponível do lote considerando os recuos informados.`,
      );
    } else if (estimatedBuiltArea > grossCapacity * 0.9) {
      warnings.push("O programa está muito próximo do limite físico disponível no lote; a implantação pode ficar comprometida.");
    }
  }

  return {
    status: errors.length ? "blocked" : warnings.length ? "warning" : "ok",
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    netProgramArea: Math.round(netProgramArea * 10) / 10,
    estimatedBuiltArea,
    desiredArea,
  };
}

export type ClientBriefPlan = {
  typology: ConceptTypology;
  floors: number;
  suggestedArea: number;
  layoutPreferences: LayoutPreferences;
  rooms: ReturnType<typeof buildTypologyRooms>;
};

export type ClientBriefAlternativeId = "primary" | "compact" | "balanced" | "integrated";

export type ArchitectureDNA = {
  concept?: string;
  spatialStrategy?: string;
  volumeStrategy?: string;
  roofStrategy?: string;
  materialIntent?: string;
  lifestyleIntent?: string;
  siteIntent?: string;
  costIntent?: string;
  futureFlexibilityIntent?: string;
};

export type ProjectBriefSnapshot = {
  version?: 2;
  brief: ClientBrief;
  vision: ClientVision;
  household?: HouseholdContext;
  siteContext?: ProjectSiteContext;
  selectedAlternativeId?: ClientBriefAlternativeId;
  selectedAlternativeTitle?: string;
  clientFitSummary?: string;
  designRationale?: string;
  intervention?: "preservar" | "otimizar" | "valorizar" | "assinatura";
  architectureDNA?: ArchitectureDNA;
  experienceStrategy?: string[];
  daylightStrategy?: string[];
  facadeDirection?: string[];
  selfCritique?: string[];
  briefingCompleteness?: number;
};

export function assessProjectBriefCompleteness(snapshot: Pick<ProjectBriefSnapshot, "brief" | "vision" | "household" | "siteContext">) {
  const { brief, vision, household, siteContext } = snapshot;
  const checks = [
    Boolean(brief.roomProgram?.length),
    Number(brief.desiredAreaTotal) >= 40,
    Boolean(brief.adjacencyRules?.length),
    Boolean(vision.lifestyle),
    Boolean(vision.protagonist),
    Boolean(vision.priorities?.length),
    Boolean(vision.mustHave?.trim() || vision.avoid?.trim()),
    Boolean(vision.futureNeeds?.trim()),
    Boolean(household?.residents && household.residents > 0),
    Boolean(household?.routineNotes?.trim() || household?.workFromHome || household?.hostingFrequency),
    Boolean(siteContext?.northSide && siteContext.northSide !== "nao_informado"),
    Boolean(siteContext?.topography && siteContext.topography !== "nao_informado"),
    Boolean(siteContext?.desiredViews?.trim() || siteContext?.privacyNotes?.trim()),
    Boolean(vision.constructionMethod && vision.constructionMethod !== "nao_definido"),
    Boolean(Number(vision.budgetTarget) > 0 || vision.budgetStrategy),
    Boolean(vision.aestheticReferences?.trim() || vision.preferredMaterials?.trim()),
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

export function buildProjectBriefSnapshot(input: {
  brief: ClientBrief;
  vision: ClientVision;
  household?: HouseholdContext;
  siteContext?: ProjectSiteContext;
  intervention?: ProjectBriefSnapshot["intervention"];
  previous?: ProjectBriefSnapshot | null;
  patch?: Partial<ProjectBriefSnapshot>;
}): ProjectBriefSnapshot {
  const snapshot: ProjectBriefSnapshot = {
    version: 2,
    ...(input.previous ?? {}),
    brief: input.brief,
    vision: input.vision,
    household: input.household,
    siteContext: input.siteContext,
    intervention: input.intervention ?? input.previous?.intervention,
    ...(input.patch ?? {}),
  };
  return {
    ...snapshot,
    briefingCompleteness: assessProjectBriefCompleteness(snapshot),
  };
}

export type ClientBriefAlternative = ClientBriefPlan & {
  id: ClientBriefAlternativeId;
  title: string;
  description: string;
  variant: 0 | 1 | 2;
  architectureScore?: number;
  qualityGateVersion?: 2;
  qualityDimensions?: Partial<Record<
    "program" | "circulation" | "privacy" | "ergonomics" | "geometry" | "constructability" | "furnitureFit" | "architecturalCoherence",
    { score: number; status: "approved" | "warning" | "blocked"; issues: string[] }
  >>;
  hardBlockers?: string[];
  criticReview?: {
    approved: boolean;
    score: number;
    blockingIssues: string[];
    improvements: string[];
    strengths: string[];
    summary: string;
    unavailable?: boolean;
  };
  designRationale?: string;
  qualityIssues?: string[];
  qualityStrengths?: string[];
  clientFitSummary?: string;
  intervention?: "preservar" | "otimizar" | "valorizar" | "assinatura";
  architectureDNA?: ArchitectureDNA;
  experienceStrategy?: string[];
  daylightStrategy?: string[];
  facadeDirection?: string[];
  selfCritique?: string[];
  programCompliance?: {
    desiredAreaTotal?: number | null;
    actualAreaTotal?: number;
    outsideTargetCount?: number;
    rooms?: Array<{
      id: string;
      label: string;
      required?: boolean;
      targetArea: number;
      targetWidth?: number | null;
      targetDepth?: number | null;
      actualWidth?: number;
      actualDepth?: number;
      actualArea: number;
      deviationPct: number;
      status: "ok" | "warning" | "outside_target";
    }>;
    adjacency?: Array<{
      id: string;
      fromLabel: string;
      toLabel: string;
      relation: ClientAdjacencyRelation;
      required: boolean;
      satisfied: boolean;
    }>;
    adjacencySatisfiedCount?: number;
    adjacencyTotalCount?: number;
    access?: Array<{
      id: string;
      fromLabel: string;
      toLabel: string;
      mode: ClientAccessRuleMode;
      required: boolean;
      reason?: string;
      satisfied: boolean;
    }>;
    accessSatisfiedCount?: number;
    accessTotalCount?: number;
    circulation?: {
      connected: boolean;
      unreachableRooms: string[];
    };
    furnitureFit?: {
      status: "approved" | "warning" | "blocked";
      score: number;
      blockers: string[];
      issues: string[];
      items: Array<{
        roomId: string;
        label: string;
        status: "approved" | "warning" | "blocked";
        score: number;
        requiredEnvelope: { width: number; depth: number };
        actual: { width: number; depth: number };
        furniture: string[];
        issues: string[];
      }>;
    } | null;
  };
  projectBrief?: ProjectBriefSnapshot;
};

function nextId(prefix: string, index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${index}-${Date.now()}`;
}

function roomProgramId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildDefaultRoomProgram(brief: Pick<ClientBrief,
  "bedrooms" | "suites" | "floors" | "garageSpaces" | "gourmet" | "pool" | "office"
>): ClientRoomRequest[] {
  const nonSuiteBedrooms = Math.max(0, brief.bedrooms - brief.suites);
  const sleepingFloor = brief.floors === 2 ? "superior" as const : "terreo" as const;
  return [
    { id: roomProgramId("sala"), kind: "sala", label: "Sala de estar + jantar", quantity: 1, targetArea: 28, floorPreference: "terreo", required: true },
    { id: roomProgramId("cozinha"), kind: "cozinha", label: "Cozinha", quantity: 1, targetArea: 14, floorPreference: "terreo", required: true },
    ...(brief.suites > 0 ? [
      { id: roomProgramId("suite"), kind: "suite" as const, label: "Suíte", quantity: brief.suites, targetArea: 16, floorPreference: sleepingFloor, required: true },
      { id: roomProgramId("suite-bath"), kind: "banheiro" as const, label: "Banho suíte", quantity: brief.suites, targetArea: 5, floorPreference: sleepingFloor, required: true },
    ] : []),
    ...(nonSuiteBedrooms > 0 ? [
      { id: roomProgramId("quarto"), kind: "quarto" as const, label: "Quarto", quantity: nonSuiteBedrooms, targetArea: 12, floorPreference: sleepingFloor, required: true },
      { id: roomProgramId("social-bath"), kind: "banheiro" as const, label: "Banheiro social", quantity: 1, targetArea: 4.5, floorPreference: sleepingFloor, required: true },
    ] : []),
    { id: roomProgramId("lavanderia"), kind: "lavanderia", label: "Lavanderia", quantity: 1, targetArea: 6, floorPreference: "terreo", required: true },
    { id: roomProgramId("garagem"), kind: "garagem", label: `Garagem ${brief.garageSpaces} ${brief.garageSpaces === 1 ? "vaga" : "vagas"}`, quantity: 1, targetArea: brief.garageSpaces * 15, floorPreference: "terreo", required: true },
    ...(brief.gourmet ? [
      { id: roomProgramId("gourmet"), kind: "gourmet" as const, label: "Espaço gourmet", quantity: 1, targetArea: 20, floorPreference: "terreo" as const, required: true },
      { id: roomProgramId("lavabo"), kind: "banheiro" as const, label: "Lavabo", quantity: 1, targetArea: 3, floorPreference: "terreo" as const, required: false },
    ] : []),
    ...(brief.office ? [
      { id: roomProgramId("office"), kind: "outro" as const, label: "Escritório", quantity: 1, targetArea: 10, floorPreference: "terreo" as const, required: true },
    ] : []),
    ...(brief.pool ? [
      { id: roomProgramId("pool"), kind: "piscina" as const, label: "Piscina", quantity: 1, targetArea: 18, floorPreference: "terreo" as const, required: true },
    ] : []),
  ];
}

export function buildRecommendedAdjacencyRules(brief: ClientBrief): ClientAdjacencyRule[] {
  const program = Array.isArray(brief.roomProgram) ? brief.roomProgram : [];
  const find = (predicate: (item: ClientRoomRequest) => boolean) => program.find(predicate);
  const living = find((item) => item.kind === "sala");
  const kitchen = find((item) => item.kind === "cozinha");
  const gourmet = find((item) => item.kind === "gourmet");
  const laundry = find((item) => item.kind === "lavanderia");
  const garage = find((item) => item.kind === "garagem");
  const pool = find((item) => item.kind === "piscina");
  const suite = find((item) => item.kind === "suite");
  const suiteBath = find((item) => item.kind === "banheiro" && /su[ií]te|master/i.test(item.label));

  const rules: ClientAdjacencyRule[] = [];
  const add = (
    from: ClientRoomRequest | undefined,
    to: ClientRoomRequest | undefined,
    relation: ClientAdjacencyRelation,
    required: boolean,
  ) => {
    if (!from || !to || from.id === to.id) return;
    const pairExists = rules.some((rule) =>
      (rule.fromRequestId === from.id && rule.toRequestId === to.id)
      || (rule.fromRequestId === to.id && rule.toRequestId === from.id)
    );
    if (pairExists) return;
    rules.push({
      id: roomProgramId("adj"),
      fromRequestId: from.id,
      toRequestId: to.id,
      relation,
      required,
    });
  };

  if (brief.integratedKitchen) add(living, kitchen, "direct", true);
  add(kitchen, gourmet, "near", true);
  add(kitchen, laundry, "near", false);
  add(gourmet, pool, "near", false);
  add(suite, suiteBath, "direct", true);
  if (brief.privateAwaySocial) {
    add(suite, gourmet, "away", true);
    add(suite, garage, "away", true);
  }
  return rules;
}


export function buildRecommendedAccessRules(brief: ClientBrief): ClientAccessRule[] {
  const program = Array.isArray(brief.roomProgram) ? brief.roomProgram : [];
  const rules: ClientAccessRule[] = [];
  const findAll = (predicate: (item: ClientRoomRequest) => boolean) => program.filter(predicate);
  const suites = findAll((item) => item.kind === "suite");
  const suiteBaths = findAll((item) => item.kind === "banheiro" && /su[ií]te|master/i.test(item.label));
  const garages = findAll((item) => item.kind === "garagem");
  const privateRooms = findAll((item) => item.kind === "suite" || item.kind === "quarto");

  const add = (
    from: ClientRoomRequest | undefined,
    to: ClientRoomRequest | undefined,
    mode: ClientAccessRuleMode,
    required: boolean,
    reason: string,
  ) => {
    if (!from || !to || from.id === to.id) return;
    const pair = [from.id, to.id].sort().join("::");
    if (rules.some((rule) => [rule.fromRequestId, rule.toRequestId].sort().join("::") === pair && rule.mode === mode)) return;
    rules.push({
      id: roomProgramId("access"),
      fromRequestId: from.id,
      toRequestId: to.id,
      mode,
      required,
      reason,
    });
  };

  suites.forEach((suite, index) => {
    const numbered = suite.label.match(/\d+/)?.[0];
    const namedBath = numbered
      ? suiteBaths.find((bath) => bath.label.match(/\d+/)?.[0] === numbered)
      : suiteBaths[index] ?? suiteBaths[0];
    add(suite, namedBath, "required_direct", true, "Banheiro de suíte precisa ter acesso direto pela própria suíte.");
  });

  for (const garage of garages) {
    for (const privateRoom of privateRooms) {
      add(garage, privateRoom, "forbidden_direct", true, "Garagem não deve abrir diretamente para quarto ou suíte.");
    }
  }

  return rules;
}

export type FunctionalGraphValidation = {
  status: "ok" | "warning" | "blocked";
  errors: string[];
  warnings: string[];
};

export function validateClientAccessRules(brief: ClientBrief): FunctionalGraphValidation {
  const program = Array.isArray(brief.roomProgram) ? brief.roomProgram : [];
  const rules = Array.isArray(brief.accessRules) ? brief.accessRules : [];
  const ids = new Set(program.map((item) => item.id));
  const errors: string[] = [];
  const warnings: string[] = [];
  const byPair = new Map<string, Set<ClientAccessRuleMode>>();

  for (const rule of rules) {
    if (!ids.has(rule.fromRequestId) || !ids.has(rule.toRequestId)) {
      errors.push("Existe uma regra de acesso apontando para um ambiente removido.");
      continue;
    }
    if (rule.fromRequestId === rule.toRequestId) {
      errors.push("Uma regra de acesso não pode relacionar o ambiente com ele mesmo.");
      continue;
    }
    const pair = [rule.fromRequestId, rule.toRequestId].sort().join("::");
    const modes = byPair.get(pair) ?? new Set<ClientAccessRuleMode>();
    modes.add(rule.mode);
    byPair.set(pair, modes);
  }

  for (const modes of byPair.values()) {
    if (modes.has("required_direct") && modes.has("forbidden_direct")) {
      errors.push("O mesmo par de ambientes está configurado simultaneamente com acesso direto obrigatório e proibido.");
    }
  }

  const suites = program.filter((item) => item.kind === "suite" && item.required !== false);
  const suiteBaths = program.filter((item) => item.kind === "banheiro" && /su[ií]te|master/i.test(item.label));
  if (suites.length && !suiteBaths.length) {
    errors.push("Há suíte sem banheiro privativo correspondente no programa.");
  }
  if (rules.length === 0 && program.length > 1) {
    warnings.push("O grafo de acessos ainda não foi definido; aplique as regras recomendadas para validar portas e circulação.");
  }

  return {
    status: errors.length ? "blocked" : warnings.length ? "warning" : "ok",
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

function roomDimensionsForArea(
  kind: ClientRoomRequestKind,
  area: number,
  preferredWidth?: number,
  preferredDepth?: number,
) {
  const safeArea = Math.max(kind === "banheiro" ? 2.4 : 4, Math.min(kind === "garagem" ? 90 : 70, area));
  const requestedWidth = Number(preferredWidth);
  const requestedDepth = Number(preferredDepth);
  if (Number.isFinite(requestedWidth) && requestedWidth >= 1.2 && Number.isFinite(requestedDepth) && requestedDepth >= 1.2) {
    return {
      width: Math.round(requestedWidth * 100) / 100,
      depth: Math.round(requestedDepth * 100) / 100,
    };
  }
  const preferredWidthByKind: Partial<Record<ClientRoomRequestKind, number>> = {
    banheiro: 2.0,
    lavanderia: 2.4,
    cozinha: 3.4,
    sala: 4.6,
    suite: 3.8,
    quarto: 3.2,
    garagem: 5.5,
    gourmet: 4.5,
    piscina: 6,
    outro: 3.2,
  };
  let width = Math.min(preferredWidthByKind[kind] ?? Math.sqrt(safeArea), Math.max(1.5, safeArea / 1.8));
  let depth = safeArea / width;
  if (depth < 1.5) {
    depth = 1.5;
    width = safeArea / depth;
  }
  return {
    width: Math.round(width * 20) / 20,
    depth: Math.round(depth * 20) / 20,
  };
}

function expandRoomProgram(brief: ClientBrief) {
  const program = Array.isArray(brief.roomProgram) && brief.roomProgram.length
    ? brief.roomProgram
    : buildDefaultRoomProgram(brief);

  return program.flatMap((request, requestIndex) => {
    const quantity = Math.max(0, Math.min(8, Math.round(Number(request.quantity) || 0)));
    if (!quantity) return [];
    return Array.from({ length: quantity }, (_, index) => {
      const dims = roomDimensionsForArea(
        request.kind,
        Number(request.targetArea) || 8,
        request.preferredWidth,
        request.preferredDepth,
      );
      const numbered = quantity > 1;
      const floorFlexible = request.floorPreference === "qualquer" && brief.floors > 1;
      const privateKind = request.kind === "suite" || request.kind === "quarto"
        || (request.kind === "banheiro" && /su[ií]te|banheiro social|master/i.test(request.label));
      const floor = request.floorPreference === "superior" && brief.floors > 1
        ? 1
        : floorFlexible && privateKind
          ? 1
          : 0;
      return {
        id: nextId(`program-${request.kind}`, requestIndex * 10 + index),
        kind: request.kind,
        label: numbered ? `${request.label} ${index + 1}` : request.label,
        width: dims.width,
        depth: dims.depth,
        floor,
        x: 0,
        y: 0,
        targetArea: Math.round((Number(request.targetArea) || dims.width * dims.depth) * 100) / 100,
        targetWidth: Number.isFinite(Number(request.preferredWidth)) ? Number(request.preferredWidth) : undefined,
        targetDepth: Number.isFinite(Number(request.preferredDepth)) ? Number(request.preferredDepth) : undefined,
        programNotes: request.notes?.trim() || undefined,
        required: request.required !== false,
        programRequestId: request.id,
        floorFlexible,
      };
    });
  });
}

function chooseBaseTypology(brief: ClientBrief): ConceptTypology {
  if (brief.floors === 2) {
    return brief.pool || brief.suites >= 2 || brief.bedrooms >= 4
      ? "sobrado_master"
      : "sobrado_3q";
  }
  if (brief.pool || brief.gourmet) return "terrea_lazer";
  if (brief.bedrooms <= 2) return "terrea_2q";
  return "terrea_3q";
}

function calculateSuggestedArea(rooms: ClientBriefPlan["rooms"]) {
  const roomArea = rooms
    .filter((room) => room.kind !== "piscina")
    .reduce((sum, room) => sum + room.width * room.depth, 0);
  return Math.max(80, Math.round((roomArea * 1.12) / 5) * 5);
}

export function buildClientBriefPlan(brief: ClientBrief): ClientBriefPlan {
  const typology = chooseBaseTypology(brief);
  let rooms = buildTypologyRooms(typology);

  const sleepingFloor = brief.floors === 2 ? 1 : 0;
  const sleepingRooms = rooms
    .filter((room) => room.kind === "suite" || room.kind === "quarto")
    .slice(0, brief.bedrooms);

  while (sleepingRooms.length < brief.bedrooms) {
    const index = sleepingRooms.length;
    sleepingRooms.push({
      id: nextId("client-bedroom", index),
      kind: "quarto",
      label: `Quarto ${index + 1}`,
      width: 3.2,
      depth: 3,
      floor: sleepingFloor,
      x: 0,
      y: 0,
    });
  }

  const requestedSuites = Math.min(brief.suites, brief.bedrooms);
  let quartoIndex = 1;
  let suiteIndex = 1;
  const normalizedSleepingRooms = sleepingRooms.map((room, index) => {
    const suite = index < requestedSuites;
    return {
      ...room,
      kind: suite ? "suite" as const : "quarto" as const,
      floor: sleepingFloor,
      label: suite
        ? requestedSuites > 1 ? `Suíte ${suiteIndex++}` : "Suíte"
        : `Quarto ${quartoIndex++}`,
      width: suite ? Math.max(room.width, 3.8) : Math.max(room.width, 3.1),
      depth: suite ? Math.max(room.depth, 3.4) : Math.max(room.depth, 3),
    };
  });

  rooms = [
    ...rooms.filter((room) => room.kind !== "suite" && room.kind !== "quarto"),
    ...normalizedSleepingRooms,
  ];

  // O programa precisa representar a suíte de verdade: dormitório + banheiro próprio.
  // Antes o briefing podia pedir 2 suítes e manter apenas 1 banho de suíte do template,
  // tornando impossível para a IA gerar uma planta arquitetonicamente correta.
  const existingSuiteBaths = rooms.filter(
    (room) => room.kind === "banheiro" && /su[ií]te|master/i.test(room.label),
  );
  if (existingSuiteBaths.length > requestedSuites) {
    const keepIds = new Set(existingSuiteBaths.slice(0, requestedSuites).map((room) => room.id));
    rooms = rooms.filter(
      (room) => room.kind !== "banheiro" || !/su[ií]te|master/i.test(room.label) || keepIds.has(room.id),
    );
  }
  const currentSuiteBaths = rooms.filter(
    (room) => room.kind === "banheiro" && /su[ií]te|master/i.test(room.label),
  );
  for (let index = currentSuiteBaths.length; index < requestedSuites; index += 1) {
    rooms.push({
      id: nextId("client-suite-bath", rooms.length + index),
      kind: "banheiro",
      label: requestedSuites > 1 ? `Banho suíte ${index + 1}` : "Banho suíte",
      width: 1.8,
      depth: 2.4,
      floor: sleepingFloor,
      x: 0,
      y: 0,
    });
  }

  const garageWidth = brief.garageSpaces === 1 ? 3.2 : brief.garageSpaces === 2 ? 5.8 : 8.4;
  const garage = rooms.find((room) => room.kind === "garagem");
  if (garage) {
    garage.width = garageWidth;
    garage.depth = 5.5;
    garage.label = `Garagem ${brief.garageSpaces} ${brief.garageSpaces === 1 ? "vaga" : "vagas"}`;
  }

  if (!brief.gourmet) {
    rooms = rooms.filter((room) => room.kind !== "gourmet");
  } else if (!rooms.some((room) => room.kind === "gourmet")) {
    rooms.push({
      id: nextId("client-gourmet", rooms.length),
      kind: "gourmet",
      label: "Espaço gourmet",
      width: 4.8,
      depth: 3.8,
      floor: 0,
      x: 0,
      y: 0,
    });
  }

  if (!brief.pool) {
    rooms = rooms.filter((room) => room.kind !== "piscina");
  } else if (!rooms.some((room) => room.kind === "piscina")) {
    rooms.push({
      id: nextId("client-pool", rooms.length),
      kind: "piscina",
      label: "Piscina",
      width: 6,
      depth: 3,
      floor: 0,
      x: 0,
      y: 0,
    });
  }

  if (brief.office && !rooms.some((room) => room.kind === "outro" && /escritório/i.test(room.label))) {
    rooms.push({
      id: nextId("client-office", rooms.length),
      kind: "outro",
      label: "Escritório",
      width: 3,
      depth: 3,
      floor: 0,
      x: 0,
      y: 0,
    });
  }

  // O programa de necessidades preenchido pelo cliente é autoritativo.
  // Circulação e escadas são geradas pelo sistema; os demais ambientes vêm do briefing,
  // com quantidade e área-alvo explícitas em vez de serem adivinhados pelo template.
  if (Array.isArray(brief.roomProgram) && brief.roomProgram.length) {
    const systemRooms = rooms.filter((room) => room.kind === "circulacao" || room.kind === "escada");
    const requestedRooms = expandRoomProgram(brief);
    rooms = [...systemRooms, ...requestedRooms];
  }

  const layoutPreferences: LayoutPreferences = {
    ...DEFAULT_LAYOUT_PREFERENCES,
    kitchenNearGourmet: brief.gourmet,
    gourmetNearPool: brief.gourmet && brief.pool,
    livingIntegratedKitchen: brief.integratedKitchen,
    privateAwaySocial: brief.privateAwaySocial,
  };

  const requestedTotal = Number(brief.desiredAreaTotal);
  const suggestedArea = Number.isFinite(requestedTotal) && requestedTotal >= 40
    ? Math.round(requestedTotal)
    : calculateSuggestedArea(rooms);

  return {
    typology,
    floors: brief.floors,
    suggestedArea,
    layoutPreferences,
    rooms,
  };
}

function resizeRoomsForAlternative(
  rooms: ClientBriefPlan["rooms"],
  profile: ClientBriefAlternativeId,
  lotWidth: number,
  lotDepth: number,
) {
  const maxWidth = Math.max(2.4, lotWidth - 1.2);
  const maxDepth = Math.max(2.4, lotDepth - 1.2);

  return rooms.map((room) => {
    let widthFactor = 1;
    let depthFactor = 1;

    if (profile === "compact") {
      if (["sala", "cozinha", "gourmet", "outro"].includes(room.kind)) {
        widthFactor = 0.9;
        depthFactor = 0.92;
      }
    }

    if (profile === "integrated") {
      if (["sala", "cozinha", "gourmet"].includes(room.kind)) {
        widthFactor = 1.08;
        depthFactor = 1.06;
      }
      if (room.kind === "suite") {
        widthFactor = 1.03;
        depthFactor = 1.03;
      }
    }

    return {
      ...room,
      width: Math.max(1.8, Math.min(maxWidth, Math.round(room.width * widthFactor * 20) / 20)),
      depth: Math.max(1.5, Math.min(maxDepth, Math.round(room.depth * depthFactor * 20) / 20)),
      x: 0,
      y: 0,
    };
  });
}

export function buildClientBriefAlternativesAuto(
  brief: ClientBrief,
  lotWidth: number,
  lotDepth: number,
): ClientBriefAlternative[] {
  const base = buildClientBriefPlan(brief);

  const profiles: Array<{
    id: ClientBriefAlternativeId;
    title: string;
    description: string;
    variant: 0 | 1 | 2;
    preferences: Partial<LayoutPreferences>;
  }> = [
    {
      id: "compact",
      title: "Opção A · Compacta",
      description: "Reduz circulação e aproxima os ambientes para aproveitar melhor a área.",
      variant: 0,
      preferences: {
        livingIntegratedKitchen: true,
        privateAwaySocial: brief.privateAwaySocial,
      },
    },
    {
      id: "balanced",
      title: "Opção B · Equilibrada",
      description: "Distribuição intermediária, equilibrando privacidade, circulação e área social.",
      variant: 1,
      preferences: {},
    },
    {
      id: "integrated",
      title: "Opção C · Mais integrada",
      description: "Valoriza sala, cozinha e lazer conectados, com área social mais generosa.",
      variant: 2,
      preferences: {
        livingIntegratedKitchen: true,
        kitchenNearGourmet: brief.gourmet,
        gourmetNearPool: brief.gourmet && brief.pool,
      },
    },
  ];

  return profiles.map((profile) => {
    const layoutPreferences: LayoutPreferences = {
      ...base.layoutPreferences,
      ...profile.preferences,
    };

    let rooms = resizeRoomsForAlternative(
      base.rooms.map((room) => ({ ...room })),
      profile.id,
      lotWidth,
      lotDepth,
    );

    for (let floor = 0; floor < base.floors; floor += 1) {
      rooms = generateTypologyLayout(
        rooms,
        lotWidth,
        lotDepth,
        floor,
        base.typology,
        profile.variant,
        layoutPreferences,
      );
    }

    return {
      ...base,
      id: profile.id,
      title: profile.title,
      description: profile.description,
      variant: profile.variant,
      layoutPreferences,
      suggestedArea: calculateSuggestedArea(rooms),
      rooms,
    };
  });
}


// ── Plantas pelas Necessidades a partir dos modelos desenhados ─────────────────────────
// O encaixe automático (buildClientBriefAlternativesAuto) empilhava cômodos soltos, fora do
// lote e sobrepostos (ex.: 24 erros). Agora as opções são os modelos desenhados que mais se
// aproximam do briefing e cabem no terreno: sempre sem erros.

type BriefPlacement = {
  frontSide: "top" | "bottom" | "left" | "right";
  setbacks: { top: number; bottom: number; left: number; right: number };
};

const DEFAULT_PLACEMENT: BriefPlacement = {
  frontSide: "top",
  setbacks: { top: 4, bottom: 3, left: 1.5, right: 1.5 },
};

function templateFeatures(template: (typeof CONCEPT_TYPOLOGIES)[number]) {
  const rooms = template.rooms;
  const garage = rooms.find((room) => room.kind === "garagem");
  const spaces = garage ? Number((garage.label.match(/(\d)\s*vaga/i) ?? [])[1] ?? (garage.width >= 7.5 ? 3 : garage.width >= 5 ? 2 : 1)) : 0;
  return {
    floors: template.floors,
    bedrooms: rooms.filter((room) => room.kind === "suite" || room.kind === "quarto").length,
    suites: rooms.filter((room) => room.kind === "suite").length,
    garage: spaces,
    gourmet: rooms.some((room) => room.kind === "gourmet"),
    pool: rooms.some((room) => room.kind === "piscina"),
    office: rooms.some((room) => /office|escrit/i.test(room.label)),
  };
}

function briefDifferences(brief: ClientBrief, features: ReturnType<typeof templateFeatures>) {
  const notes: string[] = [];
  if (features.bedrooms !== brief.bedrooms) notes.push(`${features.bedrooms} dormitórios (pedido: ${brief.bedrooms})`);
  if (features.suites !== Math.min(brief.suites, brief.bedrooms)) notes.push(`${features.suites} ${features.suites === 1 ? "suíte" : "suítes"} (pedido: ${brief.suites})`);
  if (features.garage && features.garage !== brief.garageSpaces) notes.push(`${features.garage} ${features.garage === 1 ? "vaga" : "vagas"} (pedido: ${brief.garageSpaces})`);
  if (brief.gourmet && !features.gourmet) notes.push("sem gourmet");
  if (brief.pool && !features.pool) notes.push("sem piscina");
  if (brief.office && !features.office) notes.push("sem escritório");
  return notes;
}

export function buildClientBriefAlternatives(
  brief: ClientBrief,
  lotWidth: number,
  lotDepth: number,
  placement: BriefPlacement = DEFAULT_PLACEMENT,
): ClientBriefAlternative[] {
  const ids: ClientBriefAlternativeId[] = ["compact", "balanced", "integrated"];
  const letters = ["A", "B", "C"];
  const scored = CONCEPT_TYPOLOGIES.flatMap((template) => {
    const rooms = buildTypologyPlan(template.id, lotWidth, lotDepth, placement.frontSide, placement.setbacks);
    if (!rooms || template.minLotWidth > lotWidth + 0.01) return [];
    const errors = Array.from({ length: template.floors }, (_, floor) =>
      validateConceptLayout(rooms as never, lotWidth, lotDepth, floor, { frontSide: placement.frontSide, setbackFront: 0 })
        .filter((issue) => issue.severity === "error").length,
    ).reduce((sum, count) => sum + count, 0);
    if (errors > 0) return [];
    const features = templateFeatures(template);
    const score =
      Math.abs(features.floors - brief.floors) * 12
      + Math.abs(features.bedrooms - brief.bedrooms) * 4
      + Math.abs(features.suites - Math.min(brief.suites, brief.bedrooms)) * 2
      + (features.garage ? Math.abs(features.garage - brief.garageSpaces) : brief.garageSpaces) * 1.5
      + (brief.gourmet !== features.gourmet ? 2 : 0)
      + (brief.pool !== features.pool ? 3 : 0)
      + (brief.office !== features.office ? 1 : 0);
    return [{ template, rooms, features, score }];
  }).sort((a, b) => a.score - b.score).slice(0, 3);

  return scored.map(({ template, rooms, features }, index) => {
    const differences = briefDifferences(brief, features);
    return {
      id: ids[index],
      title: `Opção ${letters[index]} · ${template.title}`,
      description: differences.length
        ? `${template.subtitle}. Diferenças do pedido: ${differences.join(", ")}.`
        : `${template.subtitle}. Atende ao briefing.`,
      variant: index as 0 | 1 | 2,
      typology: template.id,
      floors: template.floors,
      suggestedArea: template.suggestedArea,
      layoutPreferences: { ...DEFAULT_LAYOUT_PREFERENCES },
      rooms: rooms as ClientBriefPlan["rooms"],
    };
  });
}

/** Conta erros de planta em uma alternativa (usado para descartar plantas inválidas da IA). */
export function countBriefAlternativeErrors(rooms: ClientBriefPlan["rooms"], floors: number, lotWidth: number, lotDepth: number) {
  let errors = 0;
  for (let floor = 0; floor < Math.max(1, floors); floor += 1) {
    errors += validateConceptLayout(rooms as never, lotWidth, lotDepth, floor).filter((issue) => issue.severity === "error").length;
  }
  return errors;
}
