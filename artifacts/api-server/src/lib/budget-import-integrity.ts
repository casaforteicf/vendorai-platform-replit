/** Pure validation of an approved import snapshot against a proposal payload. */
export type ApprovedBudgetItem = {
  descricao?: string | null;
  quantidade?: number | null;
  valorUnitario?: number | null;
};
export type SubmittedBudgetItem = {
  nome?: string | null;
  quantidade?: number | null;
  valorUnitario?: number | null;
};
export function matchesApprovedBudget(
  approved: { valorTotal?: number | null; itens?: ApprovedBudgetItem[] | null } | null,
  submitted: { valorTotal?: number | string | null; itens?: SubmittedBudgetItem[] | null },
): boolean {
  const approvedItems = approved?.itens;
  const submittedItems = submitted.itens;
  const total = Number(approved?.valorTotal);
  const submittedTotal = submitted.valorTotal == null ? NaN : Number(submitted.valorTotal);
  if (!Array.isArray(approvedItems) || !Array.isArray(submittedItems) ||
      approvedItems.length === 0 || approvedItems.length !== submittedItems.length ||
      !Number.isFinite(total) || total <= 0 ||
      !Number.isFinite(submittedTotal) || Math.abs(total - submittedTotal) > 0.011) return false;
  return approvedItems.every((item, index) => {
    const other = submittedItems[index];
    const quantity = Number(item.quantidade);
    const unit = Number(item.valorUnitario);
    const otherQuantity = Number(other?.quantidade);
    const otherUnit = Number(other?.valorUnitario);
    return !!item.descricao?.trim() &&
      item.descricao.trim() === other?.nome?.trim() &&
      Number.isFinite(quantity) && quantity > 0 &&
      Number.isFinite(unit) && unit >= 0 &&
      Number.isFinite(otherQuantity) && otherQuantity > 0 &&
      Number.isFinite(otherUnit) && otherUnit >= 0 &&
      Math.abs(quantity - otherQuantity) <= 0.0001 &&
      Math.abs(unit - otherUnit) <= 0.011;
  });
}
