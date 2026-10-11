import { expect, it } from "vitest";
import { normalizeOpeningDimensions } from "./conceptParametricEditing";
it("preserva janela até o piso", () => {
  expect(normalizeOpeningDimensions({ type: "window", sillHeight: 0 }).sillHeight).toBe(0);
});
it("usa o padrão para peitoril ausente ou inválido", () => {
  expect(normalizeOpeningDimensions({ type: "window" }).sillHeight).toBe(0.9);
  expect(normalizeOpeningDimensions({ type: "window", sillHeight: NaN }).sillHeight).toBe(0.9);
});
it("mantém limites e peitoril de porta no piso", () => {
  expect(normalizeOpeningDimensions({ type: "window", sillHeight: -1 }).sillHeight).toBe(0);
  expect(normalizeOpeningDimensions({ type: "window", sillHeight: 3 }).sillHeight).toBe(2.2);
  expect(normalizeOpeningDimensions({ type: "door", sillHeight: 1 }).sillHeight).toBe(0);
});
