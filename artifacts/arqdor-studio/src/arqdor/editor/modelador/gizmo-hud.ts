/**
 * Readout do gizmo — transforma o arrasto em texto que o arquiteto lê.
 *
 * Puro de propósito: a cena three.js só entrega os números (posição/rotação/escala antes e
 * depois); toda a formatação e a escolha do eixo dominante são testáveis sem navegador.
 */

import { deltaEixo, eixoDominante } from './snap';
import type { Eixo } from './snap';
import type { Vetor3 } from './schema';

export type ModoArrasto = 'mover' | 'rotacionar' | 'escalar' | null;

export interface TransformacaoGizmo {
  posicao: Vetor3;
  rotacao: Vetor3;
  escala: Vetor3;
}

const ROTULO: Record<Eixo, string> = { x: 'X', y: 'Y', z: 'Z' };

function numero(valor: number, casas: number): string {
  const arredondado = Math.abs(valor) < 1e-9 ? 0 : valor;
  return arredondado.toFixed(casas).replace('.', ',');
}

function comSinal(valor: number, casas: number): string {
  const arredondado = Math.abs(valor) < 0.5 * Math.pow(10, -casas) ? 0 : valor;
  return (arredondado > 0 ? '+' : '') + numero(arredondado, casas);
}

/** "Mover · X +2,35 m · 2,35 m" — eixo dominante + distância real percorrida. */
export function textoMover(antes: Vetor3, depois: Vetor3): string {
  const eixo = eixoDominante(antes, depois);
  const distancia = Math.hypot(
    depois[0] - antes[0],
    depois[1] - antes[1],
    depois[2] - antes[2],
  );
  return 'Mover · ' + ROTULO[eixo] + ' ' + comSinal(deltaEixo(antes, depois, eixo), 2) +
    ' m · ' + numero(distancia, 2) + ' m';
}

/** "Rotacionar · Y +90,0°" */
export function textoRotacionar(antes: Vetor3, depois: Vetor3): string {
  const eixo = eixoDominante(antes, depois);
  const angulo = (deltaEixo(antes, depois, eixo) * 180) / Math.PI;
  return 'Rotacionar · ' + ROTULO[eixo] + ' ' + comSinal(angulo, 1) + '°';
}

/** "Escalar · X × 2,00" */
export function textoEscalar(antes: Vetor3, depois: Vetor3): string {
  const eixo = eixoDominante(antes, depois);
  const indice = eixo === 'x' ? 0 : eixo === 'y' ? 1 : 2;
  const base = Math.abs(antes[indice]) < 1e-9 ? 1 : antes[indice];
  const fator = depois[indice] / base;
  return 'Escalar · ' + ROTULO[eixo] + ' × ' + numero(fator, 2);
}

/** Texto do arrasto conforme o modo ativo; null quando não há gizmo ativo. */
export function textoDoArrasto(
  modo: ModoArrasto,
  antes: TransformacaoGizmo,
  depois: TransformacaoGizmo,
): string | null {
  if (modo === 'mover') return textoMover(antes.posicao, depois.posicao);
  if (modo === 'rotacionar') return textoRotacionar(antes.rotacao, depois.rotacao);
  if (modo === 'escalar') return textoEscalar(antes.escala, depois.escala);
  return null;
}
