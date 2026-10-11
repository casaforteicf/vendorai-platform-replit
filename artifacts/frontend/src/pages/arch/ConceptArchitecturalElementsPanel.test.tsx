import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConceptArchitecturalElementsPanel } from "./ConceptArchitecturalElementsPanel";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
afterEach(cleanup);
it("creates a valid stair with optional upper slab opening", () => {
  const onChange = vi.fn();
  render(<ConceptArchitecturalElementsPanel model={emptyArchitecturalModel()} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.change(screen.getByLabelText("Tipo de elemento"), { target: { value: "stair" } });
  expect(screen.getByRole("checkbox").checked).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.calls[0][0].stairs[0]).toMatchObject({ floor: 0, run: 4.2, openSlab: false });
});
it("preserves a selected element floor when editing from a different view", () => {
  const onChange = vi.fn(); const model = emptyArchitecturalModel();
  model.slabs.push({ id: "existing", floor: 1, x: 0, y: 0, width: 3, depth: 3, thickness: 0.15, elevation: 3.12, voids: [] });
  render(<ConceptArchitecturalElementsPanel model={model} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.click(screen.getByRole("button", { name: "slab · existing" }));
  fireEvent.change(screen.getByLabelText("Largura"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
  expect(onChange.mock.calls[0][0].slabs[0]).toMatchObject({ floor: 1, width: 4, elevation: 3.12 });
});

it("converts centimetres and preserves authored slab openings", () => {
  const onChange = vi.fn(); const model = emptyArchitecturalModel();
  model.slabs.push({ id: "slab", floor: 1, x: 0, y: 0, width: 3, depth: 3, thickness: 0.2, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
  render(<ConceptArchitecturalElementsPanel model={model} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.click(screen.getByRole("button", { name: "slab · slab" }));
  expect((screen.getByLabelText("Espessura (cm)") as HTMLInputElement).value).toBe("20");
  fireEvent.change(screen.getByLabelText("Espessura (cm)"), { target: { value: "25" } });
  fireEvent.change(screen.getByLabelText("Cota superior (m)"), { target: { value: "3.4" } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
  expect(onChange.mock.calls[0][0].slabs[0]).toMatchObject({ thickness: 0.25, elevation: 3.4, floor: 1, voids: model.slabs[0].voids });
});
it("rejects a blank or zero slab thickness without committing", () => {
  const onChange = vi.fn();
  render(<ConceptArchitecturalElementsPanel model={emptyArchitecturalModel()} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  for (const value of ["", "0"]) {
    fireEvent.change(screen.getByLabelText("Espessura (cm)"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  }
  expect(onChange).not.toHaveBeenCalled();
});
it("edits roof type, pitch, eave and elevation with flat roof consistency", () => {
  const onChange = vi.fn();
  render(<ConceptArchitecturalElementsPanel model={emptyArchitecturalModel()} onChange={onChange} floor={1} lotWidth={12} lotDepth={20} />);
  fireEvent.change(screen.getByLabelText("Tipo de elemento"), { target: { value: "roof" } });
  fireEvent.change(screen.getByLabelText("Tipo de cobertura"), { target: { value: "flat" } });
  expect((screen.getByLabelText("Inclinação (°)") as HTMLInputElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Beiral (m)"), { target: { value: "0.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(onChange.mock.calls[0][0].roofs[0]).toMatchObject({ type: "flat", pitchDegrees: 0, overhang: 0.5, elevation: 5.92 });
  fireEvent.change(screen.getByLabelText("Tipo de cobertura"), { target: { value: "mono" } });
  fireEvent.change(screen.getByLabelText("Inclinação (°)"), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(onChange.mock.calls[1][0].roofs[0]).toMatchObject({ type: "mono", pitchDegrees: 20 });
});
it("shows stair metrics and rejects a rise that cannot fit", () => {
  const onChange = vi.fn();
  render(<ConceptArchitecturalElementsPanel model={emptyArchitecturalModel()} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.change(screen.getByLabelText("Tipo de elemento"), { target: { value: "stair" } });
  expect(screen.getByText(/16 espelhos/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Desnível (m)"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});
it("starts another slab with the 15cm default after editing an existing one", () => {
  const onChange = vi.fn(); const model = emptyArchitecturalModel();
  model.slabs.push({ id: "old", floor: 1, x: 0, y: 0, width: 3, depth: 3, thickness: 0.25, elevation: 4, voids: [] });
  render(<ConceptArchitecturalElementsPanel model={model} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.click(screen.getByRole("button", { name: "slab · old" }));
  fireEvent.click(screen.getByRole("button", { name: "Novo elemento" }));
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  expect(onChange.mock.calls[0][0].slabs[1]).toMatchObject({ floor: 0, thickness: 0.15, elevation: 0.16 });
  expect(onChange.mock.calls[0][0].slabs[0]).toEqual(model.slabs[0]);
});

it("rejects roof pitches outside the accepted range", () => {
  const onChange = vi.fn();
  render(<ConceptArchitecturalElementsPanel model={emptyArchitecturalModel()} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.change(screen.getByLabelText("Tipo de elemento"), { target: { value: "roof" } });
  for (const value of ["61", "-1", ""]) {
    fireEvent.change(screen.getByLabelText("Inclinação (°)"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  }
  expect(onChange).not.toHaveBeenCalled();
});

it("loads requested plan selection once and supports selecting the same element again", () => {
  const model = emptyArchitecturalModel(); const onChange = vi.fn();
  model.slabs.push({ id: "s", floor: 1, x: 1, y: 1, width: 3, depth: 3, thickness: 0.2, elevation: 3.12, voids: [] });
  const { rerender } = render(<ConceptArchitecturalElementsPanel model={model} requestedSelection={{ id: "s", revision: 1 }} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  expect((screen.getByLabelText("Espessura (cm)") as HTMLInputElement).value).toBe("20");
  fireEvent.change(screen.getByLabelText("Largura"), { target: { value: "4" } });
  rerender(<ConceptArchitecturalElementsPanel model={{ ...model }} requestedSelection={{ id: "s", revision: 1 }} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  expect((screen.getByLabelText("Largura") as HTMLInputElement).value).toBe("4");
  rerender(<ConceptArchitecturalElementsPanel model={model} requestedSelection={{ id: "s", revision: 2 }} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  expect((screen.getByLabelText("Largura") as HTMLInputElement).value).toBe("3");
});

it("duplicates saved slab parameters with configured offsets in a single change", () => {
  const onChange = vi.fn(); const model = emptyArchitecturalModel();
  model.slabs.push({ id: "s", floor: 1, x: 0, y: 0, width: 3, depth: 3, thickness: 0.2, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
  render(<ConceptArchitecturalElementsPanel model={model} onChange={onChange} floor={0} lotWidth={12} lotDepth={20} />);
  fireEvent.click(screen.getByRole("button", { name: "slab · s" }));
  fireEvent.change(screen.getByLabelText("Largura"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Deslocamento X da cópia (m)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Deslocamento Y da cópia (m)"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.calls[0][0].slabs[1]).toMatchObject({ id: "s-copia-1", x: 4, y: 0, width: 3, floor: 1, voids: [{ x: 5, y: 1, width: 1, depth: 1 }] });
  expect(model.slabs).toHaveLength(1);
});
it("shows a copy validation error without changing the model", () => {
  const onChange = vi.fn(); const model = emptyArchitecturalModel();
  model.slabs.push({ id: "s", floor: 0, x: 0, y: 0, width: 3, depth: 3, thickness: 0.15, elevation: 0.16, voids: [] });
  render(<ConceptArchitecturalElementsPanel model={model} onChange={onChange} floor={0} lotWidth={3} lotDepth={3} />);
  fireEvent.click(screen.getByRole("button", { name: "slab · s" }));
  fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Deslocamento X da cópia (m)"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Duplicar" }));
  expect(onChange).not.toHaveBeenCalled();
});
