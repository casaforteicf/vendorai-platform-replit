import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STANDARD_CONSTRUCTION_COMPOSITIONS } from "../data/construction-composition-catalog";

const routeSource = readFileSync(new URL("../routes/construcao.ts", import.meta.url), "utf8");
const bootstrapSource = readFileSync(
  new URL("../lib/ensure-standard-construction-catalog.ts", import.meta.url),
  "utf8",
);
const frontendSource = readFileSync(
  new URL("../../../frontend/src/pages/Composicoes.tsx", import.meta.url),
  "utf8",
);

describe("Arqdor standard construction composition catalog", () => {
  it("covers the requested construction groups with stable codes", () => {
    const codes = new Set(STANDARD_CONSTRUCTION_COMPOSITIONS.map((item) => item.codigo));

    expect(codes.has("ARQ-REV-001")).toBe(true); // porcelanato
    expect(codes.has("ARQ-REV-002")).toBe(true); // revestimento parede
    expect(codes.has("ARQ-REV-003")).toBe(true); // basecoat
    expect(codes.has("ARQ-REV-004")).toBe(true); // drywall
    expect(codes.has("ARQ-FOR-001")).toBe(true); // massa corrida
    expect(codes.has("ARQ-FOR-002")).toBe(true); // pintura interna
    expect(codes.has("ARQ-FOR-003")).toBe(true); // pintura externa
    expect(codes.has("ARQ-FOR-004")).toBe(true); // forro drywall
    expect(codes.has("ARQ-ELE-001")).toBe(true); // plafon
    expect(codes.has("ARQ-ELE-002")).toBe(true); // elétrica
    expect(codes.has("ARQ-HID-001")).toBe(true); // água fria
    expect(codes.has("ARQ-HID-002")).toBe(true); // água quente
    expect(codes.has("ARQ-HID-003")).toBe(true); // esgoto
    expect(codes.has("ARQ-HID-004")).toBe(true); // chuveiro
    expect(codes.has("ARQ-HID-005")).toBe(true); // torneira
    expect(codes.has("ARQ-ESQ-001")).toBe(true); // portão
    expect(codes.has("ARQ-EXT-001")).toBe(true); // muro
    expect(codes.has("ARQ-EXT-003")).toBe(true); // calçada concreto
    expect(codes.has("ARQ-EXT-004")).toBe(true); // calçada paver
  });

  it("keeps reference quantities editable and prices out of the catalog", () => {
    for (const composition of STANDARD_CONSTRUCTION_COMPOSITIONS) {
      expect(composition.unidade.length).toBeGreaterThan(0);
      expect(composition.etapaKey.length).toBeGreaterThan(0);
      expect(composition.itens.length).toBeGreaterThan(0);

      for (const item of composition.itens) {
        expect(Number(item.quantidade)).toBeGreaterThan(0);
        expect("precoUnitario" in item).toBe(false);
      }
    }
  });

  it("applies the catalog through an idempotent tenant-scoped endpoint", () => {
    expect(routeSource).toContain(
      'router.post("/tenants/:tenantId/composicoes/catalogo-padrao/aplicar"',
    );
    expect(routeSource).toContain("ensureStandardConstructionCatalog(tid)");
    expect(bootstrapSource).toContain("eq(composicoesTable.tenantId, tenantId)");
    expect(bootstrapSource).toContain("eq(composicoesTable.codigo, template.codigo)");
    expect(bootstrapSource).toContain("composicoesExistentes += 1");
    expect(bootstrapSource).toContain("insertInsumoSchema.safeParse");
    expect(bootstrapSource).not.toContain("precoUnitario: item.");
  });

  it("imports tenant schema and gates catalog bootstrap to construction vertical", () => {
    // Regression: the bootstrap already referenced tenantsTable but omitted its import.
    expect(bootstrapSource).toMatch(/import\\s*\\{[^}]*\\btenantsTable\\b[^}]*\\}\\s*from\\s*["']@workspace\\/db["']/s);
    expect(bootstrapSource).toContain("tenantsTable.vertical");
    expect(bootstrapSource).toContain("eq(tenantsTable.id, tenantId)");
    expect(bootstrapSource).toMatch(/if\\s*\\(!\\/constru\\/i|!isConstructionVertical)/);
    expect(bootstrapSource).toContain("totalCatalogo: 0");
  });

  it("exposes the catalog action in the compositions screen", () => {
    expect(frontendSource).toContain("handleApplyStandardCatalog");
    expect(frontendSource).toContain("Catálogo padrão");
    expect(frontendSource).toContain("/composicoes/catalogo-padrao/aplicar");
    expect(frontendSource).toContain("getListComposicoesQueryKey(tenantId)");
    expect(frontendSource).toContain("getListInsumosQueryKey(tenantId)");
  });
});
