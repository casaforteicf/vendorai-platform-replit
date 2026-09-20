import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../routes/construcao.ts", import.meta.url), "utf8");

describe("construction tenant isolation guards", () => {
  it("keeps the tenant route guard tied to the authenticated tenant", () => {
    expect(source).toContain('router.param("tenantId"');
    expect(source).toContain("canAccessTenant(req, tid)");
    expect(source).toContain('scope.vertical.toLowerCase().includes("constru")');
  });

  it("keeps obra ownership constrained by tenant", () => {
    expect(source).toContain('router.param("obraId"');
    expect(source).toContain("eq(obrasTable.id, obraId)");
    expect(source).toContain("eq(obrasTable.tenantId, tid)");
  });

  it("keeps direct etapa routes protected through an ownership join", () => {
    expect(source).toContain(".innerJoin(obrasTable, eq(obrasTable.id, obraEtapasTable.obraId))");
    expect(source).toContain("eq(obrasTable.tenantId, tid)");
  });

  it("keeps construction catalog entities explicitly tenant-scoped", () => {
    expect(source).toContain('router.get("/tenants/:tenantId/composicoes"');
    expect(source).toContain('router.post("/tenants/:tenantId/composicoes"');
    expect(source).toContain('router.get("/tenants/:tenantId/insumos');
    expect(source).toContain("eq(composicoesTable.tenantId, tid)");
    expect(source).toContain("eq(insumosTable.tenantId, tid)");
  });

  it("keeps budgets nested under an owned obra", () => {
    expect(source).toContain('router.get("/tenants/:tenantId/obras/:obraId/orcamentos"');
    expect(source).toContain('router.post("/tenants/:tenantId/obras/:obraId/orcamentos"');
    expect(source).toContain("eq(obraOrcamentosTable.obraId, obraId)");
  });
});
