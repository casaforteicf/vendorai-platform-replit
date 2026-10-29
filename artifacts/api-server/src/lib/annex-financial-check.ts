export type FinancialEvidenceRow = {
  id: string; valorBruto: string | number; amortizacaoEntrada: string | number;
  valorLiquido: string | number; saldoEntradaApos: string | number;
};
export type FinancialEvidenceIssue = { code: string; medicaoId: string; message: string };
const moneyCents = (value: number | string): number | null => {
  if (typeof value === "string" && !/^-?\d+(\.\d{1,4})?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
// Analyzes operational measurement arithmetic only; not an approval of contract amounts.
export function checkMeasurementArithmetic(rows: FinancialEvidenceRow[]): FinancialEvidenceIssue[] {
  const issues: FinancialEvidenceIssue[] = [];
  for (const row of rows) {
    const gross = moneyCents(row.valorBruto);
    const amortized = moneyCents(row.amortizacaoEntrada);
    const net = moneyCents(row.valorLiquido);
    const balance = moneyCents(row.saldoEntradaApos);
    if (gross === null || amortized === null || net === null || balance === null) {
      issues.push({ code: "MEDICAO_VALOR_INVALIDO", medicaoId: row.id, message: "Há valor financeiro inválido na medição." });
      continue;
    }
    if (amortized < 0 || gross < 0 || net < 0 || balance < 0 || amortized > gross) {
      issues.push({ code: "MEDICAO_VALOR_INCONSISTENTE", medicaoId: row.id, message: "Medição contém valor negativo ou amortização maior que o bruto." });
    }
    if (Math.abs(gross - amortized - net) > 1) {
      issues.push({ code: "MEDICAO_NAO_FECHA", medicaoId: row.id, message: "Valor bruto menos amortização não confere com o líquido." });
    }
  }
  return issues;
}
