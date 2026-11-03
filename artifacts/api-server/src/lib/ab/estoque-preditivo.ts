/**
 * Motor preditivo de estoque — A&B (AB-03 / FASE 3).
 *
 * Função PURA: recebe saldos, política de reposição e histórico de consumo;
 * devolve o que precisa ser comprado. Nenhum acesso a banco aqui — a parte que
 * fala com o Postgres vive em `artifacts/api-server/src/jobs/abEstoquePreditivo.ts`.
 *
 * Regras (e o porquê):
 *
 *  1. **Só entra insumo com `saldoAtual < pontoPedido`.** Estar exatamente no
 *     ponto de pedido ainda não é urgência; o disparo é ao furar.
 *  2. **Demanda projetada = consumo médio diário × (lead time + dias de
 *     cobertura).** Comprar só o que falta hoje chega atrasado: o pedido leva
 *     `leadTimeDias` para chegar e a cobertura é o período que a compra cobre.
 *  3. **Nunca sugerir menos do que repor até o ponto de pedido.** Sem histórico
 *     (`consumoMedioDiario = 0`) a projeção é zero, e sem esse piso a sugestão
 *     também seria — deixando o insumo furando o mínimo para sempre.
 *  4. **Arredonda para 3 casas** (grama/mililitro) e descarta sugestão zerada.
 */

export type SaldoPolitica = {
  insumoId: string;
  insumoNome: string;
  unidade: string;
  saldoAtual: number;
  estoqueMinimo: number;
  /** Dispara a sugestão. Por definição >= estoqueMinimo. */
  pontoPedido: number;
  leadTimeDias: number;
};

export type ConsumoRegistrado = {
  insumoId: string;
  /** ISO `yyyy-mm-dd`. */
  data: string;
  quantidade: number;
};

export type SugestaoCompra = {
  insumoId: string;
  insumoNome: string;
  unidade: string;
  saldoAtual: number;
  pontoPedido: number;
  leadTimeDias: number;
  consumoMedioDiario: number;
  /** Consumo médio × (lead time + cobertura). */
  demandaProjetada: number;
  quantidadeSugerida: number;
  /** Explica de onde veio o número, para o gerente conferir sem abrir planilha. */
  origem: "demanda_projetada" | "reposicao_do_ponto_de_pedido";
};

export type ParametrosMotor = {
  saldos: SaldoPolitica[];
  consumos: ConsumoRegistrado[];
  /** Quantos dias de histórico entram na média. */
  janelaDias: number;
  /** Quantos dias a compra deve cobrir além do lead time. */
  diasCobertura: number;
};

function arredondar(valor: number, casas = 3): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

export function calcularSugestoesCompra({
  saldos,
  consumos,
  janelaDias,
  diasCobertura,
}: ParametrosMotor): SugestaoCompra[] {
  if (!Number.isFinite(janelaDias) || janelaDias <= 0) {
    throw new Error("janelaDias precisa ser maior que zero");
  }
  if (!Number.isFinite(diasCobertura) || diasCobertura < 0) {
    throw new Error("diasCobertura não pode ser negativo");
  }

  const consumoPorInsumo = new Map<string, number>();
  for (const registro of consumos) {
    if (!Number.isFinite(registro.quantidade) || registro.quantidade <= 0) continue;
    consumoPorInsumo.set(
      registro.insumoId,
      (consumoPorInsumo.get(registro.insumoId) ?? 0) + registro.quantidade,
    );
  }

  const sugestoes: SugestaoCompra[] = [];

  for (const saldo of saldos) {
    if (!Number.isFinite(saldo.saldoAtual) || !Number.isFinite(saldo.pontoPedido)) continue;
    if (saldo.saldoAtual >= saldo.pontoPedido) continue;

    const leadTime = Math.max(0, Math.trunc(saldo.leadTimeDias ?? 0));
    const totalConsumido = consumoPorInsumo.get(saldo.insumoId) ?? 0;
    const consumoMedioDiario = arredondar(totalConsumido / janelaDias);
    const horizonteDias = leadTime + diasCobertura;

    const demandaProjetada = arredondar(consumoMedioDiario * horizonteDias);
    const porDemanda = arredondar(demandaProjetada - saldo.saldoAtual);
    const porReposicao = arredondar(saldo.pontoPedido - saldo.saldoAtual);
    const quantidadeSugerida = Math.max(porDemanda, porReposicao);

    if (quantidadeSugerida <= 0) continue;

    sugestoes.push({
      insumoId: saldo.insumoId,
      insumoNome: saldo.insumoNome,
      unidade: saldo.unidade,
      saldoAtual: saldo.saldoAtual,
      pontoPedido: saldo.pontoPedido,
      leadTimeDias: leadTime,
      consumoMedioDiario,
      demandaProjetada,
      quantidadeSugerida,
      origem: porDemanda > porReposicao ? "demanda_projetada" : "reposicao_do_ponto_de_pedido",
    });
  }

  // Ordem estável (alfabética) para a ordem de compra não mudar entre execuções.
  return sugestoes.sort((a, b) => a.insumoNome.localeCompare(b.insumoNome, "pt-BR"));
}
