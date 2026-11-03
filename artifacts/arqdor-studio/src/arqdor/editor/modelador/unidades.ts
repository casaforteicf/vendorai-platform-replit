/**
 * Unidades — conversão entre a unidade exibida e o METRO (unidade interna).
 *
 * Regra do motor: tudo é metro. A unidade escolhida só afeta entrada (barra de medidas) e
 * exibição (tooltips/HUD). Nenhum número convertido é persistido.
 */

import type { MedidaLida } from './medida';

export type Unidade = 'mm' | 'cm' | 'm' | 'pol';

/** Quanto 1 unidade vale em metros. */
export const FATOR_METROS: Record<Unidade, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  pol: 0.0254,
};

export function paraMetros(valor: number, unidade: Unidade): number {
  return valor * FATOR_METROS[unidade];
}

export function deMetros(metros: number, unidade: Unidade): number {
  return metros / FATOR_METROS[unidade];
}

export function simbolo(unidade: Unidade): string {
  return unidade;
}

/** Casas decimais que não escondem a medida nem enchem a tela. */
function casas(unidade: Unidade): number {
  if (unidade === 'mm') return 0;
  if (unidade === 'cm') return 1;
  if (unidade === 'pol') return 2;
  return 2;
}

/** Ex.: 2.8 m em cm → "280,0 cm" */
export function formatarComUnidade(metros: number, unidade: Unidade): string {
  const valor = deMetros(metros, unidade);
  const texto = valor.toFixed(casas(unidade)).replace('.', ',');
  return texto + ' ' + simbolo(unidade);
}

/**
 * Converte uma medida já interpretada (em números da unidade escolhida) para metros.
 * É o único ponto de conversão da entrada digitada.
 */
export function converterMedida(lido: MedidaLida, unidade: Unidade): MedidaLida {
  if (unidade === 'm') return lido;
  const fator = FATOR_METROS[unidade];
  if (lido.tipo === 'escalar') return { tipo: 'escalar', valor: lido.valor * fator };
  if (lido.tipo === 'dimensoes') {
    return { tipo: 'dimensoes', largura: lido.largura * fator, profundidade: lido.profundidade * fator };
  }
  if (lido.tipo === 'dimensoes3') {
    return {
      tipo: 'dimensoes3',
      largura: lido.largura * fator,
      profundidade: lido.profundidade * fator,
      altura: lido.altura * fator,
    };
  }
  return lido;
}
