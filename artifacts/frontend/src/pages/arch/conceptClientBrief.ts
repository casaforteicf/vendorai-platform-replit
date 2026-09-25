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
