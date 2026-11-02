/**
 * ARQDOR STUDIO 2.0 — Modelador de móveis (contrato).
 *
 * E16: `avisos` saiu do documento. Diagnóstico de colisão é DERIVADO (determinístico)
 * da geometria — persistido ele envelhece e viaja entre usuários, violando a regra 9.
 * O documento guarda parâmetros; o diagnóstico é calculado no load e a cada regeneração.
 */

import type { Vetor3 } from '../modelador/schema';

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
  elementoBimId?: string;
  versao: number;
}

/** Resultado DERIVADO da validação — nunca persistido como parte do documento. */
export interface DiagnosticoMovel {
  movelId: string;
  /** Hash da geometria que gerou este diagnóstico (invalida o cache ao editar). */
  hashGeometria: string;
  calculadoEm: string;
  avisos: AvisoPainel[];
}

export type AvisoPainel =
  | { tipo: 'excede_dimensao'; painelId: string; campo: 'largura' | 'altura' | 'profundidade'; valor: number; limite: number }
  | { tipo: 'colisao'; painelA: string; painelB: string }
  | { tipo: 'ferragem_sem_painel'; ferragemId: string };