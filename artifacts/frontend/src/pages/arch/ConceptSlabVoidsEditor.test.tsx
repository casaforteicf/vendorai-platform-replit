import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConceptSlabVoidsEditor } from "./ConceptSlabVoidsEditor";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
afterEach(cleanup);
function setup() {
  const model = emptyArchitecturalModel();
  model.slabs.push({ id: "slab", floor: 0, x: 0, y: 0, width: 3, depth: 3, thickness: 0.15, elevation: 0.16, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
  const onChange = vi.fn();
  render(<ConceptSlabVoidsEditor model={model} slab={model.slabs[0]} onChange={onChange} />);
  return { model, onChange };
}
it("adds an opening without mutating existing ones", () => {
  const { model, onChange } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Adicionar vão" }));
  expect(onChange.mock.calls[0][0].slabs[0].voids).toHaveLength(2);
  expect(model.slabs[0].voids).toHaveLength(1);
});
it("edits and deletes the selected opening", () => {
  const { onChange } = setup();
  fireEvent.click(screen.getByRole("button", { name: /Vão 1/ }));
  fireEvent.change(screen.getByLabelText("Largura do vão"), { target: { value: "1.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar vão" }));
  expect(onChange.mock.calls[0][0].slabs[0].voids[0].width).toBe(1.5);
  fireEvent.click(screen.getByRole("button", { name: /Vão 1/ }));
  fireEvent.click(screen.getByRole("button", { name: "Excluir vão" }));
  expect(onChange.mock.calls[1][0].slabs[0].voids).toEqual([]);
});
it("rejects outside, overlapping and empty measurements before committing", () => {
  const { onChange } = setup();
  for (const [x, width] of [["3", "1"], ["1", "1"], ["", "1"]]) {
    fireEvent.change(screen.getByLabelText("X do vão"), { target: { value: x } });
    fireEvent.change(screen.getByLabelText("Largura do vão"), { target: { value: width } });
    fireEvent.change(screen.getByLabelText("Y do vão"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar vão" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  }
  expect(onChange).not.toHaveBeenCalled();
});
