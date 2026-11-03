/**
 * Prancha — escala, página e carimbo.
 *
 * A4 paisagem, margem 10 mm, carimbo à direita. A matemática é pura (testável); o desenho do
 * carimbo acontece no canvas 2D de exportação.
 */

export const PRANCHA = {
  larguraMm: 297,
  alturaMm: 210,
  margemMm: 10,
  carimboMm: 70,
  dpiPadrao: 150,
} as const;

export type EscalaPrancha = 50 | 100 | 200;

export const ESCALAS: readonly EscalaPrancha[] = [50, 100, 200];

export function mmParaPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export interface PaginaPrancha {
  larguraPx: number;
  alturaPx: number;
  /** Área de desenho (sem margem e sem carimbo), em pixels. */
  desenhoPx: { largura: number; altura: number };
  /** Área de desenho em metros reais na escala escolhida. */
  desenhoM: { largura: number; altura: number };
  /** Quantos pixels representam 1 metro no papel. */
  pxPorMetro: number;
  margemPx: number;
  carimboPx: number;
}

/** 1:50 ⇒ 1 m real = 2 cm no papel. */
export function calcularPagina(escala: EscalaPrancha, dpi = PRANCHA.dpiPadrao): PaginaPrancha {
  const mmPorMetro = 1000 / escala;
  const pxPorMetro = mmParaPx(mmPorMetro, dpi);
  const desenhoLarguraMm = PRANCHA.larguraMm - PRANCHA.margemMm * 2 - PRANCHA.carimboMm;
  const desenhoAlturaMm = PRANCHA.alturaMm - PRANCHA.margemMm * 2;
  return {
    larguraPx: mmParaPx(PRANCHA.larguraMm, dpi),
    alturaPx: mmParaPx(PRANCHA.alturaMm, dpi),
    desenhoPx: { largura: mmParaPx(desenhoLarguraMm, dpi), altura: mmParaPx(desenhoAlturaMm, dpi) },
    desenhoM: { largura: desenhoLarguraMm / mmPorMetro, altura: desenhoAlturaMm / mmPorMetro },
    pxPorMetro,
    margemPx: mmParaPx(PRANCHA.margemMm, dpi),
    carimboPx: mmParaPx(PRANCHA.carimboMm, dpi),
  };
}

export interface DadosCarimbo {
  titulo: string;
  projeto: string;
  escala: EscalaPrancha;
  data: string;
  /** Maior lado do modelo em metros (para o campo "dimensão"). */
  dimensaoM?: number;
}

/** Linhas do carimbo, na ordem em que são desenhadas. */
export function linhasCarimbo(dados: DadosCarimbo): Array<{ rotulo: string; valor: string }> {
  return [
    { rotulo: 'PROJETO', valor: dados.projeto.trim().length > 0 ? dados.projeto : '—' },
    { rotulo: 'VISTA', valor: dados.titulo },
    { rotulo: 'ESCALA', valor: '1:' + String(dados.escala) },
    { rotulo: 'DATA', valor: dados.data },
    ...(dados.dimensaoM === undefined
      ? []
      : [{ rotulo: 'MAIOR LADO', valor: String(Math.round(dados.dimensaoM * 100) / 100) + ' m' }]),
  ];
}
