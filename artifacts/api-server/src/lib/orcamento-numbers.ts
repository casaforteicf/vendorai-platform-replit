export function roundOrcamentoNumber(value: number | string | null | undefined): number {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

export function normalizeOrcamentoQuantity(value: number | string | null | undefined): number {
  return Math.max(0.01, roundOrcamentoNumber(value));
}

export function normalizeOrcamentoMoney(value: number | string | null | undefined): number {
  return Math.max(0, roundOrcamentoNumber(value));
}
