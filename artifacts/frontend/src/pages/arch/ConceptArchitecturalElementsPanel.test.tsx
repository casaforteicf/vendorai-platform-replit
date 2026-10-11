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
