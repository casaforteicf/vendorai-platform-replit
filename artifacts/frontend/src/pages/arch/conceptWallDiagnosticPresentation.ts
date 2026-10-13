import type { ConceptWallDiagnostic } from "./conceptWallDiagnostics";

const issueLabels: Record<ConceptWallDiagnostic["issues"][number]["code"], string> = {
  INVALID_LOT: "Dimensões do terreno inválidas",
  INVALID_WALL_ID: "Identificador da parede ausente ou inválido",
  INVALID_FLOOR: "Pavimento inválido",
  INVALID_TOLERANCE: "Precisão geométrica inválida",
  DUPLICATE_ID: "Identificador de parede duplicado",
  INVALID_COORDINATE: "Coordenadas inválidas",
  OUTSIDE_LOT: "Parede fora dos limites do terreno",
  ZERO_LENGTH: "Parede sem comprimento",
  INVALID_THICKNESS: "Espessura da parede inválida",
};

export type WallDiagnosticItem = {
  id: string;
  label: string;
  wallIds: string[];
  severity: "error" | "info";
};

export function describeWallDiagnostics(report: ConceptWallDiagnostic): WallDiagnosticItem[] {
  return [
    ...report.issues.map((item, index) => ({
      id: `issue-${index}-${item.wallId}`,
      label: issueLabels[item.code],
      wallIds: item.wallId ? [item.wallId] : [],
      severity: "error" as const,
    })),
    ...report.overlaps.map((item, index) => ({
      id: `overlap-${index}-${item.firstWallId}-${item.secondWallId}`,
      label: `Paredes sobrepostas (${item.length.toFixed(2)} m)`,
      wallIds: [item.firstWallId, item.secondWallId],
      severity: "error" as const,
    })),
    ...report.junctions.map((item, index) => ({
      id: `junction-${index}-${item.firstWallId}-${item.secondWallId}`,
      label: item.kind === "tee" ? "Encontro em T" : item.kind === "crossing" ? "Cruzamento de paredes" : "Encontro de extremidades",
      wallIds: [item.firstWallId, item.secondWallId],
      severity: "info" as const,
    })),
  ];
}
