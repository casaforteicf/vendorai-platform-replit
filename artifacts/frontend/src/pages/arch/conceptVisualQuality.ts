import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape, LayoutIssue } from "./conceptGeometry";
import { validateConceptLayout } from "./conceptGeometry";
import type { FacadeDesignState } from "./conceptFacadeDesign";
import { buildDerivedFacadeModel } from "./conceptFacadeGeometry";
import type { SitePlacement } from "./conceptSitePlacement";

type ObjectFootprint = { id: string; label: string; floor: number; x: number; y: number; width: number; depth: number; rotation: number };

/** Shared preflight for the plan, 3D camera and facade, before spending a render. */
export function inspectConceptVisualQuality(input: {
  rooms: ConceptRoomShape[]; levels: ConceptModelLevel[]; lotWidth: number; lotDepth: number;
  wallFirstFloors: number[]; objects: ObjectFootprint[]; design: FacadeDesignState; placement: SitePlacement;
}): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  for (const level of input.levels) {
    if (!input.wallFirstFloors.includes(level.floor)) {
      issues.push(...validateConceptLayout(input.rooms, input.lotWidth, input.lotDepth, level.floor, input.placement)
        .map((issue) => ({ ...issue, id: `floor-${level.floor}-${issue.id}`, message: `Pavimento ${level.floor + 1}: ${issue.message}` })));
    }
    for (const opening of level.openings) {
      const width = opening.width ?? (opening.type === "door" ? 0.9 : 1.2);
      const height = opening.height ?? (opening.type === "door" ? 2.1 : 1.2);
      const sill = opening.type === "door" ? 0 : opening.sillHeight ?? 0.9;
      if (![opening.x, opening.y, width, height, sill].every(Number.isFinite) || width <= 0 || height <= 0 || sill < 0 || height + sill > 2.8 + 0.01) {
        issues.push({ id: `opening-${level.floor}-${opening.id}`, severity: "error", message: `Pavimento ${level.floor + 1}: há uma ${opening.type === "door" ? "porta" : "janela"} que excede a altura da parede ou tem dimensões inválidas. Ajuste-a na planta.` });
      }
    }
  }
  for (const object of input.objects) {
    if (![object.x, object.y, object.width, object.depth, object.rotation].every(Number.isFinite) || object.width <= 0 || object.depth <= 0) {
      issues.push({ id: `object-${object.id}`, severity: "error", message: `${object.label}: dimensões inválidas. Ajuste o objeto antes de renderizar.` });
    }
  }
  const facade = buildDerivedFacadeModel(input.levels, input.rooms, input.placement);
  for (const volume of input.design.volumes) {
    if (![volume.x, volume.y, volume.width, volume.height, volume.depth].every(Number.isFinite)
      || volume.width <= 0 || volume.height <= 0 || volume.x < 0 || volume.y < 0
      || volume.x + volume.width > 100.01 || volume.y + volume.height > 100.01) {
      issues.push({ id: `volume-${volume.id}`, severity: "error", message: `${volume.label}: o volume ultrapassa a composição. Ajuste sua posição ou tamanho na fachada.` });
    }
    // Surface cladding and open frames may share a wall with an opening. Solid
    // projections must be reviewed: do not silently erase the user's volumes.
    if (!["box", "garage", "planter"].includes(volume.kind)) continue;
    const reverse = input.placement.frontSide === "bottom" || input.placement.frontSide === "left";
    const hit = facade.openings.some((opening) => {
      const center = (reverse ? facade.maxAxis - opening.axis : opening.axis - facade.minAxis) / facade.width * 100;
      const x = center - opening.width / facade.width * 50;
      const w = opening.width / facade.width * 100;
      const y = (facade.height - opening.floor * 2.96 - 0.16 - opening.height - opening.sillHeight) / facade.height * 100;
      const h = opening.height / facade.height * 100;
      return Math.min(x + w, volume.x + volume.width) - Math.max(x, volume.x) > 0.1
        && Math.min(y + h, volume.y + volume.height) - Math.max(y, volume.y) > 0.1;
    });
    if (hit) issues.push({ id: `volume-opening-${volume.id}`, severity: "error", message: `${volume.label} atravessa uma porta ou janela. Reposicione o volume na fachada antes de renderizar.` });
  }
  return issues;
}
