import { describe, expect, it } from "vitest";
import {
  nextConstructionStage,
  scoreConstructionOpportunity,
} from "../services/constructionRevenuePack.js";

describe("construction revenue industry pack", () => {
  it("prioriza mudança de etapa com intenção e dados completos", () => {
    expect(scoreConstructionOpportunity({
      tipo: "mudanca_etapa",
      diasDesdeUltimo: 20,
      diasEsperado: 10,
      intentScore: 40,
      dadosCompletos: true,
    })).toEqual({ score: 100, prioridade: "alta", confianca: "alta" });
  });

  it("recomenda não agir quando uma exceção comercial bloqueia a ação", () => {
    expect(scoreConstructionOpportunity({
      tipo: "recompra",
      diasDesdeUltimo: 45,
      diasEsperado: 30,
      bloqueadoPorExcecao: true,
    })).toEqual({ score: 0, prioridade: "nao_agir", confianca: "baixa" });
  });

  it("segue a jornada vertical da obra", () => {
    expect(nextConstructionStage("estrutura")).toBe("alvenaria");
    expect(nextConstructionStage("manutencao")).toBeNull();
    expect(nextConstructionStage("desconhecida")).toBeNull();
  });
});
