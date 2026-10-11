import type { SurveyElement } from "./SurveyElementsEditor";

/** Builds an editable draft in meters, without changing an existing project. */
export function convertSurveyToArqdor(elements: SurveyElement[]) {
  const warnings: string[] = [];
  const walls = elements.filter((e) => e.elementType === "wall");
  const validWalls = walls.filter((e) => e.verified && [e.x1Mm,e.y1Mm,e.x2Mm,e.y2Mm].every((n) => typeof n === "number" && Number.isFinite(n)) && Math.hypot((e.x2Mm ?? 0)-(e.x1Mm ?? 0),(e.y2Mm ?? 0)-(e.y1Mm ?? 0)) >= 10);
  if (validWalls.length !== walls.length) warnings.push("Existem paredes sem coordenadas ou conferência.");
  const customWalls = validWalls.map((w) => ({
    id: w.id, floor: 0,
    x1: w.x1Mm! / 1000, y1: w.y1Mm! / 1000,
    x2: w.x2Mm! / 1000, y2: w.y2Mm! / 1000,
    thickness: (w.thicknessMm ?? 150) / 1000,
  }));
  const wallIds = new Set(customWalls.map((w) => w.id));
  const openings = elements.filter((e) => e.elementType === "door" || e.elementType === "window");
  const customOpenings = openings.filter((e) =>
    e.verified && e.wallId && wallIds.has(e.wallId) &&
    typeof e.widthMm === "number" && e.widthMm > 0 &&
    typeof e.heightMm === "number" && e.heightMm > 0 &&
    typeof e.offsetMm === "number" && e.offsetMm >= 0 &&
    (e.elementType === "door" || typeof e.sillHeightMm === "number")
  ).map((e) => ({
    id: e.id, wallId: e.wallId!, floor: 0,
    type: e.elementType as "door" | "window",
    offset: e.offsetMm! / 1000, width: e.widthMm! / 1000,
    height: e.heightMm! / 1000,
    sillHeight: (e.sillHeightMm ?? 0) / 1000,
  }));
  if (customOpenings.length !== openings.length) warnings.push("Existem aberturas pendentes ou sem parede válida.");
  if (!customWalls.length) warnings.push("Nenhuma parede validada para conversão.");
  for (const opening of customOpenings) {
    const wall = customWalls.find((entry) => entry.id === opening.wallId);
    if (!wall) continue;
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (opening.offset + opening.width > length + 0.00001)
      warnings.push("Abertura " + opening.id + " ultrapassa a parede.");
  }
  for (let i = 0; i < customOpenings.length; i++) {
    for (let j = i + 1; j < customOpenings.length; j++) {
      const a = customOpenings[i], other = customOpenings[j];
      if (a.wallId !== other.wallId) continue;
      if (a.offset < other.offset + other.width && other.offset < a.offset + a.width &&
          a.sillHeight < other.sillHeight + other.height && other.sillHeight < a.sillHeight + a.height)
        warnings.push("Aberturas sobrepostas na parede " + a.wallId + ".");
    }
  }
  const endpoints = customWalls.flatMap((w) => [{wallId:w.id,x:w.x1,y:w.y1},{wallId:w.id,x:w.x2,y:w.y2}]);
  for (const wall of customWalls) {
    const start = endpoints.some((p) => p.wallId !== wall.id && Math.hypot(p.x-wall.x1,p.y-wall.y1) < 0.005);
    const end = endpoints.some((p) => p.wallId !== wall.id && Math.hypot(p.x-wall.x2,p.y-wall.y2) < 0.005);
    if (!start || !end) warnings.push("Parede " + wall.id + " possui extremidades sem conexão comprovada.");
  }
  if (walls.length !== new Set(walls.map((w) => w.id)).size) warnings.push("IDs duplicados no levantamento.");
  return {
    schemaVersion: 1, generatedFrom: "arqdor_measure", previewOnly: true,
    configuration: { projectScope: "room" as const, floors: 1, customWalls, customOpenings },
    warnings,
    readyForReview: customWalls.length > 0 && warnings.length === 0,
  };
}
