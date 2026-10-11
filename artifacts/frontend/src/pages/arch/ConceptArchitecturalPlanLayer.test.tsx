import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConceptArchitecturalPlanLayer } from "./ConceptArchitecturalPlanLayer";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
afterEach(cleanup);
function model() {
  const m = emptyArchitecturalModel();
  m.slabs.push({ id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 3, thickness: 0.15, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
  return m;
}
it("selects visible elements by click and keyboard and marks the current selection", () => {
  const onSelect = vi.fn();
  render(<svg><ConceptArchitecturalPlanLayer model={model()} floor={1} selectedId="s" onSelect={onSelect} /></svg>);
  const button = screen.getByRole("button", { name: "Laje · s" });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(button.getAttribute("pointer-events")).toBe("visibleStroke");
  fireEvent.click(button); fireEvent.keyDown(button, { key: "Enter" }); fireEvent.keyDown(button, { key: " " });
  expect(onSelect.mock.calls).toEqual([["s"], ["s"], ["s"]]);
});
it("filters other floors and leaves the drawing inert without a callback", () => {
  const { rerender } = render(<svg><ConceptArchitecturalPlanLayer model={model()} floor={0} onSelect={vi.fn()} /></svg>);
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<svg><ConceptArchitecturalPlanLayer model={model()} floor={1} /></svg>);
  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelector('[data-architectural-id="s"]')?.getAttribute("pointer-events")).toBe("none");
});
