/**
 * Métricas para o hover inteligente (item 4).
 *
 * O tooltip mostra, para uma FACE: largura × altura, área em m² e a normal.
 * Para uma ARESTA: comprimento e ângulo em relação à horizontal.
 *
 * Puro: recebe pontos de mundo e devolve números. Quem monta o texto é a UI.
 */

import type { Vetor3 } from './schema';

const EPS = 1e-9;

export interface MetricasFace {
  /** Maior dimensão do bounding box da face. */
  largura: number;
  /** Menor dimensão do bounding box da face. */
  altura: number;
  area: number;
  normal: Vetor3;
}

/** Normal por Newell (robusto para polígonos não triviais). */
export function normalDaFace(pontos: readonly Vetor3[]): Vetor3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const norma = Math.hypot(nx, ny, nz);
  return norma < EPS ? [0, 0, 0] : [nx / norma, ny / norma, nz / norma];
}

/** Área do polígono projetada no plano da própria face (via norma de Newell). */
export function areaDaFace(pontos: readonly Vetor3[]): number {
  const normal = normalDaFace(pontos);
  if (Math.abs(normal[0]) + Math.abs(normal[1]) + Math.abs(normal[2]) < EPS) return 0;
  let soma = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    // componente do produto vetorial alinhada com a normal
    const cx = a[1] * b[2] - a[2] * b[1];
    const cy = a[2] * b[0] - a[0] * b[2];
    const cz = a[0] * b[1] - a[1] * b[0];
    soma += cx * normal[0] + cy * normal[1] + cz * normal[2];
  }
  return Math.abs(soma) / 2;
}

export function metricasFace(pontos: readonly Vetor3[]): MetricasFace {
  if (pontos.length < 3) return { largura: 0, altura: 0, area: 0, normal: [0, 0, 0] };

  const normal = normalDaFace(pontos);
  // dois eixos no plano da face
  const referencia: Vetor3 = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u: Vetor3 = [
    referencia[1] * normal[2] - referencia[2] * normal[1],
    referencia[2] * normal[0] - referencia[0] * normal[2],
    referencia[0] * normal[1] - referencia[1] * normal[0],
  ];
  const normaU = Math.hypot(u[0], u[1], u[2]);
  const ux: Vetor3 = normaU < EPS ? [1, 0, 0] : [u[0] / normaU, u[1] / normaU, u[2] / normaU];
  const vy: Vetor3 = [
    normal[1] * ux[2] - normal[2] * ux[1],
    normal[2] * ux[0] - normal[0] * ux[2],
    normal[0] * ux[1] - normal[1] * ux[0],
  ];

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of pontos) {
    const pu = p[0] * ux[0] + p[1] * ux[1] + p[2] * ux[2];
    const pv = p[0] * vy[0] + p[1] * vy[1] + p[2] * vy[2];
    if (pu < minU) minU = pu;
    if (pu > maxU) maxU = pu;
    if (pv < minV) minV = pv;
    if (pv > maxV) maxV = pv;
  }

  const du = maxU - minU;
  const dv = maxV - minV;
  return {
    largura: Math.max(du, dv),
    altura: Math.min(du, dv),
    area: areaDaFace(pontos),
    normal,
  };
}

export interface MetricasAresta {
  comprimento: number;
  /** Ângulo em graus em relação ao plano horizontal (0 = deitada, 90 = vertical). */
  anguloGraus: number;
}

export function metricasAresta(a: Vetor3, b: Vetor3): MetricasAresta {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const comprimento = Math.hypot(dx, dy, dz);
  if (comprimento < EPS) return { comprimento: 0, anguloGraus: 0 };
  const horizontal = Math.hypot(dx, dz);
  const angulo = (Math.atan2(Math.abs(dy), horizontal) * 180) / Math.PI;
  return { comprimento, anguloGraus: angulo };
}
