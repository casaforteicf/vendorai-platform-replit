import { buildFurnitureCuttingReport, type PanelMaterial, type CuttingReport } from "./furniture-engineering-core";
import { buildPartLabels, validatePartDrilling, type IdentifiedPanelPart, type PartLabel } from "./furniture-part-labels";

/** Lote 13.37 — caderno técnico estruturado; não é desenho CAD ou PDF. */
export type TechnicalIssue = {
  partId: string;
  severity: "blocking" | "review";
  description: string;
};
export type TechnicalPiece = {
  id: string;
  name: string;
  furnitureId: string;
  furnitureName: string;
  roomId: string;
  roomName: string;
  revision: string;
  quantity: number;
  material: { id: string; manufacturer: string; sku: string; color: string; thicknessMm: number };
  dimensionsMm: { width: number; length: number; thickness: number };
  edges: IdentifiedPanelPart["edges"];
  operations: IdentifiedPanelPart["operations"];
  labels: PartLabel[];
};
export type TechnicalFurniture = {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  pieces: TechnicalPiece[];
};
export type TechnicalRoom = { id: string; name: string; furniture: TechnicalFurniture[] };
export type TechnicalDossier = {
  tenantId: string;
  projectId: string;
  revision: string;
  rooms: TechnicalRoom[];
  materials: CuttingReport["materials"];
  edges: CuttingReport["edges"];
  preliminaryCuttingPlan: CuttingReport["sheets"];
  labels: PartLabel[];
  issues: TechnicalIssue[];
  status: "blocked" | "review-required";
  productionReady: false;
  notes: string[];
};

export function buildFurnitureTechnicalDossier(input: {
  tenantId: string; projectId: string; revision: string;
  parts: readonly IdentifiedPanelPart[]; materials: readonly PanelMaterial[];
  kerfMm?: number; marginMm?: number;
}): TechnicalDossier {
  if (!input.revision.trim()) throw new Error("Revision required");
  const materialIndex = new Map(input.materials.map(m => [m.id, m]));
  const cutting = buildFurnitureCuttingReport(input);
  const labels = buildPartLabels(input);
  const labelIndex = new Map<string, PartLabel[]>();
  for (const label of labels) labelIndex.set(label.partId, [...(labelIndex.get(label.partId) ?? []), label]);
  const issues: TechnicalIssue[] = [];
  const rooms = new Map<string, TechnicalRoom>();
  for (const part of input.parts) {
    if (part.revision !== input.revision)
      issues.push({partId:part.id,severity:"blocking",description:"Peça com revisão divergente do caderno"});
    const material = materialIndex.get(part.materialId)!;
    for (const finding of validatePartDrilling(part))
      issues.push({partId:part.id,severity: finding.includes("outside") || finding.includes("Duplicate") ? "blocking" : "review",description:finding});
    // A relação com o catálogo não significa que o processo construtivo esteja homologado.
    if (part.operations.length === 0)
      issues.push({partId:part.id,severity:"review",description:"Sem operações declaradas; confirmar se a peça não necessita usinagem"});
    let room = rooms.get(part.roomId);
    if (!room) {
      room = {id:part.roomId,name:part.roomName,furniture:[]};
      rooms.set(part.roomId,room);
    }
    let furniture = room.furniture.find(f => f.id === part.furnitureId);
    if (!furniture) {
      furniture = {id:part.furnitureId,name:part.furnitureName,roomId:part.roomId,roomName:part.roomName,pieces:[]};
      room.furniture.push(furniture);
    }
    furniture.pieces.push({
      id:part.id,name:part.name,furnitureId:part.furnitureId,furnitureName:part.furnitureName,
      roomId:part.roomId,roomName:part.roomName,revision:part.revision,quantity:part.quantity,
      material:{id:material.id,manufacturer:material.manufacturer,sku:material.sku,color:material.color,thicknessMm:material.thicknessMm},
      dimensionsMm:{width:part.widthMm,length:part.lengthMm,thickness:material.thicknessMm},
      edges:{...part.edges},operations:part.operations.map(o=>({...o})),labels:labelIndex.get(part.id) ?? [],
    });
  }
  for (const warning of cutting.warnings) {
    if (warning.includes("exceeds stock sheet")) {
      const id = warning.split(" ")[1] ?? "unknown";
      issues.push({partId:id,severity:"blocking",description:warning});
    }
  }
  return {
    tenantId:input.tenantId,projectId:input.projectId,revision:input.revision,
    rooms:[...rooms.values()],materials:cutting.materials,edges:cutting.edges,
    preliminaryCuttingPlan:cutting.sheets,labels,issues,
    status:issues.some(i=>i.severity==="blocking") ? "blocked" : "review-required",
    productionReady:false,
    notes:["Caderno técnico estruturado preliminar. Desenhos cotados, PDF e homologação industrial ainda pendentes.",
      "Plano de corte preliminar não corresponde a nesting otimizado nem autoriza fabricação.",
      "Revisar manualmente furações, montagem, ferragens e dimensionamento antes da liberação."],
  };
}
