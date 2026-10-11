import type { PanelPart, PanelMaterial } from "./furniture-engineering-core";

/** Identidade e manufatura de cada peça física — Arqdor lote 13.
 * Coordenadas de furação em mm, referenciadas ao canto de origem e face especificada.
 * Nenhuma operação deve ser enviada diretamente para CNC sem revisão de engenharia.
 */
export type DrillingOperation = {
  id: string;
  kind: "hole" | "slot" | "pocket" | "groove";
  face: "A" | "B" | "edge-top" | "edge-bottom" | "edge-left" | "edge-right";
  xMm: number;
  yMm: number;
  diameterMm?: number;
  depthMm: number;
  lengthMm?: number;
  hardwareSku?: string;
  notes?: string;
};
export type IdentifiedPanelPart = PanelPart & {
  roomId: string;
  roomName: string;
  furnitureName: string;
  itemName?: string;
  revision: string;
  operations: DrillingOperation[];
};
export type PartLabel = {
  code: string;
  partId: string;
  instance: number;
  projectId: string;
  room: string;
  furniture: string;
  piece: string;
  item: string;
  revision: string;
  material: string;
  sku: string;
  dimensions: string;
  edgeSummary: string;
  operationCount: number;
  drillingSummary: string;
  qrPayload: string;
};
const requireText = (v: string, field: string) => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
};
const finiteNonnegative = (v: number, field: string) => {
  if (!Number.isFinite(v) || v < 0) throw new Error(`Invalid ${field}`);
};
export function validatePartDrilling(part: IdentifiedPanelPart): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const op of part.operations) {
    requireText(op.id, "operation ID");
    if (ids.has(op.id)) issues.push(`Duplicate operation: ${op.id}`);
    ids.add(op.id);
    for (const [key, value] of [["xMm", op.xMm], ["yMm", op.yMm], ["depthMm", op.depthMm]] as const)
      finiteNonnegative(value, key);
    if (op.diameterMm !== undefined) finiteNonnegative(op.diameterMm, "diameterMm");
    if (op.lengthMm !== undefined) finiteNonnegative(op.lengthMm, "lengthMm");
    const edge = op.face.startsWith("edge-");
    if (!edge && (op.xMm > part.widthMm || op.yMm > part.lengthMm))
      issues.push(`Operation ${op.id} is outside panel bounds`);
    if (!edge && op.depthMm > 0)
      issues.push(`Check depth and face for operation ${op.id} against actual panel thickness`);
  }
  return issues;
}
/** Etiquetas distintas por unidade física: código estável dentro de uma revisão. */
export function buildPartLabels(
  input: { tenantId: string; projectId: string; parts: readonly IdentifiedPanelPart[]; materials: readonly PanelMaterial[] },
): PartLabel[] {
  requireText(input.tenantId, "tenantId");
  requireText(input.projectId, "projectId");
  const mats = new Map(input.materials.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const labels: PartLabel[] = [];
  for (const part of input.parts) {
    if (part.tenantId !== input.tenantId || part.projectId !== input.projectId)
      throw new Error(`Part outside tenant/project: ${part.id}`);
    requireText(part.id, "part.id");
    requireText(part.name, "part.name");
    requireText(part.roomId, "roomId");
    requireText(part.roomName, "roomName");
    requireText(part.furnitureId, "furnitureId");
    requireText(part.furnitureName, "furnitureName");
    requireText(part.revision, "revision");
    if (seen.has(part.id)) throw new Error(`Duplicate part ID: ${part.id}`);
    seen.add(part.id);
    if (!Number.isSafeInteger(part.quantity) || part.quantity < 1)
      throw new Error(`Invalid quantity: ${part.id}`);
    for (const [k,v] of [["widthMm",part.widthMm],["lengthMm",part.lengthMm]] as const) {
      finiteNonnegative(v,k);
      if (v === 0) throw new Error(`Zero size: ${part.id}`);
    }
    const material = mats.get(part.materialId);
    if (!material || material.tenantId !== input.tenantId)
      throw new Error(`Material missing or outside tenant: ${part.materialId}`);
    const issues = validatePartDrilling(part);
    if (issues.some((i) => i.startsWith("Duplicate") || i.includes("outside panel")))
      throw new Error(`Invalid operations for ${part.id}: ${issues.join("; ")}`);
    const edgeSummary = Object.entries(part.edges).filter(([,value]) => Boolean(value))
      .map(([side,e]) => `${side}: ${e!.manufacturer} ${e!.sku} ${e!.color}`).join(" | ") || "Sem fita";
    const drillingSummary = part.operations.length
      ? part.operations.map((op) => `${op.kind}/${op.face} (${op.xMm},${op.yMm}) Ø${op.diameterMm ?? "-"} prof.${op.depthMm} mm`).join("; ")
      : "Sem operações";
    for (let instance=1; instance<=part.quantity; instance++) {
      const code = `${part.furnitureId}/${part.id}/R${part.revision}/${instance}`;
      labels.push({
        code, partId: part.id, instance, projectId: part.projectId,
        room: part.roomName, furniture: part.furnitureName,
        piece: part.name, item: part.itemName ?? part.parentItemId ?? part.furnitureName,
        revision: part.revision,
        material: `${material.manufacturer} / ${material.line} / ${material.color}`,
        sku: material.sku, dimensions: `${part.widthMm} × ${part.lengthMm} × ${material.thicknessMm} mm`,
        edgeSummary, operationCount: part.operations.length, drillingSummary,
        qrPayload: JSON.stringify({
          kind: "arqdor-furniture-part", version: 1,
          tenantId: part.tenantId, projectId: part.projectId,
          furnitureId: part.furnitureId, roomId: part.roomId,
          partId: part.id, revision: part.revision, instance,
        }),
      });
    }
  }
  return labels;
}
