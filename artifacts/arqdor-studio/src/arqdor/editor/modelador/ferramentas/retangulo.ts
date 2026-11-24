import type { Aresta, Face, OperacaoModelador, Plano, Solido, Vetor3, Vertice } from '../schema';
import { doEspacoPlano, paraEspacoPlano, snapGrade } from '../plano';
import { idVertice } from './linha';

/**
 * Retângulo coplanar ao plano informado (4 vértices, 4 arestas, 1 face).
 * Cantos calculados no espaço (u, v) do plano — funciona tanto no chão quanto em parede.
 */
export function criarRetangulo(entrada: {
  solido: Solido;
  plano: Plano;
  a: Vetor3;
  b: Vetor3;
  passoGrade?: number;
}): OperacaoModelador[] {
  const passo = entrada.passoGrade ?? 0.05;
  const a = snapGrade(entrada.a, passo);
  const b = snapGrade(entrada.b, passo);

  const [u1, v1] = paraEspacoPlano(a, entrada.plano);
  const [u2, v2] = paraEspacoPlano(b, entrada.plano);
  if (Math.abs(u1 - u2) < 1e-6 || Math.abs(v1 - v2) < 1e-6) return [];

  const cantos: Vetor3[] = [
    doEspacoPlano([u1, v1], entrada.plano),
    doEspacoPlano([u2, v1], entrada.plano),
    doEspacoPlano([u2, v2], entrada.plano),
    doEspacoPlano([u1, v2], entrada.plano),
  ];

  const vertices: Vertice[] = cantos.map((posicao) => ({ id: idVertice(), posicao }));
  const arestas: Aresta[] = vertices.map((v, i) => ({
    id: idVertice(),
    verticeA: v.id,
    verticeB: vertices[(i + 1) % vertices.length].id,
  }));
  const face: Face = { id: idVertice(), vertices: vertices.map((v) => v.id) };

  return [
    { tipo: 'adicionar_vertices', solidoId: entrada.solido.id, vertices },
    { tipo: 'adicionar_arestas', solidoId: entrada.solido.id, arestas },
    { tipo: 'adicionar_faces', solidoId: entrada.solido.id, faces: [face] },
  ];
}