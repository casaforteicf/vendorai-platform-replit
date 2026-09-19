export type ConceptPromotedMaterialRef = {
  id: string;
  name: string;
  category: string;
  manufacturer?: string;
  finish?: string;
  color: string;
  secondaryColor?: string;
  edgeColor?: string;
  gloss?: number;
  pattern: string;
  libraryMaterialId?: string;
};

export type ConceptPromotedMaterialScheme = {
  floor: ConceptPromotedMaterialRef;
  floorByLevel?: Record<string, ConceptPromotedMaterialRef>;
  interiorWall: ConceptPromotedMaterialRef;
  exteriorWall: ConceptPromotedMaterialRef;
  roof: ConceptPromotedMaterialRef;
  stair: ConceptPromotedMaterialRef;
};

export type ConceptPromotionRoom = {
  floor?: number;
  kind?: string;
  stairFloorToFloorHeight?: number;
};

export type ConceptPromotedObject = {
  id: string;
  presetId?: string;
  name: string;
  category: string;
  symbol?: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotationDeg: number;
  material?: string;
  finish?: string;
  color?: string;
  componentId?: string;
  manufacturerId?: string;
  catalogProductId?: string;
  locked?: boolean;
};

export function conceptFloorElevation(
  rooms: ConceptPromotionRoom[],
  targetFloor: number,
) {
  let elevation = 0;
  for (let floor = 0; floor < targetFloor; floor += 1) {
    const stair = rooms.find((room) => room.floor === floor && room.kind === "escada");
    const floorToFloor = Number(stair?.stairFloorToFloorHeight);
    elevation += Number.isFinite(floorToFloor) && floorToFloor >= 2.96
      ? floorToFloor
      : 2.96;
  }
  return elevation;
}

export function conceptObjectRows(
  objects: ConceptPromotedObject[],
  rooms: ConceptPromotionRoom[],
) {
  return objects.map((object) => ({
    objectClientId: object.id,
    name: object.name || "Objeto",
    category: object.category || "decoracao",
    material: object.material || null,
    finish: object.finish || null,
    color: object.color || null,
    dimensions: {
      width: object.width,
      height: object.height,
      depth: object.depth,
      unit: "m",
    },
    position: {
      x: object.x,
      y: object.y,
      z: conceptFloorElevation(rooms, object.floor),
      rotationDeg: object.rotationDeg,
      floor: object.floor,
    },
    componentId: object.componentId || object.presetId || null,
    manufacturerId: object.manufacturerId || null,
    designIntent: [
      "source:arqdor_concept",
      ...(object.presetId ? [`preset:${object.presetId}`] : []),
      ...(object.symbol ? [`symbol:${object.symbol}`] : []),
      ...(object.catalogProductId ? [`catalog_product:${object.catalogProductId}`] : []),
    ],
    locked: object.locked ?? false,
  }));
}

export function collectConceptMaterials(
  scheme: ConceptPromotedMaterialScheme | undefined,
) {
  if (!scheme) {
    return [] as Array<{ material: ConceptPromotedMaterialRef; usedBy: string[] }>;
  }

  const entries = new Map<string, {
    material: ConceptPromotedMaterialRef;
    usedBy: string[];
  }>();

  const add = (material: ConceptPromotedMaterialRef | undefined, usedBy: string) => {
    if (!material?.id || !material?.name) return;
    const existing = entries.get(material.id);
    if (existing) {
      if (!existing.usedBy.includes(usedBy)) existing.usedBy.push(usedBy);
      return;
    }
    entries.set(material.id, { material, usedBy: [usedBy] });
  };

  add(scheme.floor, "surface:floor:default");
  for (const [floor, material] of Object.entries(scheme.floorByLevel ?? {})) {
    add(material, `surface:floor:${floor}`);
  }
  add(scheme.interiorWall, "surface:interior_wall");
  add(scheme.exteriorWall, "surface:exterior_wall");
  add(scheme.roof, "surface:roof");
  add(scheme.stair, "surface:stair");

  return [...entries.values()];
}

export function conceptMaterialRows(
  scheme: ConceptPromotedMaterialScheme | undefined,
) {
  return collectConceptMaterials(scheme).map(({ material, usedBy }) => ({
    materialClientId: `concept-material-${material.id}`,
    name: material.name,
    category: material.category,
    manufacturer: material.manufacturer ?? "",
    finish: material.finish ?? "",
    gloss: material.gloss ?? 0,
    palette: [
      material.color,
      material.secondaryColor,
      material.edgeColor,
    ].filter((value): value is string => Boolean(value)),
    usedByObjects: [
      "source:arqdor_concept",
      `pattern:${material.pattern}`,
      ...(material.libraryMaterialId
        ? [`library_material:${material.libraryMaterialId}`]
        : []),
      ...usedBy,
    ],
  }));
}
