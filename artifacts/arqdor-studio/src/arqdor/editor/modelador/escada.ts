/**
 * Escada RETA — geometria pura.
 *
 * Perfil de degraus (riser + tread) extrudado na largura: prisma ao longo de X. Cada degrau
 * sai com piso e espelho reais, e a escada é um sólido FECHADO (laterais em polígono + uma
 * face por aresta do perfil), então booleana e BIM funcionam sobre ela.
 *
 * `posicao` é o canto mínimo do pé da escada; a escada sobe em +Y e avança em +Z.
 */

import type { Aresta, Face, Solido, Vetor3, Vertice } from './schema';
import { orientarParaFora } from './orientacao';

export interface EntradaEscada {
  id: string;
  nome: string;
  posicao: Vetor3;
  /** Largura ao longo de X. */
  largura: number;
  /** Altura total a vencer. */
  alturaTotal: number;
  /** Profundidade do piso do degrau (run), em Z. */
  profundidadeDegrau: number;
  /** Número de degraus. Sem valor, usa espelho de 18 cm. */
  numeroDegraus?: number;
}

export type ErroEscada = {
  codigo: 'MEDIDA_INVALIDA';
  campo: 'largura' | 'alturaTotal' | 'profundidadeDegrau' | 'numeroDegraus';
  valor: number;
};

export type ResultadoEscada = { ok: true; solido: Solido } | { ok: false; erro: ErroEscada };

const MINIMO = 0.05;
export const ESPELHO_PADRAO = 0.18;

export function criarEscadaReta(entrada: EntradaEscada): ResultadoEscada {
  const medidas = {
    largura: entrada.largura,
    alturaTotal: entrada.alturaTotal,
    profundidadeDegrau: entrada.profundidadeDegrau,
  };

  for (const campo of ['largura', 'alturaTotal', 'profundidadeDegrau'] as const) {
    const valor = medidas[campo];
    if (!Number.isFinite(valor) || valor < MINIMO) {
      return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo, valor } };
    }
  }

  const degraus = entrada.numeroDegraus ?? Math.max(1, Math.ceil(entrada.alturaTotal / ESPELHO_PADRAO));
  if (!Number.isInteger(degraus) || degraus < 1) {
    return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: 'numeroDegraus', valor: degraus } };
  }

  const run = entrada.profundidadeDegrau;
  const rise = entrada.alturaTotal / degraus;
  const [x0, y0, z0] = entrada.posicao;
  const x1 = x0 + entrada.largura;

  // Perfil (z, y): base em (0,0), sobe em degraus e desce a prumo no fim.
  const perfil: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < degraus; i += 1) {
    perfil.push([i * run, (i + 1) * rise]);
    perfil.push([(i + 1) * run, (i + 1) * rise]);
  }
  perfil.push([degraus * run, 0]);

  const id = entrada.id;
  const total = perfil.length;
  const ladoA: string[] = [];
  const ladoB: string[] = [];
  const vertices: Vertice[] = [];
  for (let k = 0; k < total; k += 1) {
    const [pz, py] = perfil[k];
    const a = id + '_v' + String(k) + 'a';
    const b = id + '_v' + String(k) + 'b';
    ladoA.push(a);
    ladoB.push(b);
    vertices.push({ id: a, posicao: [x0, y0 + py, z0 + pz] });
    vertices.push({ id: b, posicao: [x1, y0 + py, z0 + pz] });
  }

  const arestas: Aresta[] = [];
  for (let k = 0; k < total; k += 1) {
    const proximo = (k + 1) % total;
    arestas.push({ id: id + '_aA' + String(k), verticeA: ladoA[k], verticeB: ladoA[proximo] });
    arestas.push({ id: id + '_aB' + String(k), verticeA: ladoB[k], verticeB: ladoB[proximo] });
    arestas.push({ id: id + '_aL' + String(k), verticeA: ladoA[k], verticeB: ladoB[k] });
  }

  const faces: Face[] = ladoA.map((_, k) => {
    const proximo = (k + 1) % total;
    return {
      id: id + '_f_lado' + String(k),
      vertices: [ladoA[k], ladoA[proximo], ladoB[proximo], ladoB[k]],
    };
  });
  faces.push({ id: id + '_f_perfilA', vertices: ladoA });
  faces.push({ id: id + '_f_perfilB', vertices: [...ladoB].reverse() });

  return {
    ok: true,
    solido: {
      id,
      nome: entrada.nome,
      vertices,
      arestas,
      faces: orientarParaFora(vertices, faces),
      transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
    },
  };
}
