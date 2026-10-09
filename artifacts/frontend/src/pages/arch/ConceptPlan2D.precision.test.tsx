// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConceptPlan2D from "./ConceptPlan2D";

afterEach(cleanup);
beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId = 1;
    pointerType = "mouse";
  }
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
  Object.defineProperty(SVGSVGElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", { configurable: true, value() {
    return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } };
  } });
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({}) }) });
});

function draw(onCreateCustomWall: ReturnType<typeof vi.fn>, customWalls: Array<{ id: string; floor: number; x1: number; y1: number; x2: number; y2: number }> = []) {
  const result = render(<ConceptPlan2D rooms={[]} lotWidth={12} lotDepth={30} geometry={{ walls: [], openings: [] }} selectedId={null} onSelect={() => undefined} interactionMode="draw-wall" customWalls={customWalls} onCreateCustomWall={onCreateCustomWall} />);
  return result.container.querySelector("svg.block")!;
}

describe("desenho de paredes com precisão", () => {
  it("permite corrigir a medida com Backspace antes de aplicar", () => {
    const create = vi.fn();
    const svg = draw(create);
    fireEvent.pointerDown(svg, { clientX: 1, clientY: 2 });
    fireEvent.pointerMove(svg, { clientX: 4, clientY: 2 });
    for (const key of "4,19") fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ x2: 5.12 }));
  });

  it("cancela a cadeia com Escape sem criar uma parede", () => {
    const create = vi.fn();
    const svg = draw(create);
    fireEvent.pointerDown(svg, { clientX: 1, clientY: 2 });
    fireEvent.pointerMove(svg, { clientX: 4, clientY: 2 });
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Comprimento da nova parede" })).toBeNull();
  });

  it("não interpreta o zero de 10,00 como enquadramento da vista", () => {
    const create = vi.fn();
    const svg = draw(create);
    fireEvent.pointerDown(svg, { clientX: 1, clientY: 2 });
    fireEvent.pointerMove(svg, { clientX: 4, clientY: 2 });
    for (const key of "10,00") fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ x1: 1, y1: 2, x2: 11, y2: 2 }));
  });

  it("oferece medida e espessura visíveis sem exigir teclado físico", () => {
    const create = vi.fn();
    const svg = draw(create);
    fireEvent.change(screen.getByRole("combobox", { name: "Espessura das novas paredes" }), { target: { value: "0.2" } });
    fireEvent.pointerDown(svg, { clientX: 1, clientY: 2 });
    fireEvent.pointerMove(svg, { clientX: 4, clientY: 2 });
    fireEvent.change(screen.getByRole("textbox", { name: "Comprimento da nova parede" }), { target: { value: "4,12" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar medida" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ x2: 5.12, thickness: 0.2 }));
    fireEvent.click(screen.getByRole("button", { name: "Encerrar desenho" }));
    expect(screen.queryByRole("textbox", { name: "Comprimento da nova parede" })).toBeNull();
  });

  it("encaixa exatamente em extremidade importada fora da grade", () => {
    const create = vi.fn();
    const svg = draw(create, [{ id: "imported", floor: 0, x1: 4.12, y1: 3.37, x2: 4.12, y2: 8 }]);
    fireEvent.pointerDown(svg, { clientX: 4.1, clientY: 3.4 });
    fireEvent.pointerMove(svg, { clientX: 6, clientY: 3.37 });
    fireEvent.change(screen.getByRole("textbox", { name: "Comprimento da nova parede" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar medida" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ x1: 4.12, y1: 3.37 }));
  });

  it("mostra erro e não cria parede quando a medida ultrapassa os limites", () => {
    const create = vi.fn();
    const svg = draw(create);
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 2 });
    fireEvent.pointerMove(svg, { clientX: 11, clientY: 2 });
    fireEvent.change(screen.getByRole("textbox", { name: "Comprimento da nova parede" }), { target: { value: "4,20" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar medida" }));
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("ultrapassa");
  });
});
