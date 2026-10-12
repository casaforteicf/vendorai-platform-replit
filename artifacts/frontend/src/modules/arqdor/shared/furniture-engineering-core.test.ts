import { describe, expect, it } from "vitest";
import { buildFurnitureCuttingReport, updateSelectedParts, type PanelMaterial, type PanelPart } from "./furniture-engineering-core";

const material: PanelMaterial = {
  id: "mdf-branco", tenantId: "t1", manufacturer: "Fabricante",
  line: "BP", sku: "BP-BR-18", color: "Branco", thicknessMm: 18,
  stockWidthMm: 1850, stockLengthMm: 2750, grain: "none",
};
const part = (id: string, materialId = material.id): PanelPart => ({
  id, tenantId: "t1", projectId: "proj1", furnitureId: "armario1",
  parentItemId: "vao1", name: "Prateleira", quantity: 1,
  widthMm: 700, lengthMm: 500, materialId, grainDirection: "none",
  edges: { bottom: { materialId: "fita1", manufacturer: "Bordas",
    sku: "FD-BR-1", color: "Branco", thicknessMm: 1 } },
});
describe("Arqdor lote 13 — peças e plano preliminar", () => {
  it("altera exclusivamente a peça selecionada", () => {
    const before = [part("p1"), part("p2")];
    const after = updateSelectedParts(before, ["p2"], { materialId: "mdf-carvalho" });
    expect(after[0]).toBe(before[0]);
    expect(after[1].materialId).toBe("mdf-carvalho");
    expect(before[1].materialId).toBe(material.id);
  });
  it("agrupa materiais, fita e vínculos por peça", () => {
    const report = buildFurnitureCuttingReport({
      tenantId: "t1", projectId: "proj1", materials: [material],
      parts: [part("p1"), part("p2")],
    });
    expect(report.productionReady).toBe(false);
    expect(report.materials[0]).toMatchObject({ partCount: 2, netAreaMm2: 700000 });
    expect(report.edges[0].lengthMm).toBe(1400);
    expect(report.links[0].partIds).toEqual(["p1", "p2"]);
    expect(report.sheets[0].placements).toHaveLength(2);
  });
  it("bloqueia mistura de tenants", () => {
    expect(() => buildFurnitureCuttingReport({
      tenantId: "t2", projectId: "proj1", materials: [material], parts: [part("p1")],
    })).toThrow(/outside tenant/);
  });
  it("não força encaixe de peça maior que a chapa", () => {
    const report = buildFurnitureCuttingReport({
      tenantId: "t1", projectId: "proj1", materials: [material],
      parts: [{ ...part("p1"), widthMm: 2500 }],
    });
    expect(report.sheets).toHaveLength(0);
    expect(report.warnings.some((x) => x.includes("manual segmentation"))).toBe(true);
  });
  it("não reusa IDs duplicados", () => {
    expect(() => buildFurnitureCuttingReport({
      tenantId: "t1", projectId: "proj1", materials: [material],
      parts: [part("p1"), part("p1")],
    })).toThrow(/Duplicate part ID/);
  });
});
