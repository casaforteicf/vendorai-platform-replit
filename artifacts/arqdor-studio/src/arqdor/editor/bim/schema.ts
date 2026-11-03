/**
 * ARQDOR STUDIO 2.0 — BIM Core (contrato).
 *
 * Decisão E18: `porta` e `janela` continuam sendo TIPOS (Parte 29).
 * `esquadria` deixou de ser tipo e virou CATEGORIA — o vão contábil, o render e o
 * Bloco 10 continuam válidos.
 *
 * Decisão E11: furo de MEP é ABERTURA PARAMÉTRICA da parede, não booleana.
 *
 * Decisão E8: o móvel é dono do VÍNCULO, não do elemento. Excluir o móvel no Modelador
 * zera `modeladorSolidoId` (geometria estática permanece) — o `ElementoBim` NÃO é apagado,
 * porque orçamento e render dependem dele.
 */

export type TipoElemento =
  | 'parede'
  | 'porta'
  | 'janela'
  | 'laje'
  | 'mobiliario'
  | 'telhado'
  | 'escada';

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

/**
 * Mobiliário no BIM.
 *
 * E8: `modeladorSolidoId` é OPCIONAL porque a exclusão do móvel no Modelador só
 * desfaz o vínculo. Sem ele, o elemento continua existindo e renderizável pelas
 * `dimensoes` (geometria estática) — B10-10.
 */
export interface GeometriaMobiliario {
  modeladorSolidoId?: string;
  dimensoes: { largura: number; altura: number; profundidade: number };
  categoria?: string;
  /** D5: posicao em planta (m). Sem ela o movel nao pode ser derivado em 2D. */
  posicao?: [number, number];
  /** D5: rotacao em planta (graus), sentido anti-horario. */
  rotacaoGraus?: number;
}

export interface GeometriaTelhado {
  contorno: [number, number][];
  inclinacaoGraus: number;
}

/**
 * Escada RETA no BIM (decisão do dono, 2026-11-03).
 *
 * Mesma convenção das outras geometrias: `posicao` é o canto mínimo da projeção em planta.
 * O concreto é medido pelo prisma de degraus (é o volume real da escada do modelador), não
 * pela caixa envolvente — caixa superestima e é o erro clássico de orçamento de escada.
 *
 * `comprimento` é a soma dos pisos (projeção horizontal), não o desenvolvimento inclinado.
 */
export interface GeometriaEscada {
  posicao: [number, number];
  /** Largura em X. */
  largura: number;
  /** Projeção horizontal em Y (soma dos pisos). */
  comprimento: number;
  /** Altura a vencer (soma dos espelhos). */
  alturaTotal: number;
  numeroDegraus: number;
}

export type Geometria =
  | GeometriaParede
  | GeometriaPorta
  | GeometriaJanela
  | GeometriaLaje
  | GeometriaMobiliario
  | GeometriaTelhado
  | GeometriaEscada;

export interface ElementoBim {
  id: string;
  projetoId: string;
  tipo: TipoElemento;
  nivel: number;
  geometria: Geometria;
  propriedades: Record<string, unknown>;
  camadaId: string;
  /** D6: referencia o catálogo de materiais. Sem isto não há agrupamento de orçamento. */
  materialId?: string;
}

/**
 * Operações do BIM Core.
 * E11: `adicionar_abertura`/`remover_abertura` substituem a booleana em parede.
 * E8: excluir móvel NÃO gera `remover_elemento_bim`; gera
 *     `atualizar_elemento_bim` com `modeladorSolidoId` ausente.
 */
/** E11: furo como abertura paramétrica da parede. */
export interface OperacaoAdicionarAbertura {
  tipo: 'adicionar_abertura';
  elementoId: string;
  abertura: AberturaFuro;
}

export interface OperacaoRemoverAbertura {
  tipo: 'remover_abertura';
  elementoId: string;
  abertura: AberturaFuro;
}

/**
 * Operações do BIM Core.
 * E8: excluir móvel NÃO gera `remover_elemento_bim`; gera `atualizar_elemento_bim`
 *     com `modeladorSolidoId` ausente.
 */
export type OperacaoBIM =
  | { tipo: 'criar_elemento_bim'; elemento: ElementoBim }
  | { tipo: 'atualizar_elemento_bim'; antes: ElementoBim; depois: ElementoBim }
  | { tipo: 'remover_elemento_bim'; elemento: ElementoBim }
  | OperacaoAdicionarAbertura
  | OperacaoRemoverAbertura;