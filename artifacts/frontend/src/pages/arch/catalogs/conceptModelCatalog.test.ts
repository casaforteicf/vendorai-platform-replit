import { describe, expect, it } from "vitest";
import { CONCEPT_MODEL_CATALOG, CONCEPT_MODEL_VARIANTS, getConceptModelDefinition, listConceptModelVariants } from "./conceptModelCatalog";

describe("Arqdor 3D model catalog", () => {
  it("keeps every built-in real model renderable and licensed", () => {
    const models = [
      ...Object.values(CONCEPT_MODEL_CATALOG).filter(Boolean),
      ...CONCEPT_MODEL_VARIANTS,
    ];

    expect(models.length).toBeGreaterThan(0);

    for (const model of models) {
      expect(model?.id).toBeTruthy();
      expect(model?.label).toBeTruthy();
      expect(model?.source).toBeTruthy();
      expect(model?.license).toBeTruthy();
      expect(model?.url).toMatch(/^https:\/\//);
      expect(model?.url).toMatch(/\.(glb|gltf)(\?|#|$)/i);
    }
  });

  it("prefers the catalog model URL from the project object over the generic fallback", () => {
    const object = {
      id: "catalog-object-1",
      kind: "sofa" as const,
      label: "Sofá parceiro",
      floor: 0,
      x: 2,
      y: 3,
      width: 2.2,
      depth: 0.9,
      rotation: 0,
      catalogProductId: "product-123",
      supplier: "Parceiro teste",
      model3dUrl: "https://cdn.example.com/sofa.glb",
    };

    const model = getConceptModelDefinition(object);

    expect(model).toMatchObject({
      id: "catalog-product-123",
      kind: "sofa",
      label: "Sofá parceiro",
      url: "https://cdn.example.com/sofa.glb",
      source: "Parceiro teste",
    });
  });

  it("lists only variants compatible with the requested object kind", () => {
    const chairVariants = listConceptModelVariants("chair");

    expect(chairVariants.length).toBeGreaterThanOrEqual(2);
    expect(chairVariants.every((item) => item.kind === "chair")).toBe(true);
    expect(chairVariants.some((item) => /pufe/i.test(item.label))).toBe(true);
  });
});
