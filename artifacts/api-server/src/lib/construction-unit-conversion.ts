export type PurchaseConversionInput = {
  quantidadeTecnica: number;
  fatorCompraParaConsumo?: number | null;
  perdaPadraoPercentual?: number | null;
  perdaPercentualOverride?: number | null;
  quantidadeMinimaCompra?: number | null;
  multiploCompra?: number | null;
  permiteFracionarCompra?: boolean | null;
};

export type PurchaseConversionResult = {
  quantidadeTecnica: number;
  perdaPercentualAplicada: number;
  quantidadeComPerda: number;
  quantidadeCompraBruta: number;
  quantidadeCompraFinal: number;
};

function safeNonNegative(value: number | null | undefined, fallback = 0): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : fallback;
}

export function calcularQuantidadeCompra(input: PurchaseConversionInput): PurchaseConversionResult {
  const quantidadeTecnica = safeNonNegative(input.quantidadeTecnica);
  const fator = safeNonNegative(input.fatorCompraParaConsumo, 1) || 1;

  // Regra oficial: override substitui a perda padrão; nunca soma as duas.
  const perdaPercentualAplicada = input.perdaPercentualOverride != null
    ? safeNonNegative(input.perdaPercentualOverride)
    : safeNonNegative(input.perdaPadraoPercentual);

  const quantidadeComPerda = quantidadeTecnica * (1 + perdaPercentualAplicada / 100);
  const quantidadeCompraBruta = quantidadeComPerda / fator;

  let quantidadeCompraFinal = quantidadeCompraBruta;

  if (!input.permiteFracionarCompra) {
    const multiplo = safeNonNegative(input.multiploCompra, 1) || 1;
    quantidadeCompraFinal = Math.ceil((quantidadeCompraFinal - Number.EPSILON) / multiplo) * multiplo;
  }

  const minimo = safeNonNegative(input.quantidadeMinimaCompra);
  if (minimo > 0 && quantidadeCompraFinal < minimo) {
    quantidadeCompraFinal = minimo;
    if (!input.permiteFracionarCompra) {
      const multiplo = safeNonNegative(input.multiploCompra, 1) || 1;
      quantidadeCompraFinal = Math.ceil((quantidadeCompraFinal - Number.EPSILON) / multiplo) * multiplo;
    }
  }

  const round = (n: number) => Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;

  return {
    quantidadeTecnica: round(quantidadeTecnica),
    perdaPercentualAplicada: round(perdaPercentualAplicada),
    quantidadeComPerda: round(quantidadeComPerda),
    quantidadeCompraBruta: round(quantidadeCompraBruta),
    quantidadeCompraFinal: round(quantidadeCompraFinal),
  };
}
