export function reconcileAnnexTotals(contractValue: number, receivables: number[]) {
  const total = receivables.reduce((sum, amount) => sum + amount, 0);
  return {
    contractValue,
    receivablesTotal: total,
    equal: Math.abs(total - contractValue) <= 0.01,
    contractualApprovalVerified: false,
    canIssueAnnexB: false,
  };
}
