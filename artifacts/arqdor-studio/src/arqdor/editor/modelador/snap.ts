/**
 * ARQDOR STUDIO 2.0 — snap/inferência (contrato).
 *
 * Correções aplicadas:
 *  - E1: existe referência de INTERSEÇÃO (o rascunho não tinha como representá-la).
 *  - E2: `calcularSnap` pode devolver `null` (B6-4: sem candidato, cai na grade).
 *  - Extra: `tipo` e `referencia` são correlacionados — um snap de interseção
 *    NÃO compila com referência de vértice.
 *  - Regra 9: `cor` saiu do domínio; a cor é derivada do `tipo` na camada de UI.
 */

import type { Plano, Vetor3 } from './schema';

export type SnapTipo =
  | 'grade'
  | 'vertice'
  | 'aresta_ponto'
  | 'face_ponto'
  | 'interseccao'
  | 'eixo_x'
  | 'eixo_y'
  | 'eixo_z';

/** Referência por tipo de snap. */
export interface ReferenciaSnap {
  grade: Record<string, never>;
  vertice: { solidoId: string; verticeId: string };
  aresta_ponto: { solidoId: string; arestaId: string; t: number };
  face_ponto: { solidoId: string; faceId: string; u: number; v: number };
  interseccao: {
    solidoIdA: string;
    arestaIdA: string;
    solidoIdB: string;
    arestaIdB: string;
  };
  eixo_x: { eixo: 'x' };
  eixo_y: { eixo: 'y' };
  eixo_z: { eixo: 'z' };
}

/** União discriminada: `tipo` decide qual `referencia` é válida. */
export type SnapResultado = {
  [K in SnapTipo]: {
    tipo: K;
    posicao: Vetor3;
    referencia: ReferenciaSnap[K];
    prioridade: number;
    /** Distância em PIXELS de tela — ranqueamento independe do zoom. */
    distanciaTela: number;
  };
}[SnapTipo];

export const PRIORIDADE_SNAP: Record<SnapTipo, number> = {
  vertice: 100,
  interseccao: 90,
  aresta_ponto: 70,
  face_ponto: 50,
  eixo_x: 30,
  eixo_y: 30,
  eixo_z: 30,
  grade: 10,
};

export const RAIO_SNAP_PX = 12;

export type ModoGizmo = 'mover' | 'rotacionar' | 'escalar' | null;

/**
 * Contrato de `calcularSnap`.
 * `TRaio`/`TCamera` são injetados (three é usado só na borda) para o domínio não depender da lib.
 * Retorna `null` quando não há candidato ou quando o gizmo está ativo (C13).
 */
export type CalcularSnap = <TRaio, TCamera>(entrada: {
  raio: TRaio;
  camera: TCamera;
  planoAlvo: Plano | null;
  modoGizmo: ModoGizmo;
}) => SnapResultado | null;
/* ------------------------------------------------------------------ */
/* Implementação (Bloco 6)                                             */
/* ------------------------------------------------------------------ */

export interface CandidatoVertice {
  tipo: 'vertice';
  solidoId: string;
  verticeId: string;
  posicao: Vetor3;
}

export interface CandidatoAresta {
  tipo: 'aresta_ponto';
  solidoId: string;
  arestaId: string;
  a: Vetor3;
  b: Vetor3;
}

export type CandidatoSnap = CandidatoVertice | CandidatoAresta;

export interface EntradaSnap {
  ponteiro: { x: number; y: number };
  projetar: (ponto: Vetor3) => { x: number; y: number } | null;
  candidatos: readonly CandidatoSnap[];
  grade?: Vetor3;
  raioPx?: number;
}

function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pontoSegmento(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distancia: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 < 1e-9) return { distancia: distancia(p, a), t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2));
  return { distancia: distancia(p, { x: a.x + dx * t, y: a.y + dy * t }), t };
}

function interpolar(a: Vetor3, b: Vetor3, t: number): Vetor3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Melhor snap: maior PRIORIDADE; empate vai para o mais perto na tela. */
export function calcularSnap(entrada: EntradaSnap): SnapResultado | null {
  const raio = entrada.raioPx ?? RAIO_SNAP_PX;
  let melhor: SnapResultado | null = null;

  const considerar = (candidato: SnapResultado): void => {
    if (candidato.distanciaTela > raio) return;
    if (melhor === null || candidato.prioridade > melhor.prioridade) {
      melhor = candidato;
      return;
    }
    if (candidato.prioridade === melhor.prioridade && candidato.distanciaTela < melhor.distanciaTela) {
      melhor = candidato;
    }
  };

  for (const item of entrada.candidatos) {
    if (item.tipo === 'vertice') {
      const tela = entrada.projetar(item.posicao);
      if (tela === null) continue;
      considerar({
        tipo: 'vertice',
        posicao: item.posicao,
        referencia: { solidoId: item.solidoId, verticeId: item.verticeId },
        prioridade: PRIORIDADE_SNAP.vertice,
        distanciaTela: distancia(entrada.ponteiro, tela),
      });
      continue;
    }

    const telaA = entrada.projetar(item.a);
    const telaB = entrada.projetar(item.b);
    if (telaA === null || telaB === null) continue;
    const proximo = pontoSegmento(entrada.ponteiro, telaA, telaB);
    considerar({
      tipo: 'aresta_ponto',
      posicao: interpolar(item.a, item.b, proximo.t),
      referencia: { solidoId: item.solidoId, arestaId: item.arestaId, t: proximo.t },
      prioridade: PRIORIDADE_SNAP.aresta_ponto,
      distanciaTela: proximo.distancia,
    });
  }

  if (melhor === null && entrada.grade !== undefined) {
    return { tipo: 'grade', posicao: entrada.grade, referencia: {}, prioridade: PRIORIDADE_SNAP.grade, distanciaTela: 0 };
  }

  return melhor;
}