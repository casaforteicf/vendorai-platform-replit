export type DxfRoom = {
  id?: string;
  label?: string;
  kind?: string;
  floor?: number;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
};

export type DxfWall = {
  id: string;
  floor?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
};

export type DxfOpening = {
  id?: string;
  wallId: string;
  floor?: number;
  offset?: number;
  width?: number;
  type?: string;
};

type ConceptDxfInput = {
  title?: string | null;
  rooms?: DxfRoom[] | null;
  customWalls?: DxfWall[] | null;
  customOpenings?: DxfOpening[] | null;
};

const MM = 1000;

function pair(code: number, value: string | number) {
  return `${code}\n${value}\n`;
}

function sanitizeLayerName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "ARQDOR";
}

function sanitizeText(value: string) {
  return value.replace(/[\r\n]+/g, " ").slice(0, 120);
}

function floorLayer(prefix: string, floor: number) {
  return sanitizeLayerName(`${prefix}_P${floor + 1}`);
}

function lineEntity(layer: string, x1: number, y1: number, x2: number, y2: number) {
  return [
    pair(0, "LINE"),
    pair(8, layer),
    pair(10, Math.round(x1 * MM)),
    pair(20, Math.round(y1 * MM)),
    pair(30, 0),
    pair(11, Math.round(x2 * MM)),
    pair(21, Math.round(y2 * MM)),
    pair(31, 0),
  ].join("");
}

function textEntity(layer: string, text: string, x: number, y: number, heightMm = 220) {
  return [
    pair(0, "TEXT"),
    pair(8, layer),
    pair(10, Math.round(x * MM)),
    pair(20, Math.round(y * MM)),
    pair(30, 0),
    pair(40, heightMm),
    pair(1, sanitizeText(text)),
  ].join("");
}

function rectangleEntities(layer: string, x: number, y: number, width: number, depth: number) {
  return [
    lineEntity(layer, x, y, x + width, y),
    lineEntity(layer, x + width, y, x + width, y + depth),
    lineEntity(layer, x + width, y + depth, x, y + depth),
    lineEntity(layer, x, y + depth, x, y),
  ].join("");
}

function openingEntity(opening: DxfOpening, wall: DxfWall) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const wallLength = Math.hypot(dx, dy);
  if (wallLength <= 0.0001) return "";

  const offset = Math.max(0, Math.min(1, Number(opening.offset ?? 0.5)));
  const openingWidth = Math.max(0.2, Number(opening.width ?? 0.9));
  const ux = dx / wallLength;
  const uy = dy / wallLength;
  const centerDistance = wallLength * offset;
  const half = Math.min(openingWidth / 2, wallLength / 2);
  const cx = wall.x1 + ux * centerDistance;
  const cy = wall.y1 + uy * centerDistance;
  const x1 = cx - ux * half;
  const y1 = cy - uy * half;
  const x2 = cx + ux * half;
  const y2 = cy + uy * half;
  const floor = Number.isFinite(Number(opening.floor)) ? Number(opening.floor) : Number(wall.floor ?? 0);

  return lineEntity(floorLayer("ARQ_ABERTURAS", floor), x1, y1, x2, y2);
}

export function buildConceptDxf(input: ConceptDxfInput) {
  const rooms = Array.isArray(input.rooms) ? input.rooms : [];
  const walls = Array.isArray(input.customWalls) ? input.customWalls : [];
  const openings = Array.isArray(input.customOpenings) ? input.customOpenings : [];
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));

  let entities = "";

  if (walls.length) {
    for (const wall of walls) {
      const floor = Number.isFinite(Number(wall.floor)) ? Number(wall.floor) : 0;
      entities += lineEntity(
        floorLayer("ARQ_PAREDES", floor),
        Number(wall.x1),
        Number(wall.y1),
        Number(wall.x2),
        Number(wall.y2),
      );
    }
  }

  for (const room of rooms) {
    const x = Number(room.x);
    const y = Number(room.y);
    const width = Number(room.width);
    const depth = Number(room.depth);
    if (![x, y, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) continue;
    const floor = Number.isFinite(Number(room.floor)) ? Number(room.floor) : 0;
    const outlineLayer = floorLayer(walls.length ? "ARQ_AMBIENTES" : "ARQ_PAREDES", floor);
    entities += rectangleEntities(outlineLayer, x, y, width, depth);
    if (room.label || room.kind) {
      entities += textEntity(
        floorLayer("ARQ_TEXTOS", floor),
        String(room.label || room.kind || "Ambiente"),
        x + width / 2,
        y + depth / 2,
      );
    }
  }

  for (const opening of openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) continue;
    entities += openingEntity(opening, wall);
  }

  const header = [
    pair(0, "SECTION"),
    pair(2, "HEADER"),
    pair(9, "$ACADVER"),
    pair(1, "AC1009"),
    pair(9, "$INSUNITS"),
    pair(70, 4),
    pair(0, "ENDSEC"),
    pair(0, "SECTION"),
    pair(2, "ENTITIES"),
  ].join("");

  const footer = [pair(0, "ENDSEC"), pair(0, "EOF")].join("");

  return header + entities + footer;
}

export function conceptDxfFilename(title?: string | null) {
  const base = sanitizeLayerName(title || "arqdor-projeto").toLowerCase();
  return `${base || "arqdor-projeto"}.dxf`;
}
