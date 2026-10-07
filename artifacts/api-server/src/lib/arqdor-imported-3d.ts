import type { ArqdorIntelligentProjectImport } from "./arqdor-intelligent-project-import.js";

type JsonRecord = Record<string, unknown>;

export type ImportedArchitectural3DProfile = {
  confidence: number;
  floors: Array<{
    floor: number;
    label: string;
    wallHeightM: number | null;
    levelElevationM: number | null;
    sourcePages: number[];
    evidence: string[];
  }>;
  roof: {
    type: string | null;
    material: string | null;
    pitchDegrees: number | null;
    slopePercent: number | null;
    ridgeElevationM: number | null;
    sourcePages: number[];
    evidence: string[];
  };
  facades: Array<{
    orientation: "front" | "rear" | "left" | "right" | "unknown";
    page: number;
    confidence: number;
    style: string | null;
    materials: JsonRecord[];
    architecturalFeatures: JsonRecord[];
    heights: JsonRecord[];
    evidence: string[];
  }>;
  warnings: string[];
  canApply: boolean;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function findNumericByKeys(value: unknown, keys: string[]): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumericByKeys(item, keys);
      if (found != null) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as JsonRecord;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const n = finite(obj[key]);
      if (n != null) return n;
    }
  }
  for (const item of Object.values(obj)) {
    const found = findNumericByKeys(item, keys);
    if (found != null) return found;
  }
  return null;
}

function findStringByKeys(value: unknown, keys: string[]): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as JsonRecord;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const text = String(obj[key] ?? "").trim();
      if (text) return text.slice(0, 180);
    }
  }
  for (const item of Object.values(obj)) {
    const found = findStringByKeys(item, keys);
    if (found) return found;
  }
  return null;
}

function normalizePitchDegrees(rawDegrees: number | null, rawSlopePercent: number | null) {
  if (rawDegrees != null && rawDegrees > 0 && rawDegrees < 89) return rawDegrees;
  if (rawSlopePercent != null && rawSlopePercent > 0 && rawSlopePercent < 1000) {
    return Math.atan(rawSlopePercent / 100) * 180 / Math.PI;
  }
  return null;
}

function sectionWallHeight(section: ArqdorIntelligentProjectImport["memory"]["sections"][number]) {
  const explicit = findNumericByKeys(section.heights, [
    "wallHeightM",
    "ceilingHeightM",
    "clearHeightM",
    "peDireitoM",
    "pe_direito_m",
    "heightM",
  ]);
  if (explicit != null && explicit >= 1.8 && explicit <= 8) return explicit;

  const levels = Array.isArray(section.levels) ? section.levels : [];
  const elevations = levels
    .map((item) => findNumericByKeys(item, ["elevationM", "elevation", "nivelM", "levelM"]))
    .filter((item): item is number => item != null)
    .sort((a, b) => a - b);
  if (elevations.length >= 2) {
    for (let i = 1; i < elevations.length; i += 1) {
      const delta = elevations[i]! - elevations[i - 1]!;
      if (delta >= 1.8 && delta <= 8) return delta;
    }
  }
  return null;
}

export function buildImportedArchitectural3DProfile(
  analysis: Pick<ArqdorIntelligentProjectImport, "memory">,
): ImportedArchitectural3DProfile {
  const warnings: string[] = [];
  const sections = analysis.memory.sections ?? [];
  const floorCount = Math.max(1, Number(analysis.memory.floors ?? analysis.memory.floorPlans.length || 1));

  const sectionHeights = sections
    .map((section) => ({ section, height: sectionWallHeight(section) }))
    .filter((item) => item.height != null);

  const floors = Array.from({ length: floorCount }, (_, floor) => {
    const candidate = sectionHeights[floor] ?? sectionHeights[0] ?? null;
    const wallHeightM = candidate?.height ?? null;
    const levelElevationM = floor === 0
      ? 0
      : floorsElevation(sectionHeights.map((item) => item.height as number), floor);

    return {
      floor,
      label: `Pavimento ${floor + 1}`,
      wallHeightM,
      levelElevationM,
      sourcePages: candidate ? [candidate.section.page] : [],
      evidence: candidate?.section.evidence ?? [],
    };
  });

  const roofSources = [
    analysis.memory.roof,
    ...sections.map((section) => section.roof).filter(Boolean),
  ].filter(Boolean) as JsonRecord[];

  const slopePercent = findNumericByKeys(roofSources, [
    "slopePercent",
    "slope_percent",
    "inclinationPercent",
    "inclination_percent",
    "inclinacaoPercentual",
    "inclinacao_percentual",
  ]);
  const directDegrees = findNumericByKeys(roofSources, [
    "pitchDegrees",
    "pitch_degrees",
    "inclinationDegrees",
    "inclination_degrees",
    "angleDegrees",
  ]);
  const pitchDegrees = normalizePitchDegrees(directDegrees, slopePercent);
  const ridgeElevationM = findNumericByKeys(roofSources, [
    "ridgeElevationM",
    "ridge_elevation_m",
    "cumeeiraM",
    "cumeeira_m",
  ]);
  const roofType = findStringByKeys(roofSources, ["type", "roofType", "roof_type", "tipo"]);
  const roofMaterial = findStringByKeys(roofSources, ["material", "roofMaterial", "roof_material", "telha"]);

  if (!sectionHeights.length) warnings.push("Nenhuma altura vertical explícita confiável foi encontrada nos cortes.");
  if (pitchDegrees == null && roofSources.length) warnings.push("Cobertura identificada, mas sem inclinação numérica segura para parametrizar.");

  const facades = (analysis.memory.facades ?? []).map((facade) => ({
    orientation: facade.orientation ?? "unknown",
    page: facade.page,
    confidence: facade.confidence,
    style: facade.style ?? null,
    materials: facade.materials ?? [],
    architecturalFeatures: facade.architecturalFeatures ?? [],
    heights: facade.heights ?? [],
    evidence: facade.evidence ?? [],
  }));

  const evidenceCount =
    floors.filter((floor) => floor.wallHeightM != null).length
    + (pitchDegrees != null ? 1 : 0)
    + facades.filter((facade) => facade.confidence >= 0.65).length;

  const confidence = clamp(
    (sectionHeights.length ? 0.45 : 0.1)
      + (pitchDegrees != null ? 0.2 : 0)
      + Math.min(0.25, facades.length * 0.06)
      + (roofSources.length ? 0.1 : 0),
    0,
    1,
  );

  return {
    confidence,
    floors,
    roof: {
      type: roofType,
      material: roofMaterial,
      pitchDegrees,
      slopePercent,
      ridgeElevationM,
      sourcePages: sections.filter((section) => section.roof).map((section) => section.page),
      evidence: sections.flatMap((section) => section.roof ? section.evidence : []).slice(0, 100),
    },
    facades,
    warnings,
    canApply: evidenceCount > 0 && confidence >= 0.5,
  };
}

function floorsElevation(heights: number[], floor: number) {
  if (floor <= 0) return 0;
  let total = 0;
  for (let i = 0; i < floor; i += 1) total += heights[i] ?? heights[0] ?? 2.8;
  return Math.round(total * 1000) / 1000;
}
