import {
  DEFAULT_LAYOUT_PREFERENCES,
  buildTypologyRooms,
  type ConceptTypology,
  type LayoutPreferences,
} from "./conceptTemplates";

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

  const roomArea = rooms
    .filter((room) => room.kind !== "piscina")
    .reduce((sum, room) => sum + room.width * room.depth, 0);
  const suggestedArea = Math.max(80, Math.round((roomArea * 1.12) / 5) * 5);

  return {
    typology,
    floors: brief.floors,
    suggestedArea,
    layoutPreferences,
    rooms,
  };
}
