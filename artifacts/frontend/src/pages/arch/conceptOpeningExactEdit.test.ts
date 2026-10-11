import { describe, expect, it } from "vitest";
import { exactOpeningEdit } from "./conceptOpeningPlacement";

const window = { type: "window" as const, offset: 0.25, width: 1, height: 1.2, sillHeight: 0.9 };
describe("medidas exatas das aberturas", () => {
  it("desvincula produto com medidas alteradas e preserva vínculo ao reposicionar", () => {
    const product = { ...window, catalogProductId: "product-1" };
    expect(exactOpeningEdit(product, { width: 1.2 }, [], 4)).toMatchObject({ opening: { catalogProductId: undefined } });
    expect(exactOpeningEdit(product, { offset: 0.5 }, [], 4)).toMatchObject({ opening: { catalogProductId: "product-1" } });
    expect(exactOpeningEdit(product, { width: 1 }, [], 4)).toMatchObject({ opening: { catalogProductId: "product-1" } });
  });
  it("mantém largura e posição solicitadas quando cabem", () => {
    expect(exactOpeningEdit(window, { width: 1.37 }, [], 4)).toEqual({ opening: { ...window, width: 1.37 } });
  });
  it("rejeita largura que ultrapassa a extremidade sem deslocar ou reduzir", () => {
    expect(exactOpeningEdit(window, { width: 2.5 }, [], 4)).toHaveProperty("error");
    expect(window).toMatchObject({ offset: 0.25, width: 1 });
  });
  it("rejeita posição fora da parede sem prender silenciosamente no limite", () => {
    expect(exactOpeningEdit(window, { offset: 0 }, [], 4)).toHaveProperty("error");
  });
  it("bloqueia nova sobreposição ao mudar o peitoril", () => {
    const lower = { ...window, height: 0.6, sillHeight: 0 };
    expect(exactOpeningEdit(window, { sillHeight: 0.2 }, [lower], 4)).toHaveProperty("error");
    expect(exactOpeningEdit(window, { sillHeight: 0.8 }, [lower], 4)).toHaveProperty("opening");
  });
  it("rejeita altura total não finita sem alterar a abertura", () => {
    const imported = { ...window, height: 1e308, sillHeight: 1e308 };
    expect(exactOpeningEdit(imported, { offset: 0.5 }, [], 4)).toHaveProperty("error");
    expect(imported.offset).toBe(window.offset);
  });
  it("rejeita medidas fora da faixa e números inválidos", () => {
    for (const patch of [{ width: 4.1 }, { width: 0.3 }, { height: 3 }, { height: NaN }, { sillHeight: -0.1 }, { sillHeight: 2.3 }]) {
      expect(exactOpeningEdit(window, patch, [], 10)).toHaveProperty("error");
    }
  });
  it("preserva dimensões importadas ao editar outro parâmetro", () => {
    const imported = { ...window, offset: 0.5, width: 5 };
    expect(exactOpeningEdit(imported, { sillHeight: 0 }, [], 10)).toEqual({ opening: { ...imported, sillHeight: 0 } });
  });
});
