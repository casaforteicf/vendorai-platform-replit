import { describe, expect, it } from "vitest";
import { buildVerticalStarterDefinition, findVerticalBlueprint, resolveVerticalBlueprint, VERTICAL_BLUEPRINTS, type RegistryCapability } from "./app_vertical_blueprints.js";

describe("app vertical blueprints", () => {
  it("covers the standard multi-vertical portfolio", () => {
    expect(VERTICAL_BLUEPRINTS.length).toBeGreaterThanOrEqual(20);
    expect(findVerticalBlueprint("Arquitetura e construção")?.key).toBe("arquitetura-construcao");
    expect(findVerticalBlueprint("clínicas")?.key).toBe("clinicas");
    expect(findVerticalBlueprint("Restaurantes e tele-entrega")?.key).toBe("restaurantes-delivery");
  });

  it("reuses registry capabilities and leaves only real gaps", () => {
    const blueprint = findVerticalBlueprint("imobiliarias");
    expect(blueprint).not.toBeNull();
    const registry: RegistryCapability[] = [
      { kind: "feature", key: "crm", name: "CRM" },
      { kind: "feature", key: "property-listings", name: "Catálogo de imóveis" },
      { kind: "feature", key: "agenda", name: "Agenda" },
      { kind: "workflow", key: "automation", name: "Automação" },
      { kind: "component", key: "documents", name: "Documentos" },
    ];
    const result = resolveVerticalBlueprint(blueprint!, registry);
    expect(result.reused.map((item) => item.key)).toEqual(expect.arrayContaining(["crm-leads", "property-listings", "appointments", "automation", "documents"]));
    expect(result.gaps.some((item) => item.key === "property-search")).toBe(true);
    expect(result.summary.required).toBe(result.summary.reused + result.summary.gaps);
  });


  it("builds a versionable starter without inventing executable actions", () => {
    const blueprint = findVerticalBlueprint("arquitetura-construcao")!;
    const resolution = resolveVerticalBlueprint(blueprint, [{ kind: "feature", key: "crm", name: "CRM" }]);
    const definition = buildVerticalStarterDefinition(blueprint, resolution) as any;
    expect(definition.runtime.version).toBe(1);
    expect(definition.runtime.pages.length).toBeGreaterThanOrEqual(3);
    expect(definition.productModel.appProduct.nativeFunctions).toContain("Orçamento de obra");
    expect(definition.valueAgent.enabled).toBe(true);
    expect(JSON.stringify(definition.runtime)).not.toContain("actionKey");
  });
  it("keeps regulated safeguards attached to health and legal verticals", () => {
    expect(findVerticalBlueprint("médicos")?.safeguards?.join(" ")).toMatch(/médico responsável/i);
    expect(findVerticalBlueprint("advocacia")?.safeguards?.join(" ")).toMatch(/advogado/i);
  });
});