/**
 * Nível de seleção por clique — regra pura, testável.
 *
 * 1 clique = face/aresta · Alt = loop · Alt+Shift = sólido.
 * O duplo clique NÃO entra aqui: ele abre a medida (decidido em 2026-11-03).
 */

import { loopDaFace, loopDeAresta } from './loop';
import type { Solido } from './schema';

export type Nivel = 'face' | 'aresta' | 'loop' | 'sólido';

export interface NivelSelecao {
  nivel: Nivel;
  /** Quantidade de arestas do loop (0 nos demais níveis). */
  arestas: number;
  /** Ids das arestas do loop. */
  ids: string[];
}

export function resolverNivel(args: {
  solido: Solido;
  faceId: string | null;
  arestaId: string | null;
  altKey?: boolean;
  shiftKey?: boolean;
}): NivelSelecao {
  if (args.altKey === true && args.shiftKey === true) {
    return { nivel: 'sólido', arestas: args.solido.arestas.length, ids: [] };
  }
  if (args.altKey === true) {
    const ids =
      args.faceId !== null
        ? loopDaFace(args.solido, args.faceId)
        : args.arestaId !== null
          ? loopDeAresta(args.solido, args.arestaId)
          : [];
    return { nivel: 'loop', arestas: ids.length, ids };
  }
  return { nivel: args.faceId !== null ? 'face' : 'aresta', arestas: 0, ids: [] };
}
