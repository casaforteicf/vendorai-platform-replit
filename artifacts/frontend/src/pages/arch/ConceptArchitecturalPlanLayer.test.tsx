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

it("moves a selected element in centimetre steps and ignores key repeats", () => {
  const onMove = vi.fn();
  render(<svg><ConceptArchitecturalPlanLayer model={model()} floor={1} selectedId="s" onSelect={vi.fn()} onMove={onMove} /></svg>);
  const button = screen.getByRole("button", { name: "Laje · s" });
  fireEvent.keyDown(button, { key: "ArrowRight" });
  fireEvent.keyDown(button, { key: "ArrowUp", shiftKey: true });
  fireEvent.keyDown(button, { key: "ArrowDown", repeat: true });
  expect(onMove.mock.calls).toEqual([["s", 0.01, 0], ["s", 0, -0.1]]);
});

afterEach(() => vi.unstubAllGlobals());
function dragSetup() {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: PointerEventInit) { super(type, options); this.pointerId = options.pointerId ?? 1; }
  });
  const onMove = vi.fn();
  const { rerender } = render(<svg><ConceptArchitecturalPlanLayer model={model()} floor={1} selectedId="s" onSelect={vi.fn()} onMove={onMove} lotWidth={12} lotDepth={20} /></svg>);
  const button = screen.getByRole("button", { name: "Laje · s" }) as unknown as SVGRectElement;
  Object.defineProperty(button, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
  Object.defineProperty(button.ownerSVGElement, "createSVGPoint", { value: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x / 100, y: this.y / 100 }; } }) });
  let captured = false;
  const release = vi.fn(() => { captured = false; });
  Object.defineProperty(button, "setPointerCapture", { value: vi.fn(() => { captured = true; }) });
  Object.defineProperty(button, "hasPointerCapture", { value: () => captured });
  Object.defineProperty(button, "releasePointerCapture", { value: release });
  return { button, onMove, rerender, release };
}
it("previews a metric drag and commits only once on release", () => {
  const { button, onMove } = dragSetup();
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
  expect(button.getAttribute("x")).toBe("1");
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.pointerUp(button, { pointerId: 1 });
  fireEvent.pointerUp(button, { pointerId: 1 });
  expect(onMove.mock.calls).toEqual([["s", 1, 1]]);
});
it("cancels Escape and pointer cancellation without a commit", () => {
  const { button, onMove } = dragSetup();
  for (const cancel of ["escape", "pointer"]) {
    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
    if (cancel === "escape") fireEvent.keyDown(button, { key: "Escape" });
    else fireEvent.pointerCancel(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(button.getAttribute("x")).toBe("0");
  }
  expect(onMove).not.toHaveBeenCalled();
});
it("does not commit out-of-bounds motion or a different pointer", () => {
  const { button, onMove } = dragSetup();
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(button, { pointerId: 2, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 2000, clientY: 100 });
  fireEvent.pointerUp(button, { pointerId: 1 });
  expect(onMove).not.toHaveBeenCalled();
});

it("discards a drag when its source snapshot changes", () => {
  const { button, onMove, rerender } = dragSetup();
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
  rerender(<svg><ConceptArchitecturalPlanLayer model={model()} floor={1} selectedId="s" onSelect={vi.fn()} onMove={onMove} lotWidth={12} lotDepth={20} /></svg>);
  fireEvent.pointerUp(button, { pointerId: 1 });
  expect(onMove).not.toHaveBeenCalled();
});

it("keeps keyboard moves out of an active drag and releases capture on cancellation", () => {
  const { button, onMove, release } = dragSetup();
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.keyDown(button, { key: "ArrowRight" });
  fireEvent.keyDown(button, { key: "Enter" });
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(button, { key: "Escape" });
  expect(release).toHaveBeenCalledWith(1);
  fireEvent.pointerUp(button, { pointerId: 1 });
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(button, { key: "ArrowRight" });
  expect(onMove.mock.calls).toEqual([["s", 0.01, 0]]);
});
it("ignores capture loss for another pointer but cancels the active pointer", () => {
  const { button, onMove } = dragSetup();
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.lostPointerCapture(button, { pointerId: 2 });
  expect(button.getAttribute("x")).toBe("1");
  fireEvent.lostPointerCapture(button, { pointerId: 1 });
  expect(button.getAttribute("x")).toBe("0");
  fireEvent.pointerUp(button, { pointerId: 1 });
  expect(onMove).not.toHaveBeenCalled();
});

it("previews corner resizing, commits once and cancels an invalid shrink", () => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, options: PointerEventInit) { super(type, options); this.pointerId = options.pointerId ?? 1; }
  });
  const onResize = vi.fn();
  render(<svg><ConceptArchitecturalPlanLayer model={model()} floor={1} selectedId="s" onSelect={vi.fn()} onResize={onResize} lotWidth={12} lotDepth={20} /></svg>);
  const grip = screen.getByRole("button", { name: "Redimensionar Laje · s" }) as unknown as SVGCircleElement;
  Object.defineProperty(grip, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
  Object.defineProperty(grip.ownerSVGElement, "createSVGPoint", { value: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x / 100, y: this.y / 100 }; } }) });
  Object.defineProperty(grip, "setPointerCapture", { value: vi.fn() });
  Object.defineProperty(grip, "hasPointerCapture", { value: () => false });
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 500, clientY: 400 });
  expect(grip.getAttribute("cx")).toBe("5");
  expect(onResize).not.toHaveBeenCalled();
  fireEvent.pointerUp(grip, { pointerId: 1 });
  fireEvent.pointerUp(grip, { pointerId: 1 });
  expect(onResize.mock.calls).toEqual([["s", 5, 4]]);
  onResize.mockClear();
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 100, clientY: 100 });
  expect(grip.getAttribute("cx")).toBe("4");
  fireEvent.keyDown(grip, { key: "Escape" });
  fireEvent.pointerUp(grip, { pointerId: 1 });
  expect(onResize).not.toHaveBeenCalled();
  fireEvent.keyDown(grip, { key: "ArrowRight", shiftKey: true });
  expect(onResize.mock.calls).toEqual([["s", 4.1, 3]]);
});
