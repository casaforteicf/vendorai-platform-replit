/**
 * Grip de edição (estilo SketchUp) — centro e normal da face, em coordenadas LOCAIS do sólido.
 *
 * O canvas usa isso para desenhar o losango e transformar o arrasto em deslocamento ao longo da
 * normal (que é exatamente o que o Push/Pull consome).
 */

import type { Solido, Vetor3 } from './schema';

export interface GripFace {
  posicao: Vetor3;
  normal: Vetor3;
  faceId: string;
}

function normalizar(v: Vetor3): Vetor3 | null {
  const comprimento = Math.hypot(v[0], v[1], v[2]);
  if (comprimento < 1e-9) return null;
  return [v[0] / comprimento, v[1] / comprimento, v[2] / comprimento];
}

/** Normal pelo método de Newell (face de qualquer orientação). */
export function normalDaFace(pontos: readonly Vetor3[]): Vetor3 | null {
  if (pontos.length < 3) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalizar([x, y, z]);
}

/** Centro e normal da face — null quando a face ou os vértices não existem. */
export function centroNormalDaFace(solido: Solido, faceId: string): GripFace | null {
  const face = solido.faces.find((item) => item.id === faceId);
  if (face === undefined) return null;
  const mapa = new Map(solido.vertices.map((vertice) => [vertice.id, vertice.posicao]));
  const pontos: Vetor3[] = [];
  for (const id of face.vertices) {
    const posicao = mapa.get(id);
    if (posicao === undefined) return null;
    pontos.push(posicao);
  }
  if (pontos.length < 3) return null;
  const normal = normalDaFace(pontos);
  if (normal === null) return null;
  const centro: Vetor3 = [
    pontos.reduce((soma, ponto) => soma + ponto[0], 0) / pontos.length,
    pontos.reduce((soma, ponto) => soma + ponto[1], 0) / pontos.length,
    pontos.reduce((soma, ponto) => soma + ponto[2], 0) / pontos.length,
  ];
  return { posicao: centro, normal, faceId };
}
