import { describe, expect, it } from "vitest";
import { expectedInsuranceProductCodes } from "../services/insuranceWhitespaceEngine.js";

describe("corporate insurance whitespace templates", () => {
  it("mapeia transportadora com frota para frota, carga e RC", () => {
    const products = expectedInsuranceProductCodes({ setor: "Transportadora e logística", fleetSize: 25, headcount: 40 });
    expect(products).toEqual(expect.arrayContaining(["frota", "transporte_carga", "rc_geral", "vida_grupo"]));
  });

  it("mapeia construtora para engenharia, garantia e frota", () => {
    const products = expectedInsuranceProductCodes({ setor: "Construção civil", porte: "media" });
    expect(products).toEqual(expect.arrayContaining(["engenharia_obra", "garantia", "frota"]));
  });

  it("não recomenda saúde sem massa mínima de colaboradores", () => {
    const products = expectedInsuranceProductCodes({ setor: "Serviços", headcount: 5 });
    expect(products).not.toContain("saude_odonto");
  });
});
