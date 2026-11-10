/**
 * ARQDOR STUDIO 2.0 — Modelador de móveis (contrato).
 *
 * E16: `avisos` saiu do documento. Diagnóstico de colisão é DERIVADO (determinístico)
 * da geometria — persistido ele envelhece e viaja entre usuários, violando a regra 9.
 *
 * E8 (decidido): o móvel é dono do VÍNCULO, não do elemento BIM.
 * Excluir o móvel remove sólidos + documento do móvel; o `ElementoBim` permanece e o
 * vínculo é zerado no mesmo passo (histórico de orçamento/render não se perde).
 */

import type { Solido, Vetor3 } from '../modelador/schema';

export type MovelTipo =
  | 'armario'
  | 'mesa'
  | 'cadeira'
  | 'estante'
  | 'balcao'
  | 'custom';

export type PainelPapel =
  | 'lateral_esq'
  | 'lateral_dir'
  | 'topo'
  | 'fundo'
  | 'prateleira'
  | 'porta'
  | 'frente_gaveta'
  | 'traseira'
  | 'divisoria';

export interface PainelMovel {
  id: string;
  papel: PainelPapel;
  offset: Vetor3;
  dimensoes: { largura: number; altura: number; espessura: number };
  ferragemIds: string[];
  materialId?: string;
}

export type FerragemTipo =
  | 'dobradica'
  | 'corredica'
  | 'parafuso'
  | 'puxador'
  | 'pe'
  | 'sapata';

export interface Ferragem {
  id: string;
  tipo: FerragemTipo;
  posicao: Vetor3;
  painelA?: string;
  painelB?: string;
  quantidade: number;
  especificacao?: string;
}

/** Documento do móvel: parâmetros, não geometria nem diagnóstico. */
export interface MovelParametrico {
  id: string;
  nome: string;
  tipo: MovelTipo;
  dimensoes: { largura: number; altura: number; profundidade: number };
  espessuraChapa: number;
  materialChapaId: string;
  paineis: PainelMovel[];
  ferragens: Ferragem[];
  solidoIds: string[];
  /** Ausente quando não há vínculo com o BIM (permitido — D10-2). */
  elementoBimId?: string;
  versao: number;
}

/** Folga mínima para considerar dois painéis em colisão (metros). */
export const TOLERANCIA_COLISAO_M = 0.001;

export type AvisoPainel =
  | {
      tipo: 'excede_dimensao';
      painelId: string;
      campo: 'largura' | 'altura' | 'profundidade';
      valor: number;
      limite: number;
    }
  | { tipo: 'colisao'; painelA: string; painelB: string }
  | { tipo: 'ferragem_sem_painel'; ferragemId: string };

/** Resultado DERIVADO da validação — nunca persistido como parte do documento. */
export interface DiagnosticoMovel {
  movelId: string;
  /** Hash dos parâmetros que geraram este diagnóstico (invalida o cache ao editar). */
  hashParametros: string;
  /** ISO 8601. */
  calculadoEm: string;
  avisos: AvisoPainel[];
}

/** Contrato do cálculo: puro, determinístico, sem efeito colateral. */
export type CalcularDiagnosticoMovel = (movel: MovelParametrico) => DiagnosticoMovel;

/**
 * Operações do móvel.
 * `remover_movel` NÃO apaga o ElementoBim: apenas devolve os sólidos e o documento.
 * Quem zera o vínculo é uma `OperacaoBIM.atualizar_elemento_bim` no mesmo PassoCrossStore,
 * garantindo atomicidade (undo devolve móvel E vínculo juntos).
 */
export type OperacaoMovel =
  | { tipo: 'criar_movel'; movel: MovelParametrico; solidos: Solido[] }
  | {
      tipo: 'atualizar_movel';
      antes: MovelParametrico;
      depois: MovelParametrico;
      solidosAntes: Solido[];
      solidosDepois: Solido[];
    }
  | { tipo: 'remover_movel'; movel: MovelParametrico; solidos: Solido[] };