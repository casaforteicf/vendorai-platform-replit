export type ImportedDxfWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  sourceLayer?: string;
};

export type DxfImportResult = {
  walls: ImportedDxfWall[];
  bounds: { width: number; depth: number };
  unit: "mm" | "cm" | "m" | "in" | "ft" | "unitless";
  skippedDiagonal: number;
  skippedUnsupported: number;
  warnings: string[];
};

type Pair = { code: number; value: string };

function unitScaleToMeters(code: number | null) {
  switch (code) {
    case 1: return { scale: 0.0254, unit: "in" as const };
    case 2: return { scale: 0.3048, unit: "ft" as const };
    case 4: return { scale: 0.001, unit: "mm" as const };
    case 5: return { scale: 0.01, unit: "cm" as const };
    case 6: return { scale: 1, unit: "m" as const };
    default: return { scale: 1, unit: "unitless" as const };
  }
}

function floorFromLayer(layer: string) {
  const match = layer.match(/(?:^|[_-])(?:P|PAV|PAVIMENTO|FLOOR)[_-]?(\d+)(?:$|[_-])/i);
  if (!match) return 0;
  return Math.max(0, Number(match[1]) - 1);
}

function tokenize(input: string): Pair[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]?.trim());
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }
  return pairs;
}

function insUnits(pairs: Pair[]) {
  for (let i = 0; i < pairs.length - 1; i += 1) {
    if (pairs[i].code === 9 && pairs[i].value.trim() === "$INSUNITS") {
      const next = pairs[i + 1];
      if (next?.code === 70) return Number(next.value.trim());
    }
  }
  return null;
}

function isEntitiesStart(pairs: Pair[], index: number) {
  return pairs[index]?.code === 0
    && pairs[index]?.value.trim() === "SECTION"
    && pairs[index + 1]?.code === 2
    && pairs[index + 1]?.value.trim() === "ENTITIES";
}

function nearOrthogonal(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.02) return null;
  const ratioX = Math.abs(dx) / length;
  const ratioY = Math.abs(dy) / length;
  if (ratioY <= 0.035) return { x1, y1, x2, y2: y1 };
  if (ratioX <= 0.035) return { x1, y1, x2: x1, y2 };
  return null;
}

export function parseAsciiDxf(input: string): DxfImportResult {
  if (!input || input.includes("\u0000")) {
    throw new Error("Arquivo DXF binário ou inválido. Exporte como DXF ASCII antes de importar.");
  }

  const pairs = tokenize(input);
  if (!pairs.length) throw new Error("DXF vazio ou inválido.");

  const unitInfo = unitScaleToMeters(insUnits(pairs));
  let inEntities = false;
  let skippedDiagonal = 0;
  let skippedUnsupported = 0;
  const rawWalls: Array<Omit<ImportedDxfWall, "id">> = [];

  for (let i = 0; i < pairs.length; i += 1) {
    if (isEntitiesStart(pairs, i)) {
      inEntities = true;
      i += 1;
      continue;
    }
    if (!inEntities) continue;
    if (pairs[i].code === 0 && pairs[i].value.trim() === "ENDSEC") break;
    if (pairs[i].code !== 0) continue;

    const entityType = pairs[i].value.trim().toUpperCase();
    let j = i + 1;
    while (j < pairs.length && pairs[j].code !== 0) j += 1;
    const entity = pairs.slice(i + 1, j);

    const layer = entity.find((pair) => pair.code === 8)?.value.trim() || "0";
    const floor = floorFromLayer(layer);

    if (entityType === "LINE") {
      const x1 = Number(entity.find((pair) => pair.code === 10)?.value) * unitInfo.scale;
      const y1 = Number(entity.find((pair) => pair.code === 20)?.value) * unitInfo.scale;
      const x2 = Number(entity.find((pair) => pair.code === 11)?.value) * unitInfo.scale;
      const y2 = Number(entity.find((pair) => pair.code === 21)?.value) * unitInfo.scale;
      if (![x1, y1, x2, y2].every(Number.isFinite)) {
        skippedUnsupported += 1;
      } else {
        const snapped = nearOrthogonal(x1, y1, x2, y2);
        if (!snapped) skippedDiagonal += 1;
        else rawWalls.push({ ...snapped, floor, thickness: 0.14, sourceLayer: layer });
      }
    } else if (entityType === "LWPOLYLINE") {
      const closed = (Number(entity.find((pair) => pair.code === 70)?.value ?? 0) & 1) === 1;
      const vertices: Array<{ x: number; y: number }> = [];
      let pendingX: number | null = null;
      for (const pair of entity) {
        if (pair.code === 10) pendingX = Number(pair.value) * unitInfo.scale;
        if (pair.code === 20 && pendingX != null) {
          const y = Number(pair.value) * unitInfo.scale;
          if (Number.isFinite(pendingX) && Number.isFinite(y)) vertices.push({ x: pendingX, y });
          pendingX = null;
        }
      }
      const segmentCount = closed ? vertices.length : Math.max(0, vertices.length - 1);
      for (let v = 0; v < segmentCount; v += 1) {
        const a = vertices[v];
        const b = vertices[(v + 1) % vertices.length];
        if (!a || !b) continue;
        const snapped = nearOrthogonal(a.x, a.y, b.x, b.y);
        if (!snapped) skippedDiagonal += 1;
        else rawWalls.push({ ...snapped, floor, thickness: 0.14, sourceLayer: layer });
      }
    } else if (!["TEXT", "MTEXT", "INSERT", "POINT", "CIRCLE", "ARC", "HATCH"].includes(entityType)) {
      skippedUnsupported += 1;
    }

    i = j - 1;
  }

  if (!rawWalls.length) {
    throw new Error("Nenhuma parede ortogonal foi encontrada no DXF.");
  }

  const minX = Math.min(...rawWalls.flatMap((wall) => [wall.x1, wall.x2]));
  const minY = Math.min(...rawWalls.flatMap((wall) => [wall.y1, wall.y2]));
  const maxX = Math.max(...rawWalls.flatMap((wall) => [wall.x1, wall.x2]));
  const maxY = Math.max(...rawWalls.flatMap((wall) => [wall.y1, wall.y2]));

  const seen = new Set<string>();
  const walls: ImportedDxfWall[] = [];
  for (const wall of rawWalls.slice(0, 1200)) {
    const x1 = Math.round((wall.x1 - minX) * 1000) / 1000;
    const y1 = Math.round((wall.y1 - minY) * 1000) / 1000;
    const x2 = Math.round((wall.x2 - minX) * 1000) / 1000;
    const y2 = Math.round((wall.y2 - minY) * 1000) / 1000;
    const forward = `${wall.floor}:${x1},${y1}:${x2},${y2}`;
    const reverse = `${wall.floor}:${x2},${y2}:${x1},${y1}`;
    const key = forward < reverse ? forward : reverse;
    if (seen.has(key)) continue;
    seen.add(key);
    walls.push({
      id: `dxf-wall-${walls.length + 1}`,
      floor: wall.floor,
      x1,
      y1,
      x2,
      y2,
      thickness: wall.thickness,
      sourceLayer: wall.sourceLayer,
    });
  }

  const warnings: string[] = [];
  if (unitInfo.unit === "unitless") warnings.push("DXF sem unidade definida; os valores foram interpretados como metros.");
  if (skippedDiagonal) warnings.push(`${skippedDiagonal} segmentos diagonais foram ignorados nesta primeira versão do importador.`);
  if (skippedUnsupported) warnings.push(`${skippedUnsupported} entidades não suportadas foram ignoradas.`);
  if (rawWalls.length > 1200) warnings.push("O arquivo tinha mais de 1.200 segmentos; somente os primeiros foram considerados.");

  return {
    walls,
    bounds: {
      width: Math.round((maxX - minX) * 1000) / 1000,
      depth: Math.round((maxY - minY) * 1000) / 1000,
    },
    unit: unitInfo.unit,
    skippedDiagonal,
    skippedUnsupported,
    warnings,
  };
}
