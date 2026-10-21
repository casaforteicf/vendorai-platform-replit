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

export type FinancialMeasurement = {
  id: string;
  valorBruto: string | number | null;
  amortizacaoEntrada: string | number | null;
  valorLiquido: string | number | null;
  saldoEntradaApos: string | number | null;
};

function moneyInCents(value: string | number | null): number | null {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

// Independent accounting checks only. They do NOT validate contractual
// classification, payment schedule, signing, or an approved revision.
export function reconcileAnnexMeasurements(measurements: FinancialMeasurement[]) {
  const issues: Array<{ code: string; measurementId: string; message: string }> = [];
  let grossCents = 0;
  let amortizedCents = 0;
  let netCents = 0;
  for (const measurement of measurements) {
    const gross = moneyInCents(measurement.valorBruto);
    const amortization = moneyInCents(measurement.amortizacaoEntrada);
    const net = moneyInCents(measurement.valorLiquido);
    if (gross == null || amortization == null || net == null) {
      issues.push({ code: "INVALID_MEASUREMENT", measurementId: measurement.id,
        message: "Medição com valor bruto, amortização ou líquido inválido." });
      continue;
    }
    if (amortization > gross || gross - amortization !== net) {
      issues.push({ code: "MEASUREMENT_BALANCE_MISMATCH", measurementId: measurement.id,
        message: "Valor líquido não confere com valor bruto menos amortização da entrada." });
    }
    grossCents += gross;
    amortizedCents += amortization;
    netCents += net;
  }
  return {
    grossTotal: (grossCents / 100).toFixed(2),
    amortizedEntryTotal: (amortizedCents / 100).toFixed(2),
    netTotal: (netCents / 100).toFixed(2),
    measurementsCount: measurements.length,
    issues,
    canIssueAnnexB: false,
  };
}

export type ContractPaymentLine = {
  id: string;
  kind: "entrada" | "pvc" | "medicao" | "outro";
  amount: string | number;
  referenceId?: string | null;
  dueDate?: string | null;
};

// This accepts only explicitly classified contractual lines: operational ERP
// titles must never be guessed into categories by description or amount.
export function reconcileClassifiedContractPayments(
  contractTotal: string | number,
  lines: ContractPaymentLine[],
) {
  const issues: Array<{ code: string; lineId?: string; message: string }> = [];
  const expected = moneyInCents(contractTotal);
  if (expected == null) issues.push({ code: "INVALID_CONTRACT_TOTAL", message: "Valor global do contrato inválido." });
  const sums = { entrada: 0, pvc: 0, medicao: 0, outro: 0 };
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.id)) {
      issues.push({ code: "DUPLICATE_PAYMENT_LINE", lineId: line.id, message: "Linha contratual duplicada." });
      continue;
    }
    seen.add(line.id);
    const amount = moneyInCents(line.amount);
    if (amount == null) {
      issues.push({ code: "INVALID_PAYMENT_AMOUNT", lineId: line.id, message: "Valor da parcela inválido." });
      continue;
    }
    if (!line.referenceId?.trim()) {
      issues.push({ code: "PAYMENT_SOURCE_MISSING", lineId: line.id, message: "Parcela sem vínculo de origem verificável." });
    }
    sums[line.kind] += amount;
  }
  const total = Object.values(sums).reduce((sum, value) => sum + value, 0);
  if (expected != null && total !== expected) {
    issues.push({ code: "PAYMENT_TOTAL_MISMATCH", message: "Parcelas classificadas não fecham com o valor global do contrato." });
  }
  return {
    totals: Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, (value / 100).toFixed(2)])),
    sum: (total / 100).toFixed(2),
    contractTotal: expected == null ? null : (expected / 100).toFixed(2),
    issues,
    contractualApprovalVerified: false,
    canIssueAnnexB: false,
  };
}

/** Conserva o adiantamento como crédito, não como segunda receita.
 * Uma entrada recebida e sua amortização nas medições não podem ser somadas
 * novamente ao total contratado. Somente vínculos explícitos são aceitos.
 */
export function auditEntryAmortization(
  contractedEntry: string | number,
  measurements: FinancialMeasurement[],
) {
  const entry = moneyInCents(contractedEntry);
  const issues: Array<{ code: string; message: string; measurementId?: string }> = [];
  if (entry == null) issues.push({ code: "ENTRY_INVALID", message: "Entrada contratada inválida." });
  let amortized = 0;
  let previousBalance: number | null = entry;
  for (const measurement of measurements) {
    const part = moneyInCents(measurement.amortizacaoEntrada);
    const balance = moneyInCents(measurement.saldoEntradaApos);
    if (part == null) {
      issues.push({ code: "AMORTIZATION_INVALID", measurementId: measurement.id, message: "Amortização inválida." });
      continue;
    }
    amortized += part;
    if (previousBalance != null && balance != null && previousBalance - part !== balance) {
      issues.push({ code: "ENTRY_BALANCE_MISMATCH", measurementId: measurement.id, message: "Saldo da entrada após medição não confere." });
    }
    // A série deve vir ordenada e completa; quando falta saldo não inferimos um.
    previousBalance = balance;
    if (balance == null) issues.push({ code: "ENTRY_BALANCE_MISSING", measurementId: measurement.id, message: "Saldo da entrada não registrado." });
  }
  if (entry != null && amortized > entry) {
    issues.push({ code: "ENTRY_OVER_AMORTIZED", message: "Amortização acumulada supera a entrada." });
  }
  return {
    contractedEntry: entry == null ? null : (entry / 100).toFixed(2),
    amortizedTotal: (amortized / 100).toFixed(2),
    remainingEntry: entry == null ? null : ((entry - amortized) / 100).toFixed(2),
    issues,
    contractualApprovalVerified: false,
    canIssueAnnexB: false,
  };
}
