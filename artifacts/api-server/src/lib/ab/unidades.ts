/**
 * Conversão de unidades do estoque de A&B (AB-04).
 *
 * O saldo físico fica em `hotel_stock_location_balances.quantity`, expresso na
 * unidade do `inventory_items` (que no hotel pode ser kg, l, un, saco…). O motor
 * preditivo trabalha na unidade base do insumo (`g`, `ml`, `un`). Sem converter,
 * "2 kg de arroz" viraria "2 g" e a sugestão de compra sairia 1000× menor.
 *
 * Função pura, sem banco — a parte que lê as tabelas vive em
 * `artifacts/api-server/src/jobs/abEstoqueSync.ts`.
 */

export type UnidadeBase = "g" | "ml" | "un";
export type Familia = "massa" | "volume" | "contagem";

export const UNIDADES_BASE: readonly UnidadeBase[] = ["g", "ml", "un"];

type Definicao = { familia: Familia; fatorParaBase: number };

/**
 * Aliases aceitos. O cadastro do hotel é livre (`inventory_items.unidade` é
 * texto), então "KG", "kg", "quilo" e "kilo" têm que significar a mesma coisa.
 */
const UNIDADES: Record<string, Definicao> = {
  // massa (base: g)
  mg: { familia: "massa", fatorParaBase: 0.001 },
  g: { familia: "massa", fatorParaBase: 1 },
  gr: { familia: "massa", fatorParaBase: 1 },
  grama: { familia: "massa", fatorParaBase: 1 },
  gramas: { familia: "massa", fatorParaBase: 1 },
  kg: { familia: "massa", fatorParaBase: 1000 },
  kgs: { familia: "massa", fatorParaBase: 1000 },
  quilo: { familia: "massa", fatorParaBase: 1000 },
  quilos: { familia: "massa", fatorParaBase: 1000 },
  kilo: { familia: "massa", fatorParaBase: 1000 },
  kilos: { familia: "massa", fatorParaBase: 1000 },
  // volume (base: ml)
  ml: { familia: "volume", fatorParaBase: 1 },
  mililitro: { familia: "volume", fatorParaBase: 1 },
  mililitros: { familia: "volume", fatorParaBase: 1 },
  l: { familia: "volume", fatorParaBase: 1000 },
  lt: { familia: "volume", fatorParaBase: 1000 },
  lts: { familia: "volume", fatorParaBase: 1000 },
  litro: { familia: "volume", fatorParaBase: 1000 },
  litros: { familia: "volume", fatorParaBase: 1000 },
  // contagem (base: un)
  un: { familia: "contagem", fatorParaBase: 1 },
  und: { familia: "contagem", fatorParaBase: 1 },
  unds: { familia: "contagem", fatorParaBase: 1 },
  unid: { familia: "contagem", fatorParaBase: 1 },
  unidade: { familia: "contagem", fatorParaBase: 1 },
  unidades: { familia: "contagem", fatorParaBase: 1 },
  pc: { familia: "contagem", fatorParaBase: 1 },
  pcs: { familia: "contagem", fatorParaBase: 1 },
  peca: { familia: "contagem", fatorParaBase: 1 },
  pecas: { familia: "contagem", fatorParaBase: 1 },
};

/** Normaliza o rótulo: sem acento, sem espaço, minúsculo. `"Pç"` → `"pc"`. */
export function normalizarUnidade(bruta: string | null | undefined): string {
  return (bruta ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.\s]/g, "");
}

export function unidadeBaseDoInsumo(bruta: string | null | undefined): UnidadeBase | null {
  const normalizada = normalizarUnidade(bruta);
  if (normalizada === "g" || normalizada === "gr") return "g";
  if (normalizada === "ml") return "ml";
  if (normalizada === "un" || normalizada === "und" || normalizada === "unid") return "un";
  return null;
}

export type OpcoesConversao = {
  /**
   * Fator explícito para unidade não métrica (saco, caixa, fardo…): quantas
   * unidades base do insumo há em 1 unidade de estoque. Ex.: 1 saco de arroz =
   * 50000 g → fator 50000.
   *
   * Sem ele, o conversor RECUSA converter — chutar faria o saldo errar em
   * ordens de magnitude e ninguém perceberia até faltar mercadoria.
   */
  fatorEmbalagem?: number | null;
};

export class ErroConversao extends Error {
  constructor(
    message: string,
    readonly unidadeOrigem: string,
    readonly unidadeDestino: string,
  ) {
    super(message);
    this.name = "ErroConversao";
  }
}

function arredondar(valor: number, casas = 4): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

/**
 * Converte `quantidade` de `unidadeOrigem` para a unidade base do insumo.
 *
 * Regras:
 *  - mesma família (massa/volume/contagem) → converte pelo fator métrico;
 *  - famílias diferentes (kg → ml) → **erro**: massa e volume só se convertem
 *    com densidade, que o cadastro não tem. Inventar 1:1 erraria em silêncio;
 *  - unidade desconhecida (saco, caixa) → exige `fatorEmbalagem`;
 *  - unidade base fora de g/ml/un → erro (é o CHECK de `ab_estoque_saldos`).
 */
export function converterParaBase(
  quantidade: number,
  unidadeOrigem: string | null | undefined,
  unidadeBase: UnidadeBase | string | null | undefined,
  opcoes: OpcoesConversao = {},
): number {
  const destino = unidadeBaseDoInsumo(unidadeBase ?? null);
  if (!destino) {
    throw new ErroConversao(
      `Unidade base inválida para o insumo: "${unidadeBase}" (esperado g, ml ou un).`,
      String(unidadeOrigem ?? ""),
      String(unidadeBase ?? ""),
    );
  }
  if (!Number.isFinite(quantidade)) {
    throw new ErroConversao("Quantidade inválida para conversão.", String(unidadeOrigem ?? ""), destino);
  }

  const origem = normalizarUnidade(unidadeOrigem);
  const definicaoOrigem = UNIDADES[origem];

  if (!definicaoOrigem) {
    const fator = opcoes.fatorEmbalagem;
    if (typeof fator === "number" && Number.isFinite(fator) && fator > 0) {
      return arredondar(quantidade * fator);
    }
    throw new ErroConversao(
      `Unidade "${unidadeOrigem ?? ""}" não é métrica e não tem fator de embalagem cadastrado. ` +
        `Informe quantas unidades ${destino} há em 1 ${unidadeOrigem ?? "unidade"} de estoque.`,
      String(unidadeOrigem ?? ""),
      destino,
    );
  }

  const definicaoDestino = UNIDADES[destino]!;
  if (definicaoOrigem.familia !== definicaoDestino.familia) {
    throw new ErroConversao(
      `Não é possível converter ${origem} (${definicaoOrigem.familia}) para ${destino} ` +
        `(${definicaoDestino.familia}) sem densidade — cadastre o fator de embalagem do insumo.`,
      origem,
      destino,
    );
  }

  const convertido = (quantidade * definicaoOrigem.fatorParaBase) / definicaoDestino.fatorParaBase;
  return arredondar(convertido);
}
