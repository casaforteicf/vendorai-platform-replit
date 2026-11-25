import { describe, expect, it } from "vitest";
import { cardsForStage } from "./pipeline-board";

describe("cardsForStage", () => {
  const cards = [
    { id: "1", etapa: "pedido_confirmado", leadId: "lead-1" },
    { id: "2", etapa: "pedido_confirmado", leadId: null },
    { id: "3", etapa: "projeto", leadId: "lead-3" },
  ];

  it("mostra cards da etapa mesmo quando têm leadId e o contexto ainda não carregou", () => {
    expect(cardsForStage(cards, "pedido_confirmado").map((card) => card.id)).toEqual(["1", "2"]);
  });

  it("não mistura cards de outras etapas", () => {
    expect(cardsForStage(cards, "projeto").map((card) => card.id)).toEqual(["3"]);
  });

  it("devolve lista vazia quando a etapa não tem cards", () => {
    expect(cardsForStage(cards, "cancelado")).toEqual([]);
  });
});
