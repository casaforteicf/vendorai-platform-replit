import { validateConceptLayout, type ConceptRoomShape, type OpeningMarker } from "./conceptGeometry";
import { normalizeOpeningParameters } from "./conceptOpenings";
import { conceptObjectCorners, type ConceptObject } from "./conceptObjects";
import { normalizeStairParameters, stairFootprintMetrics } from "./conceptStairs";
import type { ClosedSpaceCell } from "./conceptWallNetwork";

export type ArchitecturalValidationCategory =
  | "geometry"
  | "dimension"
  | "circulation"
  | "opening"
  | "stair"
  | "object";

export type ArchitecturalValidationEntity =
  | "room"
  | "space"
  | "opening"
  | "stair"
  | "object";

export type ArchitecturalIssue = {
  id: string;
  severity: "error" | "warning";
  category: ArchitecturalValidationCategory;
  entityType?: ArchitecturalValidationEntity;
  entityId?: string;
  message: string;
  recommendation?: string;
  x?: number;
  y?: number;
};

export type ValidationSpace = {
  id: string;
  label?: string;
  kind?: string;
  area: number;
  centroid: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
  cells: ClosedSpaceCell[];
};

export type ValidationWall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
};

export type ArchitecturalValidationInput = {
  rooms: ConceptRoomShape[];
  walls: ValidationWall[];
  lotWidth: number;
  lotDepth: number;
  floor: number;
  floors: number;
  wallFirstActive: boolean;
  wallCount: number;
  spaces: ValidationSpace[];
  openings: OpeningMarker[];
  objects: ConceptObject[];
};

type Point = { x: number; y: number };

const EPS = 0.04;
const COLLISION_EPS = 0.03;

const REFERENCE_DIMENSIONS: Record<string, { minArea?: number; minWidth?: number; label: string }> = {
  sala: { minArea: 7, minWidth: 2.4, label: "Sala" },
  cozinha: { minArea: 4, minWidth: 1.8, label: "Cozinha" },
  suite: { minArea: 9, minWidth: 2.5, label: "Suíte" },
  quarto: { minArea: 7.5, minWidth: 2.4, label: "Quarto" },
  banheiro: { minArea: 1.8, minWidth: 1.1, label: "Banheiro" },
  lavanderia: { minArea: 1.8, minWidth: 1.2, label: "Lavanderia" },
  garagem: { minArea: 12, minWidth: 2.4, label: "Garagem" },
  gourmet: { minArea: 6, minWidth: 2.2, label: "Gourmet" },
  circulacao: { minWidth: 0.9, label: "Circulação" },
};

const WINDOW_REFERENCE_KINDS = new Set(["sala", "cozinha", "suite", "quarto", "gourmet"]);
const DOOR_REFERENCE_KINDS = new Set(["suite", "quarto", "banheiro", "lavanderia"]);

function pointInRect(point: Point, rect: { x: number; y: number; width: number; height: number }, tolerance = EPS) {
  return point.x >= rect.x - tolerance &&
    point.x <= rect.x + rect.width + tolerance &&
    point.y >= rect.y - tolerance &&
    point.y <= rect.y + rect.height + tolerance;
}

function pointInCells(point: Point, cells: ClosedSpaceCell[]) {
  return cells.some((cell) => pointInRect(point, cell));
}

function roomCenter(room: ConceptRoomShape) {
  return { x: room.x + room.width / 2, y: room.y + room.depth / 2 };
}

function roomContainsPoint(room: ConceptRoomShape, point: Point) {
  return pointInRect(point, { x: room.x, y: room.y, width: room.width, height: room.depth }, 0.06);
}

function openingTouchesRectBoundary(
  opening: OpeningMarker,
  rect: { x: number; y: number; width: number; height: number },
  tolerance = 0.08,
) {
  const withinX = opening.x >= rect.x - tolerance && opening.x <= rect.x + rect.width + tolerance;
  const withinY = opening.y >= rect.y - tolerance && opening.y <= rect.y + rect.height + tolerance;
  const onHorizontal = withinX &&
    (Math.abs(opening.y - rect.y) <= tolerance || Math.abs(opening.y - (rect.y + rect.height)) <= tolerance);
  const onVertical = withinY &&
    (Math.abs(opening.x - rect.x) <= tolerance || Math.abs(opening.x - (rect.x + rect.width)) <= tolerance);
  return onHorizontal || onVertical;
}

function openingTouchesSpace(opening: OpeningMarker, space: ValidationSpace) {
  return space.cells.some((cell) => openingTouchesRectBoundary(opening, {
    x: cell.x,
    y: cell.y,
    width: cell.width,
    height: cell.height,
  }));
}

function polygonAxes(points: Point[]) {
  const axes: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(edge.x, edge.y);
    if (length <= 0.0001) continue;
    axes.push({ x: -edge.y / length, y: edge.x / length });
  }
  return axes;
}

function projection(points: Point[], axis: Point) {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

function polygonsOverlap(a: Point[], b: Point[], tolerance = COLLISION_EPS) {
  for (const axis of [...polygonAxes(a), ...polygonAxes(b)]) {
    const pa = projection(a, axis);
    const pb = projection(b, axis);
    if (pa.max <= pb.min + tolerance || pb.max <= pa.min + tolerance) return false;
  }
  return true;
}

function rectPolygon(rect: { x: number; y: number; width: number; height: number }): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function wallPolygon(wall: ValidationWall): Point[] | null {
  const thickness = Math.max(0.08, wall.thickness ?? 0.15);
  const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
  const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
  if (horizontal) {
    return rectPolygon({
      x: Math.min(wall.x1, wall.x2),
      y: wall.y1 - thickness / 2,
      width: Math.abs(wall.x2 - wall.x1),
      height: thickness,
    });
  }
  if (vertical) {
    return rectPolygon({
      x: wall.x1 - thickness / 2,
      y: Math.min(wall.y1, wall.y2),
      width: thickness,
      height: Math.abs(wall.y2 - wall.y1),
    });
  }
  return null;
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function openingClearancePolygon(opening: OpeningMarker) {
  const params = normalizeOpeningParameters(opening.type, opening);
  const clearance = opening.type === "door" ? 0.8 : 0.35;
  return opening.orientation === "horizontal"
    ? rectPolygon({
        x: opening.x - params.width / 2,
        y: opening.y - clearance,
        width: params.width,
        height: clearance * 2,
      })
    : rectPolygon({
        x: opening.x - clearance,
        y: opening.y - params.width / 2,
        width: clearance * 2,
        height: params.width,
      });
}

function openingRange(opening: OpeningMarker) {
  const params = normalizeOpeningParameters(opening.type, opening);
  const center = opening.orientation === "horizontal" ? opening.x : opening.y;
  return { min: center - params.width / 2, max: center + params.width / 2 };
}

function openingsShareWall(a: OpeningMarker, b: OpeningMarker) {
  if (a.orientation !== b.orientation) return false;
  if (a.wallId && b.wallId) return a.wallId === b.wallId;
  const aCoord = a.orientation === "horizontal" ? a.y : a.x;
  const bCoord = b.orientation === "horizontal" ? b.y : b.x;
  return Math.abs(aCoord - bCoord) <= 0.08;
}

function minDimension(width: number, depth: number) {
  return Math.min(width, depth);
}

function validateReferenceDimensions(
  id: string,
  label: string,
  kind: string,
  area: number,
  width: number,
  depth: number,
  entityType: "room" | "space",
  position: Point,
) {
  const rule = REFERENCE_DIMENSIONS[kind];
  if (!rule) return [] as ArchitecturalIssue[];
  const issues: ArchitecturalIssue[] = [];
  if (rule.minArea != null && area + EPS < rule.minArea) {
    issues.push({
      id: `dimension-area-${entityType}-${id}`,
      severity: "warning",
      category: "dimension",
      entityType,
      entityId: id,
      x: position.x,
      y: position.y,
      message: `${label} tem ${area.toFixed(1)} m²; a referência conceitual usada pelo Arqdor é ≥ ${rule.minArea.toFixed(1)} m².`,
      recommendation: "Revise a área antes do detalhamento executivo.",
    });
  }
  if (rule.minWidth != null && minDimension(width, depth) + EPS < rule.minWidth) {
    issues.push({
      id: `dimension-width-${entityType}-${id}`,
      severity: "warning",
      category: kind === "circulacao" ? "circulation" : "dimension",
      entityType,
      entityId: id,
      x: position.x,
      y: position.y,
      message: `${label} tem largura mínima aproximada de ${minDimension(width, depth).toFixed(2)} m; referência conceitual: ≥ ${rule.minWidth.toFixed(2)} m.`,
      recommendation: kind === "circulacao"
        ? "Aumente a faixa livre de circulação."
        : "Revise a menor dimensão do ambiente.",
    });
  }
  return issues;
}

export function validateArchitecturalConcept(input: ArchitecturalValidationInput): ArchitecturalIssue[] {
  const {
    rooms,
    walls,
    lotWidth,
    lotDepth,
    floor,
    floors,
    wallFirstActive,
    wallCount,
    spaces,
    openings,
    objects,
  } = input;
  const issues: ArchitecturalIssue[] = [];
  const currentRooms = rooms.filter((room) => room.floor === floor);
  const currentObjects = objects.filter((object) => object.floor === floor);

  if (!wallFirstActive) {
    const basic = validateConceptLayout(rooms, lotWidth, lotDepth, floor)
      .filter((issue) => !issue.id.startsWith("stair-") && !issue.id.startsWith("small-"));
    for (const issue of basic) {
      const room = issue.roomId ? currentRooms.find((item) => item.id === issue.roomId) : null;
      const position = room ? roomCenter(room) : { x: lotWidth / 2, y: lotDepth / 2 };
      issues.push({
        id: issue.id,
        severity: issue.severity,
        category: issue.id.startsWith("overlap-") || issue.id.startsWith("outside-") ? "geometry" : "circulation",
        entityType: room ? "room" : undefined,
        entityId: room?.id,
        x: position.x,
        y: position.y,
        message: issue.message,
      });
    }
  } else if (spaces.length === 0) {
    issues.push({
      id: `wall-first-no-space-${floor}`,
      severity: "error",
      category: "geometry",
      x: lotWidth / 2,
      y: Math.min(lotDepth / 2, 8),
      message: wallCount > 0
        ? "A rede de paredes deste pavimento ainda não forma nenhum ambiente fechado."
        : "Este pavimento está no modo parede livre, mas ainda não possui paredes.",
      recommendation: wallCount > 0
        ? "Feche os perímetros ou conecte as extremidades das paredes."
        : "Desenhe o perímetro e as divisórias para formar os ambientes.",
    });
  }

  for (const room of currentRooms) {
    if (room.kind === "piscina" || wallFirstActive) continue;
    issues.push(...validateReferenceDimensions(
      room.id,
      room.label,
      room.kind,
      room.width * room.depth,
      room.width,
      room.depth,
      "room",
      roomCenter(room),
    ));
  }

  if (wallFirstActive) {
    for (const space of spaces) {
      const kind = space.kind ?? "outro";
      const label = space.label?.trim() || "Ambiente";
      issues.push(...validateReferenceDimensions(
        space.id,
        label,
        kind,
        space.area,
        space.bounds.width,
        space.bounds.height,
        "space",
        space.centroid,
      ));
    }
  }

  const windowTargets = wallFirstActive
    ? spaces.filter((space) => WINDOW_REFERENCE_KINDS.has(space.kind ?? ""))
    : currentRooms.filter((room) => WINDOW_REFERENCE_KINDS.has(room.kind));
  for (const target of windowTargets) {
    const hasWindow = openings.some((opening) =>
      opening.type === "window" &&
      ("cells" in target
        ? openingTouchesSpace(opening, target as ValidationSpace)
        : openingTouchesRectBoundary(opening, {
            x: (target as ConceptRoomShape).x,
            y: (target as ConceptRoomShape).y,
            width: (target as ConceptRoomShape).width,
            height: (target as ConceptRoomShape).depth,
          }))
    );
    if (!hasWindow) {
      const position = "centroid" in target
        ? (target as ValidationSpace).centroid
        : roomCenter(target as ConceptRoomShape);
      issues.push({
        id: `window-missing-${target.id}`,
        severity: "warning",
        category: "opening",
        entityType: "cells" in target ? "space" : "room",
        entityId: target.id,
        x: position.x,
        y: position.y,
        message: `${("label" in target && target.label) || "Ambiente"} não possui janela detectada no perímetro.`,
        recommendation: "Preveja iluminação e ventilação compatíveis com o uso do ambiente.",
      });
    }
  }

  const doorTargets = wallFirstActive
    ? spaces.filter((space) => DOOR_REFERENCE_KINDS.has(space.kind ?? ""))
    : currentRooms.filter((room) => DOOR_REFERENCE_KINDS.has(room.kind));
  for (const target of doorTargets) {
    const hasDoor = openings.some((opening) =>
      opening.type === "door" &&
      ("cells" in target
        ? openingTouchesSpace(opening, target as ValidationSpace)
        : openingTouchesRectBoundary(opening, {
            x: (target as ConceptRoomShape).x,
            y: (target as ConceptRoomShape).y,
            width: (target as ConceptRoomShape).width,
            height: (target as ConceptRoomShape).depth,
          }))
    );
    if (!hasDoor) {
      const position = "centroid" in target
        ? (target as ValidationSpace).centroid
        : roomCenter(target as ConceptRoomShape);
      issues.push({
        id: `door-missing-${target.id}`,
        severity: "warning",
        category: "circulation",
        entityType: "cells" in target ? "space" : "room",
        entityId: target.id,
        x: position.x,
        y: position.y,
        message: `${("label" in target && target.label) || "Ambiente"} não possui porta/acesso detectado no perímetro.`,
        recommendation: "Crie um acesso direto pelo hall, circulação ou ambiente social adequado.",
      });
    }
  }

  for (const opening of openings) {
    const params = normalizeOpeningParameters(opening.type, opening);
    if (opening.type === "door" && params.width < 0.7) {
      issues.push({
        id: `door-width-${opening.id}`,
        severity: "warning",
        category: "opening",
        entityType: "opening",
        entityId: opening.id,
        x: opening.x,
        y: opening.y,
        message: `Porta com ${params.width.toFixed(2)} m de largura; referência conceitual do editor: ≥ 0,70 m.`,
        recommendation: "Revise a largura útil conforme o uso e as exigências do projeto.",
      });
    }
    if (opening.type === "door" && params.height < 2) {
      issues.push({
        id: `door-height-${opening.id}`,
        severity: "warning",
        category: "opening",
        entityType: "opening",
        entityId: opening.id,
        x: opening.x,
        y: opening.y,
        message: `Porta com ${params.height.toFixed(2)} m de altura; referência conceitual: ≥ 2,00 m.`,
      });
    }
  }

  for (let i = 0; i < openings.length; i += 1) {
    const a = openings[i]!;
    for (let j = i + 1; j < openings.length; j += 1) {
      const b = openings[j]!;
      if (!openingsShareWall(a, b)) continue;
      const ra = openingRange(a);
      const rb = openingRange(b);
      const overlap = Math.min(ra.max, rb.max) - Math.max(ra.min, rb.min);
      if (overlap > 0.04) {
        issues.push({
          id: `opening-overlap-${a.id}-${b.id}`,
          severity: "error",
          category: "opening",
          entityType: "opening",
          entityId: a.id,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          message: "Dois vãos estão se sobrepondo na mesma parede.",
          recommendation: "Reposicione ou reduza a largura de um dos vãos.",
        });
      }
    }
  }

  const hasFloorAbove = floor < floors - 1;
  const stairs = currentRooms.filter((room) => room.kind === "escada");
  if (hasFloorAbove && stairs.length === 0) {
    issues.push({
      id: `stair-required-${floor}`,
      severity: "error",
      category: "stair",
      x: lotWidth / 2,
      y: Math.min(lotDepth / 2, 8),
      message: "Este pavimento precisa de uma escada para conectar ao nível superior.",
      recommendation: "Adicione a escada antes de concluir a distribuição.",
    });
  }

  for (const stair of stairs) {
    const params = normalizeStairParameters(stair);
    const metrics = stairFootprintMetrics(stair);
    const position = roomCenter(stair);
    if (!metrics.fitsTreadDepth) {
      issues.push({
        id: `stair-run-${stair.id}`,
        severity: "error",
        category: "stair",
        entityType: "stair",
        entityId: stair.id,
        x: position.x,
        y: position.y,
        message: "O desenvolvimento disponível da escada é menor que o necessário para os pisos informados.",
        recommendation: "Aumente a caixa da escada, reduza o piso dentro da faixa permitida pelo editor ou altere o formato.",
      });
    }
    if (params.stairFlightWidth < 0.9) {
      issues.push({
        id: `stair-width-${stair.id}`,
        severity: "warning",
        category: "stair",
        entityType: "stair",
        entityId: stair.id,
        x: position.x,
        y: position.y,
        message: `Lance da escada com ${params.stairFlightWidth.toFixed(2)} m; referência conceitual: ≥ 0,90 m.`,
      });
    }
    if (params.riserHeight > 0.19 || params.riserHeight < 0.14) {
      issues.push({
        id: `stair-riser-${stair.id}`,
        severity: "warning",
        category: "stair",
        entityType: "stair",
        entityId: stair.id,
        x: position.x,
        y: position.y,
        message: `Espelho resultante de ${(params.riserHeight * 100).toFixed(1)} cm merece revisão de conforto.`,
      });
    }
    if (params.stairTreadDepth < 0.25) {
      issues.push({
        id: `stair-tread-${stair.id}`,
        severity: "warning",
        category: "stair",
        entityType: "stair",
        entityId: stair.id,
        x: position.x,
        y: position.y,
        message: `Piso da escada com ${(params.stairTreadDepth * 100).toFixed(0)} cm; referência conceitual: ≥ 25 cm.`,
      });
    }
    if (params.stairLandingDepth + EPS < params.stairFlightWidth) {
      issues.push({
        id: `stair-landing-${stair.id}`,
        severity: "warning",
        category: "stair",
        entityType: "stair",
        entityId: stair.id,
        x: position.x,
        y: position.y,
        message: `Patamar de ${params.stairLandingDepth.toFixed(2)} m é menor que a largura do lance (${params.stairFlightWidth.toFixed(2)} m).`,
        recommendation: "Revise o patamar para manter uma transição confortável entre os lances.",
      });
    }

    if (floor > 0) {
      const lower = rooms.find((room) => room.floor === floor - 1 && room.kind === "escada");
      if (lower) {
        const overlapX = rangeOverlap(stair.x, stair.x + stair.width, lower.x, lower.x + lower.width);
        const overlapY = rangeOverlap(stair.y, stair.y + stair.depth, lower.y, lower.y + lower.depth);
        const overlapArea = overlapX * overlapY;
        const referenceArea = Math.min(stair.width * stair.depth, lower.width * lower.depth);
        if (referenceArea > 0 && overlapArea / referenceArea < 0.5) {
          issues.push({
            id: `stair-stack-${stair.id}`,
            severity: "warning",
            category: "stair",
            entityType: "stair",
            entityId: stair.id,
            x: position.x,
            y: position.y,
            message: "A caixa da escada está pouco alinhada com a escada do pavimento inferior.",
            recommendation: "Revise a continuidade vertical e a posição da abertura de laje.",
          });
        }
      }
    }
  }

  const buildingContains = (point: Point) => {
    if (wallFirstActive) return spaces.some((space) => pointInCells(point, space.cells));
    return currentRooms
      .filter((room) => room.kind !== "piscina")
      .some((room) => roomContainsPoint(room, point));
  };

  for (const object of currentObjects) {
    const corners = conceptObjectCorners(object);
    const exteriorPlant = object.symbol === "plant" && object.category === "decoracao";
    if (!exteriorPlant && !corners.every(buildingContains)) {
      issues.push({
        id: `object-outside-${object.id}`,
        severity: "warning",
        category: "object",
        entityType: "object",
        entityId: object.id,
        x: object.x,
        y: object.y,
        message: `${object.name} está parcialmente fora da área interna detectada.`,
        recommendation: "Reposicione o objeto para manter o mobiliário dentro do ambiente.",
      });
    }

    const inCirculation = wallFirstActive
      ? spaces.some((space) => space.kind === "circulacao" && pointInCells({ x: object.x, y: object.y }, space.cells))
      : currentRooms.some((room) => room.kind === "circulacao" && roomContainsPoint(room, { x: object.x, y: object.y }));
    if (inCirculation) {
      issues.push({
        id: `object-circulation-${object.id}`,
        severity: "warning",
        category: "circulation",
        entityType: "object",
        entityId: object.id,
        x: object.x,
        y: object.y,
        message: `${object.name} ocupa a faixa identificada como circulação.`,
        recommendation: "Mantenha a passagem principal livre de mobiliário.",
      });
    }

    for (const wall of walls) {
      const polygon = wallPolygon(wall);
      if (!polygon || !polygonsOverlap(corners, polygon, 0.015)) continue;
      issues.push({
        id: `object-wall-${object.id}-${wall.id}`,
        severity: "error",
        category: "object",
        entityType: "object",
        entityId: object.id,
        x: object.x,
        y: object.y,
        message: `${object.name} está atravessando uma parede.`,
        recommendation: "Afaste ou gire o objeto para liberar a espessura da parede.",
      });
      break;
    }
  }

  for (let i = 0; i < currentObjects.length; i += 1) {
    const a = currentObjects[i]!;
    const aPolygon = conceptObjectCorners(a);
    for (let j = i + 1; j < currentObjects.length; j += 1) {
      const b = currentObjects[j]!;
      if (
        (a.symbol === "chair" && ["table", "island"].includes(b.symbol)) ||
        (b.symbol === "chair" && ["table", "island"].includes(a.symbol))
      ) continue;
      if (!polygonsOverlap(aPolygon, conceptObjectCorners(b))) continue;
      issues.push({
        id: `object-collision-${a.id}-${b.id}`,
        severity: "error",
        category: "object",
        entityType: "object",
        entityId: a.id,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        message: `${a.name} está colidindo com ${b.name}.`,
        recommendation: "Reposicione ou redimensione um dos objetos.",
      });
    }
  }

  const doors = openings.filter((opening) => opening.type === "door");
  for (const door of doors) {
    const clearance = openingClearancePolygon(door);
    for (const object of currentObjects) {
      if (!polygonsOverlap(clearance, conceptObjectCorners(object), 0.02)) continue;
      issues.push({
        id: `door-clearance-${door.id}-${object.id}`,
        severity: "warning",
        category: "circulation",
        entityType: "object",
        entityId: object.id,
        x: object.x,
        y: object.y,
        message: `${object.name} pode interferir na área de passagem/abertura de uma porta.`,
        recommendation: "Libere a faixa próxima ao vão antes de finalizar o layout.",
      });
    }
  }

  const severityOrder = { error: 0, warning: 1 } as const;
  return issues
    .filter((issue, index, all) => all.findIndex((candidate) => candidate.id === issue.id) === index)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.category.localeCompare(b.category));
}
