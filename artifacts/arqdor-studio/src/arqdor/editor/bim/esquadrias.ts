/**
 * D13 — Esquadrias: porta e janela como VÃO PARAMÉTRICO da parede.
 *
 * Por que elemento próprio e não `adicionar_abertura`: `adicionar_abertura` é o FURO CIRCULAR
 * de MEP (E11), que não tem folha, peitoril nem categoria. Porta e janela são elementos BIM
 * com vão contábil — `vaosPorParede` desconta `largura × altura` da área da parede — e são o
 * que o orçamento, a planta e o memorial consomem.
 *
 * Regras (todas validadas aqui, não na UI):
 *  - o vão precisa caber na parede: `0 ≤ offset` e `offset + largura ≤ comprimento`;
 *  - a altura não pode passar da parede; janela soma o peitoril: `peitoril + altura ≤ altura`;
 *  - porta tem peitoril ZERO por definição (não se passa por baixo);
 *  - id determinístico por parede/tipo/offset, então reabrir o mesmo vão não duplica.
 */

import type { ElementoBim, GeometriaJanela, GeometriaParede, GeometriaPorta } from './schema';

const EPS = 1e-6;

export type TipoVao = 'porta' | 'janela';

export interface MedidasVao {
  /** Distância do início da parede (ponto_a) até o início do vão, em metros. */
  offset: number;
  largura: number;
  altura: number;
  /** Só janela. Porta usa 0. */
  peitoril?: number;
}

export interface ContextoVao {
  projetoId: string;
  camadaId: string;
  nivel?: number;
  categoria?: GeometriaPorta['categoria'];
}

export type ErroVao =
  | { codigo: 'NAO_E_PAREDE'; elementoId: string }
  | { codigo: 'PAREDE_SEM_COMPRIMENTO'; elementoId: string }
  | { codigo: 'MEDIDA_INVALIDA'; campo: 'largura' | 'altura' | 'offset' | 'peitoril' }
  | { codigo: 'VAO_NAO_CABE'; detalhe: string }
  | { codigo: 'ALTURA_EXCEDE_PAREDE'; detalhe: string };

export type ResultadoVao = { ok: true; elemento: ElementoBim } | { ok: false; erro: ErroVao };

function comprimentoParede(geometria: GeometriaParede): number {
  return Math.hypot(geometria.ponto_b[0] - geometria.ponto_a[0], geometria.ponto_b[1] - geometria.ponto_a[1]);
}

function ehParede(elemento: ElementoBim): elemento is ElementoBim & { geometria: GeometriaParede } {
  return elemento.tipo === 'parede';
}

export function idVaoDe(paredeId: string, tipo: TipoVao, offset: number): string {
  return 'vao_' + paredeId + '_' + tipo + '_' + String(Math.round(offset * 1000));
}

export function abrirVao(
  parede: ElementoBim,
  tipo: TipoVao,
  medidas: MedidasVao,
  contexto: ContextoVao,
): ResultadoVao {
  if (!ehParede(parede)) return { ok: false, erro: { codigo: 'NAO_E_PAREDE', elementoId: parede.id } };

  const comprimento = comprimentoParede(parede.geometria);
  if (!(comprimento > EPS)) return { ok: false, erro: { codigo: 'PAREDE_SEM_COMPRIMENTO', elementoId: parede.id } };

  if (!(medidas.largura > EPS)) return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: 'largura' } };
  if (!(medidas.altura > EPS)) return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: 'altura' } };
  if (!(medidas.offset >= -EPS)) return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: 'offset' } };

  const peitoril = tipo === 'janela' ? (medidas.peitoril ?? 1) : 0;
  if (!(peitoril >= -EPS)) return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: 'peitoril' } };

  if (medidas.offset + medidas.largura > comprimento + EPS) {
    return {
      ok: false,
      erro: {
        codigo: 'VAO_NAO_CABE',
        detalhe:
          'vão vai até ' +
          (medidas.offset + medidas.largura).toFixed(2) +
          ' m, mas a parede tem ' +
          comprimento.toFixed(2) +
          ' m',
      },
    };
  }

  if (peitoril + medidas.altura > parede.geometria.altura + EPS) {
    return {
      ok: false,
      erro: {
        codigo: 'ALTURA_EXCEDE_PAREDE',
        detalhe:
          'topo do vão em ' +
          (peitoril + medidas.altura).toFixed(2) +
          ' m, parede tem ' +
          parede.geometria.altura.toFixed(2) +
          ' m',
      },
    };
  }

  const base = {
    id: idVaoDe(parede.id, tipo, medidas.offset),
    projetoId: contexto.projetoId,
    nivel: contexto.nivel ?? parede.nivel,
    camadaId: contexto.camadaId,
    propriedades: { origem: 'vao', paredeId: parede.id, tipo },
  };

  if (tipo === 'porta') {
    const geometria: GeometriaPorta = {
      parede_id: parede.id,
      offset: medidas.offset,
      largura: medidas.largura,
      altura: medidas.altura,
    };
    if (contexto.categoria !== undefined) geometria.categoria = contexto.categoria;
    return { ok: true, elemento: { ...base, tipo: 'porta', geometria } };
  }

  const geometria: GeometriaJanela = {
    parede_id: parede.id,
    offset: medidas.offset,
    largura: medidas.largura,
    altura: medidas.altura,
    peitoril,
  };
  if (contexto.categoria !== undefined) geometria.categoria = contexto.categoria;
  return { ok: true, elemento: { ...base, tipo: 'janela', geometria } };
}

/** Quantos vãos já existem nesta parede — a UI usa para numerar e limitar. */
export function vaosDaParede(elementos: readonly ElementoBim[], paredeId: string): ElementoBim[] {
  return elementos.filter((elemento) => {
    if (elemento.tipo !== 'porta' && elemento.tipo !== 'janela') return false;
    return (elemento.geometria as GeometriaPorta | GeometriaJanela).parede_id === paredeId;
  });
}
