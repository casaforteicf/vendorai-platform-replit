/** Dimensional engineering preflight for parametric BIM elements (metres). */
export type StairInput = { floor: number; rise: number; run: number; stepCount: number; width: number };
export type SlabInput = { floor: number; width: number; depth: number; thickness: number; openings: Array<{ x: number; y: number; width: number; depth: number }> };
export type RoofInput = { kind: "flat" | "pitched"; width: number; depth: number; pitchDegrees: number; eave: number };
export type ParameterIssue = { path: string; code: "NON_FINITE" | "OUT_OF_RANGE" | "OPENING_OUTSIDE_SLAB" | "OPENING_COLLISION" };
export type ParameterResult<T> = { valid: boolean; issues: ParameterIssue[]; value: T };

const range = (issues: ParameterIssue[], path: string, value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) issues.push({ path, code: "NON_FINITE" });
  else if (value < min || value > max) issues.push({ path, code: "OUT_OF_RANGE" });
};
export function validateStair(input: StairInput): ParameterResult<StairInput & { riser: number; tread: number }> {
  const issues: ParameterIssue[] = [];
  range(issues, "floor", input.floor, 0, 100);
  if (!Number.isInteger(input.floor)) issues.push({ path: "floor", code: "OUT_OF_RANGE" });
  range(issues, "rise", input.rise, 0.1, 10);
  range(issues, "run", input.run, 0.1, 30);
  range(issues, "stepCount", input.stepCount, 2, 60);
  if (!Number.isInteger(input.stepCount)) issues.push({ path: "stepCount", code: "OUT_OF_RANGE" });
  range(issues, "width", input.width, 0.5, 5);
  const riser = input.rise / input.stepCount;
  const tread = input.run / (input.stepCount - 1);
  if (Number.isFinite(riser)) range(issues, "riser", riser, 0.10, 0.22);
  if (Number.isFinite(tread)) range(issues, "tread", tread, 0.20, 0.40);
  return { valid: issues.length === 0, issues, value: { ...input, riser, tread } };
}
export function validateSlab(input: SlabInput): ParameterResult<SlabInput> {
  const issues: ParameterIssue[] = [];
  range(issues, "floor", input.floor, 0, 100);
  if (!Number.isInteger(input.floor)) issues.push({ path: "floor", code: "OUT_OF_RANGE" });
  range(issues, "width", input.width, 0.5, 300);
  range(issues, "depth", input.depth, 0.5, 300);
  range(issues, "thickness", input.thickness, 0.05, 1);
  input.openings.forEach((a, i) => {
    const path = `openings[${i}]`;
    for (const key of ["x", "y", "width", "depth"] as const) {
      if (!Number.isFinite(a[key])) issues.push({ path: `${path}.${key}`, code: "NON_FINITE" });
    }
    if (![a.x, a.y, a.width, a.depth].every(Number.isFinite)) return;
    if (a.width <= 0 || a.depth <= 0 || a.x < 0 || a.y < 0 ||
        a.x + a.width > input.width || a.y + a.depth > input.depth)
      issues.push({ path, code: "OPENING_OUTSIDE_SLAB" });
    for (let j = 0; j < i; j++) {
      const b = input.openings[j];
      if (![b.x, b.y, b.width, b.depth].every(Number.isFinite)) continue;
      if (a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.depth && a.y + a.depth > b.y)
        issues.push({ path, code: "OPENING_COLLISION" });
    }
  });
  return { valid: issues.length === 0, issues, value: input };
}
export function validateRoof(input: RoofInput): ParameterResult<RoofInput & { rise: number }> {
  const issues: ParameterIssue[] = [];
  range(issues, "width", input.width, 0.5, 300);
  range(issues, "depth", input.depth, 0.5, 300);
  range(issues, "eave", input.eave, 0, 3);
  if (input.kind !== "flat" && input.kind !== "pitched") issues.push({ path: "kind", code: "OUT_OF_RANGE" });
  if (input.kind === "flat") {
    if (!Number.isFinite(input.pitchDegrees)) issues.push({ path: "pitchDegrees", code: "NON_FINITE" });
    else if (input.pitchDegrees !== 0) issues.push({ path: "pitchDegrees", code: "OUT_OF_RANGE" });
  } else if (input.kind === "pitched") {
    range(issues, "pitchDegrees", input.pitchDegrees, 1, 60);
  }
  const rise = input.kind === "pitched" ? Math.tan(input.pitchDegrees * Math.PI / 180) * input.width / 2 : 0;
  if (!Number.isFinite(rise)) issues.push({ path: "rise", code: "NON_FINITE" });
  return { valid: issues.length === 0, issues, value: { ...input, rise } };
}
