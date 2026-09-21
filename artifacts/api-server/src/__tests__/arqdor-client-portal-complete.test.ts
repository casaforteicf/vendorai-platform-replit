import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/routes/portal.ts"),
  "utf8",
);

describe("Arqdor complete client portal contracts", () => {
  it("publishes executive construction context only through portal config", () => {
    expect(source).toContain("progressoGeral");
    expect(source).toContain("etapaAtual");
    expect(source).toContain("proximasEtapas");
    expect(source).toContain("previsaoEntrega");
    expect(source).toContain("showMeasurements");
    expect(source).toContain("showProcurementSummary");
  });

  it("only exposes approved project renders", () => {
    expect(source).toContain("approved_at IS NOT NULL");
    expect(source).toContain("showProjectGallery");
  });

  it("keeps financial and document detail behind explicit publication flags", () => {
    expect(source).toContain("showFinancialSummary");
    expect(source).toContain("showFinancialDetails");
    expect(source).toContain("CASE WHEN $3::boolean THEN c.valor_total ELSE NULL END");
    expect(source).toContain("config.showDocuments && config.showFinancialDetails");
  });

  it("uses only approved diary entries for public diary content", () => {
    expect(source).toContain('eq(obraDiarioTable.status, "aprovado")');
  });
});
