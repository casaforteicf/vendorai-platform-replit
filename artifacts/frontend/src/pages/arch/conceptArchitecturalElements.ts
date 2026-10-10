/** Pure, versionable parametric geometry for the concept editor (metres). */
export type Rect = { x: number; y: number; width: number; depth: number };
export type Slab = Rect & { id: string; floor: number; thickness: number; elevation: number; voids: Rect[] };
export type Stair = { id: string; floor: number; x: number; y: number; width: number; run: number; rise: number; preferredRiser?: number };
export type Roof = Rect & { id: string; elevation: number; pitchDegrees: number; overhang: number; type: "flat" | "mono" | "gable" };
export type OpeningScheduleItem = { id: string; wallId: string; type: "door" | "window"; width: number; height: number; sillHeight: number; quantity: number };
type Result<T> = { value: T } | { error: string };
const finite = (...values: number[]) => values.every(Number.isFinite);
const validRect = (r: Rect) => finite(r.x, r.y, r.width, r.depth) && r.width > 0 && r.depth > 0 && finite(r.x + r.width, r.y + r.depth);
const overlaps = (a: Rect, b: Rect) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1e-9 && Math.min(a.y + a.depth, b.y + b.depth) > Math.max(a.y, b.y) + 1e-9;
export function createSlab(input: Slab): Result<Slab> {
  if (!validRect(input) || !finite(input.thickness, input.elevation) || input.thickness <= 0 || !Number.isInteger(input.floor)) return { error: "Dimensões da laje inválidas." };
  for (const hole of input.voids) {
    if (!validRect(hole) || hole.x < input.x || hole.y < input.y || hole.x + hole.width > input.x + input.width || hole.y + hole.depth > input.y + input.depth) return { error: "A abertura de laje deve estar inteiramente dentro da laje." };
  }
  for (let i = 0; i < input.voids.length; i++) for (let j = i + 1; j < input.voids.length; j++) {
    if (overlaps(input.voids[i], input.voids[j])) return { error: "Aberturas de laje não podem se sobrepor." };
  }
  return { value: { ...input, voids: input.voids.map(h => ({ ...h })) } };
}
export function slabNetArea(slab: Slab): number {
  return slab.width * slab.depth - slab.voids.reduce((total, hole) => total + hole.width * hole.depth, 0);
}
export function createStraightStair(input: Stair): Result<Stair & { steps: number; riser: number; tread: number }> {
  if (!finite(input.x, input.y, input.width, input.run, input.rise, input.preferredRiser ?? 0.175) || input.width <= 0 || input.run <= 0 || input.rise <= 0 || !Number.isInteger(input.floor)) return { error: "Dimensões da escada inválidas." };
  const preferred = input.preferredRiser ?? 0.175;
  if (preferred < 0.1 || preferred > 0.22) return { error: "Espelho preferencial fora da faixa." };
  const steps = Math.max(2, Math.round(input.rise / preferred));
  const riser = input.rise / steps;
  const tread = input.run / (steps - 1);
  if (riser < 0.1 || riser > 0.22 || tread < 0.2 || tread > 0.45) return { error: "A escada não cabe no desenvolvimento disponível." };
  return { value: { ...input, steps, riser, tread } };
}
export function createRoof(input: Roof): Result<Roof & { ridgeHeight: number; footprint: Rect }> {
  if (!validRect(input) || !finite(input.elevation, input.pitchDegrees, input.overhang) || input.overhang < 0 || input.pitchDegrees < 0 || input.pitchDegrees > 60) return { error: "Dimensões da cobertura inválidas." };
  if (input.type === "flat" && input.pitchDegrees !== 0) return { error: "Cobertura plana requer inclinação zero." };
  const span = input.type === "gable" ? input.depth / 2 : input.type === "mono" ? input.depth : 0;
  const ridgeHeight = input.elevation + Math.tan(input.pitchDegrees * Math.PI / 180) * span;
  const footprint = { x: input.x - input.overhang, y: input.y - input.overhang, width: input.width + 2 * input.overhang, depth: input.depth + 2 * input.overhang };
  if (!finite(ridgeHeight, footprint.x, footprint.y, footprint.width, footprint.depth)) return { error: "Cobertura ultrapassa os limites numéricos." };
  return { value: { ...input, ridgeHeight, footprint } };
}
export function openingSchedule(openings: readonly OpeningScheduleItem[]) {
  const groups = new Map<string, OpeningScheduleItem>();
  for (const item of openings) {
    if (!finite(item.width, item.height, item.sillHeight, item.quantity) || item.width <= 0 || item.height <= 0 || item.sillHeight < 0 || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    const key = JSON.stringify([item.type, item.width, item.height, item.sillHeight]);
    const prior = groups.get(key);
    if (prior) prior.quantity += item.quantity;
    else groups.set(key, { ...item });
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || a.width - b.width || a.height - b.height);
}
