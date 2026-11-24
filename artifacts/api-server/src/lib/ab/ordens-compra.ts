import { AB_STATUS_ORDEM_COMPRA, type AbStatusOrdemCompra } from "@workspace/db";

/**
 * Ciclo de vida da ordem de compra do motor preditivo.
 *
 * A ordem nasce `sugerida` (o motor só sugere; não compra). A aprovação é
 * humana e registra quem aprovou. `recebida` é uma marcação operacional: a
 * entrada de estoque continua sendo feita pelo fluxo de recebimento (AB-06/07),
 * que é o único que escreve saldo.
 *
 * Cancelar é permitido antes de receber. Uma ordem recebida ou cancelada é
 * terminal — reabrir exigiria estorno de estoque e fica fora deste lote.
 */
const TRANSICOES: Record<AbStatusOrdemCompra, readonly AbStatusOrdemCompra[]> = {
  sugerida: ["aprovada", "cancelada"],
  aprovada: ["enviada", "cancelada"],
  enviada: ["recebida", "cancelada"],
  recebida: [],
  cancelada: [],
};

export function statusOrdemValido(valor: string): valor is AbStatusOrdemCompra {
  return (AB_STATUS_ORDEM_COMPRA as readonly string[]).includes(valor);
}

/** Mesmo status é um no-op válido (permite só atualizar observação). */
export function podeTransicionarOrdem(
  atual: AbStatusOrdemCompra,
  proximo: AbStatusOrdemCompra,
): boolean {
  if (atual === proximo) return true;
  return TRANSICOES[atual].includes(proximo);
}

export function proximosStatusOrdem(atual: AbStatusOrdemCompra): readonly AbStatusOrdemCompra[] {
  return TRANSICOES[atual];
}

/** Só a ordem ainda não aprovada aceita edição de quantidade/custo/itens. */
export function ordemEditavel(status: AbStatusOrdemCompra): boolean {
  return status === "sugerida";
}

export const ROTULO_STATUS_ORDEM: Record<AbStatusOrdemCompra, string> = {
  sugerida: "Sugerida",
  aprovada: "Aprovada",
  enviada: "Enviada",
  recebida: "Recebida",
  cancelada: "Cancelada",
};
