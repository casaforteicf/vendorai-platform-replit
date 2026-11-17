/**
 * Quantitativo de móveis — sempre em UNIDADES, agrupado por família.
 *
 * Móvel não se mede por área: 1 sofá é 1 sofá. O agrupamento por família é o que o arquiteto
 * leva para a lista de compras ("6 cadeiras de jantar"), diferente do orçamento de material.
 */

import type { ElementoBim, GeometriaMobiliario } from '../bim/schema';
import { obterFamilia } from './familias';
import type { FamiliaMovel } from './familias';

export const FAMILIA_INDEFINIDA = 'FAMILIA-INDEFINIDA';

export interface GrupoFamilia {
  familiaId: string;
  nome: string;
  categoria: string;
  /** Sempre 'un'. */
  unidade: 'un';
  quantidade: number;
  elementos: string[];
}

/**
 * Agrupa móveis por família. Elemento sem `familiaId` (colocado à mão) cai em
 * `FAMILIA-INDEFINIDA` — não desaparece do quantitativo.
 */
export function quantitativoMoveis(
  elementos: readonly ElementoBim[],
  familias: readonly FamiliaMovel[] = [],
): GrupoFamilia[] {
  const mapa = new Map<string, GrupoFamilia>();

  for (const elemento of elementos) {
    if (elemento.tipo !== 'mobiliario') continue;
    const geometria = elemento.geometria as GeometriaMobiliario;
    const familiaId = geometria.familiaId ?? FAMILIA_INDEFINIDA;
    const familia = obterFamilia(familias, familiaId);
    const existente = mapa.get(familiaId);
    if (existente === undefined) {
      mapa.set(familiaId, {
        familiaId,
        nome: familia?.nome ?? 'Móvel sem família',
        categoria: familia?.categoria ?? geometria.categoria ?? 'sem categoria',
        unidade: 'un',
        quantidade: 1,
        elementos: [elemento.id],
      });
    } else {
      existente.quantidade += 1;
      existente.elementos.push(elemento.id);
    }
  }

  return [...mapa.values()].sort((a, b) => (a.familiaId < b.familiaId ? -1 : a.familiaId > b.familiaId ? 1 : 0));
}

/** Total de móveis (unidades) — inclui os sem família. */
export function totalMoveis(elementos: readonly ElementoBim[]): number {
  return quantitativoMoveis(elementos).reduce((soma, grupo) => soma + grupo.quantidade, 0);
}
