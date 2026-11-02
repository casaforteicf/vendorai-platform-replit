/**
 * ARQDOR STUDIO 2.0 — histórico (contrato).
 *
 * Decisão E7 (aplicada): histórico ÚNICO e GLOBAL, tipo Transaction Log.
 * Um furo no MEP e a abertura na parede são UM passo atômico — desfazer volta os dois.
 *
 * Correção E5: `Passo` é união discriminada por `escopo`; o histórico não é mais
 * `PassoUndo[]` (que só aceitava operações do modelador).
 *
 * Correção E8: o passo cross-store passou a carregar operações de qualquer escopo —
 * excluir um móvel mexe em `moveis` (documento + sólidos) e em `bim` (vínculo).
 */

import type { OperacaoModelador } from './modelador/schema';
import type { OperacaoBIM } from './bim/schema';
import type { OperacaoMEP } from './mep/schema';
import type { OperacaoMovel } from './moveis/schema';

export type EscopoStore = 'modelador' | 'bim' | 'mep' | 'moveis';

export interface OperacoesPorEscopo {
  modelador?: OperacaoModelador[];
  bim?: OperacaoBIM[];
  mep?: OperacaoMEP[];
  moveis?: OperacaoMovel[];
}

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

/**
 * Passo atômico que atravessa stores.
 *
 * `ordem` é explícita porque "BIM primeiro" não é sempre correto: excluir um móvel
 * precisa remover sólidos antes de zerar o vínculo (senão o BIM aponta para sólido
 * inexistente durante a operação). A reversão percorre esta lista ao contrário.
 */
export interface PassoCrossStore {
  escopo: 'cross';
  id: string;
  operacoes: OperacoesPorEscopo;
  ordem: EscopoStore[];
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
 * e nesse caso o chamador reverte o que já aplicou (sem estado parcial).
 */
export type AplicarPasso = (passo: Passo, direcao: Direcao) => boolean;