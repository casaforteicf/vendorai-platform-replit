import { expect, it } from "vitest";
import { preserveArchitecturalSnapshot } from "./arch-concept-configuration";
const snapshot = { version: 1, slabs: [{ id: "s", floor: 1, x: 0, y: 0, width: 3, depth: 3, thickness: 0.15, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] }], stairs: [], roofs: [], openings: [] };
it("preserves geometry when a legacy configuration omits it", () => {
  const incoming = { floors: 2, desiredArea: 180 };
  const next = preserveArchitecturalSnapshot({ architecturalModel: snapshot }, incoming);
  expect(JSON.parse(JSON.stringify(next)).architecturalModel).toEqual(snapshot);
  expect(next).toMatchObject(incoming);
  expect(incoming).not.toHaveProperty("architecturalModel");
});
it("keeps an explicit empty snapshot so deleting all elements persists", () => {
  const empty = { version: 1, slabs: [], stairs: [], roofs: [], openings: [] };
  expect(preserveArchitecturalSnapshot({ architecturalModel: snapshot }, { architecturalModel: empty }).architecturalModel).toEqual(empty);
});
it("accepts an explicitly edited snapshot and leaves legacy projects legacy", () => {
  const edited = { ...snapshot, roofs: [{ id: "r" }] };
  expect(preserveArchitecturalSnapshot({ architecturalModel: snapshot }, { architecturalModel: edited }).architecturalModel).toEqual(edited);
  expect(preserveArchitecturalSnapshot({ floors: 1 }, { floors: 2 })).toEqual({ floors: 2 });
});
