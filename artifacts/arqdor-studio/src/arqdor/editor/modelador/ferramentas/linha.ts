import type { Aresta, OperacaoModelador, Solido, Vetor3, Vertice } from '../schema';
import { chaveAresta, distancia, snapGrade } from '../plano';

export const TOL_VERTICE = 1e-4;

export function idVertice(): string {
  return globalThis.crypto.randomUUID();
}

/** Reusa vértice dentro da tolerância; devolve o id existente ou cria um novo. */
export function acharOuCriarVertice(
  solido: Solido,
  posicao: Vetor3,
  tolerancia = TOL_VERTICE,
): { vertice: Vertice; novo: boolean } {
  for (const v of solido.vertices) {
    if (distancia(v.posicao, posicao) <= tolerancia) return { vertice: v, novo: false };
  }
  return { vertice: { id: idVertice(), posicao }, novo: true };
}

/** Linha entre dois pontos. Degenerada (mesmo vértice) devolve [] — nada a desenhar. */
export function criarLinha(entrada: {
  solido: Solido;
  a: Vetor3;
  b: Vetor3;
  passoGrade?: number;
  tolerancia?: number;
}): OperacaoModelador[] {
  const passo = entrada.passoGrade ?? 0.05;
  const tol = entrada.tolerancia ?? TOL_VERTICE;
  const a = snapGrade(entrada.a, passo);
  const b = snapGrade(entrada.b, passo);

  const va = acharOuCriarVertice(entrada.solido, a, tol);
  const vb = acharOuCriarVertice(entrada.solido, b, tol);
  if (va.vertice.id === vb.vertice.id) return [];

  const chave = chaveAresta(va.vertice.id, vb.vertice.id);
  const existe = entrada.solido.arestas.some((aresta) => chaveAresta(aresta.verticeA, aresta.verticeB) === chave);

  const operacoes: OperacaoModelador[] = [];
  const novos: Vertice[] = [];
  if (va.novo) novos.push(va.vertice);
  if (vb.novo) novos.push(vb.vertice);
  if (novos.length > 0) operacoes.push({ tipo: 'adicionar_vertices', solidoId: entrada.solido.id, vertices: novos });
  if (!existe) {
    const aresta: Aresta = { id: idVertice(), verticeA: va.vertice.id, verticeB: vb.vertice.id };
    operacoes.push({ tipo: 'adicionar_arestas', solidoId: entrada.solido.id, arestas: [aresta] });
  }
  return operacoes;
}