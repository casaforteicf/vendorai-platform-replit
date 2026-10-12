import type {
  ArqdorImportedFloorPlan,
  ArqdorImportedWall,
  ArqdorImportedOpening,
} from "./arqdor-intelligent-project-import.js";

export type EditableImportedWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  confidence: number;
  classification: "internal" | "external" | "unknown";
  material?: string | null;
  sourceEvidence: string[];
  sourceIndex?: number;
};

export type EditableImportedOpening = {
  id: string;
  wallId: string;
  floor: number;
  type: "door" | "window";
  offset: number;
  width?: number;
  height?: number;
  sillHeight?: number;
  code?: string | null;
  confidence: number;
  sourceEvidence: string[];
};

export type EditableImportedSpace = {
  id: string;
  floor: number;
  label: string;
  kind: string;
  centroid: { x: number; y: number };
  area: number;
  floorMaterialId?: string;
};

export type ImportedGeometryPreview = {
  page: number;
  label?: string | null;
  confidence: number;
  requiresCalibration: boolean;
  widthMeters: number | null;
  depthMeters: number | null;
  walls: EditableImportedWall[];
  openings: EditableImportedOpening[];
  spaces: EditableImportedSpace[];
  warnings: string[];
  topologyRepairs: number;
  discardedWalls: number;
  discardedOpenings: number;
  canApply: boolean;
};

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function endpoint(wall: EditableImportedWall, side: "start" | "end") {
  return side === "start" ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
}

function setEndpoint(
  wall: EditableImportedWall,
  side: "start" | "end",
  point: { x: number; y: number },
) {
  if (side === "start") {
    wall.x1 = point.x;
    wall.y1 = point.y;
  } else {
    wall.x2 = point.x;
    wall.y2 = point.y;
  }
}

function snapTopology(walls: EditableImportedWall[], tolerance = 0.08) {
  const next = walls.map((wall) => ({ ...wall }));
  let repairs = 0;

  for (let i = 0; i < next.length; i += 1) {
    const wall = next[i]!;
    for (const side of ["start", "end"] as const) {
      const point = endpoint(wall, side);
      let best: { x: number; y: number; distance: number } | null = null;

      for (let j = 0; j < next.length; j += 1) {
        if (i === j) continue;
        const other = next[j]!;
        for (const otherSide of ["start", "end"] as const) {
          const candidate = endpoint(other, otherSide);
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (distance <= tolerance && (!best || distance < best.distance)) {
            best = { ...candidate, distance };
          }
        }

        const dx = other.x2 - other.x1;
        const dy = other.y2 - other.y1;
        const len2 = dx * dx + dy * dy;
        if (len2 <= 0.000001) continue;
        const t = clamp(((point.x - other.x1) * dx + (point.y - other.y1) * dy) / len2, 0, 1);
        const projected = { x: other.x1 + t * dx, y: other.y1 + t * dy };
        const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = { ...projected, distance };
        }
      }

      if (best && best.distance > 0.002) {
        setEndpoint(wall, side, best);
        repairs += 1;
      }
    }
  }

  return {
    walls: next.map((wall) => ({
      ...wall,
      x1: Math.round(wall.x1 * 1000) / 1000,
      y1: Math.round(wall.y1 * 1000) / 1000,
      x2: Math.round(wall.x2 * 1000) / 1000,
      y2: Math.round(wall.y2 * 1000) / 1000,
    })),
    repairs,
  };
}

function roomKind(label: string) {
  const value = label.toLocaleLowerCase("pt-BR");
  if (/garagem/.test(value)) return "garagem";
  if (/cozinha/.test(value)) return "cozinha";
  if (/lavanderia|área de serviço|area de servico/.test(value)) return "lavanderia";
  if (/banheiro|bwc|lavabo/.test(value)) return "banheiro";
  if (/su[ií]te/.test(value)) return "suite";
  if (/dormit[oó]rio|quarto/.test(value)) return "quarto";
  if (/sala/.test(value)) return "sala";
  if (/closet/.test(value)) return "outro";
  if (/escrit[oó]rio/.test(value)) return "outro";
  if (/varanda|gourmet/.test(value)) return "gourmet";
  if (/corredor|circula/.test(value)) return "circulacao";
  if (/escada/.test(value)) return "escada";
  return "outro";
}

function resolveWallId(
  opening: ArqdorImportedOpening,
  walls: EditableImportedWall[],
) {
  if (opening.wallId) {
    const direct = walls.find((wall) => wall.id === opening.wallId);
    if (direct) return direct.id;
  }
  const wallIndex = n(opening.wallIndex);
  if (wallIndex != null) return walls.find((wall) => wall.sourceIndex === Math.round(wallIndex))?.id ?? null;
  return null;
}

export function importedFloorPlanToEditableGeometry(
  floorPlan: ArqdorImportedFloorPlan,
  options?: { floor?: number; widthMeters?: number; depthMeters?: number },
): ImportedGeometryPreview {
  const floor = Math.max(0, Math.round(options?.floor ?? 0));
  const widthMeters = n(options?.widthMeters ?? floorPlan.widthMeters);
  const depthMeters = n(options?.depthMeters ?? floorPlan.depthMeters);
  const calibrated = widthMeters != null && widthMeters > 0 && depthMeters != null && depthMeters > 0;

  if (!calibrated) {
    return {
      page: floorPlan.page,
      label: floorPlan.label,
      confidence: floorPlan.confidence,
      requiresCalibration: true,
      widthMeters: widthMeters ?? null,
      depthMeters: depthMeters ?? null,
      walls: [],
      openings: [],
      spaces: [],
      warnings: [
        ...floorPlan.warnings,
        "A planta precisa de largura e profundidade reais antes de virar geometria editável.",
      ],
      topologyRepairs: 0,
      discardedWalls: 0,
      discardedOpenings: 0,
      canApply: false,
    };
  }

  let discardedWalls = 0;
  const walls = floorPlan.walls.flatMap((wall: ArqdorImportedWall, index) => {
    const x1 = clamp(wall.x1, 0, 1) * widthMeters;
    const y1 = clamp(wall.y1, 0, 1) * depthMeters;
    const x2 = clamp(wall.x2, 0, 1) * widthMeters;
    const y2 = clamp(wall.y2, 0, 1) * depthMeters;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const confidence = clamp(Number(wall.confidence ?? 0.5), 0, 1);
    if (length < 0.12 || confidence < 0.28) {
      discardedWalls += 1;
      return [];
    }
    return [{
      id: wall.id || `import-wall-${index + 1}`,
      floor,
      x1,
      y1,
      x2,
      y2,
      thickness: clamp(n(wall.thickness) && n(wall.thickness)! > 0 ? n(wall.thickness)! : 0.15, 0.05, 0.6),
      confidence,
      classification: wall.classification ?? "unknown",
      material: wall.material ?? null,
      sourceEvidence: wall.evidence ?? [],
      sourceIndex: index,
    } satisfies EditableImportedWall];
  });

  const snapped = snapTopology(walls);
  let discardedOpenings = 0;
  const openings = floorPlan.openings.flatMap((opening, index) => {
    const wallId = resolveWallId(opening, snapped.walls);
    const confidence = clamp(Number(opening.confidence ?? 0.5), 0, 1);
    if (!wallId || confidence < 0.28 || opening.type === "opening") {
      discardedOpenings += 1;
      return [];
    }
    return [{
      id: opening.id || `import-opening-${index + 1}`,
      wallId,
      floor,
      type: opening.type,
      offset: clamp(Number(opening.offset ?? 0.5), 0.01, 0.99),
      width: n(opening.width) ?? undefined,
      height: n(opening.height) ?? undefined,
      sillHeight: n(opening.sillHeight) ?? undefined,
      code: opening.code ?? null,
      confidence,
      sourceEvidence: opening.evidence ?? [],
    } satisfies EditableImportedOpening];
  });

  const spaces: EditableImportedSpace[] = floorPlan.rooms.flatMap((room, index) => {
    const label = String(room.label ?? room.name ?? room.nome ?? "").trim();
    const area = n(room.areaM2 ?? room.area);
    const cxNorm = n((room.centroid as any)?.x ?? room.centroidX ?? room.x);
    const cyNorm = n((room.centroid as any)?.y ?? room.centroidY ?? room.y);
    if (!label || area == null || area <= 0 || cxNorm == null || cyNorm == null) return [];
    const centroidIsNormalized = cxNorm >= 0 && cxNorm <= 1 && cyNorm >= 0 && cyNorm <= 1;
    return [{
      id: String(room.id ?? `import-space-${index + 1}`),
      floor,
      label,
      kind: String(room.kind ?? roomKind(label)),
      centroid: {
        x: centroidIsNormalized ? cxNorm * widthMeters : cxNorm,
        y: centroidIsNormalized ? cyNorm * depthMeters : cyNorm,
      },
      area,
      floorMaterialId: typeof room.floorMaterialId === "string" ? room.floorMaterialId : undefined,
    }];
  });

  const confidence = clamp(
    (floorPlan.confidence * 0.45)
      + (snapped.walls.length ? snapped.walls.reduce((sum, wall) => sum + wall.confidence, 0) / snapped.walls.length * 0.4 : 0)
      + (openings.length ? openings.reduce((sum, opening) => sum + opening.confidence, 0) / openings.length * 0.15 : 0.08),
    0,
    1,
  );

  const warnings = [...floorPlan.warnings];
  if (discardedWalls) warnings.push(`${discardedWalls} parede(s) de baixa confiança/ comprimento inválido foram descartadas.`);
  if (discardedOpenings) warnings.push(`${discardedOpenings} abertura(s) sem parede inequívoca ou baixa confiança foram descartadas.`);
  if (snapped.repairs) warnings.push(`${snapped.repairs} encontro(s) de parede foram encaixados automaticamente.`);

  return {
    page: floorPlan.page,
    label: floorPlan.label,
    confidence,
    requiresCalibration: false,
    widthMeters,
    depthMeters,
    walls: snapped.walls,
    openings,
    spaces,
    warnings,
    topologyRepairs: snapped.repairs,
    discardedWalls,
    discardedOpenings,
    canApply: snapped.walls.length >= 3 && confidence >= 0.55,
  };
}
