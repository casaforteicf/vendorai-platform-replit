type FloorItem = { id: string; floor: number };
type Input = {
  floor: number; lotWidth: number; lotDepth: number; spaceId: string | null; spaceKind: string;
  cells: readonly object[]; walls: readonly FloorItem[]; openings: readonly FloorItem[]; objects: readonly FloorItem[];
};
const values = (item: object, keys: string[]) => keys.map(key => Reflect.get(item, key) ?? null);
/** Only placement inputs invalidate suggestions; appearance changes do not. */
export function furnitureLayoutRevision(input: Input): string {
  const items = (list: readonly FloorItem[], keys: string[]) => list
    .filter(item => item.floor === input.floor)
    .map(item => values(item, ["id", ...keys]))
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([
    input.floor, input.lotWidth, input.lotDepth, input.spaceId, input.spaceKind,
    input.cells.map(cell => values(cell, ["x", "y", "width", "height"])).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    items(input.walls, ["x1", "y1", "x2", "y2", "thickness"]),
    items(input.openings, ["wallId", "type", "offset", "width", "height", "sillHeight"]),
    items(input.objects, ["kind", "x", "y", "width", "depth", "rotation"]),
  ]);
}
