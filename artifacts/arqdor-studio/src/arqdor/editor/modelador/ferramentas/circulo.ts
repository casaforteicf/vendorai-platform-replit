import type { Aresta, Face, OperacaoModelador, Plano, Solido, Vetor3, Vertice } from '../schema';
import { doEspacoPlano, paraEspacoPlano } from '../plano';
import { idVertice } from './linha';

/** Círculo como polígono de N vértices (N arestas + 1 face). */
export function criarCirculo(entrada: {
  solido: Solido;
  plano: Plano;
  centro: Vetor3;
  raio: number;
  segmentos?: number;
}): OperacaoModelador[] {
  const n = Math.max(3, Math.floor(entrada.segmentos ?? 24));
  if (entrada.raio <= 1e-6) return [];

  const [cu, cv] = paraEspacoPlano(entrada.centro, entrada.plano);
  const vertices: Vertice[] = [];
  for (let i = 0; i < n; i += 1) {
    const angulo = (2 * Math.PI * i) / n;
    const uv: [number, number] = [cu + entrada.raio * Math.cos(angulo), cv + entrada.raio * Math.sin(angulo)];
    vertices.push({ id: idVertice(), posicao: doEspacoPlano(uv, entrada.plano) });
  }

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