/**
 * Loop de arestas (seleção inteligente, item 4).
 *
 * Definição adotada: o "loop" é o contorno fechado de uma FACE. Ao clicar numa aresta,
 * usamos a primeira face que a contém — é o que o arquiteto espera ao dar dois cliques
 * numa aresta de parede (seleciona o retângulo inteiro daquela face).
 *
 * Puro: recebe o sólido e devolve ids de arestas.
 */

import type { Solido } from './schema';

/** Conjunto de arestas (par de vértices, ordem normalizada) → id da aresta. */
function mapaArestas(solido: Solido): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const aresta of solido.arestas) {
    const chave = aresta.verticeA < aresta.verticeB ? aresta.verticeA + '|' + aresta.verticeB : aresta.verticeB + '|' + aresta.verticeA;
    mapa.set(chave, aresta.id);
  }
  return mapa;
}

function chave(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

/**
 * Arestas do contorno da face (pares consecutivos de vértices).
 * Inclui o fechamento (último → primeiro).
 */
export function loopDaFace(solido: Solido, faceId: string): string[] {
  const face = solido.faces.find((item) => item.id === faceId);
  if (face === undefined || face.vertices.length < 2) return [];
  const mapa = mapaArestas(solido);
  const saida: string[] = [];
  for (let i = 0; i < face.vertices.length; i += 1) {
    const a = face.vertices[i];
    const b = face.vertices[(i + 1) % face.vertices.length];
    const id = mapa.get(chave(a, b));
    if (id !== undefined && !saida.includes(id)) saida.push(id);
  }
  return saida;
}

/**
 * Loop a partir de uma aresta: contorno da primeira face que a contém.
 * Se nenhuma face usar a aresta (sólido aberto), devolve só a própria aresta.
 */
export function loopDeAresta(solido: Solido, arestaId: string): string[] {
  const aresta = solido.arestas.find((item) => item.id === arestaId);
  if (aresta === undefined) return [];

  for (const face of solido.faces) {
    const contem = face.vertices.some((vertice, indice) => {
      const proximo = face.vertices[(indice + 1) % face.vertices.length];
      return chave(vertice, proximo) === chave(aresta.verticeA,aresta.verticeB);
    });
    if (contem) return loopDaFace(solido, face.id);
  }

  return [arestaId];
}

/** Faces que usam a aresta (para o tooltip mostrar contexto). */
export function facesDaAresta(solido: Solido, arestaId: string): string[] {
  const aresta = solido.arestas.find((item) => item.id === arestaId);
  if (aresta === undefined) return [];
  const alvo = chave(aresta.verticeA, aresta.verticeB);
  const saida: string[] = [];
  for (const face of solido.faces) {
    for (let i = 0; i < face.vertices.length; i += 1) {
      const a = face.vertices[i];
      const b = face.vertices[(i + 1) % face.vertices.length];
      if (chave(a, b) === alvo) {
        saida.push(face.id);
        break;
      }
    }
  }
  return saida;
}
