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