import { describe, expect, it } from "vitest";
import { applyArchitecturalEdits, architecturalQuantities, emptyArchitecturalModel } from "./conceptArchitecturalModel";
const slab = { id: "s", floor: 0, x: 0, y: 0, width: 5, depth: 4, thickness: 0.15, elevation: 2.8, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] };
const window = { id: "j1", wallId: "w1", type: "window" as const, width: 1.2, height: 1, sillHeight: 0.9, quantity: 1 };
describe("snapshot arquitetônico transacional", () => {
  it("aplica edição em lote e fornece quantitativos sem mutar o original", () => {
    const original = emptyArchitecturalModel();
    const result = applyArchitecturalEdits(original, [
      { action: "upsert", element: { kind: "slab", value: slab } },
      { action: "upsert", element: { kind: "opening", value: window } },
    ]);
    expect(result).toHaveProperty("value");
    expect(original.slabs).toHaveLength(0);
    if ("value" in result) {
      expect(architecturalQuantities(result.value).slabNetArea).toBe(19);
      expect(architecturalQuantities(result.value).openings[0].quantity).toBe(1);
      result.value.slabs[0].voids[0].x = 3;
      expect(slab.voids[0].x).toBe(1);
    }
  });
  it("rejeita lote inteiro se qualquer etapa for inválida", () => {
    const original = emptyArchitecturalModel();
    const result = applyArchitecturalEdits(original, [
      { action: "upsert", element: { kind: "slab", value: slab } },
      { action: "upsert", element: { kind: "opening", value: { ...window, width: -1 } } },
    ]);
    expect(result).toHaveProperty("error");
    expect(original.slabs).toHaveLength(0);
  });
  it("atualiza pelo id e rejeita remoção inexistente", () => {
    const first = applyArchitecturalEdits(emptyArchitecturalModel(), [{ action: "upsert", element: { kind: "opening", value: window } }]);
    expect(first).toHaveProperty("value");
    if ("value" in first) {
      const second = applyArchitecturalEdits(first.value, [{ action: "upsert", element: { kind: "opening", value: { ...window, quantity: 2 } } }]);
      expect(second).toHaveProperty("value");
      if ("value" in second) expect(second.value.openings).toEqual([{ ...window, quantity: 2 }]);
      expect(applyArchitecturalEdits(first.value, [{ action: "remove", kind: "roof", id: "missing" }])).toHaveProperty("error");
    }
  });
});
