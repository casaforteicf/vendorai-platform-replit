export type IfcEditableWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  sourceIfcId: string;
  materialId?: string;
  wallType?: string;
};

export type IfcEditableOpening = {
  id: string;
  wallId: string;
  floor: number;
  type: "door" | "window";
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  sourceIfcId: string;
};

export type IfcEditableSpace = {
  id: string;
  floor: number;
  label: string;
  kind: string;
  area: number;
  floorMaterialId?: string;
  sourceIfcId: string;
};

export type IfcEditableGeometry = {
  walls: IfcEditableWall[];
  openings: IfcEditableOpening[];
  spaces: IfcEditableSpace[];
  wallMaterials: Record<string, string>;
  storeys: Array<{ ifcId: string; name: string | null; elevation: number | null; floor: number }>;
  bounds: { width: number; depth: number };
  unit: "m" | "mm" | "cm" | "unknown";
  warnings: string[];
};

type Entity = { id: string; type: string; body: string };

function entities(input: string) {
  const out = new Map<string, Entity>();
  const regex = /#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(([\s\S]*?)\);/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input))) {
    out.set(m[1]!, { id: m[1]!, type: m[2]!.toUpperCase(), body: m[3] ?? "" });
  }
  return out;
}

function refs(body: string) {
  return [...body.matchAll(/#(\d+)/g)].map((m) => m[1]!);
}

function nums(body: string) {
  return body.split(",").map((part) => Number(part.trim().replace(/[()]/g, ""))).filter(Number.isFinite);
}

function strings(body: string) {
  return [...body.matchAll(/'((?:''|[^'])*)'/g)].map((m) => (m[1] ?? "").replace(/''/g, "'"));
}
function propertyValue(body: string) {
  const match = body.match(/IFC(?:LABEL|TEXT|IDENTIFIER)\s*\(\s*'((?:''|[^'])*)'\s*\)/i);
  if (match) return (match[1] ?? "").replace(/''/g, "'");
  const numberMatch = body.match(/IFC(?:LENGTHMEASURE|AREAMEASURE|REAL)\s*\(\s*([-+0-9.Ee]+)\s*\)/i);
  return numberMatch ? Number(numberMatch[1]) : null;
}

function propertySets(map: Map<string, Entity>) {
  const propsByObject = new Map<string, Record<string, string | number>>();
  for (const rel of [...map.values()].filter((e) => e.type === "IFCRELDEFINESBYPROPERTIES")) {
    const r = refs(rel.body);
    const psetId = r.find((id) => map.get(id)?.type === "IFCPROPERTYSET");
    if (!psetId) continue;
    const pset = map.get(psetId);
    if (!pset) continue;
    const props: Record<string, string | number> = {};
    for (const propId of refs(pset.body)) {
      const prop = map.get(propId);
      if (!prop || prop.type !== "IFCPROPERTYSINGLEVALUE") continue;
      const name = strings(prop.body)[0];
      const value = propertyValue(prop.body);
      if (name && value != null) props[name] = value;
    }
    for (const objectId of r.filter((id) => id !== psetId)) {
      propsByObject.set(objectId, { ...(propsByObject.get(objectId) ?? {}), ...props });
    }
  }
  return propsByObject;
}

function materialByObject(map: Map<string, Entity>) {
  const result = new Map<string, string>();
  for (const rel of [...map.values()].filter((e) => e.type === "IFCRELASSOCIATESMATERIAL")) {
    const r = refs(rel.body);
    const materialId = r.find((id) => map.get(id)?.type === "IFCMATERIAL");
    if (!materialId) continue;
    const material = map.get(materialId);
    const name = material ? strings(material.body)[0] : undefined;
    if (!name) continue;
    for (const objectId of r.filter((id) => id !== materialId)) result.set(objectId, name);
  }
  return result;
}

function unitInfo(input: string) {
  const upper = input.toUpperCase();
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\.MILLI\.[^)]*\.METRE\./.test(upper)) return { unit: "mm" as const, scale: 0.001 };
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\.CENTI\.[^)]*\.METRE\./.test(upper)) return { unit: "cm" as const, scale: 0.01 };
  if (/IFCSIUNIT\s*\([^)]*\.LENGTHUNIT\.[^)]*\.METRE\./.test(upper)) return { unit: "m" as const, scale: 1 };
  return { unit: "unknown" as const, scale: 1 };
}

function point3(map: Map<string, Entity>, id?: string) {
  if (!id) return null;
  const e = map.get(id);
  if (!e || e.type !== "IFCCARTESIANPOINT") return null;
  const n = nums(e.body);
  return n.length >= 2 ? { x: n[0]!, y: n[1]!, z: n[2] ?? 0 } : null;
}

function direction3(map: Map<string, Entity>, id?: string) {
  if (!id) return null;
  const e = map.get(id);
  if (!e || e.type !== "IFCDIRECTION") return null;
  const n = nums(e.body);
  if (n.length < 2) return null;
  const len = Math.hypot(n[0]!, n[1]!) || 1;
  return { x: n[0]! / len, y: n[1]! / len };
}

function axisPlacement3(map: Map<string, Entity>, id?: string) {
  if (!id) return null;
  const e = map.get(id);
  if (!e || e.type !== "IFCAXIS2PLACEMENT3D") return null;
  const r = refs(e.body);
  return { point: point3(map, r[0]), refDirection: direction3(map, r[2]) };
}

function localPlacement(map: Map<string, Entity>, id?: string) {
  if (!id) return null;
  const e = map.get(id);
  if (!e || e.type !== "IFCLOCALPLACEMENT") return null;
  const r = refs(e.body);
  const parentId = r.length > 1 ? r[0] : undefined;
  const axisId = r.length > 1 ? r[1] : r[0];
  const axis = axisPlacement3(map, axisId);
  return { parentId, axis };
}

function rectangleProfile(map: Map<string, Entity>, id?: string) {
  if (!id) return null;
  const e = map.get(id);
  if (!e || e.type !== "IFCRECTANGLEPROFILEDEF") return null;
  const n = nums(e.body);
  if (n.length < 2) return null;
  return { xDim: n[n.length - 2]!, yDim: n[n.length - 1]! };
}

function productShapeProfile(map: Map<string, Entity>, shapeId?: string) {
  if (!shapeId) return null;
  const shape = map.get(shapeId);
  if (!shape || shape.type !== "IFCPRODUCTDEFINITIONSHAPE") return null;
  for (const repId of refs(shape.body)) {
    const rep = map.get(repId);
    if (!rep || rep.type !== "IFCSHAPEREPRESENTATION") continue;
    for (const itemId of refs(rep.body)) {
      const solid = map.get(itemId);
      if (!solid || solid.type !== "IFCEXTRUDEDAREASOLID") continue;
      const solidRefs = refs(solid.body);
      const profile = rectangleProfile(map, solidRefs[0]);
      if (profile) return profile;
    }
  }
  return null;
}

export function parseIfcEditableGeometry(input: string): IfcEditableGeometry {
  if (!/ISO-10303-21/i.test(input) || !/FILE_SCHEMA/i.test(input)) {
    throw new Error("O arquivo não parece ser um IFC STEP válido.");
  }

  const map = entities(input);
  const unit = unitInfo(input);
  const propsByObject = propertySets(map);
  const materialsByObject = materialByObject(map);
  const storeyEntities = [...map.values()].filter((e) => e.type === "IFCBUILDINGSTOREY");
  const storeys = storeyEntities
    .map((e, index) => {
      const s = strings(e.body);
      const n = nums(e.body);
      return {
        ifcId: e.id,
        name: s[1] || s[0] || null,
        elevation: n.length ? n[n.length - 1]! * unit.scale : null,
        floor: index,
      };
    })
    .sort((a, b) => (a.elevation ?? a.floor) - (b.elevation ?? b.floor))
    .map((s, index) => ({ ...s, floor: index }));

  const floorByStoreyId = new Map(storeys.map((s) => [s.ifcId, s.floor]));
  const floorByWallId = new Map<string, number>();
  const floorByElementId = new Map<string, number>();
  for (const rel of [...map.values()].filter((e) => e.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE")) {
    const r = refs(rel.body);
    const storeyId = r[r.length - 1];
    const floor = storeyId ? floorByStoreyId.get(storeyId) : undefined;
    if (floor == null) continue;
    for (const wallId of r.slice(0, -1)) {
      const entity = map.get(wallId);
      if (entity?.type.startsWith("IFCWALL")) floorByWallId.set(wallId, floor);
      if (entity && ["IFCDOOR", "IFCWINDOW"].includes(entity.type)) floorByElementId.set(wallId, floor);
    }
  }

  const warnings: string[] = [];
  const walls: IfcEditableWall[] = [];

  for (const wall of [...map.values()].filter((e) => e.type === "IFCWALL" || e.type === "IFCWALLSTANDARDCASE")) {
    const r = refs(wall.body);
    const placementId = r.find((id) => map.get(id)?.type === "IFCLOCALPLACEMENT");
    const shapeId = r.find((id) => map.get(id)?.type === "IFCPRODUCTDEFINITIONSHAPE");
    const placement = localPlacement(map, placementId);
    const profile = productShapeProfile(map, shapeId);
    if (!placement?.axis?.point || !profile) continue;

    const dir = placement.axis.refDirection ?? { x: 1, y: 0 };
    const length = Math.max(profile.xDim, profile.yDim) * unit.scale;
    const thickness = Math.min(profile.xDim, profile.yDim) * unit.scale;
    if (!Number.isFinite(length) || length < 0.02) continue;

    const cx = placement.axis.point.x * unit.scale;
    const cy = placement.axis.point.y * unit.scale;
    const half = length / 2;
    walls.push({
      id: `ifc-wall-${wall.id}`,
      floor: floorByWallId.get(wall.id) ?? 0,
      x1: cx - dir.x * half,
      y1: cy - dir.y * half,
      x2: cx + dir.x * half,
      y2: cy + dir.y * half,
      thickness: Math.max(0.08, Math.min(0.5, thickness || 0.14)),
      sourceIfcId: wall.id,
      materialId: materialsByObject.get(wall.id) ?? (typeof propsByObject.get(wall.id)?.ArqdorMaterialId === "string" ? String(propsByObject.get(wall.id)?.ArqdorMaterialId) : undefined),
      wallType: strings(wall.body)[1] || strings(wall.body)[0] || undefined,
    });
  }

  const rawOpenings: Array<{
    sourceIfcId: string;
    floor: number;
    type: "door" | "window";
    x: number;
    y: number;
    width: number;
    height: number;
    sillHeight: number;
  }> = [];

  for (const opening of [...map.values()].filter((e) => e.type === "IFCDOOR" || e.type === "IFCWINDOW")) {
    const r = refs(opening.body);
    const placementId = r.find((id) => map.get(id)?.type === "IFCLOCALPLACEMENT");
    const placement = localPlacement(map, placementId);
    if (!placement?.axis?.point) continue;
    const dimensions = opening.body.match(/,\$\s*,\$\s*,\s*([-+0-9.Ee]+)\s*,\s*([-+0-9.Ee]+)\s*,\s*\./);
    const height = dimensions ? Number(dimensions[1]) * unit.scale : opening.type === "IFCDOOR" ? 2.1 : 1.2;
    const width = dimensions ? Number(dimensions[2]) * unit.scale : opening.type === "IFCDOOR" ? 0.9 : 1.2;
    rawOpenings.push({
      sourceIfcId: opening.id,
      floor: floorByElementId.get(opening.id) ?? 0,
      type: opening.type === "IFCDOOR" ? "door" : "window",
      x: placement.axis.point.x * unit.scale,
      y: placement.axis.point.y * unit.scale,
      width: Number.isFinite(width) && width > 0 ? width : opening.type === "IFCDOOR" ? 0.9 : 1.2,
      height: Number.isFinite(height) && height > 0 ? height : opening.type === "IFCDOOR" ? 2.1 : 1.2,
      sillHeight: Math.max(0, placement.axis.point.z * unit.scale),
    });
  }

  if (!walls.length) {
    throw new Error("O IFC foi lido, mas não encontrei paredes com geometria SweptSolid/RectangleProfile compatível.");
  }

  const minX = Math.min(...walls.flatMap((w) => [w.x1, w.x2]));
  const minY = Math.min(...walls.flatMap((w) => [w.y1, w.y2]));
  const maxX = Math.max(...walls.flatMap((w) => [w.x1, w.x2]));
  const maxY = Math.max(...walls.flatMap((w) => [w.y1, w.y2]));

  for (const wall of walls) {
    wall.x1 = Math.round((wall.x1 - minX) * 1000) / 1000;
    wall.y1 = Math.round((wall.y1 - minY) * 1000) / 1000;
    wall.x2 = Math.round((wall.x2 - minX) * 1000) / 1000;
    wall.y2 = Math.round((wall.y2 - minY) * 1000) / 1000;
    wall.thickness = Math.round(wall.thickness * 1000) / 1000;
  }

  const openings: IfcEditableOpening[] = [];
  for (const opening of rawOpenings) {
    const x = opening.x - minX;
    const y = opening.y - minY;
    let best: { wall: IfcEditableWall; distance: number; offset: number } | null = null;

    for (const wall of walls.filter((candidate) => candidate.floor === opening.floor)) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 0.0001) continue;
      const t = Math.max(0, Math.min(1, ((x - wall.x1) * dx + (y - wall.y1) * dy) / len2));
      const px = wall.x1 + dx * t;
      const py = wall.y1 + dy * t;
      const distance = Math.hypot(x - px, y - py);
      if (!best || distance < best.distance) best = { wall, distance, offset: t };
    }

    if (!best || best.distance > Math.max(0.6, best.wall.thickness * 3)) continue;
    openings.push({
      id: `ifc-opening-${opening.sourceIfcId}`,
      wallId: best.wall.id,
      floor: opening.floor,
      type: opening.type,
      offset: Math.round(best.offset * 10000) / 10000,
      width: Math.round(opening.width * 1000) / 1000,
      height: Math.round(opening.height * 1000) / 1000,
      sillHeight: Math.round(opening.sillHeight * 1000) / 1000,
      sourceIfcId: opening.sourceIfcId,
    });
  }

  const floorBySpaceId = new Map<string, number>();
  for (const rel of [...map.values()].filter((e) => e.type === "IFCRELAGGREGATES")) {
    const r = refs(rel.body);
    const storeyId = r.find((id) => floorByStoreyId.has(id));
    if (!storeyId) continue;
    const floor = floorByStoreyId.get(storeyId)!;
    for (const id of r) if (map.get(id)?.type === "IFCSPACE") floorBySpaceId.set(id, floor);
  }

  const spaces: IfcEditableSpace[] = [...map.values()]
    .filter((e) => e.type === "IFCSPACE")
    .map((space, index) => {
      const values = strings(space.body);
      const props = propsByObject.get(space.id) ?? {};
      return {
        id: typeof props.ArqdorRoomId === "string" ? String(props.ArqdorRoomId) : `ifc-space-${space.id}`,
        floor: floorBySpaceId.get(space.id) ?? 0,
        label: values[1] || values[0] || `Ambiente ${index + 1}`,
        kind: typeof props.ArqdorRoomKind === "string" ? String(props.ArqdorRoomKind) : (values[3] || "outro"),
        area: typeof props.ArqdorArea === "number" ? Number(props.ArqdorArea) * unit.scale * unit.scale : 0,
        floorMaterialId: typeof props.ArqdorFloorMaterialId === "string" ? String(props.ArqdorFloorMaterialId) : undefined,
        sourceIfcId: space.id,
      };
    });

  const wallMaterials = Object.fromEntries(
    walls.flatMap((wall) => wall.materialId ? [[wall.id, wall.materialId] as const] : []),
  );

  const totalIfcWalls = [...map.values()].filter((e) => e.type === "IFCWALL" || e.type === "IFCWALLSTANDARDCASE").length;
  if (walls.length < totalIfcWalls) {
    warnings.push(`${totalIfcWalls - walls.length} parede(s) IFC usam uma representação geométrica ainda não suportada para edição.`);
  }
  if (!storeys.length) warnings.push("Nenhum pavimento IFC foi encontrado; as paredes foram associadas ao térreo.");
  if (unit.unit === "unknown") warnings.push("Unidade IFC não identificada; os valores foram tratados como metros.");

  if (rawOpenings.length > openings.length) {
    warnings.push(`${rawOpenings.length - openings.length} abertura(s) IFC não puderam ser associadas com segurança a uma parede editável.`);
  }

  return {
    walls,
    openings,
    spaces,
    wallMaterials,
    storeys,
    bounds: {
      width: Math.round((maxX - minX) * 1000) / 1000,
      depth: Math.round((maxY - minY) * 1000) / 1000,
    },
    unit: unit.unit,
    warnings,
  };
}
