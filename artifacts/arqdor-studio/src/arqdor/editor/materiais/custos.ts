/**
 * Custo do quantitativo — quantidade com perda × preço unitário.
 *
 * Agrupa por materialId + unidade (nunca somar m² com m³) e marca explicitamente o que ficou
 * sem preço: total que parece fechado mas esconde item sem preço é pior que total incompleto.
 */

import type { GrupoQuantitativo, Unidade } from '../orcamento/quantitativos';
import { obterMaterial } from './catalogo';
import type { Catalogo } from './catalogo';
import type { FontePreco } from './schema';

export interface LinhaCusto {
  materialId: string;
  nome: string;
  unidade: Unidade;
  quantidade: number;
  precoUnitario: number;
  fontePreco: FontePreco;
  subtotal: number;
  /** true quando o material não tem preço — o subtotal é 0 e o total fica sinalizado. */
  semPreco: boolean;
}

export interface Custos {
  linhas: LinhaCusto[];
  total: number;
  /** Quantas linhas entraram com preço 0 por falta de preço. */
  linhasSemPreco: number;
}

export function custoDoQuantitativo(
  grupos: readonly GrupoQuantitativo[],
  catalogo: Catalogo,
): Custos {
  const mapa = new Map<string, LinhaCusto>();

  for (const grupo of grupos) {
    const materialId = grupo.materialId ?? 'MAT-INDEFINIDO';
    const chave = materialId + '|' + grupo.unidade;
    const material = obterMaterial(catalogo, grupo.materialId);
    const precoUnitario = Number.isFinite(material.precoUnitario) ? material.precoUnitario : 0;
    const existente = mapa.get(chave);

    if (existente === undefined) {
      mapa.set(chave, {
        materialId,
        nome: material.nome,
        unidade: grupo.unidade,
        quantidade: grupo.quantidadeComPerda,
        precoUnitario,
        fontePreco: material.fontePreco,
        subtotal: grupo.quantidadeComPerda * precoUnitario,
        semPreco: precoUnitario <= 0,
      });
    } else {
      existente.quantidade += grupo.quantidadeComPerda;
      existente.subtotal = existente.quantidade * existente.precoUnitario;
    }
  }

  const linhas = [...mapa.values()].sort((a, b) =>
    a.materialId < b.materialId ? -1 : a.materialId > b.materialId ? 1 : a.unidade < b.unidade ? -1 : 1,
  );

  return {
    linhas,
    total: linhas.reduce((soma, linha) => soma + linha.subtotal, 0),
    linhasSemPreco: linhas.filter((linha) => linha.semPreco).length,
  };
}

/** Preço por unidade de um material (0 quando não existe no catálogo). */
export function precoUnitarioDe(catalogo: Catalogo, materialId: string | null): number {
  return obterMaterial(catalogo, materialId).precoUnitario;
}
