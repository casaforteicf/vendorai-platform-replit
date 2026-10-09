type Point = { x: number; y: number };
type Cell = { x: number; y: number; width: number; height: number };
type ObjectFootprint = { x: number; y: number; width: number; depth: number; rotation: number };
function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
function clip(points: Point[], axis: "x" | "y", boundary: number, greater: boolean) {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const insideA = greater ? a[axis] >= boundary : a[axis] <= boundary;
    const insideB = greater ? b[axis] >= boundary : b[axis] <= boundary;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return result;
}
// Closed-space cells are a disjoint partition produced by the wall network.
export function furnitureFitsRoom(object: ObjectFootprint, cells: Cell[]) {
  if (![object.x, object.y, object.width, object.depth, object.rotation].every(Number.isFinite) || object.width <= 0 || object.depth <= 0) return false;
  const angle = object.rotation * Math.PI / 180, cx = object.x + object.width / 2, cy = object.y + object.depth / 2;
  const polygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * object.width / 2, y = sy * object.depth / 2;
    return { x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) };
  });
  const covered = cells.reduce((sum, cell) => {
    if (![cell.x, cell.y, cell.width, cell.height].every(Number.isFinite) || cell.width <= 0 || cell.height <= 0) return sum;
    let intersection = clip(polygon, "x", cell.x, true);
    intersection = clip(intersection, "x", cell.x + cell.width, false);
    intersection = clip(intersection, "y", cell.y, true);
    intersection = clip(intersection, "y", cell.y + cell.height, false);
    return sum + polygonArea(intersection);
  }, 0);
  const area = object.width * object.depth;
  return Math.abs(covered - area) <= Math.max(1e-8, area * 1e-8);
}
