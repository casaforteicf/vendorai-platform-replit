import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConceptArchitecturalDocumentation } from "./ConceptArchitecturalDocumentation";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
afterEach(cleanup);
it("updates visible dimensions from authored model and allows hiding them", () => {
 const model = emptyArchitecturalModel();
 model.slabs.push({ id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 5, thickness: 0.2, elevation: 3.12, voids: [] });
 const { rerender } = render(<ConceptArchitecturalDocumentation model={model} />);
 expect(screen.getByText("5.00 m")).toBeTruthy();
 expect(screen.getByText("0.20 m")).toBeTruthy();
 rerender(<ConceptArchitecturalDocumentation model={{ ...model, slabs: [{ ...model.slabs[0], depth: 6 }] }} />);
 expect(screen.getByText("6.00 m")).toBeTruthy();
 fireEvent.click(screen.getByLabelText("Mostrar cotas gerais da vista"));
 expect(screen.queryByText("6.00 m")).toBeNull();
});
it("avoids dimensions on empty slices and distinguishes elevation projections", () => {
 const model = emptyArchitecturalModel();
 model.slabs.push({ id: "s", floor: 0, x: 0, y: 0, width: 4, depth: 5, thickness: 0.15, elevation: 0.16, voids: [] });
 render(<ConceptArchitecturalDocumentation model={model} />);
 fireEvent.change(screen.getByLabelText("Posição do corte (m)"), { target: { value: "10" } });
 expect(screen.getByRole("status")).toBeTruthy();
 expect(screen.getByRole("button", { name: "Exportar vista SVG" }).hasAttribute("disabled")).toBe(true);
 fireEvent.change(screen.getByLabelText("Vista"), { target: { value: "elevation" } });
 expect(screen.queryByRole("status")).toBeNull();
 expect(screen.getByText("5.00 m")).toBeTruthy();
});
