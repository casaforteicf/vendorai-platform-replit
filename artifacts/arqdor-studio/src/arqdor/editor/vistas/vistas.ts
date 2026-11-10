/**
 * Vistas do editor — registro e matemática de câmera.
 *
 * Cada vista é só: direção (do alvo para a câmera), `up`, distância e FOV. Puro e testável.
 *
 * NOTA DE PROJETO (declarada): as vistas técnicas usam FOV estreito ("teleobjetiva") para
 * aproximar projeção paralela sem trocar o tipo de câmera. Ortográfica de verdade exige uma
 * segunda câmera (troca no loop, raycaster e resize) — é a etapa 2.
 */

import type { Vetor3 } from '../modelador/schema';

export type IdVista =
  | 'perspectiva'
  | 'planta'
  | 'corte-longitudinal'
  | 'corte-transversal'
  | 'fachada-norte'
  | 'fachada-sul'
  | 'fachada-leste'
  | 'fachada-oeste'
  | 'implantacao'
  | 'isometrica'
  | 'cavaleira'
  | 'conica-1'
  | 'conica-2'
  | 'conica-3';

export type GrupoVista = 'livre' | 'tecnica' | 'axonometrica' | 'conica';

export interface ConfiguracaoVista {
  id: IdVista;
  rotulo: string;
  grupo: GrupoVista;
  /** Direção unitária do ALVO para a CÂMERA. */
  direcao: Vetor3;
  up: Vetor3;
  /** Distância = fator × raio do modelo. */
  fatorDistancia: number;
  /** FOV em graus: estreito ≈ paralela; largo = cônica. */
  fov: number;
  /** Projeção da vista: paralela (prancha) ou cônica. */
  projecao: 'perspectiva' | 'ortografica';
  /** Meia-altura do frustum ortográfico, em metros. */
  meioAltura?: number;
  /** Corte horizontal (planta baixa): plano em Y, em metros. */
  corteY?: number;
}

const NORMA = (v: Vetor3): Vetor3 => {
  const comprimento = Math.hypot(v[0], v[1], v[2]);
  return comprimento < 1e-9 ? [0, 0, 1] : [v[0] / comprimento, v[1] / comprimento, v[2] / comprimento];
};

export const VISTAS: readonly ConfiguracaoVista[] = [
  { id: 'perspectiva', rotulo: 'Perspectiva', grupo: 'livre', direcao: NORMA([1, 0.72, 1.2]), up: [0, 1, 0], fatorDistancia: 2.2, fov: 45, projecao: 'perspectiva' },

  // Técnicas — projeção PARALELA (prancha em escala)
  { id: 'planta', rotulo: 'Planta baixa (corte 1,50 m)', grupo: 'tecnica', direcao: [0, 1, 0], up: [0, 0, -1], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 14, corteY: 1.5 },
  { id: 'implantacao', rotulo: 'Planta de implantação', grupo: 'tecnica', direcao: [0, 1, 0], up: [0, 0, -1], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 30 },
  { id: 'corte-longitudinal', rotulo: 'Corte longitudinal', grupo: 'tecnica', direcao: [0, 0, 1], up: [0, 1, 0], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 10 },
  { id: 'corte-transversal', rotulo: 'Corte transversal', grupo: 'tecnica', direcao: [1, 0, 0], up: [0, 1, 0], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 10 },
  { id: 'fachada-norte', rotulo: 'Fachada norte', grupo: 'tecnica', direcao: [0, 0, -1], up: [0, 1, 0], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 10 },
  { id: 'fachada-sul', rotulo: 'Fachada sul', grupo: 'tecnica', direcao: [0, 0, 1], up: [0, 1, 0], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 10 },
  { id: 'fachada-leste', rotulo: 'Fachada leste', grupo: 'tecnica', direcao: [1, 0, 0], up: [0, 1, 0], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 10 },
  { id: 'fachada-oeste', rotulo: 'Fachada oeste', grupo: 'tecnica', direcao: [-1, 0, 0], up: [0, 1, 0], fatorDistancia: 3, fov: 4, projecao: 'ortografica', meioAltura: 10 },

  // Axonométricas — também paralelas
  { id: 'isometrica', rotulo: 'Isométrica', grupo: 'axonometrica', direcao: NORMA([1, 1, 1]), up: [0, 1, 0], fatorDistancia: 2.6, fov: 18, projecao: 'ortografica', meioAltura: 16 },
  { id: 'cavaleira', rotulo: 'Cavaleira (profundidade 45°)', grupo: 'axonometrica', direcao: NORMA([0.55, 0.35, 1]), up: [0, 1, 0], fatorDistancia: 2.8, fov: 20, projecao: 'ortografica', meioAltura: 16 },

  // Cônicas
  { id: 'conica-1', rotulo: 'Perspectiva 1 ponto de fuga', grupo: 'conica', direcao: [0, 0.25, 1], up: [0, 1, 0], fatorDistancia: 2.2, fov: 50, projecao: 'perspectiva' },
  { id: 'conica-2', rotulo: 'Perspectiva 2 pontos de fuga', grupo: 'conica', direcao: NORMA([1, 0.35, 1]), up: [0, 1, 0], fatorDistancia: 2.4, fov: 48, projecao: 'perspectiva' },
  { id: 'conica-3', rotulo: 'Perspectiva aérea (3 pontos)', grupo: 'conica', direcao: NORMA([0.8, 1.1, 1]), up: [0, 1, 0], fatorDistancia: 2.8, fov: 52, projecao: 'perspectiva' },
];

export function obterVista(id: IdVista): ConfiguracaoVista {
  return VISTAS.find((vista) => vista.id === id) ?? VISTAS[0];
}

export function vistasPorGrupo(): Array<{ grupo: GrupoVista; rotulo: string; vistas: ConfiguracaoVista[] }> {
  const rotulos: Record<GrupoVista, string> = {
    livre: 'Livre',
    tecnica: 'Vistas técnicas',
    axonometrica: 'Axonométricas',
    conica: 'Cônicas',
  };
  const ordem: GrupoVista[] = ['livre', 'tecnica', 'axonometrica', 'conica'];
  return ordem.map((grupo) => ({
    grupo,
    rotulo: rotulos[grupo],
    vistas: VISTAS.filter((vista) => vista.grupo === grupo),
  }));
}

export interface CameraDaVista {
  posicao: Vetor3;
  up: Vetor3;
  fov: number;
}

/** Posição da câmera = alvo + direção × distância. */
export function cameraDaVista(vista: ConfiguracaoVista, alvo: Vetor3, raio: number): CameraDaVista {
  const distancia = Math.max(0.5, raio * vista.fatorDistancia);
  const direcao = NORMA(vista.direcao);
  return {
    posicao: [alvo[0] + direcao[0] * distancia, alvo[1] + direcao[1] * distancia, alvo[2] + direcao[2] * distancia],
    up: vista.up,
    fov: vista.fov,
  };
}

/** Planta baixa: plano de corte horizontal em Y (metade positiva). */
export function planoDeCorte(vista: ConfiguracaoVista): { normal: Vetor3; constante: number } | null {
  if (vista.corteY === undefined) return null;
  return { normal: [0, -1, 0], constante: vista.corteY };
}
