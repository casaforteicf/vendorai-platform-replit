const BUDGET_CONTEXT_PATTERN = /\b(orcamento|proposta)\b/i;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Messages that mention a quote/proposal may only be sent when the Scout
 * opportunity is linked to a proposal that was actually sent to that lead.
 */
export function requiresSentProposalContext(tipo: string | null, message: string): boolean {
  return tipo === "orcamento_parado" || BUDGET_CONTEXT_PATTERN.test(normalizeText(message));
}

export function isSentProposalStatus(status: string | null | undefined): boolean {
  return status === "enviada";
}
