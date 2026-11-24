/**
 * Álgebra vetorial e geometria de apoio do modelador.
 * Puro, sem dependência de lib 3D — three entra só nos viewports.
 */

import type { Plano, Vetor3 } from './schema';

export const EPS = 1e-9;

export const ORIGEM: Vetor3 = [0, 0, 0];

export const dot = (a: Vetor3, b: Vetor3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const sub = (a: Vetor3, b: Vetor3): Vetor3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const add = (a: Vetor3, b: Vetor3): Vetor3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const scale = (a: Vetor3, k: number): Vetor3 => [a[0] * k, a[1] * k, a[2] * k];

export const cross = (a: Vetor3, b: Vetor3): Vetor3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const length = (a: Vetor3): number => Math.hypot(a[0], a[1], a[2]);

export const distancia = (a: Vetor3, b: Vetor3): number => length(sub(a, b));

export function normalize(a: Vetor3): Vetor3 {
  const l = length(a);
  if (l < EPS) return [0, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Aproxima para a grade (padrão 5 cm). */
export function snapGrade(ponto: Vetor3, passo = 0.05): Vetor3 {
  const s = (n: number): number => Math.round(n / passo) * passo;
  return [s(ponto[0]), s(ponto[1]), s(ponto[2])];
}

/** Invariante 7: chave de aresta usa \u0000 e é simétrica. */
export function chaveAresta(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Projeta um ponto no plano. */
export function projetarEmPlano(p: Vetor3, plano: Plano): Vetor3 {
  const n = normalize(plano.normal);
  const d = dot(sub(p, plano.origem), n);
  return sub(p, scale(n, d));
}

/** Coordenadas locais do plano (u, v). */
export function paraEspacoPlano(p: Vetor3, plano: Plano): [number, number] {
  const rel = sub(p, plano.origem);
  return [dot(rel, normalize(plano.u)), dot(rel, normalize(plano.v))];
}

/** Reconstrói o ponto de mundo a partir de (u, v) do plano. */
export function doEspacoPlano(uv: [number, number], plano: Plano): Vetor3 {
  return add(plano.origem, add(scale(normalize(plano.u), uv[0]), scale(normalize(plano.v), uv[1])));
}

/**
 * Normal de polígono por Newell — robusta para polígonos não-planos e para
 * winding inconsistente (é o que o Bloco 5 usa para decidir a orientação).
 */
export function normalDoPoligono(pontos: readonly Vetor3[]): Vetor3 {
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
  return normalize([nx, ny, nz]);
}

/** Área do polígono (m²), sempre positiva. */
export function areaDoPoligono(pontos: readonly Vetor3[]): number {
  if (pontos.length < 3) return 0;
  let soma: Vetor3 = [0, 0, 0];
  for (let i = 1; i < pontos.length - 1; i += 1) {
    soma = add(soma, cross(sub(pontos[i], pontos[0]), sub(pontos[i + 1], pontos[0])));
  }
  return length(soma) / 2;
}

/** Ponto mais próximo num segmento (t limitado a [0,1]). */
export function pontoNoSegmento(p: Vetor3, a: Vetor3, b: Vetor3): { ponto: Vetor3; t: number; distancia: number } {
  const ab = sub(b, a);
  const den = dot(ab, ab);
  if (den < EPS) return { ponto: a, t: 0, distancia: distancia(p, a) };
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / den));
  const ponto = add(a, scale(ab, t));
  return { ponto, t, distancia: distancia(p, ponto) };
}