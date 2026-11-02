/**
 * ARQDOR STUDIO 2.0 — domínio do modelador (contrato).
 *
 * Regra 1: Vetor3 é TUPLA, nunca objeto.
 * Regra 2: undo agrupado; o conteúdo de um passo é `PassoUndo`.
 * Regra 6: sem `any`.
 */

export type Vetor3 = [number, number, number];

export interface Plano {
  origem: Vetor3;
  normal: Vetor3;
  u: Vetor3;
  v: Vetor3;
}

export const PLANO_CHAO: Plano = {
  origem: [0, 0, 0],
  normal: [0, 1, 0],
  u: [1, 0, 0],
  v: [0, 0, 1],
};

export interface Vertice {
  id: string;
  posicao: Vetor3;
}

export interface Aresta {
  id: string;
  verticeA: string;
  verticeB: string;
}

/** Material por face: referencia o catálogo global, não copia valores. */
export interface MaterialFace {
  materialId: string;
  escala?: [number, number];
  rotacao?: number;
  offset?: [number, number];
}

/** Diferença máxima de normal para considerar duas faces coplanares (graus). */
export const TOLERANCIA_COPLANARIDADE_GRAUS = 0.5;

export interface Face {
  id: string;
  vertices: string[];
  material?: MaterialFace;
  /**
   * E10 (decidido): `mergeCoplanares` fica.
   * Regiões planas viram UMA face lógica; regiões com variação de normal viram triângulos
   * (e aí esta flag é true). Quem consome não pode assumir "sempre triangular" nem
   * "sempre quadrangular".
   */
  triangulada?: boolean;
}

export interface Transformacao {
  posicao: Vetor3;
  rotacao: Vetor3;
  escala: Vetor3;
}

export interface Solido {
  id: string;
  nome: string;
  vertices: Vertice[];
  arestas: Aresta[];
  faces: Face[];
  transformacao: Transformacao;
}

export type TipoBooleana = 'uniao' | 'diferenca' | 'intersecao';

/**
 * Booleana entre dois sólidos.
 *
 * E9 (decidido): o sólido B é CONSUMIDO — não permanece na cena.
 * E o resultado HERDA o id de A, de propósito: preserva referências externas
 * (`ElementoBim.geometria.modeladorSolidoId`, seleção, camada). Por isso A não
 * aparece em `removidos` — ele é substituído no lugar.
 *
 * Invariantes:
 *  - `depois.resultado.id === solidoA`
 *  - `removidos` = os sólidos que saem da cena além dessa substituição (hoje `[antes.solidoB]`)
 *  - undo: `depois.resultado` → `antes.solidoA`; reinserir `antes.solidoB`
 */
export interface OperacaoBooleana {
  tipo: 'aplicar_booleana';
  operacao: TipoBooleana;
  solidoA: string;
  solidoB: string;
  antes: { solidoA: Solido; solidoB: Solido };
  depois: { resultado: Solido; removidos: Solido[] };
}

/**
 * Resultado tipado de uma booleana (adotado da entrega v2 do DeepSeek).
 * Fecha o caminho de erro do motor: sem isso o chamador só tinha exceção.
 */
export type BooleanaErro =
  | { codigo: 'NAO_MANIFOLD'; solidoId: string; detalhe: string }
  | { codigo: 'WASM_NAO_CARREGADO' }
  | { codigo: 'OPERACAO_INVALIDA'; detalhe: string }
  | { codigo: 'TEMPO_EXCEDIDO'; ms: number; limite: number }
  | { codigo: 'LIMITE_TRIANGULOS'; total: number; limite: number }
  | { codigo: 'CANCELADO_PELO_USUARIO' };

export type BooleanaResultado =
  | { ok: true; solido: Solido; operacao: OperacaoBooleana }
  | { ok: false; erro: BooleanaErro };

export interface OperacaoMaterial {
  tipo: 'pintar_face';
  solidoId: string;
  faceIds: string[];
  /** Mesma ordem de `faceIds`. */
  antes: (MaterialFace | undefined)[];
  depois: MaterialFace | undefined;
}

export interface OperacaoImportacao {
  tipo: 'importar_solidos';
  depois: Solido[];
}

/** União de operações do modelador. Sem membro "catch-all": cada op tem `tipo` literal. */
export type OperacaoModelador =
  | { tipo: 'criar_vertice'; vertice: Vertice }
  | { tipo: 'criar_aresta'; aresta: Aresta }
  | { tipo: 'criar_face'; face: Face }
  | { tipo: 'criar_solido'; solido: Solido }
  | { tipo: 'atualizar_solido'; antes: Solido; depois: Solido }
  | { tipo: 'adicionar_vertices'; solidoId: string; vertices: Vertice[] }
  | { tipo: 'adicionar_arestas'; solidoId: string; arestas: Aresta[] }
  | { tipo: 'adicionar_faces'; solidoId: string; faces: Face[] }
  | { tipo: 'remover_faces'; solidoId: string; faces: Face[] }
  | { tipo: 'remover_vertices'; solidoId: string; vertices: Vertice[] }
  | { tipo: 'remover_solido'; solido: Solido }
  | OperacaoBooleana
  | OperacaoMaterial
  | OperacaoImportacao;

/* PassoUndo vive em transacao.ts: o passo pode carregar operações de vários escopos. */