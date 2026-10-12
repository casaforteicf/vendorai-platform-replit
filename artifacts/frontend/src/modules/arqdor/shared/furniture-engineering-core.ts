/**
 * ARQDOR LOTE 13 — núcleo puro de peças, materiais e pré-plano de corte.
 * Unidade única: milímetros. Nenhuma saída deste módulo é programa CNC.
 * Cada peça tem ID estável, mesmo se a aparência de outra peça for idêntica.
 */
export type PanelMaterial = {
  id: string;
  tenantId: string;
  manufacturer: string;
  line: string;
  sku: string;
  color: string;
  thicknessMm: number;
  stockWidthMm: number;
  stockLengthMm: number;
  grain: "none" | "length" | "width";
};
export type EdgeSpec = {
  materialId: string;
  manufacturer: string;
  sku: string;
  color: string;
  thicknessMm: number;
};
export type PanelPart = {
  id: string;
  tenantId: string;
  projectId: string;
  furnitureId: string;
  parentItemId?: string;
  name: string;
  quantity: number;
  widthMm: number;
  lengthMm: number;
  materialId: string;
  grainDirection: "none" | "along-length" | "along-width";
  edges: Partial<Record<"top" | "bottom" | "left" | "right", EdgeSpec>>;
};
export type FurnitureItemLink = {
  projectId: string;
  furnitureId: string;
  itemId: string;
  parentItemId?: string;
  partIds: string[];
};
export type CuttingPlacement = {
  partId: string;
  instance: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  lengthMm: number;
};
export type CuttingSheet = {
  materialId: string;
  sheetNumber: number;
  widthMm: number;
  lengthMm: number;
  placements: CuttingPlacement[];
  usedAreaMm2: number;
  utilizationPercent: number;
};
export type MaterialQuantity = {
  materialId: string;
  manufacturer: string;
  sku: string;
  color: string;
  thicknessMm: number;
  partCount: number;
  netAreaMm2: number;
  sheets: number;
};
export type EdgeQuantity = {
  manufacturer: string;
  sku: string;
  color: string;
  lengthMm: number;
};
export type CuttingReport = {
  projectId: string;
  links: FurnitureItemLink[];
  materials: MaterialQuantity[];
  edges: EdgeQuantity[];
  sheets: CuttingSheet[];
  warnings: string[];
  productionReady: false;
};

function positive(n: number, field: string): void {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${field}: expected positive finite number`);
}
function nonempty(v: string, field: string): void {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
}
const num = (v: number) => Math.round(v * 1000) / 1000;

/** Imutável: atualiza apenas IDs explicitamente selecionados. */
export function updateSelectedParts(
  parts: readonly PanelPart[],
  selectedIds: readonly string[],
  patch: Pick<PanelPart, "materialId"> | { edges: PanelPart["edges"] },
): PanelPart[] {
  const chosen = new Set(selectedIds);
  return parts.map((part) =>
    chosen.has(part.id)
      ? { ...part, ...patch, edges: "edges" in patch ? { ...part.edges, ...patch.edges } : { ...part.edges } }
      : part,
  );
}

/**
 * Primeiro encaixe em linhas, sem rotação, com kerf e margens.
 * É um plano PRELIMINAR, não nesting industrial otimizado.
 * Todas as peças são orientadas como fornecidas, preservando o veio.
 */
export function buildFurnitureCuttingReport(input: {
  tenantId: string;
  projectId: string;
  parts: readonly PanelPart[];
  materials: readonly PanelMaterial[];
  kerfMm?: number;
  marginMm?: number;
}): CuttingReport {
  nonempty(input.tenantId, "tenantId");
  nonempty(input.projectId, "projectId");
  const kerf = input.kerfMm ?? 3;
  const margin = input.marginMm ?? 10;
  if (!Number.isFinite(kerf) || kerf < 0 || !Number.isFinite(margin) || margin < 0)
    throw new Error("kerfMm and marginMm must be finite nonnegative numbers");
  const catalog = new Map(input.materials.map((m) => [m.id, m]));
  if (catalog.size !== input.materials.length) throw new Error("Duplicate material IDs");
  const ids = new Set<string>();
  const links = new Map<string, FurnitureItemLink>();
  const groups = new Map<string, { material: PanelMaterial; parts: PanelPart[] }>();
  const edgeTotals = new Map<string, EdgeQuantity>();
  for (const part of input.parts) {
    if (ids.has(part.id)) throw new Error(`Duplicate part ID: ${part.id}`);
    ids.add(part.id);
    if (part.tenantId !== input.tenantId || part.projectId !== input.projectId)
      throw new Error(`Part outside tenant/project: ${part.id}`);
    nonempty(part.furnitureId, "furnitureId");
    nonempty(part.id, "part.id");
    positive(part.widthMm, "part.widthMm");
    positive(part.lengthMm, "part.lengthMm");
    if (!Number.isSafeInteger(part.quantity) || part.quantity <= 0)
      throw new Error(`Invalid quantity for ${part.id}`);
    const material = catalog.get(part.materialId);
    if (!material || material.tenantId !== input.tenantId)
      throw new Error(`Material missing or outside tenant: ${part.materialId}`);
    positive(material.thicknessMm, "thicknessMm");
    positive(material.stockWidthMm, "stockWidthMm");
    positive(material.stockLengthMm, "stockLengthMm");
    const key = material.id;
    const group = groups.get(key) ?? { material, parts: [] };
    group.parts.push(part);
    groups.set(key, group);
    const lk = `${part.furnitureId}::${part.parentItemId ?? part.furnitureId}`;
    const link = links.get(lk) ?? {
      projectId: part.projectId, furnitureId: part.furnitureId,
      itemId: part.parentItemId ?? part.furnitureId,
      parentItemId: part.parentItemId ? part.furnitureId : undefined,
      partIds: [],
    };
    link.partIds.push(part.id);
    links.set(lk, link);
    for (const [side, edge] of Object.entries(part.edges)) {
      if (!edge) continue;
      positive(edge.thicknessMm, "edge.thicknessMm");
      const k = JSON.stringify([edge.manufacturer, edge.sku, edge.color]);
      const e = edgeTotals.get(k) ?? {
        manufacturer: edge.manufacturer, sku: edge.sku, color: edge.color, lengthMm: 0,
      };
      e.lengthMm += (side === "top" || side === "bottom" ? part.widthMm : part.lengthMm) * part.quantity;
      edgeTotals.set(k, e);
    }
  }
  const sheets: CuttingSheet[] = [];
  const materials: MaterialQuantity[] = [];
  const warnings: string[] = [];
  for (const { material, parts } of groups.values()) {
    const usableW = material.stockWidthMm - margin * 2;
    const usableL = material.stockLengthMm - margin * 2;
    if (usableW <= 0 || usableL <= 0) throw new Error(`No usable stock area: ${material.id}`);
    let current: CuttingSheet | undefined;
    let cursorX = margin, cursorY = margin, rowHeight = 0;
    const openSheet = () => {
      current = {
        materialId: material.id,
        sheetNumber: sheets.filter((s) => s.materialId === material.id).length + 1,
        widthMm: material.stockWidthMm,
        lengthMm: material.stockLengthMm,
        placements: [], usedAreaMm2: 0, utilizationPercent: 0,
      };
      sheets.push(current);
      cursorX = margin; cursorY = margin; rowHeight = 0;
    };
    const ordered = [...parts].sort((a, b) => b.lengthMm - a.lengthMm || b.widthMm - a.widthMm);
    for (const part of ordered) {
      if (part.widthMm > usableW || part.lengthMm > usableL) {
        warnings.push(`Part ${part.id} exceeds stock sheet ${material.id}; manual segmentation required`);
        continue;
      }
      for (let i = 0; i < part.quantity; i++) {
        if (!current) openSheet();
        if (cursorX + part.widthMm > material.stockWidthMm - margin) {
          cursorX = margin; cursorY += rowHeight + kerf; rowHeight = 0;
        }
        if (cursorY + part.lengthMm > material.stockLengthMm - margin) openSheet();
        current!.placements.push({
          partId: part.id, instance: i + 1, xMm: cursorX, yMm: cursorY,
          widthMm: part.widthMm, lengthMm: part.lengthMm,
        });
        current!.usedAreaMm2 += part.widthMm * part.lengthMm;
        cursorX += part.widthMm + kerf;
        rowHeight = Math.max(rowHeight, part.lengthMm);
      }
    }
    const ownSheets = sheets.filter((s) => s.materialId === material.id);
    for (const sheet of ownSheets)
      sheet.utilizationPercent = num(100 * sheet.usedAreaMm2 / (sheet.widthMm * sheet.lengthMm));
    materials.push({
      materialId: material.id, manufacturer: material.manufacturer, sku: material.sku,
      color: material.color, thicknessMm: material.thicknessMm,
      partCount: parts.reduce((n, p) => n + p.quantity, 0),
      netAreaMm2: parts.reduce((n, p) => n + p.widthMm * p.lengthMm * p.quantity, 0),
      sheets: ownSheets.length,
    });
  }
  warnings.push("Preliminary guillotine-style row layout only; validate grain, defects, tooling, edge offsets, manufacturing tolerances and machine constraints before production.");
  return {
    projectId: input.projectId, links: [...links.values()], materials,
    edges: [...edgeTotals.values()].map((e) => ({ ...e, lengthMm: num(e.lengthMm) })),
    sheets, warnings, productionReady: false,
  };
}
