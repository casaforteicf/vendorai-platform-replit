import { describe, expect, it } from "vitest";
import { compactCatalogNames } from "./catalog-readiness.js";

describe("catalog readiness context helpers", () => {
  it("normalizes, truncates and limits catalog names deterministically", () => {
    const names = compactCatalogNames([
      { nome: "  Produto   Principal  " },
      { nome: "Serviço Premium" },
      { nome: "" },
      { nome: "Terceiro Item" },
    ], 2);

    expect(names).toEqual(["Produto Principal", "Serviço Premium"]);
  });

  it("caps requested preview size for prompt safety", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ nome: `Item ${index + 1}` }));
    expect(compactCatalogNames(items, 100)).toHaveLength(20);
  });
});
