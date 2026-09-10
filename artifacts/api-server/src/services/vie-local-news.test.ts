import { describe, expect, it } from "vitest";
import { resolveTenantNewsLocation } from "./vie-local-news.js";

describe("resolveTenantNewsLocation", () => {
  it("prioriza cidade e estado estruturados do discovery", () => {
    expect(resolveTenantNewsLocation({
      discoveryData: { cidade: "Chapecó", estado: "Santa Catarina" },
      endereco: "Rua Exemplo, 123",
    })).toEqual({ city: "Chapecó", stateCode: "SC", stateName: "Santa Catarina" });
  });

  it("aceita UF estruturada sem depender do endereço", () => {
    expect(resolveTenantNewsLocation({
      discoveryData: { city: "São Paulo", uf: "SP" },
    })).toEqual({ city: "São Paulo", stateCode: "SP", stateName: "São Paulo" });
  });

  it("extrai cidade e UF quando o endereço contém localidade", () => {
    expect(resolveTenantNewsLocation({
      endereco: "Av. Brasil, Centro, Iporã do Oeste - SC",
    })).toEqual({ city: "Iporã do Oeste", stateCode: "SC", stateName: "Santa Catarina" });
  });

  it("não inventa localidade a partir de endereço sem cidade e UF", () => {
    expect(resolveTenantNewsLocation({
      endereco: "Rua Renê Vegas, 69",
    })).toEqual({ city: null, stateCode: null, stateName: null });
  });
});
