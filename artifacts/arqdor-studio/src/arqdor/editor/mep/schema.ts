/**
 * ARQDOR STUDIO 2.0 — MEP (contrato).
 *
 * E11 (decidido): o furo NÃO é operação de MEP nem booleana.
 * `criar_furo` foi removido e virou composição:
 *   OperacaoBIM.adicionar_abertura + OperacaoMEP.criar_elemento_mep → um PassoCrossStore.
 *
 * E12 (decidido): roteamento é A* 2D POR CAMADA, num plano de corte a altura fixa.
 * Grid 3D de 0,10 m numa casa 20×20×5 m seria 2 milhões de células por consulta.
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

// ---------- E12: roteamento 2D por camada ----------

export interface OpcoesRoteamento {
  /** Plano de corte 2D da camada, em metros (elétrica 1,20 · hidráulica 0,60 …). */
  alturaPlanoM: number;
  /** Lado da célula do grid. 0,10 m ⇒ 40 mil células numa casa 20×20 m. */
  passoGradeM: number;
  /** Custo relativo de virar 90° (evita "escadinha"). */
  custoCurva: number;
  /** Custo de sair do plano (passagens verticais). */
  custoInclinacao: number;
  /** Folga lateral em múltiplos do diâmetro. */
  folgaDiametro: number;
  /** Teto de segurança de células expandidas — estourar retorna null, não trava a aba. */
  maxCelulas: number;
}

export const ROTEAMENTO_PADRAO: OpcoesRoteamento = {
  alturaPlanoM: 1.2,
  passoGradeM: 0.1,
  custoCurva: 5,
  custoInclinacao: 10,
  folgaDiametro: 2,
  maxCelulas: 250_000,
};

export interface ResultadoRoteamento {
  /** Waypoints em coordenadas de mundo, já suavizados (colineares removidos). */
  caminho: Vetor3[];
  celulasVisitadas: number;
  obstaculosConsiderados: number;
}

/** Retorna null quando não há rota viável (UI mostra "sem rota") ou estoura o teto. */
export type RoteadorTubo = (entrada: {
  de: Vetor3;
  para: Vetor3;
  diametroMm: number;
  camada: CamadaMEP;
  opcoes: OpcoesRoteamento;
}) => ResultadoRoteamento | null;