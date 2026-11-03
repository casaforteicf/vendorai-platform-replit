/**
 * Orçamento por serviço (composição).
 *
 * O elemento pode apontar para uma composição (`servicoId`). Nesse caso o custo vem dos
 * insumos da composição, não do material simples. Elementos SEM `servicoId` não geram linha
 * aqui — o orçamento de materiais existente continua sendo a única fonte para eles (é o que
 * garante que nada muda de valor para quem não usa composição).
 */

import type { ElementoBim } from '../bim/schema';
import type { Catalogo } from '../materiais/catalogo';
import { custoComposicao } from '../materiais/composicoes';
import type { Composicao } from '../materiais/composicoes';
import { medirElemento, vaosPorParede } from './quantitativos';

export interface LinhaServico {
  elementoId: string;
  composicaoId: string;
  nome: string;
  /** Quantidade do SERVIÇO (unidade da composição). */
  quantidade: number;
  /** Custo unitário da composição (soma dos insumos). */
  custoUnitario: number;
  total: number;
  /** Insumos sem preço — o total está subestimado de propósito. */
  faltando: string[];
}

export interface CustosServico {
  linhas: LinhaServico[];
  total: number;
  /** Elementos que apontam para composição inexistente. */
  semComposicao: string[];
}

/**
 * Metragem real por elemento, na unidade da composição.
 *
 * Conversão EXPLÍCITA quando a unidade não é medida direta:
 *   m² → m³: área × espessura (parede/laje)
 *   m³ → m²: volume ÷ espessura
 * Sem espessura declarada, cai em 1 (uma unidade de serviço) — nunca inventa a espessura.
 */
export function obterQuantidadesPorElemento(
  elementos: readonly ElementoBim[],
  composicoes: readonly Composicao[],
): Record<string, number> {
  const porId = new Map(composicoes.map((composicao) => [composicao.id, composicao]));
  const vaos = vaosPorParede(elementos);
  const quantidades: Record<string, number> = {};

  for (const elemento of elementos) {
    const servicoId = elemento.servicoId;
    if (servicoId === undefined || servicoId.length === 0) continue;
    const composicao = porId.get(servicoId);
    if (composicao === undefined) continue;

    const medicoes = medirElemento(elemento, vaos);
    const espessura = (elemento.geometria as { espessura?: number }).espessura;

    let quantidade: number | undefined;
    const direta = medicoes.find((medicao) => medicao.unidade === composicao.unidade);
    if (direta !== undefined) {
      quantidade = direta.quantidade;
    } else if (composicao.unidade === 'm3' && typeof espessura === 'number' && espessura > 0) {
      const area = medicoes.find((medicao) => medicao.unidade === 'm2');
      if (area !== undefined) quantidade = area.quantidade * espessura;
    } else if (composicao.unidade === 'm2' && typeof espessura === 'number' && espessura > 0) {
      const volume = medicoes.find((medicao) => medicao.unidade === 'm3');
      if (volume !== undefined) quantidade = volume.quantidade / espessura;
    }

    // Medida inválida (ex.: volume NaN por falta de espessura) não pode virar custo NaN.
    quantidades[elemento.id] = quantidade !== undefined && Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1;
  }

  return quantidades;
}

/**
 * Custo dos elementos que usam composição.
 * `quantidades` é opcional (default 1 serviço por elemento) — quem tem a metragem passa aqui.
 */
export function custoDeServicos(
  elementos: readonly ElementoBim[],
  catalogo: Catalogo,
  composicoes: readonly Composicao[],
  quantidades: Readonly<Record<string, number>> = {},
): CustosServico {
  const porId = new Map(composicoes.map((composicao) => [composicao.id, composicao]));
  const linhas: LinhaServico[] = [];
  const semComposicao: string[] = [];

  for (const elemento of elementos) {
    const servicoId = elemento.servicoId;
    if (servicoId === undefined || servicoId.length === 0) continue;

    const composicao = porId.get(servicoId);
    if (composicao === undefined) {
      semComposicao.push(elemento.id);
      continue;
    }
    const custo = custoComposicao(composicao, catalogo);
    const quantidade = quantidades[elemento.id] ?? 1;
    linhas.push({
      elementoId: elemento.id,
      composicaoId: composicao.id,
      nome: composicao.nome,
      quantidade,
      custoUnitario: custo.custo,
      total: Math.round(custo.custo * quantidade * 100) / 100,
      faltando: custo.faltando,
    });
  }

  return {
    linhas,
    total: Math.round(linhas.reduce((soma, linha) => soma + linha.total, 0) * 100) / 100,
    semComposicao,
  };
}
