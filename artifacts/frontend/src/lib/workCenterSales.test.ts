import { describe, expect, it } from "vitest";
import {
  calculateItemsSubtotal,
  dealStageToWorkStep,
  fromProposalItems,
  toProposalItems,
} from "./workCenterSales";

describe("workCenterSales", () => {
  it("mapeia a etapa do negócio para a etapa operacional", () => {
    expect(dealStageToWorkStep("novo")).toBe(1);
    expect(dealStageToWorkStep("qualificado")).toBe(2);
    expect(dealStageToWorkStep("negociacao")).toBe(3);
    expect(dealStageToWorkStep("em_execucao")).toBe(4);
  });

  it("calcula catálogo e item livre no mesmo subtotal", () => {
    expect(
      calculateItemsSubtotal([
        {
          id: "catalog:1",
          source: "catalog",
          productId: "1",
          name: "Janela",
          quantity: 2,
          unitPrice: 500,
        },
        {
          id: "custom:1",
          source: "custom",
          name: "Instalação especial",
          quantity: 1,
          unitPrice: 350,
        },
      ]),
    ).toBe(1350);
  });

  it("preserva produtoId apenas para itens vinculados ao catálogo", () => {
    const proposalItems = toProposalItems([
      {
        id: "catalog:1",
        source: "catalog",
        productId: "1",
        name: "Janela",
        sku: "JAN-01",
        quantity: 1,
        unitPrice: 500,
      },
      {
        id: "custom:1",
        source: "custom",
        name: "Recorte sob medida",
        description: "Conforme visita",
        quantity: 1,
        unitPrice: 90,
      },
    ]);
    expect(proposalItems[0]).toMatchObject({ produtoId: "1", sku: "JAN-01" });
    expect(proposalItems[1]).not.toHaveProperty("produtoId");
    expect(fromProposalItems(proposalItems)[1]).toMatchObject({
      source: "custom",
      description: "Conforme visita",
    });
  });
});
