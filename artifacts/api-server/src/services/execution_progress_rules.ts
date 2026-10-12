/** Regras puras de progresso por item de lote, escala de 6 casas decimais. */
export function validateCompletedQuantity(allocated: number, current: number, requested: number) {
  const values = [allocated, current, requested];
  if (values.some((n) => !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 1e6)) ||
      Math.abs(n * 1e6 - Math.round(n * 1e6)) > 1e-6)) {
    throw new Error("Quantidade inválida");
  }
  if (current > allocated) throw new Error("Estado inconsistente");
  if (requested < current) throw new Error("Redução exige estorno auditável");
  if (requested > allocated) throw new Error("Quantidade executada ultrapassa a reservada");
  return requested;
}
