import { buildConceptGeometry, type ConceptRoomShape, type OpeningMarker } from "./conceptGeometry";

export type SolarSide = "north" | "south" | "east" | "west";
export type LotSide = "top" | "bottom" | "left" | "right";

export type DaylightVentilationIssue = {
  id: string;
  severity: "warning" | "error";
  roomId?: string;
  message: string;
};

export type DaylightVentilationRoomResult = {
  roomId: string;
  daylightRatio: number;
  exteriorOpeningSides: LotSide[];
  crossVentilation: boolean;
  solarExposure?: SolarSide[];
  score: number;
};

export type DaylightVentilationResult = {
  score: number;
  issues: DaylightVentilationIssue[];
  rooms: DaylightVentilationRoomResult[];
  solarAnalysis: "available" | "insufficient_data";
};

type ClimateInput = {
  frontSide?: LotSide;
  northSide?: LotSide | null;
};

const HABITABLE = new Set(["sala", "quarto", "suite", "cozinha", "gourmet", "outro"]);
const PRIVATE = new Set(["quarto", "suite", "banheiro"]);

function openingSide(opening: OpeningMarker, room: ConceptRoomShape): LotSide | null {
  const eps = 0.08;
  if (opening.orientation === "horizontal") {
    if (Math.abs(opening.y - room.y) <= eps) return "top";
    if (Math.abs(opening.y - (room.y + room.depth)) <= eps) return "bottom";
  } else {
    if (Math.abs(opening.x - room.x) <= eps) return "left";
    if (Math.abs(opening.x - (room.x + room.width)) <= eps) return "right";
  }
  return null;
}

function opposite(side: LotSide) {
  return ({ top: "bottom", bottom: "top", left: "right", right: "left" } as const)[side];
}

function solarMap(northSide: LotSide | null | undefined): Partial<Record<LotSide, SolarSide>> {
  if (!northSide) return {};
  const clockwise: LotSide[] = ["top", "right", "bottom", "left"];
  const idx = clockwise.indexOf(northSide);
  if (idx < 0) return {};
  return {
    [clockwise[idx]]: "north",
    [clockwise[(idx + 1) % 4]]: "east",
    [clockwise[(idx + 2) % 4]]: "south",
    [clockwise[(idx + 3) % 4]]: "west",
  };
}

function privacyRisk(side: LotSide, room: ConceptRoomShape, lotWidth: number, lotDepth: number) {
  const boundaryDistance = side === "top" ? room.y
    : side === "bottom" ? lotDepth - (room.y + room.depth)
      : side === "left" ? room.x
        : lotWidth - (room.x + room.width);
  return boundaryDistance < 1.5;
}

function evaluateRoom(
  room: ConceptRoomShape,
  windows: OpeningMarker[],
  lotWidth: number,
  lotDepth: number,
  northSide?: LotSide | null,
): DaylightVentilationRoomResult & { issues: DaylightVentilationIssue[] } {
  const issues: DaylightVentilationIssue[] = [];
  const roomWindows = windows.filter((opening) => opening.roomId === room.id && opening.type === "window");
  const area = Math.max(0.1, room.width * room.depth);
  const openingArea = roomWindows.reduce((sum, opening) =>
    sum + Math.max(0, opening.width ?? 0) * Math.max(0, opening.height ?? 0), 0);
  const daylightRatio = openingArea / area;
  const sides = [...new Set(roomWindows.map((opening) => openingSide(opening, room)).filter(Boolean))] as LotSide[];

  const crossVentilation = sides.some((side) => sides.includes(opposite(side)))
    || (sides.includes("top") || sides.includes("bottom")) && (sides.includes("left") || sides.includes("right"));

  let score = 100;

  if (HABITABLE.has(room.kind)) {
    if (!roomWindows.length) {
      score -= 45;
      issues.push({
        id: `daylight-no-window-${room.id}`,
        severity: "error",
        roomId: room.id,
        message: `${room.label} não possui janela externa para iluminação/ventilação natural.`,
      });
    } else if (daylightRatio < 0.08) {
      score -= 22;
      issues.push({
        id: `daylight-low-ratio-${room.id}`,
        severity: daylightRatio < 0.05 ? "error" : "warning",
        roomId: room.id,
        message: `${room.label} tem relação preliminar de área de abertura baixa (${(daylightRatio * 100).toFixed(1)}% da área do ambiente).`,
      });
    }

    if (["sala", "suite", "quarto", "cozinha"].includes(room.kind) && roomWindows.length && !crossVentilation) {
      score -= 10;
      issues.push({
        id: `ventilation-single-side-${room.id}`,
        severity: "warning",
        roomId: room.id,
        message: `${room.label} possui ventilação por uma única orientação; avalie possibilidade de ventilação cruzada.`,
      });
    }
  }

  for (const side of sides) {
    if (PRIVATE.has(room.kind) && privacyRisk(side, room, lotWidth, lotDepth)) {
      score -= 8;
      issues.push({
        id: `privacy-window-boundary-${room.id}-${side}`,
        severity: "warning",
        roomId: room.id,
        message: `${room.label} possui abertura muito próxima da divisa; revisar privacidade e exigências locais.`,
      });
    }
  }

  const directions = solarMap(northSide);
  const solarExposure = northSide
    ? sides.map((side) => directions[side]).filter(Boolean) as SolarSide[]
    : undefined;

  if (solarExposure?.includes("west") && ["quarto", "suite"].includes(room.kind)) {
    score -= 8;
    issues.push({
      id: `solar-west-private-${room.id}`,
      severity: "warning",
      roomId: room.id,
      message: `${room.label} recebe abertura para oeste; considerar sombreamento para reduzir ganho térmico no período da tarde.`,
    });
  }

  if (northSide && HABITABLE.has(room.kind) && roomWindows.length && solarExposure?.length === 0) {
    score -= 6;
    issues.push({
      id: `solar-unresolved-${room.id}`,
      severity: "warning",
      roomId: room.id,
      message: `Não foi possível determinar a orientação solar das aberturas de ${room.label}.`,
    });
  }

  return {
    roomId: room.id,
    daylightRatio,
    exteriorOpeningSides: sides,
    crossVentilation,
    solarExposure,
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues,
  };
}

export function evaluateDaylightVentilationSolar(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  input: ClimateInput = {},
): DaylightVentilationResult {
  const results: DaylightVentilationRoomResult[] = [];
  const issues: DaylightVentilationIssue[] = [];
  const floors = [...new Set(rooms.map((room) => room.floor))];

  for (const floor of floors) {
    const geometry = buildConceptGeometry(
      rooms,
      lotWidth,
      lotDepth,
      floor,
      input.frontSide ?? "top",
    );
    const windows = geometry.openings.filter((opening) => opening.type === "window");
    for (const room of rooms.filter((candidate) => candidate.floor === floor && candidate.kind !== "piscina")) {
      const evaluated = evaluateRoom(room, windows, lotWidth, lotDepth, input.northSide);
      results.push({
        roomId: evaluated.roomId,
        daylightRatio: evaluated.daylightRatio,
        exteriorOpeningSides: evaluated.exteriorOpeningSides,
        crossVentilation: evaluated.crossVentilation,
        solarExposure: evaluated.solarExposure,
        score: evaluated.score,
      });
      issues.push(...evaluated.issues);
    }
  }

  if (!input.northSide) {
    issues.push({
      id: "solar-insufficient-orientation",
      severity: "warning",
      message: "Orientação norte não informada: análise solar permanece preliminar e não influencia bloqueio técnico.",
    });
  }

  const relevant = results.filter((result) => {
    const room = rooms.find((candidate) => candidate.id === result.roomId);
    return room && HABITABLE.has(room.kind);
  });
  const score = relevant.length
    ? Math.round(relevant.reduce((sum, room) => sum + room.score, 0) / relevant.length)
    : 100;

  return {
    score,
    issues: [...new Map(issues.map((issue) => [issue.id, issue])).values()],
    rooms: results,
    solarAnalysis: input.northSide ? "available" : "insufficient_data",
  };
}
