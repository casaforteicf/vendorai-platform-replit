import { validateConceptLayout, type ConceptRoomShape, type LayoutIssue } from "./conceptGeometry";
import { evaluateConceptErgonomics, type ErgonomicResult } from "./conceptErgonomics";
import { evaluateFurniturePlacement, type FurniturePlacementResult } from "./conceptFurniturePlacement";
import { evaluateCirculationAndDoorSwing, type CirculationResult } from "./conceptCirculation";
import { evaluateDaylightVentilationSolar, type DaylightVentilationResult } from "./conceptClimatePerformance";
import { evaluatePrivacyAcousticZoning, type PrivacyAcousticResult } from "./conceptPrivacyAcoustic";
import { evaluateConstructability, type ConstructabilityResult } from "./conceptConstructability";
import { evaluateBuildabilityCost, type BuildabilityResult } from "./conceptBuildabilityCost";

export type ConceptAcceptanceStatus = "approved" | "review" | "blocked";

export type ConceptAcceptanceResult = {
  status: ConceptAcceptanceStatus;
  score: number;
  issues: LayoutIssue[];
  errors: LayoutIssue[];
  warnings: LayoutIssue[];
  majorWarnings: LayoutIssue[];
  blockingIssueIds: string[];
  ergonomics: ErgonomicResult;
  furniture: FurniturePlacementResult;
  circulation: CirculationResult;
  climate: DaylightVentilationResult;
  privacyAcoustic: PrivacyAcousticResult;
  constructability: ConstructabilityResult;
  buildability: BuildabilityResult;
};

const MAJOR_WARNING_PREFIXES = [
  "private-access-",
  "natural-opening-",
  "functional-width-",
  "circulation-missing-",
  "service-private-adjacency-",
  "garage-access-",
];

function isMajorWarning(issue: LayoutIssue) {
  return issue.severity === "warning" && MAJOR_WARNING_PREFIXES.some((prefix) => issue.id.includes(prefix));
}

/**
 * Etapa 77 — gate único de aceite do pré-projeto.
 *
 * Regras:
 * - qualquer erro geométrico/funcional bloqueia a alternativa;
 * - avisos funcionais relevantes exigem revisão;
 * - acúmulo de avisos também impede "aprovação silenciosa";
 * - score é explicativo e nunca substitui as issues detalhadas.
 */
export function evaluateConceptAcceptance(input: {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  floors: number;
  site?: {
    frontSide?: "top" | "bottom" | "left" | "right";
    setbackFront?: number;
    northSide?: "top" | "bottom" | "left" | "right" | null;
  };
}): ConceptAcceptanceResult {
  const issues: LayoutIssue[] = [];

  for (let floor = 0; floor < Math.max(1, input.floors); floor += 1) {
    issues.push(
      ...validateConceptLayout(input.rooms, input.lotWidth, input.lotDepth, floor, input.site)
        .map((issue) => ({
          ...issue,
          id: `floor-${floor}-${issue.id}`,
          message: `Pavimento ${floor + 1}: ${issue.message}`,
        })),
    );
  }

  const ergonomics = evaluateConceptErgonomics(input.rooms);
  for (const ergonomic of ergonomics.issues) {
    issues.push({
      id: ergonomic.id,
      severity: ergonomic.severity,
      roomId: ergonomic.roomId,
      message: ergonomic.message,
    });
  }

  const furniture = evaluateFurniturePlacement(input.rooms, input.lotWidth, input.lotDepth);
  for (const furnitureIssue of furniture.issues) {
    issues.push({
      id: furnitureIssue.id,
      severity: furnitureIssue.severity,
      roomId: furnitureIssue.roomId,
      message: furnitureIssue.message,
    });
  }

  const circulation = evaluateCirculationAndDoorSwing(
    input.rooms,
    input.lotWidth,
    input.lotDepth,
    furniture.items,
  );
  for (const circulationIssue of circulation.issues) {
    issues.push({
      id: circulationIssue.id,
      severity: circulationIssue.severity,
      roomId: circulationIssue.roomId,
      message: circulationIssue.message,
    });
  }

  const climate = evaluateDaylightVentilationSolar(
    input.rooms,
    input.lotWidth,
    input.lotDepth,
    {
      frontSide: input.site?.frontSide,
      northSide: input.site?.northSide,
    },
  );
  for (const climateIssue of climate.issues) {
    if (climateIssue.id === "solar-insufficient-orientation") continue;
    issues.push({
      id: climateIssue.id,
      severity: climateIssue.severity,
      roomId: climateIssue.roomId,
      message: climateIssue.message,
    });
  }

  const privacyAcoustic = evaluatePrivacyAcousticZoning(
    input.rooms,
    input.lotWidth,
    input.lotDepth,
    { frontSide: input.site?.frontSide },
  );
  for (const paIssue of privacyAcoustic.issues) {
    issues.push({
      id: paIssue.id,
      severity: paIssue.severity,
      roomId: paIssue.roomIds[0],
      message: paIssue.message,
    });
  }

  const constructability = evaluateConstructability(input.rooms);
  for (const constructIssue of constructability.issues) {
    issues.push({
      id: constructIssue.id,
      severity: constructIssue.severity,
      roomId: constructIssue.roomIds[0],
      message: constructIssue.message,
    });
  }

  const buildability = evaluateBuildabilityCost(input.rooms);
  for (const buildIssue of buildability.issues) {
    issues.push({
      id: buildIssue.id,
      severity: buildIssue.severity,
      roomId: buildIssue.roomIds[0],
      message: buildIssue.message,
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const majorWarnings = warnings.filter(isMajorWarning);

  const rawScore =
    100
    - errors.length * 30
    - majorWarnings.length * 12
    - (warnings.length - majorWarnings.length) * 5;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let status: ConceptAcceptanceStatus = "approved";
  if (errors.length > 0 || score < 60) {
    status = "blocked";
  } else if (majorWarnings.length > 0 || warnings.length >= 3 || score < 85) {
    status = "review";
  }

  return {
    status,
    score,
    issues,
    errors,
    warnings,
    majorWarnings,
    blockingIssueIds: errors.map((issue) => issue.id),
    ergonomics,
    furniture,
    circulation,
    climate,
    privacyAcoustic,
    constructability,
    buildability,
  };
}
