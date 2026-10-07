// Motor de cálculo de orçamento para produtos por m² (teto vinílico, revestimento de parede).
// Ver claude/calculo-orcamento-m2-e-perfil.md no projeto pra contexto completo da decisão.
//
// Dois tipos de produto suportados aqui:
// - "area_com_acabamento_perimetro" (teto vinílico): entrada por AMBIENTE
//   (largura×comprimento ou m² direto), soma área e perímetro de todos os
//   ambientes, calcula fechamento de pacote pro produto principal E pro
//   acessório de acabamento (perímetro).
// - "area_simples" (revestimento de parede): entrada por PAREDE
//   (largura×altura ou m² direto), soma só a área, sem perímetro/acessório.
//
// Fechamento de pacote: quantidade necessária ÷ fechamentoPacote,
// arredondado pra cima (Math.ceil) — sem margem de perda adicional, o
// arredondamento pra pacote fechado já cobre a folga.

export type TipoCalculo =
  | "area_simples"
  | "area_com_acabamento_perimetro"
  | "acabamento_perimetro"
  | "linear"
  | "peca_avulsa";

export interface SuperficieAmbiente {
  nome?: string;
  /** metros. Informe largura+comprimento OU m2Direto. */
  largura?: number;
  /** metros. */
  comprimento?: number;
  /** m² informado direto, quando não há largura/comprimento (ex: veio de planta já calculada). */
  m2Direto?: number;
  /**
   * Sobrescreve o perímetro calculado automaticamente (2×(largura+comprimento)).
   * Obrigatório quando m2Direto é usado (não dá pra derivar perímetro sem dimensões).
   * Também use pra ambientes irregulares (formato em L, recortes).
   */
  perimetroManual?: number;
}

export interface SuperficieParede {
  nome?: string;
  /** metros. Informe largura+altura OU m2Direto. */
  largura?: number;
  /** metros. */
  altura?: number;
  /** m² informado direto. */
  m2Direto?: number;
}

/** Recorte dos campos de produtos_catalogo relevantes pro cálculo. */
export interface ProdutoCalculo {
  id: string;
  nome: string;
  tipoCalculo: TipoCalculo | null;
  /** preco_base — usado como fallback quando não há fechamento_pacote definido. */
  precoBase: number;
  /** fechamento_pacote — m² ou m que 1 pacote/embalagem cobre. */
  fechamentoPacote?: number | null;
  /** preco_pacote — preço da embalagem fechada. Se ausente, é derivado de fechamentoPacote × precoBase. */
  precoPacote?: number | null;
  /** Quantidade de pacotes primários contidos em uma embalagem mestre. */
  embalagemMestreQuantidade?: number | null;
  /** Quantidade mínima faturável, em pacotes primários. */
  quantidadeMinimaVenda?: number | null;
  /** Múltiplo obrigatório de venda, em pacotes primários. */
  multiploVenda?: number | null;
  /** Quando true, não força fechamento pela embalagem mestre. */
  permiteFracionarEmbalagemMestre?: boolean | null;
}

export interface DetalheSuperficie {
  nome?: string;
  area: number;
  perimetro?: number;
}

export interface ResultadoCalculoProduto {
  produtoId: string;
  /** m² (produto principal) ou m linear (acessório), soma de todas as superfícies. */
  quantidadeNecessaria: number;
  /** nº de pacotes primários efetivamente faturados após regras comerciais. */
  numeroPacotes: number;
  /** nº de pacotes necessários antes de mínimo/múltiplo/embalagem mestre. */
  numeroPacotesNecessarios?: number;
  /** nº de embalagens mestre faturadas, quando a regra existir. */
  numeroEmbalagensMestre?: number;
  /** quantidade física faturada (numeroPacotes × fechamentoPacote). */
  quantidadeFaturada?: number;
  valorTotal: number;
  detalhamentoSuperficies: DetalheSuperficie[];
}

export interface ResultadoCalculoOrcamento {
  produtoPrincipal: ResultadoCalculoProduto;
  /** presente só quando tipoCalculo = "area_com_acabamento_perimetro" e um acessório foi passado. */
  acessorioPerimetro?: ResultadoCalculoProduto;
}

export class ErroCalculoOrcamento extends Error {}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Área e perímetro de um ambiente (teto). Perímetro assume retângulo salvo quando perimetroManual é informado. */
export function calcularAmbiente(amb: SuperficieAmbiente): { area: number; perimetro: number } {
  if (amb.m2Direto != null) {
    if (amb.perimetroManual == null) {
      throw new ErroCalculoOrcamento(
        `Ambiente "${amb.nome ?? "sem nome"}": ao informar m² direto, o perímetro precisa ser informado manualmente (não dá pra derivar sem largura/comprimento).`
      );
    }
    return { area: amb.m2Direto, perimetro: amb.perimetroManual };
  }
  if (amb.largura == null || amb.comprimento == null) {
    throw new ErroCalculoOrcamento(
      `Ambiente "${amb.nome ?? "sem nome"}": informe largura+comprimento ou m² direto (com perímetro manual).`
    );
  }
  if (amb.largura <= 0 || amb.comprimento <= 0) {
    throw new ErroCalculoOrcamento(`Ambiente "${amb.nome ?? "sem nome"}": largura e comprimento devem ser maiores que zero.`);
  }
  const area = amb.largura * amb.comprimento;
  const perimetroAuto = 2 * (amb.largura + amb.comprimento);
  return { area, perimetro: amb.perimetroManual ?? perimetroAuto };
}

/** Área de uma parede (revestimento). Sem desconto de vãos de porta/janela (decisão confirmada). */
export function calcularParede(par: SuperficieParede): { area: number } {
  if (par.m2Direto != null) return { area: par.m2Direto };
  if (par.largura == null || par.altura == null) {
    throw new ErroCalculoOrcamento(`Parede "${par.nome ?? "sem nome"}": informe largura+altura ou m² direto.`);
  }
  if (par.largura <= 0 || par.altura <= 0) {
    throw new ErroCalculoOrcamento(`Parede "${par.nome ?? "sem nome"}": largura e altura devem ser maiores que zero.`);
  }
  return { area: par.largura * par.altura };
}

/**
 * Fecha a quantidade necessária em pacotes/embalagens inteiras (arredonda pra cima).
 * Quando o produto não tem fechamento_pacote definido, cobra pela quantidade exata × precoBase
 * (produtos vendidos a granel, sem embalagem fechada).
 */
export function calcularFechamentoPacote(
  quantidadeNecessaria: number,
  produto: Pick<
    ProdutoCalculo,
    | "fechamentoPacote"
    | "precoPacote"
    | "precoBase"
    | "embalagemMestreQuantidade"
    | "quantidadeMinimaVenda"
    | "multiploVenda"
    | "permiteFracionarEmbalagemMestre"
  >
): {
  numeroPacotes: number;
  numeroPacotesNecessarios: number;
  numeroEmbalagensMestre?: number;
  quantidadeFaturada?: number;
  valorTotal: number;
} {
  const fechamento = produto.fechamentoPacote;
  if (!fechamento || fechamento <= 0) {
    return {
      numeroPacotes: 0,
      numeroPacotesNecessarios: 0,
      quantidadeFaturada: round3(quantidadeNecessaria),
      valorTotal: round2(quantidadeNecessaria * produto.precoBase),
    };
  }

  const numeroPacotesNecessarios = Math.ceil(quantidadeNecessaria / fechamento);
  const minimo = Math.max(1, Math.trunc(produto.quantidadeMinimaVenda ?? 1));
  const multiplo = Math.max(1, Math.trunc(produto.multiploVenda ?? 1));
  const mestre = Math.max(1, Math.trunc(produto.embalagemMestreQuantidade ?? 1));
  const mestreObrigatoria = mestre > 1 && produto.permiteFracionarEmbalagemMestre !== true;

  const gcd = (a: number, b: number): number => {
    let x = a;
    let y = b;
    while (y !== 0) [x, y] = [y, x % y];
    return x;
  };
  const lcm = (a: number, b: number) => (a * b) / gcd(a, b);
  const passoVenda = mestreObrigatoria ? lcm(mestre, multiplo) : multiplo;

  let numeroPacotes = Math.max(numeroPacotesNecessarios, minimo);
  numeroPacotes = Math.ceil(numeroPacotes / passoVenda) * passoVenda;

  const precoUnitarioPacote = produto.precoPacote ?? fechamento * produto.precoBase;
  return {
    numeroPacotes,
    numeroPacotesNecessarios,
    numeroEmbalagensMestre: mestreObrigatoria ? Math.ceil(numeroPacotes / mestre) : undefined,
    quantidadeFaturada: round3(numeroPacotes * fechamento),
    valorTotal: round2(numeroPacotes * precoUnitarioPacote),
  };
}

/**
 * Motor principal. Dado o produto (com tipoCalculo já resolvido do cadastro) e a lista de
 * superfícies informadas pelo vendedor/agente SDR, retorna a quantidade fechada e o valor —
 * do produto principal e, se aplicável, do acessório de acabamento de perímetro escolhido.
 */
export function calcularOrcamentoProdutoArea(
  produto: ProdutoCalculo,
  superficies: SuperficieAmbiente[] | SuperficieParede[],
  acessorioPerimetro?: ProdutoCalculo
): ResultadoCalculoOrcamento {
  const tipo = produto.tipoCalculo ?? "area_simples";

  if (tipo === "area_com_acabamento_perimetro") {
    if (!superficies.length) {
      throw new ErroCalculoOrcamento(`Produto "${produto.nome}": informe ao menos um ambiente.`);
    }
    let areaTotal = 0;
    let perimetroTotal = 0;
    const detalhamento: DetalheSuperficie[] = [];
    for (const s of superficies as SuperficieAmbiente[]) {
      const { area, perimetro } = calcularAmbiente(s);
      areaTotal += area;
      perimetroTotal += perimetro;
      detalhamento.push({ nome: s.nome, area: round3(area), perimetro: round3(perimetro) });
    }

    const principal = calcularFechamentoPacote(areaTotal, produto);
    const resultado: ResultadoCalculoOrcamento = {
      produtoPrincipal: {
        produtoId: produto.id,
        quantidadeNecessaria: round3(areaTotal),
        numeroPacotes: principal.numeroPacotes,
        numeroPacotesNecessarios: principal.numeroPacotesNecessarios,
        numeroEmbalagensMestre: principal.numeroEmbalagensMestre,
        quantidadeFaturada: principal.quantidadeFaturada,
        valorTotal: principal.valorTotal,
        detalhamentoSuperficies: detalhamento,
      },
    };

    if (acessorioPerimetro) {
      const ac = calcularFechamentoPacote(perimetroTotal, acessorioPerimetro);
      resultado.acessorioPerimetro = {
        produtoId: acessorioPerimetro.id,
        quantidadeNecessaria: round3(perimetroTotal),
        numeroPacotes: ac.numeroPacotes,
        numeroPacotesNecessarios: ac.numeroPacotesNecessarios,
        numeroEmbalagensMestre: ac.numeroEmbalagensMestre,
        quantidadeFaturada: ac.quantidadeFaturada,
        valorTotal: ac.valorTotal,
        detalhamentoSuperficies: [],
      };
    }
    return resultado;
  }

  if (tipo === "area_simples") {
    if (!superficies.length) {
      throw new ErroCalculoOrcamento(`Produto "${produto.nome}": informe ao menos uma parede.`);
    }
    let areaTotal = 0;
    const detalhamento: DetalheSuperficie[] = [];
    for (const s of superficies as SuperficieParede[]) {
      const { area } = calcularParede(s);
      areaTotal += area;
      detalhamento.push({ nome: s.nome, area: round3(area) });
    }
    const principal = calcularFechamentoPacote(areaTotal, produto);
    return {
      produtoPrincipal: {
        produtoId: produto.id,
        quantidadeNecessaria: round3(areaTotal),
        numeroPacotes: principal.numeroPacotes,
        numeroPacotesNecessarios: principal.numeroPacotesNecessarios,
        numeroEmbalagensMestre: principal.numeroEmbalagensMestre,
        quantidadeFaturada: principal.quantidadeFaturada,
        valorTotal: principal.valorTotal,
        detalhamentoSuperficies: detalhamento,
      },
    };
  }

  throw new ErroCalculoOrcamento(
    `calcularOrcamentoProdutoArea não suporta tipoCalculo "${tipo}" — esperado "area_simples" ou "area_com_acabamento_perimetro".`
  );
}
