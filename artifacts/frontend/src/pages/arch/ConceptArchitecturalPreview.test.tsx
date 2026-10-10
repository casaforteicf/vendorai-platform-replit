import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConceptArchitecturalPreview } from "./ConceptArchitecturalPreview";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";

describe("visualização isolada dos elementos paramétricos", () => {
  it("mostra a planta e alterna para representação volumétrica sem mutar o modelo", () => {
    const model = emptyArchitecturalModel();
    model.slabs.push({ id: "l1", floor: 0, x: 0, y: 0, width: 4, depth: 3, thickness: 0.15, elevation: 3, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
    render(<ConceptArchitecturalPreview model={model} floor={0} />);
    expect(screen.getByRole("img", { name: "Planta paramétrica" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Planta paramétrica" }).querySelector('[data-element-id="l1:void:0"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volumes 3D preliminares" }));
    expect(screen.getByRole("img", { name: "Representação volumétrica preliminar" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Representação volumétrica preliminar" }).querySelector('[data-element-id="l1:solid:0"]')).toBeTruthy();
    expect(model.slabs[0].voids).toEqual([{ x: 1, y: 1, width: 1, depth: 1 }]);
  });
});
