/**
 * Motor de cálculo do "briffing" (resumo de produção) — A&B / Hotelaria.
 *
 * Função pura, sem React e sem I/O: dá para validar o resultado contra as
 * planilhas do hotel em um teste, antes de qualquer tela existir.
 *
 * Fórmula por insumo de um prato:
 *
 *     quantidade = ocupação × porçõesPorPax × gramaturaPorPorção × fatorCorreção
 *
 * Regras adotadas (e o porquê):
 *  - **Porções não são arredondadas.** 3 hóspedes × 0,5 porção = 1,5 porção, e
 *    arredondar para 2 inflaria a compra em 33%. A planilha também não
 *    arredonda nesse ponto; o arredondamento fica só na 3ª casa da unidade base.
 *  - **Fator de correção (FC) é obrigatório > 0 quando informado.** FC ≤ 0 é
 *    quase sempre digitação errada (ex.: 0,15 no lugar de 1,15) e produziria
 *    uma compra 85% menor em silêncio.
 *  - **Um insumo não pode ter duas unidades.** Se "arroz" aparece como `g` num
 *    prato e `un` em outro, consolidar as duas linhas esconderia um erro de
 *    cadastro; o motor falha com mensagem explícita.
 *  - **Consolidado na ordem de primeira aparição no cardápio** — determinístico
 *    e fácil de conferir linha a linha contra o papel.
 */

export type UnidadeBase = "g" | "ml" | "un";

export type FichaTecnicaItem = {
  insumoId: string;
  insumoNome: string;
  /** Unidade em que `gramaturaPorPorcao` é expressa. */
  unidadeBase: UnidadeBase;
  /** Quantidade líquida por porção, na unidade base. */
  gramaturaPorPorcao: number;
  /** Fator de correção (1.15 = +15% de perda/limpeza). Padrão: 1. */
  fatorCorrecao?: number;
};

export type Prato = {
  id: string;
  nome: string;
  /** Quantas porções cada hóspede consome deste prato. */
  porcoesPorPax: number;
  ficha: FichaTecnicaItem[];
};

export type CardapioDia = {
  /** ISO `yyyy-mm-dd`. */
  data: string;
  pratos: Prato[];
};

export type InsumoCalculado = {
  insumoId: string;
  insumoNome: string;
  unidade: UnidadeBase;
  /** Quantidade na unidade base, já com fator de correção. */
  quantidadeBase: number;
  /** Conveniência para g/ml (quantidadeBase / 1000). Ausente para `un`. */
  quantidadeKg?: number;
};

export type ResultadoPorPrato = {
  pratoId: string;
  pratoNome: string;
  porcoesTotais: number;
  insumos: InsumoCalculado[];
};

export type ResultadoBriffing = {
  ocupacao: number;
  porPrato: ResultadoPorPrato[];
  consolidado: InsumoCalculado[];
};

/** Arredonda para 3 casas na unidade base (precisão de grama/mililitro). */
export function arredondar(valor: number, casas = 3): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

function exigirFinito(valor: number, nome: string, contexto: string): number {
  if (!Number.isFinite(valor)) {
    throw new Error(`${contexto}: ${nome} precisa ser um número finito.`);
  }
  return valor;
}

function validarNaoNegativo(valor: number, nome: string, contexto: string): number {
  exigirFinito(valor, nome, contexto);
  if (valor < 0) {
    throw new Error(`${contexto}: ${nome} não pode ser negativo (recebido ${valor}).`);
  }
  return valor;
}

function emKg(quantidade: number, unidade: UnidadeBase): number | undefined {
  return unidade === "un" ? undefined : arredondar(quantidade / 1000);
}

export function calcularBriffing(ocupacao: number, cardapio: CardapioDia): ResultadoBriffing {
  validarNaoNegativo(ocupacao, "ocupação", "Briffing");
  if (!cardapio || !Array.isArray(cardapio.pratos)) {
    throw new Error("Briffing: o cardápio precisa informar a lista de pratos.");
  }

  const porPrato: ResultadoPorPrato[] = [];
  const consolidado = new Map<string, InsumoCalculado>();
  /** insumoId -> unidade já vista, para barrar mistura de unidades. */
  const unidadePorInsumo = new Map<string, UnidadeBase>();

  for (const prato of cardapio.pratos) {
    const contexto = `Briffing · prato "${prato.nome || prato.id}"`;
    validarNaoNegativo(prato.porcoesPorPax, "porções por hóspede", contexto);
    if (!Array.isArray(prato.ficha)) {
      throw new Error(`${contexto}: a ficha técnica precisa ser uma lista.`);
    }

    const porcoesTotais = arredondar(ocupacao * prato.porcoesPorPax);

    const insumos = prato.ficha.map((item) => {
      const fc = item.fatorCorrecao ?? 1;
      exigirFinito(fc, "fator de correção", contexto);
      if (fc <= 0) {
        throw new Error(`${contexto}: fator de correção deve ser maior que zero (recebido ${fc}).`);
      }
      validarNaoNegativo(item.gramaturaPorPorcao, "gramatura por porção", contexto);

      const quantidadeBase = arredondar(item.gramaturaPorPorcao * porcoesTotais * fc);
      const calculado: InsumoCalculado = {
        insumoId: item.insumoId,
        insumoNome: item.insumoNome,
        unidade: item.unidadeBase,
        quantidadeBase,
        quantidadeKg: emKg(quantidadeBase, item.unidadeBase),
      };

      const unidadeVista = unidadePorInsumo.get(item.insumoId);
      if (unidadeVista && unidadeVista !== item.unidadeBase) {
        throw new Error(
          `Briffing: o insumo "${item.insumoNome}" aparece em unidades diferentes ` +
            `(${unidadeVista} e ${item.unidadeBase}). Corrija a ficha técnica antes de calcular.`,
        );
      }
      unidadePorInsumo.set(item.insumoId, item.unidadeBase);

      const chave = `${item.insumoId}::${item.unidadeBase}`;
      const acumulado = consolidado.get(chave);
      if (acumulado) {
        acumulado.quantidadeBase = arredondar(acumulado.quantidadeBase + quantidadeBase);
        acumulado.quantidadeKg = emKg(acumulado.quantidadeBase, acumulado.unidade);
      } else {
        consolidado.set(chave, { ...calculado });
      }

      return calculado;
    });

    porPrato.push({
      pratoId: prato.id,
      pratoNome: prato.nome,
      porcoesTotais,
      insumos,
    });
  }

  return { ocupacao, porPrato, consolidado: [...consolidado.values()] };
}

/**
 * Soma vários dias de briffing num único consolidado — é a lista que alimenta a
 * requisição de compra semanal. Lança se, entre os dias, um insumo aparecer em
 * unidades diferentes.
 */
export function consolidarBriffings(resultados: ResultadoBriffing[]): InsumoCalculado[] {
  const total = new Map<string, InsumoCalculado>();
  const unidadePorInsumo = new Map<string, UnidadeBase>();

  for (const resultado of resultados) {
    for (const insumo of resultado.consolidado) {
      const unidadeVista = unidadePorInsumo.get(insumo.insumoId);
      if (unidadeVista && unidadeVista !== insumo.unidade) {
        throw new Error(
          `Consolidação: o insumo "${insumo.insumoNome}" aparece em unidades diferentes ` +
            `(${unidadeVista} e ${insumo.unidade}).`,
        );
      }
      unidadePorInsumo.set(insumo.insumoId, insumo.unidade);

      const chave = `${insumo.insumoId}::${insumo.unidade}`;
      const acumulado = total.get(chave);
      if (acumulado) {
        acumulado.quantidadeBase = arredondar(acumulado.quantidadeBase + insumo.quantidadeBase);
        acumulado.quantidadeKg = emKg(acumulado.quantidadeBase, acumulado.unidade);
      } else {
        total.set(chave, { ...insumo });
      }
    }
  }

  return [...total.values()];
}

const FORMATO_NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Texto curto para a lista de compras: "12,5 kg", "750 g", "30 un". */
export function formatarQuantidade(quantidadeBase: number, unidade: UnidadeBase): string {
  if (unidade === "un") return `${FORMATO_NUMERO.format(quantidadeBase)} un`;
  if (quantidadeBase >= 1000) {
    return `${FORMATO_NUMERO.format(arredondar(quantidadeBase / 1000))} ${unidade === "g" ? "kg" : "L"}`;
  }
  return `${FORMATO_NUMERO.format(quantidadeBase)} ${unidade}`;
}
