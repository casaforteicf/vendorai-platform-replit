export type DxfEditableWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  sourceLayer?: string;
};

export type DxfEditableGeometry = {
  walls: DxfEditableWall[];
  openings: [];
  bounds: { width: number; depth: number };
  unit: "m" | "mm" | "cm" | "unknown";
  warnings: string[];
};

type Pair = { code: number; value: string };

function pairs(input: string): Pair[] {
  const lines = input.replace(/\r/g, "").split("\n");
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]?.trim());
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: lines[i + 1]?.trim() ?? "" });
  }
  return out;
}

function insunits(input: Pair[]) {
  for (let i = 0; i < input.length - 2; i++) {
    if (input[i]?.code === 9 && input[i]?.value === "$INSUNITS") {
      const value = Number(input[i + 1]?.value);
      if (value === 4) return { unit: "mm" as const, scale: 0.001 };
      if (value === 5) return { unit: "cm" as const, scale: 0.01 };
      if (value === 6) return { unit: "m" as const, scale: 1 };
    }
  }
  return { unit: "unknown" as const, scale: 1 };
}

function floorFromLayer(layer: string) {
  const match = layer.match(/(?:P|PAV|FLOOR)[_-]?(\d+)/i);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

export function parseDxfEditableGeometry(input: string): DxfEditableGeometry {
  if (!/SECTION/i.test(input) || !/ENTITIES/i.test(input)) {
    throw new Error("O arquivo não parece ser um DXF ASCII válido.");
  }

  const p = pairs(input);
  const unit = insunits(p);
  const raw: Array<{ layer: string; x1: number; y1: number; x2: number; y2: number }> = [];

  for (let i = 0; i < p.length; i++) {
    if (p[i]?.code !== 0 || p[i]?.value.toUpperCase() !== "LINE") continue;
    let layer = "0";
    let x1: number | null = null, y1: number | null = null, x2: number | null = null, y2: number | null = null;
    for (let j = i + 1; j < p.length && p[j]?.code !== 0; j++) {
      const pair = p[j]!;
      if (pair.code === 8) layer = pair.value || "0";
      if (pair.code === 10) x1 = Number(pair.value);
      if (pair.code === 20) y1 = Number(pair.value);
      if (pair.code === 11) x2 = Number(pair.value);
      if (pair.code === 21) y2 = Number(pair.value);
    }
    if ([x1, y1, x2, y2].every((v) => typeof v === "number" && Number.isFinite(v))) {
      raw.push({ layer, x1: x1!, y1: y1!, x2: x2!, y2: y2! });
    }
  }

  if (!raw.length) throw new Error("O DXF foi lido, mas não encontrei entidades LINE compatíveis.");

  const explicitWalls = raw.filter((line) => /parede|wall|alvenaria|arq_paredes/i.test(line.layer));
  const selected = explicitWalls.length ? explicitWalls : raw;
  const warnings: string[] = [];
  if (!explicitWalls.length) warnings.push("Não encontrei camada explícita de paredes; todas as entidades LINE foram tratadas como candidatas e precisam de revisão.");
  if (unit.unit === "unknown") warnings.push("Unidade do DXF não identificada; os valores foram tratados como metros.");

  const scaled = selected
    .map((line, index) => ({
      id: `dxf-wall-${index + 1}`,
      floor: floorFromLayer(line.layer),
      x1: line.x1 * unit.scale,
      y1: line.y1 * unit.scale,
      x2: line.x2 * unit.scale,
      y2: line.y2 * unit.scale,
      thickness: 0.14,
      sourceLayer: line.layer,
    }))
    .filter((line) => Math.hypot(line.x2 - line.x1, line.y2 - line.y1) >= 0.02);

  if (!scaled.length) throw new Error("O DXF não contém linhas com comprimento suficiente para formar paredes.");

  const minX = Math.min(...scaled.flatMap((w) => [w.x1, w.x2]));
  const minY = Math.min(...scaled.flatMap((w) => [w.y1, w.y2]));
  const maxX = Math.max(...scaled.flatMap((w) => [w.x1, w.x2]));
  const maxY = Math.max(...scaled.flatMap((w) => [w.y1, w.y2]));

  for (const wall of scaled) {
    wall.x1 = Math.round((wall.x1 - minX) * 1000) / 1000;
    wall.y1 = Math.round((wall.y1 - minY) * 1000) / 1000;
    wall.x2 = Math.round((wall.x2 - minX) * 1000) / 1000;
    wall.y2 = Math.round((wall.y2 - minY) * 1000) / 1000;
  }

  return {
    walls: scaled,
    openings: [],
    bounds: {
      width: Math.round((maxX - minX) * 1000) / 1000,
      depth: Math.round((maxY - minY) * 1000) / 1000,
    },
    unit: unit.unit,
    warnings,
  };
}
