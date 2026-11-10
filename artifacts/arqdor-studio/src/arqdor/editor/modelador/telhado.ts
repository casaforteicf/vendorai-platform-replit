/**
 * Telhado de DUAS ÁGUAS — geometria pura.
 *
 * Base retangular no plano X/Z, cumeeira paralela a X na metade de Z. Duas águas (planos
 * inclinados), duas empenas triangulares e base fechada: sólido fechado, pronto para
 * `criar_solido` e para a classificação BIM (`tipo: 'telhado'`).
 *
 * `posicao` é o CANTO MÍNIMO da base, mesma convenção de `criarCaixa`.
 * O beiral expande a base para fora nas quatro direções, sem mudar a altura da cumeeira.
 */

import type { Aresta, Face, Solido, Vetor3, Vertice } from './schema';
import { orientarParaFora } from './orientacao';

export interface EntradaTelhado {
  id: string;
  nome: string;
  /** Canto mínimo da base, no chão. */
  posicao: Vetor3;
  /** Comprimento ao longo de X (paralelo à cumeeira). */
  larguraX: number;
  /** Profundidade ao longo de Z (as duas águas caem para ±Z). */
  profundidadeZ: number;
  /** Altura da cumeeira acima da base. */
  altura: number;
  /** Beiral: expande a base para fora. 0 = sem beiral. */
  beiral?: number;
}

export type ErroTelhado = {
  codigo: 'MEDIDA_INVALIDA';
  campo: 'larguraX' | 'profundidadeZ' | 'altura' | 'beiral';
  valor: number;
};

export type ResultadoTelhado = { ok: true; solido: Solido } | { ok: false; erro: ErroTelhado };

const MINIMO = 0.05;

export function criarTelhadoDuasAguas(entrada: EntradaTelhado): ResultadoTelhado {
  const beiral = entrada.beiral ?? 0;
  const medidas = {
    larguraX: entrada.larguraX,
    profundidadeZ: entrada.profundidadeZ,
    altura: entrada.altura,
    beiral,
  };

  for (const campo of ['larguraX', 'profundidadeZ', 'altura'] as const) {
    const valor = medidas[campo];
    if (!Number.isFinite(valor) || valor < MINIMO) {
      return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo, valor } };
    }
  }
  if (!Number.isFinite(beiral) || beiral < 0) {
    return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: 'beiral', valor: beiral } };
  }

  const [x0, y0, z0] = entrada.posicao;
  const ax0 = x0 - beiral;
  const ax1 = x0 + entrada.larguraX + beiral;
  const az0 = z0 - beiral;
  const az1 = z0 + entrada.profundidadeZ + beiral;
  const zc = (az0 + az1) / 2;
  const yr = y0 + entrada.altura;

  const id = entrada.id;
  const v = {
    a: id + '_vA',
    b: id + '_vB',
    c: id + '_vC',
    d: id + '_vD',
    r0: id + '_vR0',
    r1: id + '_vR1',
  };

  const vertices: Vertice[] = [
    { id: v.a, posicao: [ax0, y0, az0] },
    { id: v.b, posicao: [ax1, y0, az0] },
    { id: v.c, posicao: [ax1, y0, az1] },
    { id: v.d, posicao: [ax0, y0, az1] },
    { id: v.r0, posicao: [ax0, yr, zc] },
    { id: v.r1, posicao: [ax1, yr, zc] },
  ];

  const arestas: Aresta[] = [
    { id: id + '_a1', verticeA: v.a, verticeB: v.b },
    { id: id + '_a2', verticeA: v.b, verticeB: v.c },
    { id: id + '_a3', verticeA: v.c, verticeB: v.d },
    { id: id + '_a4', verticeA: v.d, verticeB: v.a },
    { id: id + '_a5', verticeA: v.a, verticeB: v.r0 },
    { id: id + '_a6', verticeA: v.b, verticeB: v.r1 },
    { id: id + '_a7', verticeA: v.c, verticeB: v.r1 },
    { id: id + '_a8', verticeA: v.d, verticeB: v.r0 },
    { id: id + '_a9', verticeA: v.r0, verticeB: v.r1 },
  ];

  const faces: Face[] = orientarParaFora(vertices, [
    { id: id + '_f_agua_frente', vertices: [v.a, v.b, v.r1, v.r0] },
    { id: id + '_f_agua_fundo', vertices: [v.d, v.c, v.r1, v.r0] },
    { id: id + '_f_empena_esq', vertices: [v.a, v.d, v.r0] },
    { id: id + '_f_empena_dir', vertices: [v.b, v.r1, v.c] },
    { id: id + '_f_base', vertices: [v.a, v.b, v.c, v.d] },
  ]);

  return {
    ok: true,
    solido: {
      id,
      nome: entrada.nome,
      vertices,
      arestas,
      faces,
      transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
    },
  };
}
