import type { ConceptFacadePreferences, VolumetryRoom } from "./ConceptVolumetry";
import { normalizeRoofParameters } from "./conceptRoof";
import {
  conceptFloorMaterial,
  materialPrompt,
  normalizeConceptMaterialScheme,
  type ConceptMaterialScheme,
} from "./conceptMaterials";

export type ConceptRenderBriefInput = {
  lotWidth: number;
  lotDepth: number;
  floors: number;
  desiredArea: number;
  rooms: VolumetryRoom[];
  facade: ConceptFacadePreferences;
  materials: ConceptMaterialScheme;
};

const styleLabel: Record<ConceptFacadePreferences["style"], string> = {
  contemporaneo: "contemporary Brazilian residential architecture",
  minimalista: "minimalist Brazilian residential architecture with clean geometric lines",
  classico_contemporaneo: "contemporary classic residential architecture with restrained elegant proportions",
  tropical: "tropical Brazilian architecture with generous openings and integrated landscaping",
  industrial: "contemporary industrial residential architecture with concrete, steel and strong volumes",
  rustico_contemporaneo: "contemporary rustic residential architecture with natural materials and clean volumes",
};


const accentLabel: Record<ConceptFacadePreferences["accentMaterial"], string> = {
  nenhum: "no secondary accent material",
  madeira: "natural wood accent panels",
  pedra: "natural stone accent walls",
  concreto: "exposed concrete accent volumes",
};

const roofLabel: Record<ConceptFacadePreferences["roof"], string> = {
  platibanda: "flat roof concealed behind parapets",
  aparente: "visible pitched roof",
  misto: "mixed roof composition with parapets and selected visible roof planes",
};

const frameLabel: Record<ConceptFacadePreferences["frameTone"], string> = {
  preto: "matte black window and door frames",
  branco: "white window and door frames",
  bronze: "bronze-toned window and door frames",
};

export function buildConceptRenderBrief(input: ConceptRenderBriefInput) {
  const roomSummary = input.rooms
    .filter((room) => room.kind !== "piscina")
    .map((room) => `${room.label}: ${room.width.toFixed(1)} x ${room.depth.toFixed(1)} m, floor ${room.floor + 1}, position (${room.x.toFixed(1)}, ${room.y.toFixed(1)})`)
    .join("; ");

  const pool = input.rooms.find((room) => room.kind === "piscina");
  const facade = input.facade;
  const roof = normalizeRoofParameters(facade);
  const materials = normalizeConceptMaterialScheme(input.materials);
  const floorMaterials = Array.from({ length: input.floors }, (_, floor) =>
    `floor ${floor + 1}: ${materialPrompt(conceptFloorMaterial(materials, floor))}`
  ).join("; ");
  const roofDetails = roof.roof === "platibanda"
    ? `parapet height ${roof.roofParapetHeight.toFixed(2)} m`
    : [
        `${roof.roofWaters} roof plane(s)`,
        `pitch ${roof.roofPitchDeg.toFixed(0)} degrees`,
        `eave overhang ${roof.roofOverhang.toFixed(2)} m`,
        roof.roofWaters === 1
          ? `fall direction ${roof.roofSlopeDirection}`
          : `ridge axis ${roof.roofRidgeOrientation}`,
        roof.roof === "misto"
          ? `parapet share ${Math.round(roof.roofMixedRatio * 100)}% and parapet height ${roof.roofParapetHeight.toFixed(2)} m`
          : null,
      ].filter(Boolean).join(", ");

  return [
    "Convert this conceptual FRONT ELEVATION and the structured plan data into a photorealistic exterior architectural photograph.",
    "CRITICAL PRESERVATION: preserve the number of floors, garage position, main entrance hierarchy, facade proportions, roof strategy and the major opening rhythm shown in the source elevation. Do not invent a different house.",
    `Site: rectangular lot ${input.lotWidth} x ${input.lotDepth} m. Building: ${input.floors} floor(s), target area approximately ${input.desiredArea} m².`,
    `Architectural direction: ${styleLabel[facade.style]}.`,
    `Roof: ${roofLabel[facade.roof]}; ${roofDetails}.`,
    `Main facade material: ${materialPrompt(materials.exteriorWall)}. Secondary accent direction: ${accentLabel[facade.accentMaterial]}.`,
    `Facade tone: ${facade.facadeTone}. Frames: ${frameLabel[facade.frameTone]}.`,
    `Material scheme — floors: ${floorMaterials}. Interior walls: ${materialPrompt(materials.interiorWall)}. Exterior walls: ${materialPrompt(materials.exteriorWall)}. Stairs: ${materialPrompt(materials.stair)}. Roof finish: ${materialPrompt(materials.roof)}.`,
    "Respect these specified materials and colors wherever their corresponding modeled surfaces are visible. Do not substitute unrelated finishes.",
    `Landscaping intensity: ${facade.landscaping}. Use realistic Brazilian residential landscaping without blocking the architecture.`,
    pool
      ? `Preserve the pool exactly at its modeled position and approximate size ${pool.width.toFixed(1)} x ${pool.depth.toFixed(1)} m.`
      : "Do not invent a swimming pool.",
    "Refine facade openings and entrance details only within the composition shown in the source elevation. Keep the garage, social facade and upper-floor composition recognizable.",
    "Use realistic exterior materials, physically plausible daylight, architectural shadows, reflections and professional real-estate photography quality.",
    "Use a frontal or slight 3/4 architectural camera that clearly preserves the source elevation composition; avoid aerial or distorted perspectives.",
    `Structured room reference for preservation: ${roomSummary}`,
    "This is a CONCEPTUAL pre-project visualization, not a technical or construction document.",
  ].join("\n");
}

export async function svgElementToPngDataUrl(svg: SVGSVGElement, scale = 1.7) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(800, Math.round((viewBox.width || svg.clientWidth || 900) * scale));
  const height = Math.max(560, Math.round((viewBox.height || svg.clientHeight || 650) * scale));

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível preparar a volumetria para o render."));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível para gerar a imagem-base.");

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png", 0.96);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
