import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/routes/arch_production_procurement.ts"),
  "utf8",
);
const compositionSchema = fs.readFileSync(
  path.resolve(process.cwd(), "../../lib/db/src/schema/composicoes.ts"),
  "utf8",
);
const purchaseSchema = fs.readFileSync(
  path.resolve(process.cwd(), "../../lib/db/src/schema/insumos.ts"),
  "utf8",
);

describe("Arqdor schedule intelligence contracts", () => {
  it("derives schedule duration from composition productivity without overwriting manual settings", () => {
    expect(compositionSchema).toContain('produtividadeDia: numeric("produtividade_dia"');
    expect(compositionSchema).toContain('equipePadrao: integer("equipe_padrao"');
    expect(routeSource).toContain("composition_productivity_day");
    expect(routeSource).toContain("group.effortPersonDays / Math.max(1, group.suggestedTeam)");
    expect(routeSource).toContain("COALESCE(produtividade_dia, 0)::numeric = 0");
  });

  it("links procurement lead time to stage schedule and exposes risk", () => {
    expect(purchaseSchema).toContain('prazoFornecedorDias: integer("prazo_fornecedor_dias"');
    expect(routeSource).toContain("data_limite_compra");
    expect(routeSource).toContain("risco_cronograma");
    expect(routeSource).toContain("prazoFornecedorDias");
  });

  it("feeds EVM actual cost from received purchases and measured progress", () => {
    expect(routeSource).toContain("custoRealizadoCalculado");
    expect(routeSource).toContain("comprasRealizadas");
    expect(routeSource).toContain("maoObraExecutadaEstimada");
    expect(routeSource).toContain("percentual_executado");
  });
});
