import type { PropostaItem, PropostaStatus } from "@workspace/api-client-react";

export type WorkCenterItem = {
  id: string;
  source: "catalog" | "custom";
  productId?: string;
  name: string;
  sku?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
};

export type WorkCenterStep = 0 | 1 | 2 | 3 | 4;

export function dealStageToWorkStep(stage?: string | null): WorkCenterStep {
  if (["ganho", "em_execucao", "entregue"].includes(stage ?? "")) return 4;
  if (["proposta", "negociacao", "conferencia_estoque"].includes(stage ?? ""))
    return 3;
  if (stage === "qualificado") return 2;
  return stage ? 1 : 0;
}

export function calculateItemsSubtotal(items: WorkCenterItem[]): number {
  return items.reduce(
    (total, item) =>
      total + Math.max(1, item.quantity) * Math.max(0, item.unitPrice),
    0,
  );
}

export function toProposalItems(items: WorkCenterItem[]): PropostaItem[] {
  return items.map((item) => ({
    nome: item.name.trim(),
    quantidade: Math.max(1, item.quantity),
    valorUnitario: Math.max(0, item.unitPrice),
    ...(item.productId ? { produtoId: item.productId } : {}),
    ...(item.sku?.trim() ? { sku: item.sku.trim() } : {}),
    ...(item.description?.trim() ? { descricao: item.description.trim() } : {}),
  }));
}

export function fromProposalItems(items: PropostaItem[]): WorkCenterItem[] {
  return items.map((item, index) => ({
    id: item.produtoId
      ? `catalog:${item.produtoId}`
      : `custom:${index}:${item.nome}`,
    source: item.produtoId ? "catalog" : "custom",
    productId: item.produtoId,
    name: item.nome,
    sku: item.sku,
    description: item.descricao,
    quantity: item.quantidade,
    unitPrice: item.valorUnitario,
  }));
}

export function nextProposalStatusAction(status?: PropostaStatus | null) {
  if (status === "rascunho")
    return { status: "enviada" as const, label: "Marcar como enviada" };
  if (status === "enviada")
    return { status: "pendente" as const, label: "Cliente está analisando" };
  if (status === "pendente")
    return { status: "aceita" as const, label: "Confirmar venda" };
  return null;
}
