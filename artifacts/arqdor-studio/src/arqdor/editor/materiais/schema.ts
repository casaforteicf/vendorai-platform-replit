/**
 * Materiais — contrato (M1).
 *
 * Material é dado de ENGENHARIA: preço, unidade e fonte. A aparência (`pbr`) existe só para o
 * render e nunca entra no orçamento — misturar as duas coisas é o caminho clássico para o
 * quantitativo mentir.
 */

import type { Categoria, Unidade } from '../orcamento/quantitativos';

export type FontePreco = 'SINAPI' | 'PROPRIO' | 'COTACAO';

export interface Material {
  id: string;
  nome: string;
  categoria: Categoria;
  unidade: Unidade;
  /** Preço unitário na unidade do material. 0 = ainda sem preço (não quebra o orçamento). */
  precoUnitario: number;
  /** De onde veio o preço vigente: base SINAPI, tabela própria ou resposta de fornecedor. */
  fontePreco: FontePreco;
  /** Preço da base, para a banda de sanidade 0,5×–3× (D6). */
  precoReferencia?: number;
  codigoPraca?: string;
  /** Fator de perda do material; precede o da categoria (D6). */
  perda?: number;
  /** Aparência para o render — o orçamento NUNCA lê isto. */
  pbr?: { cor: string; rugosidade: number; metalico: number; texturaId?: string };
  atualizadoEm?: string;
}

/** Fallback: nunca lança, nunca deixa item fora do orçamento. */
export const MATERIAL_INDEFINIDO: Material = {
  id: 'MAT-INDEFINIDO',
  nome: 'Material não especificado',
  categoria: 'acabamento',
  unidade: 'm2',
  precoUnitario: 0,
  fontePreco: 'PROPRIO',
};

/** Base inicial: valores de referência de obra (SINAPI-like), não cotação. */
export const CATALOGO_PADRAO: readonly Material[] = [
  {
    id: 'MAT-ALV-BLOCO',
    nome: 'Alvenaria — bloco cerâmico 14 cm',
    categoria: 'alvenaria',
    unidade: 'm2',
    precoUnitario: 45.9,
    precoReferencia: 45.9,
    fontePreco: 'SINAPI',
    perda: 1.05,
    pbr: { cor: '#d9d2c5', rugosidade: 0.9, metalico: 0 },
  },
  {
    id: 'MAT-REB-MASSA',
    nome: 'Reboco — massa única',
    categoria: 'acabamento',
    unidade: 'm2',
    precoUnitario: 28.5,
    precoReferencia: 28.5,
    fontePreco: 'SINAPI',
    pbr: { cor: '#efece6', rugosidade: 0.95, metalico: 0 },
  },
  {
    id: 'MAT-PISO-PORC',
    nome: 'Piso — porcelanato acetinado',
    categoria: 'acabamento',
    unidade: 'm2',
    precoUnitario: 89,
    precoReferencia: 89,
    fontePreco: 'PROPRIO',
    perda: 1.1,
    pbr: { cor: '#cfc9c0', rugosidade: 0.35, metalico: 0 },
  },
  {
    id: 'MAT-LAJ-CONC',
    nome: 'Laje — concreto usinado fck 25',
    categoria: 'estrutura',
    unidade: 'm3',
    precoUnitario: 620,
    precoReferencia: 620,
    fontePreco: 'SINAPI',
    perda: 1.03,
    pbr: { cor: '#b9b9b9', rugosidade: 0.88, metalico: 0 },
  },
  {
    id: 'MAT-TELHA-CER',
    nome: 'Cobertura — telha cerâmica',
    categoria: 'cobertura',
    unidade: 'm2',
    precoUnitario: 58,
    precoReferencia: 58,
    fontePreco: 'SINAPI',
    perda: 1.08,
    pbr: { cor: '#a9532f', rugosidade: 0.8, metalico: 0 },
  },
  {
    id: 'MAT-PORTA-MAD',
    nome: 'Porta — madeira semipronta',
    categoria: 'esquadria',
    unidade: 'un',
    precoUnitario: 980,
    precoReferencia: 980,
    fontePreco: 'PROPRIO',
    pbr: { cor: '#8a5a3b', rugosidade: 0.7, metalico: 0 },
  },
];
