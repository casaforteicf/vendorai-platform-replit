type IfcRoom = {
  label?: string;
  floor?: number;
  x?: number;
  y?: number;
  width?: number;
  depth?: number;
};

type IfcWallInput = {
  id?: string;
  floor?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
};

type IfcOpeningInput = {
  id?: string;
  wallId: string;
  floor?: number;
  type: "door" | "window";
  offset: number;
  width?: number;
  height?: number;
  sillHeight?: number;
};

export type ConceptIfcInput = {
  title?: string | null;
  floors?: number;
  rooms?: IfcRoom[] | null;
  customWalls?: IfcWallInput[] | null;
  customOpenings?: IfcOpeningInput[] | null;
  wallHeight?: number;
};

const IFC64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function ifcGuid(index: number) {
  let value = BigInt(Math.max(1, index));
  let out = "";
  while (value > 0n) {
    out = IFC64[Number(value % 64n)] + out;
    value /= 64n;
  }
  return out.padStart(22, "0").slice(-22);
}

function esc(value: string) {
  return value.replace(/'/g, "''").replace(/[\r\n]+/g, " ").slice(0, 180);
}

function number(value: number) {
  if (!Number.isFinite(value)) return "0.";
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Number.isInteger(rounded) ? `${rounded}.` : String(rounded);
}

function deriveRoomWalls(rooms: IfcRoom[]) {
  const raw: IfcWallInput[] = [];
  for (const room of rooms) {
    const x = Number(room.x);
    const y = Number(room.y);
    const width = Number(room.width);
    const depth = Number(room.depth);
    if (![x, y, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) continue;
    const floor = Number.isFinite(Number(room.floor)) ? Number(room.floor) : 0;
    raw.push(
      { floor, x1: x, y1: y, x2: x + width, y2: y, thickness: 0.14 },
      { floor, x1: x + width, y1: y, x2: x + width, y2: y + depth, thickness: 0.14 },
      { floor, x1: x + width, y1: y + depth, x2: x, y2: y + depth, thickness: 0.14 },
      { floor, x1: x, y1: y + depth, x2: x, y2: y, thickness: 0.14 },
    );
  }

  const seen = new Set<string>();
  return raw.filter((wall) => {
    const a = `${wall.floor}:${wall.x1.toFixed(3)},${wall.y1.toFixed(3)}`;
    const b = `${wall.floor}:${wall.x2.toFixed(3)},${wall.y2.toFixed(3)}`;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildConceptIfc(input: ConceptIfcInput) {
  const entities: string[] = [];
  const add = (body: string) => {
    const id = entities.length + 1;
    entities.push(`#${id}=${body};`);
    return id;
  };
  const ref = (id: number) => `#${id}`;

  const rooms = Array.isArray(input.rooms) ? input.rooms : [];
  const customWalls = Array.isArray(input.customWalls) ? input.customWalls : [];
  const walls = (customWalls.length ? customWalls : deriveRoomWalls(rooms))
    .filter((wall) => [wall.x1, wall.y1, wall.x2, wall.y2].every(Number.isFinite))
    .slice(0, 2000);
  const openings = Array.isArray(input.customOpenings) ? input.customOpenings.slice(0, 2000) : [];

  if (!walls.length) throw new Error("O projeto não possui paredes suficientes para exportação IFC.");

  const maxWallFloor = walls.reduce((max, wall) => Math.max(max, Math.max(0, Math.round(Number(wall.floor ?? 0)))), 0);
  const floorCount = Math.max(1, Math.round(Number(input.floors ?? maxWallFloor + 1)), maxWallFloor + 1);
  const wallHeight = Math.max(2.2, Math.min(6, Number(input.wallHeight ?? 2.8)));
  const title = esc(input.title || "Projeto Arqdor");

  const origin = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zDirection = add("IFCDIRECTION((0.,0.,1.))");
  const xDirection = add("IFCDIRECTION((1.,0.,0.))");
  const worldAxis = add(`IFCAXIS2PLACEMENT3D(${ref(origin)},${ref(zDirection)},${ref(xDirection)})`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(worldAxis)},$)`);
  const lengthUnit = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const areaUnit = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volumeUnit = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const units = add(`IFCUNITASSIGNMENT((${ref(lengthUnit)},${ref(areaUnit)},${ref(volumeUnit)}))`);
  const project = add(`IFCPROJECT('${ifcGuid(1)}',$,'${title}',$,$,$,$,(${ref(context)}),${ref(units)})`);

  const sitePoint = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const siteAxis = add(`IFCAXIS2PLACEMENT3D(${ref(sitePoint)},$,$)`);
  const sitePlacement = add(`IFCLOCALPLACEMENT($,${ref(siteAxis)})`);
  const site = add(`IFCSITE('${ifcGuid(2)}',$,'Terreno',$,$,${ref(sitePlacement)},$,$,.ELEMENT.,$,$,$,$,$)`);

  const buildingPoint = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const buildingAxis = add(`IFCAXIS2PLACEMENT3D(${ref(buildingPoint)},$,$)`);
  const buildingPlacement = add(`IFCLOCALPLACEMENT(${ref(sitePlacement)},${ref(buildingAxis)})`);
  const building = add(`IFCBUILDING('${ifcGuid(3)}',$,'Edificação',$,$,${ref(buildingPlacement)},$,$,.ELEMENT.,$,$,$)`);

  add(`IFCRELAGGREGATES('${ifcGuid(4)}',$,$,$,${ref(project)},(${ref(site)}))`);
  add(`IFCRELAGGREGATES('${ifcGuid(5)}',$,$,$,${ref(site)},(${ref(building)}))`);

  const storeys: Array<{ entity: number; placement: number; walls: number[]; openings: number[] }> = [];
  for (let floor = 0; floor < floorCount; floor += 1) {
    const elevation = floor * 3;
    const point = add(`IFCCARTESIANPOINT((0.,0.,${number(elevation)}))`);
    const axis = add(`IFCAXIS2PLACEMENT3D(${ref(point)},$,$)`);
    const placement = add(`IFCLOCALPLACEMENT(${ref(buildingPlacement)},${ref(axis)})`);
    const name = floor === 0 ? "Térreo" : `Pavimento ${floor + 1}`;
    const storey = add(`IFCBUILDINGSTOREY('${ifcGuid(10 + floor)}',$,'${esc(name)}',$,$,${ref(placement)},$,$,.ELEMENT.,${number(elevation)})`);
    storeys.push({ entity: storey, placement, walls: [], openings: [] });
  }
  add(`IFCRELAGGREGATES('${ifcGuid(30)}',$,$,$,${ref(building)},(${storeys.map((item) => ref(item.entity)).join(",")}))`);

  const profileOrigin = add("IFCCARTESIANPOINT((0.,0.))");
  const profileAxis = add(`IFCAXIS2PLACEMENT2D(${ref(profileOrigin)},$)`);
  const extrudeDirection = zDirection;

  walls.forEach((wall, index) => {
    const floor = Math.max(0, Math.min(storeys.length - 1, Math.round(Number(wall.floor ?? 0))));
    const dx = Number(wall.x2) - Number(wall.x1);
    const dy = Number(wall.y2) - Number(wall.y1);
    const length = Math.hypot(dx, dy);
    if (length < 0.02) return;
    const thickness = Math.max(0.08, Math.min(0.5, Number(wall.thickness ?? 0.14)));
    const midX = (Number(wall.x1) + Number(wall.x2)) / 2;
    const midY = (Number(wall.y1) + Number(wall.y2)) / 2;
    const ux = dx / length;
    const uy = dy / length;

    const wallPoint = add(`IFCCARTESIANPOINT((${number(midX)},${number(midY)},0.))`);
    const wallDirection = add(`IFCDIRECTION((${number(ux)},${number(uy)},0.))`);
    const wallAxis = add(`IFCAXIS2PLACEMENT3D(${ref(wallPoint)},${ref(zDirection)},${ref(wallDirection)})`);
    const wallPlacement = add(`IFCLOCALPLACEMENT(${ref(storeys[floor]!.placement)},${ref(wallAxis)})`);
    const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ref(profileAxis)},${number(length)},${number(thickness)})`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${ref(profile)},${ref(worldAxis)},${ref(extrudeDirection)},${number(wallHeight)})`);
    const shapeRep = add(`IFCSHAPEREPRESENTATION(${ref(context)},'Body','SweptSolid',(${ref(solid)}))`);
    const productShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${ref(shapeRep)}))`);
    const wallEntity = add(`IFCWALL('${ifcGuid(1000 + index)}',$,'Parede ${index + 1}',$,$,${ref(wallPlacement)},${ref(productShape)},$,.NOTDEFINED.)`);
    storeys[floor]!.walls.push(wallEntity);
  });

  const wallById = new Map(walls.map((wall, index) => [String(wall.id ?? `wall-${index + 1}`), wall]));
  openings.forEach((opening, index) => {
    const wall = wallById.get(String(opening.wallId));
    if (!wall) return;
    const floor = Math.max(0, Math.min(storeys.length - 1, Math.round(Number(opening.floor ?? wall.floor ?? 0))));
    const dx = Number(wall.x2) - Number(wall.x1);
    const dy = Number(wall.y2) - Number(wall.y1);
    const length = Math.hypot(dx, dy);
    if (length < 0.02) return;
    const ux = dx / length;
    const uy = dy / length;
    const offset = Math.max(0, Math.min(1, Number(opening.offset ?? 0.5)));
    const cx = Number(wall.x1) + dx * offset;
    const cy = Number(wall.y1) + dy * offset;
    const width = Math.max(0.3, Number(opening.width ?? (opening.type === "door" ? 0.9 : 1.2)));
    const height = Math.max(0.5, Number(opening.height ?? (opening.type === "door" ? 2.1 : 1.2)));
    const z = Math.max(0, Number(opening.sillHeight ?? (opening.type === "window" ? 1.0 : 0)));

    const p = add(`IFCCARTESIANPOINT((${number(cx)},${number(cy)},${number(z)}))`);
    const d = add(`IFCDIRECTION((${number(ux)},${number(uy)},0.))`);
    const a = add(`IFCAXIS2PLACEMENT3D(${ref(p)},${ref(zDirection)},${ref(d)})`);
    const placement = add(`IFCLOCALPLACEMENT(${ref(storeys[floor]!.placement)},${ref(a)})`);
    const entity = opening.type === "door"
      ? add(`IFCDOOR('${ifcGuid(7000 + index)}',$,'Porta ${index + 1}',$,$,${ref(placement)},$,$,${number(height)},${number(width)},.DOOR.,.NOTDEFINED.,$)`)
      : add(`IFCWINDOW('${ifcGuid(8000 + index)}',$,'Janela ${index + 1}',$,$,${ref(placement)},$,$,${number(height)},${number(width)},.WINDOW.,.NOTDEFINED.,$)`);
    storeys[floor]!.openings.push(entity);
  });

  storeys.forEach((storey, floor) => {
    if (!storey.walls.length) return;
    const contained = [...storey.walls, ...storey.openings];
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid(5000 + floor)}',$,$,$,(${contained.map(ref).join(",")}),${ref(storey.entity)})`);
  });

  const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');
FILE_NAME('arqdor-export.ifc','${new Date().toISOString()}',('Arqdor'),('VendorAI'),'Arqdor','Arqdor','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
`;
  const footer = `
ENDSEC;
END-ISO-10303-21;
`;

  return header + entities.join("\n") + footer;
}

export function conceptIfcFilename(title?: string | null) {
  const base = (title || "arqdor-projeto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "arqdor-projeto";
  return `${base}.ifc`;
}
