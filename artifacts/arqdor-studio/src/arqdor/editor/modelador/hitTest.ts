/**
 * Interseção raio × plano.
 * O raio é uma estrutura própria (`Raio`) para o domínio não depender de three:
 * o viewport converte `THREE.Ray` para `Raio` na borda.
 */

import type { Plano, Vetor3 } from './schema';
import { PLANO_CHAO } from './schema';
import { add, dot, EPS, normalize, scale, sub } from './plano';

export interface Raio {
  origem: Vetor3;
  direcao: Vetor3;
}

/** Ponto de interseção, ou null se o plano é paralelo ou está atrás da origem. */
export function interseccaoRaioPlano(raio: Raio, plano: Plano): Vetor3 | null {
  const n = normalize(plano.normal);
  const d = normalize(raio.direcao);
  const den = dot(n, d);
  if (Math.abs(den) < EPS) return null;
  const t = dot(n, sub(plano.origem, raio.origem)) / den;
  if (t < 0) return null;
  return [raio.origem[0] + d[0] * t, raio.origem[1] + d[1] * t, raio.origem[2] + d[2] * t];
}

/**
 * Projeta o cursor no plano ativo. Sem plano (ou plano paralelo ao raio),
 * cai no plano do chão (Y = 0) — o mesmo fallback do `desenho.ts`.
 */
export function projetarNoPlanoAtivo(raio: Raio, plano: Plano | null): Vetor3 | null {
  if (plano !== null) {
    const p = interseccaoRaioPlano(raio, plano);
    if (p !== null) return p;
  }
  return interseccaoRaioPlano(raio, PLANO_CHAO);
}

/** Raio a partir da origem para um ponto (útil em testes e no preview). */
export function raioDe(origem: Vetor3, alvo: Vetor3): Raio {
  return { origem, direcao: normalize(sub(alvo, origem)) };
}

/** Ponto a `distanciaM` da origem na direção do raio (para preview/hit). */
export function pontoNoRaio(raio: Raio, distanciaM: number): Vetor3 {
  return add(raio.origem, scale(normalize(raio.direcao), distanciaM));
}