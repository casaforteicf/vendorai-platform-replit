import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConceptPlan2D from "./ConceptPlan2D";

const geometry = { walls: [], openings: [] };

describe("ConceptPlan2D mobile/touch stability", () => {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const hasPointerCapture = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(SVGSVGElement.prototype, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    Object.defineProperty(SVGSVGElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: releasePointerCapture,
    });
    Object.defineProperty(SVGSVGElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: hasPointerCapture,
    });
  });

  it("captura e libera o ponteiro durante edição para não perder arraste touch", () => {
    render(
      <ConceptPlan2D
        rooms={[]}
        lotWidth={12}
        lotDepth={30}
        geometry={geometry}
        selectedId={null}
        onSelect={() => undefined}
        interactionMode="room"
      />,
    );

    const canvas = screen.getByRole("img", { name: "Planta conceitual arquitetônica" });
    fireEvent.pointerDown(canvas, { pointerId: 7, clientX: 20, clientY: 20 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 20, clientY: 20 });
    expect(hasPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("usa altura mínima menor no mobile e mantém 620px a partir de sm", () => {
    render(
      <ConceptPlan2D
        rooms={[]}
        lotWidth={12}
        lotDepth={30}
        geometry={geometry}
        selectedId={null}
        onSelect={() => undefined}
        interactionMode="navigate"
      />,
    );

    const canvas = screen.getByRole("img", { name: "Planta conceitual arquitetônica" });
    expect(canvas.getAttribute("class")).toContain("min-h-[420px]");
    expect(canvas.getAttribute("class")).toContain("sm:min-h-[620px]");
    expect(canvas.getAttribute("class")).toContain("touch-none");
  });
});
