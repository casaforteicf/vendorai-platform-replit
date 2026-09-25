import {
  DEFAULT_LAYOUT_PREFERENCES,
  buildTypologyRooms,
  type ConceptTypology,
  type LayoutPreferences,
} from "./conceptTemplates";
import { generateTypologyLayout } from "./conceptTypologyLayout";

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
};

export type ClientVision = {
  lifestyle: "familia" | "receber" | "tranquilidade" | "praticidade" | "misto";
  protagonist: "social" | "cozinha" | "gourmet" | "suite" | "jardim";
  priorities: Array<"luz_natural" | "privacidade" | "integracao" | "natureza" | "armazenamento" | "flexibilidade">;
  budgetStrategy: "otimizar" | "equilibrar" | "priorizar_experiencia";
  futureNeeds: string;
  mustHave: string;
  avoid: string;
};

export type ClientBriefPlan = {
  typology: ConceptTypology;
  floors: number;
  suggestedArea: number;
  layoutPreferences: LayoutPreferences;
  rooms: ReturnType<typeof buildTypologyRooms>;
};

export type ClientBriefAlternativeId = "compact" | "balanced" | "integrated";

export type ClientBriefAlternative = ClientBriefPlan & {
  id: ClientBriefAlternativeId;
  title: string;
  description: string;
  variant: 0 | 1 | 2;
  architectureScore?: number;
  designRationale?: string;
  qualityIssues?: string[];
  qualityStrengths?: string[];
  clientFitSummary?: string;
};

function nextId(prefix: string, index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${index}-${Date.now()}`;
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

  const layoutPreferences: LayoutPreferences = {
    ...DEFAULT_LAYOUT_PREFERENCES,
    kitchenNearGourmet: brief.gourmet,
    gourmetNearPool: brief.gourmet && brief.pool,
    livingIntegratedKitchen: brief.integratedKitchen,
    privateAwaySocial: brief.privateAwaySocial,
  };

  return {
    typology,
    floors: brief.floors,
    suggestedArea: calculateSuggestedArea(rooms),
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

export function buildClientBriefAlternatives(
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
