import type { ConceptPlanObject } from "../ConceptPlan2D";

export type ConceptModelDefinition = {
  id: string;
  kind: ConceptPlanObject["kind"];
  label: string;
  url: string;
  license: string;
  source: string;
  targetHeight?: number;
  targetWidth?: number;
  targetDepth?: number;
};

const KH = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";

export const CONCEPT_MODEL_CATALOG: Partial<Record<ConceptPlanObject["kind"], ConceptModelDefinition>> = {
  sofa: {
    id: "khronos-sheen-wood-leather-sofa",
    kind: "sofa",
    label: "Sofá realista",
    url: `${KH}/SheenWoodLeatherSofa/glTF-Binary/SheenWoodLeatherSofa.glb`,
    license: "CC0 / CC BY 4.0",
    source: "Khronos glTF Sample Assets",
    targetHeight: 0.92,
  },
  chair: {
    id: "khronos-sheen-chair",
    kind: "chair",
    label: "Cadeira realista",
    url: `${KH}/SheenChair/glTF-Binary/SheenChair.glb`,
    license: "CC0",
    source: "Khronos glTF Sample Assets",
    targetHeight: 0.95,
  },
  lamp: {
    id: "khronos-punctual-lamp",
    kind: "lamp",
    label: "Luminária realista",
    url: `${KH}/LightsPunctualLamp/glTF-Binary/LightsPunctualLamp.glb`,
    license: "CC BY 4.0",
    source: "Khronos glTF Sample Assets",
    targetHeight: 1.55,
  },
};

export function getConceptModelDefinition(object: ConceptPlanObject) {
  if (object.model3dUrl) {
    return {
      id: object.catalogProductId ? `catalog-${object.catalogProductId}` : `custom-${object.id}`,
      kind: object.kind,
      label: object.label,
      url: object.model3dUrl,
      license: "catalog",
      source: object.supplier ?? "Catálogo Arqdor",
    } satisfies ConceptModelDefinition;
  }
  return CONCEPT_MODEL_CATALOG[object.kind] ?? null;
}
