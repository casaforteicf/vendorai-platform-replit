import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../routes/arch_production_procurement.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../../../lib/db/migrations/222_obra_workforce_kpis.sql", import.meta.url),
  "utf8",
);
const uiSource = readFileSync(
  new URL("../../../frontend/src/pages/EquipeProducao.tsx", import.meta.url),
  "utf8",
);
const obraSource = readFileSync(
  new URL("../../../frontend/src/pages/ObraDetalhe.tsx", import.meta.url),
  "utf8",
);

describe("ARQDOR obra workforce and KPIs", () => {
  it("creates tenant-scoped workforce, goal and production tables", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS obra_executores");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS obra_metas");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS obra_apontamentos_producao");
    expect(migrationSource).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("exposes obra-scoped workforce endpoints and role permissions", () => {
    expect(routeSource).toContain('"/arch/construction/:obraId/workforce"');
    expect(routeSource).toContain('"/arch/construction/:obraId/workforce/executores"');
    expect(routeSource).toContain('"/arch/construction/:obraId/workforce/metas"');
    expect(routeSource).toContain('"/arch/construction/:obraId/workforce/apontamentos"');
    expect(routeSource).toContain("OBRA_ROLE_PERMISSIONS");
    expect(routeSource).toContain("atingimentoMedioPct");
  });

  it("adds team, targets, production and KPI management to the obra UI", () => {
    expect(obraSource).toContain('"equipe-producao"');
    expect(obraSource).toContain("<EquipeProducao");
    expect(uiSource).toContain("Adicionar à obra");
    expect(uiSource).toContain("Nova meta");
    expect(uiSource).toContain("Registrar produção");
    expect(uiSource).toContain("Executores ativos");
    expect(uiSource).toContain("Atingimento médio");
  });
});
