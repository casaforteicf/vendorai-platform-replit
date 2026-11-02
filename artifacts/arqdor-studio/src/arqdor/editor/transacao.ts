/**
 * ARQDOR STUDIO 2.0 — histórico (contrato).
 *
 * Decisão E7 (aplicada): histórico ÚNICO e GLOBAL, tipo Transaction Log.
 * Um furo no MEP e a abertura na parede são UM passo atômico — desfazer volta os dois.
 *
 * Correção E5: `Passo` é união discriminada por `escopo`; o histórico não é mais
 * `PassoUndo[]` (que só aceitava operações do modelador). Quem consome o histórico
 * (store, UI, atalhos) passa a tratar as três formas.
 */

import type { OperacaoModelador } from './modelador/schema';
import type { OperacaoMEP } from './mep/schema';
import type { OperacaoBIM } from './bim/schema';

export interface PassoModelador {
  escopo: 'modelador';
  id: string;
  operacoes: OperacaoModelador[];
}

export interface PassoMEP {
  escopo: 'mep';
  id: string;
  operacoes: OperacaoMEP[];
}

/** Passo atômico que atravessa store: aplica/reverte BIM e MEP juntos, em ordem. */
export interface PassoCrossStore {
  escopo: 'cross';
  id: string;
  operacoesBIM: OperacaoBIM[];
  operacoesMEP: OperacaoMEP[];
}

export type Passo = PassoModelador | PassoMEP | PassoCrossStore;

/**
 * Log de transações. `indice` aponta para o próximo passo a ser refeito.
 * Invariante: `passos.length === indice` quando não há redo pendente.
 */
export interface Historico {
  passos: Passo[];
  indice: number;
  /** Teto de passos mantidos em memória (undo não é persistente — D8). */
  limite: number;
}

export type Direcao = 'direta' | 'reversa';

/**
 * Aplica um passo. `reversa` precisa ser exatamente o inverso de `direta`
 * (snapshots completos garantem isso). Retorna false se qualquer operação falhar —
 * e nesse caso o chamador deve reverter o que já aplicou (sem estado parcial).
 */
export type AplicarPasso = (passo: Passo, direcao: Direcao) => boolean;