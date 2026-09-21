import type { ConceptFacadePreferences, VolumetryRoom } from "./ConceptVolumetry";
import {
  getFacadeMaterial,
  type FacadeDesignState,
} from "./conceptFacadeDesign";

export type ConceptRenderBriefInput = {
  lotWidth: number;
  lotDepth: number;
  floors: number;
  desiredArea: number;
  rooms: VolumetryRoom[];
  facade: ConceptFacadePreferences;
  facadeDesign?: FacadeDesignState;
  renderView?: "exterior" | "interior";
  objects?: Array<{
    kind: string;
    label: string;
    floor: number;
    x: number;
    y: number;
    width: number;
    depth: number;
    rotation: number;
    materialId?: string;
  }>;
  wallMaterialIds?: string[];
  floorMaterialIds?: string[];
};

const styleLabel: Record<ConceptFacadePreferences["style"], string> = {
  contemporaneo: "contemporary Brazilian residential architecture",
  minimalista: "minimalist Brazilian residential architecture with clean geometric lines",
  classico_contemporaneo: "contemporary classic residential architecture with restrained elegant proportions",
  tropical: "tropical Brazilian architecture with generous openings and integrated landscaping",
  industrial: "contemporary industrial residential architecture with concrete, steel and strong volumes",
  rustico_contemporaneo: "contemporary rustic residential architecture with natural materials and clean volumes",
};

const materialLabel: Record<ConceptFacadePreferences["primaryMaterial"], string> = {
  pintura: "painted stucco/render",
  madeira: "natural wood cladding",
  pedra: "natural stone cladding",
  concreto: "exposed architectural concrete",
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
  const renderView = input.renderView ?? "exterior";
  const roomSummary = input.rooms
    .filter((room) => room.kind !== "piscina")
    .map((room) => `${room.label}: ${room.width.toFixed(1)} x ${room.depth.toFixed(1)} m, floor ${room.floor + 1}, position (${room.x.toFixed(1)}, ${room.y.toFixed(1)})`)
    .join("; ");

  const pool = input.rooms.find((room) => room.kind === "piscina");
  const facade = input.facade;
  const design = input.facadeDesign;
  const surfaceSummary = design
    ? [
        `main walls: ${getFacadeMaterial(design.surfaceMaterials.main).name}`,
        `accent: ${getFacadeMaterial(design.surfaceMaterials.accent).name}`,
        `garage: ${getFacadeMaterial(design.surfaceMaterials.garage).name}`,
        `entrance: ${getFacadeMaterial(design.surfaceMaterials.entrance).name}`,
        `paving: ${getFacadeMaterial(design.surfaceMaterials.paving).name}`,
        `frames: ${getFacadeMaterial(design.surfaceMaterials.frames).name}`,
      ].join("; ")
    : null;
  const objectSummary = input.objects?.length
    ? input.objects.map((object) =>
        `${object.label} (${object.kind}), floor ${object.floor + 1}, position (${object.x.toFixed(2)}, ${object.y.toFixed(2)}), size ${object.width.toFixed(2)} x ${object.depth.toFixed(2)} m, rotation ${Math.round(object.rotation)}°, material ${object.materialId ?? "automatic"}`
      ).join("; ")
    : null;
  const uniqueWallMaterials = [...new Set((input.wallMaterialIds ?? []).filter(Boolean))];
  const uniqueFloorMaterials = [...new Set((input.floorMaterialIds ?? []).filter(Boolean))];

  const volumeSummary = design?.volumes.length
    ? design.volumes.map((volume) =>
        `${volume.label} (${volume.kind}), position ${volume.x.toFixed(0)}%/${volume.y.toFixed(0)}%, size ${volume.width.toFixed(0)}% x ${volume.height.toFixed(0)}%, projection ${volume.depth.toFixed(1)} m, material ${getFacadeMaterial(volume.materialId).name}`
      ).join("; ")
    : null;

  return [
    renderView === "interior"
      ? "Convert this synchronized 3D architectural model into a photorealistic INTERIOR architectural visualization from the current camera/view direction."
      : "Convert this conceptual FRONT ELEVATION and the structured plan data into a photorealistic exterior architectural photograph.",
    renderView === "interior"
      ? "CRITICAL PRESERVATION: preserve the modeled floor plan geometry, wall positions, openings, furniture placement, object rotation, room proportions and material assignments visible in the source 3D view. Do not redesign the layout."
      : "CRITICAL PRESERVATION: preserve the number of floors, garage position, main entrance hierarchy, facade proportions, roof strategy and the major opening rhythm shown in the source elevation. Do not invent a different house.",
    `Site: rectangular lot ${input.lotWidth} x ${input.lotDepth} m. Building: ${input.floors} floor(s), target area approximately ${input.desiredArea} m².`,
    `Architectural direction: ${styleLabel[facade.style]}.`,
    `Roof: ${roofLabel[facade.roof]}.`,
    surfaceSummary
      ? `Exact facade material schedule selected by the user: ${surfaceSummary}. Preserve these assignments.`
      : `Main facade material: ${materialLabel[facade.primaryMaterial]}. Secondary accent: ${accentLabel[facade.accentMaterial]}.`,
    `Facade tone: ${facade.facadeTone}. Frames: ${frameLabel[facade.frameTone]}.`,
    renderView === "interior"
      ? "Interior lighting: physically plausible daylight plus warm architectural lighting. Keep a realistic Brazilian residential scale and material response."
      : `Landscaping intensity: ${facade.landscaping}. Use realistic Brazilian residential landscaping without blocking the architecture.`,
    design ? `Lighting scenario selected in editor: ${design.lighting}. Landscaping visibility: ${design.showLandscaping ? "on" : "off"}.` : "",
    volumeSummary
      ? `CRITICAL VOLUMETRY PRESERVATION: preserve these added facade volumes and their relative positions/projections: ${volumeSummary}.`
      : "Do not invent decorative facade volumes that are not present in the source elevation.",
    pool
      ? `Preserve the pool exactly at its modeled position and approximate size ${pool.width.toFixed(1)} x ${pool.depth.toFixed(1)} m.`
      : "Do not invent a swimming pool.",
    renderView === "interior"
      ? "Preserve all modeled openings and furniture. Improve only realism, material quality, lighting, decor coherence and photographic finish without changing positions or dimensions."
      : "Refine facade openings and entrance details only within the composition shown in the source elevation. Keep the garage, social facade and upper-floor composition recognizable.",
    "Use realistic exterior materials, physically plausible daylight, architectural shadows, reflections and professional real-estate photography quality.",
    renderView === "interior"
      ? "Preserve the current 3D camera direction as closely as possible. Use natural eye-level architectural perspective; avoid fisheye distortion."
      : "Use a frontal or slight 3/4 architectural camera that clearly preserves the source elevation composition; avoid aerial or distorted perspectives.",
    `Structured room reference for preservation: ${roomSummary}`,
    objectSummary ? `CRITICAL FURNITURE/OBJECT PRESERVATION: ${objectSummary}` : "",
    uniqueWallMaterials.length ? `Wall material IDs selected in editor: ${uniqueWallMaterials.join(", ")}. Preserve these assignments where visible.` : "",
    uniqueFloorMaterials.length ? `Floor material IDs selected in editor: ${uniqueFloorMaterials.join(", ")}. Preserve these assignments where visible.` : "",
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
