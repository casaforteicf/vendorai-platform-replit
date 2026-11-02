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

export interface Face {
  id: string;
  vertices: string[];
  material?: MaterialFace;
  /** Marcada quando a face veio de triangulação (booleana/import GLB). */
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
 * Booleana.
 *
 * Correção aplicada: `removidos` carrega o SNAPSHOT completo dos sólidos consumidos,
 * nunca apenas ids — undo não reconstrói geometria a partir de id.
 * `antes` existe para o redo poder recalcular sem reprocessar o motor.
 */
export interface OperacaoBooleana {
  tipo: 'aplicar_booleana';
  operacao: TipoBooleana;
  solidoA: string;
  solidoB: string;
  antes: { solidoA: Solido; solidoB: Solido };
  depois: { resultado: Solido; removidos: Solido[] };
}

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

/** Conteúdo de um passo de undo do modelador (alias histórico da Parte 29). */
export type PassoUndo = OperacaoModelador[];