/**
 * ARQDOR STUDIO 2.0 — MEP (contrato).
 *
 * Decisão E11 (aplicada): o furo NÃO é operação de MEP nem booleana.
 * `criar_furo` foi removido e virou composição:
 *   OperacaoBIM.adicionar_abertura + OperacaoMEP.criar_elemento_mep  → um PassoCrossStore.
 *
 * E15 (sub-item): `louca` sem cedilha — identificador de domínio entra em JSONB, query
 * string e URL; acento quebra filtro/encoding.
 */

import type { Vetor3 } from '../modelador/schema';

export type ElementoMEPTipo =
  | 'tomada'
  | 'interruptor'
  | 'ponto_luz'
  | 'quadro_distribuicao'
  | 'tubo_agua_fria'
  | 'tubo_agua_quente'
  | 'tubo_esgoto'
  | 'tubo_gas'
  | 'registro'
  | 'louca'
  | 'difusor_ar'
  | 'condensadora'
  | 'conduite'
  | 'caixa_passe';

export type CamadaMEP = 'eletrica' | 'hidraulica' | 'gas' | 'hvac' | 'esgoto';

export interface ElementoMEP {
  id: string;
  tipo: ElementoMEPTipo;
  /** Polyline (tubos/conduites) ou ponto único (tomadas, luminárias). */
  caminho: Vetor3[];
  paredeId?: string;
  lajeId?: string;
  ambienteId?: string;
  diametroMm?: number;
  bitolaMm2?: number;
  alturaM?: number;
  circuitoId?: string;
  camada: CamadaMEP;
}

export type OperacaoMEP =
  | { tipo: 'criar_elemento_mep'; elemento: ElementoMEP }
  | { tipo: 'atualizar_elemento_mep'; antes: ElementoMEP; depois: ElementoMEP }
  | { tipo: 'remover_elemento_mep'; elemento: ElementoMEP };

/** E6: passo de undo próprio do MEP — não é `OperacaoModelador[]`. */
export type PassoUndoMEP = OperacaoMEP[];