/**
 * ARQDOR STUDIO 2.0 — BIM Core (contrato).
 *
 * Decisão E18: `porta` e `janela` continuam sendo TIPOS (Parte 29).
 * `esquadria` deixou de ser tipo e virou CATEGORIA de porta/janela — assim o vão
 * contábil, o render e o Bloco 10 não quebram.
 *
 * Decisão E11: furo de MEP é ABERTURA PARAMÉTRICA da parede, não booleana.
 * A parede continua paramétrica; a geometria do furo é derivada e o orçamento desconta.
 */

export type TipoElemento =
  | 'parede'
  | 'porta'
  | 'janela'
  | 'laje'
  | 'mobiliario'
  | 'telhado';

export type CategoriaEsquadria =
  | 'giro'
  | 'correr'
  | 'pivotante'
  | 'basculante'
  | 'maxim_ar'
  | 'fixa';

/** Abertura circular na parede, originada do MEP. Geometria derivada, não malha. */
export interface AberturaFuro {
  id: string;
  tipo: 'furo';
  /** Centro em coordenadas LOCAIS da parede: distância ao longo do eixo. */
  offset: number;
  /** Altura do centro em relação ao piso. */
  altura: number;
  diametro: number;
  /** Rastreabilidade: qual elemento MEP gerou o furo. */
  elementoMepId: string;
}

export interface GeometriaParede {
  ponto_a: [number, number];
  ponto_b: [number, number];
  altura: number;
  espessura: number;
  /** Furos de MEP. Derivados no `derivar3d`, descontados no quantitativo. */
  aberturas?: AberturaFuro[];
}

export interface GeometriaPorta {
  parede_id: string;
  offset: number;
  largura: number;
  altura: number;
  categoria?: CategoriaEsquadria;
}

export interface GeometriaJanela {
  parede_id: string;
  offset: number;
  largura: number;
  altura: number;
  peitoril: number;
  categoria?: CategoriaEsquadria;
}

export interface GeometriaLaje {
  contorno: [number, number][];
  espessura: number;
}

/** Mobiliário do modelador referenciado por id (fonte: `arch_modelador_solidos`). */
export interface GeometriaMobiliario {
  modeladorSolidoId: string;
  dimensoes: { largura: number; altura: number; profundidade: number };
}

export interface GeometriaTelhado {
  contorno: [number, number][];
  inclinacaoGraus: number;
}

export type Geometria =
  | GeometriaParede
  | GeometriaPorta
  | GeometriaJanela
  | GeometriaLaje
  | GeometriaMobiliario
  | GeometriaTelhado;

export interface ElementoBim {
  id: string;
  projetoId: string;
  tipo: TipoElemento;
  nivel: number;
  geometria: Geometria;
  propriedades: Record<string, unknown>;
  camadaId: string;
}

/**
 * Operações do BIM Core.
 * E11: `adicionar_abertura`/`remover_abertura` substituem a booleana em parede.
 * Toda op carrega snapshot para o undo (padrão do projeto).
 */
export type OperacaoBIM =
  | { tipo: 'criar_elemento_bim'; elemento: ElementoBim }
  | { tipo: 'atualizar_elemento_bim'; antes: ElementoBim; depois: ElementoBim }
  | { tipo: 'remover_elemento_bim'; elemento: ElementoBim }
  | { tipo: 'adicionar_abertura'; elementoId: string; abertura: AberturaFuro }
  | { tipo: 'remover_abertura'; elementoId: string; abertura: AberturaFuro };