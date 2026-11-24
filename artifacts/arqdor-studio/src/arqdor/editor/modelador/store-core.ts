/**
 * Motor do modelador — funções puras (sem DOM, sem zustand).
 * O store zustand apenas delega: guarda estado e chama aplicarPasso.
 */

import type { MaterialFace, OperacaoModelador, Solido } from './schema';

export interface EstadoModelador {
  solidos: Solido[];
  proximoSolidoN: number;
}

export type ErroStore =
  | { codigo: 'SOLIDO_NAO_ENCONTRADO'; solidoId: string }
  | { codigo: 'SOLIDO_DUPLICADO'; solidoId: string }
  | { codigo: 'OPERACAO_FORA_DE_CONTEXTO'; tipo: string }
  | { codigo: 'ESTADO_INCONSISTENTE'; detalhe: string };

export type ResultadoAplicacao =
  | { ok: true; estado: EstadoModelador }
  | { ok: false; erro: ErroStore };

export const ESTADO_INICIAL: EstadoModelador = { solidos: [], proximoSolidoN: 0 };

function falha(erro: ErroStore): ResultadoAplicacao {
  return { ok: false, erro };
}

export function novoSolidoId(estado: EstadoModelador): { id: string; proximoSolidoN: number } {
  const n = estado.proximoSolidoN + 1;
  return { id: 'solido_' + String(n), proximoSolidoN: n };
}

function comSolido(
  estado: EstadoModelador,
  solidoId: string,
  transformar: (solido: Solido) => Solido,
): ResultadoAplicacao {
  const indice = estado.solidos.findIndex((s) => s.id === solidoId);
  if (indice < 0) return falha({ codigo: 'SOLIDO_NAO_ENCONTRADO', solidoId });
  const solidos = estado.solidos.slice();
  solidos[indice] = transformar(estado.solidos[indice]);
  return { ok: true, estado: { ...estado, solidos } };
}

export function aplicarOperacao(estado: EstadoModelador, op: OperacaoModelador): ResultadoAplicacao {
  switch (op.tipo) {
    case 'criar_solido': {
      if (estado.solidos.some((s) => s.id === op.solido.id)) {
        return falha({ codigo: 'SOLIDO_DUPLICADO', solidoId: op.solido.id });
      }
      return { ok: true, estado: { ...estado, solidos: [...estado.solidos, op.solido] } };
    }

    case 'remover_solido': {
      if (!estado.solidos.some((s) => s.id === op.solido.id)) {
        return falha({ codigo: 'SOLIDO_NAO_ENCONTRADO', solidoId: op.solido.id });
      }
      return { ok: true, estado: { ...estado, solidos: estado.solidos.filter((s) => s.id !== op.solido.id) } };
    }

    case 'atualizar_solido':
      return comSolido(estado, op.antes.id, () => op.depois);

    case 'adicionar_vertices':
      return comSolido(estado, op.solidoId, (s) => ({ ...s, vertices: [...s.vertices, ...op.vertices] }));

    case 'adicionar_arestas':
      return comSolido(estado, op.solidoId, (s) => ({ ...s, arestas: [...s.arestas, ...op.arestas] }));

    case 'adicionar_faces':
      return comSolido(estado, op.solidoId, (s) => ({ ...s, faces: [...s.faces, ...op.faces] }));

    case 'remover_vertices': {
      const ids = new Set(op.vertices.map((v) => v.id));
      return comSolido(estado, op.solidoId, (s) => ({ ...s, vertices: s.vertices.filter((v) => !ids.has(v.id)) }));
    }

    case 'remover_arestas': {
      const ids = new Set(op.arestas.map((a) => a.id));
      return comSolido(estado, op.solidoId, (s) => ({ ...s, arestas: s.arestas.filter((a) => !ids.has(a.id)) }));
    }

    case 'remover_faces': {
      const ids = new Set(op.faces.map((f) => f.id));
      return comSolido(estado, op.solidoId, (s) => ({ ...s, faces: s.faces.filter((f) => !ids.has(f.id)) }));
    }

    case 'aplicar_booleana': {
      if (!estado.solidos.some((s) => s.id === op.solidoA)) {
        return falha({ codigo: 'SOLIDO_NAO_ENCONTRADO', solidoId: op.solidoA });
      }
      if (!estado.solidos.some((s) => s.id === op.solidoB)) {
        return falha({ codigo: 'SOLIDO_NAO_ENCONTRADO', solidoId: op.solidoB });
      }
      const consumidos = new Set<string>([op.solidoB, ...op.depois.removidos.map((s) => s.id)]);
      const solidos: Solido[] = [];
      for (const solido of estado.solidos) {
        if (solido.id === op.solidoA) {
          solidos.push(op.depois.resultado);
        } else if (!consumidos.has(solido.id)) {
          solidos.push(solido);
        }
      }
      return { ok: true, estado: { ...estado, solidos } };
    }

    case 'pintar_face': {
      if (op.faceIds.length !== op.depois.length) {
        return falha({ codigo: 'ESTADO_INCONSISTENTE', detalhe: 'faceIds e depois com tamanhos diferentes' });
      }
      const alvo = estado.solidos.find((s) => s.id === op.solidoId);
      if (alvo === undefined) return falha({ codigo: 'SOLIDO_NAO_ENCONTRADO', solidoId: op.solidoId });

      const mapa = new Map<string, MaterialFace | undefined>();
      for (let i = 0; i < op.faceIds.length; i += 1) mapa.set(op.faceIds[i], op.depois[i]);

      return comSolido(estado, op.solidoId, (s) => ({
        ...s,
        faces: s.faces.map((f) => (mapa.has(f.id) ? { ...f, material: mapa.get(f.id) } : f)),
      }));
    }

    case 'importar_solidos': {
      const existentes = new Set(estado.solidos.map((s) => s.id));
      for (const solido of op.depois) {
        if (existentes.has(solido.id)) return falha({ codigo: 'SOLIDO_DUPLICADO', solidoId: solido.id });
      }
      return { ok: true, estado: { ...estado, solidos: [...estado.solidos, ...op.depois] } };
    }

    case 'criar_vertice':
    case 'criar_aresta':
    case 'criar_face':
      return falha({ codigo: 'OPERACAO_FORA_DE_CONTEXTO', tipo: op.tipo });
  }
}

export function inverterOperacao(op: OperacaoModelador): OperacaoModelador[] {
  switch (op.tipo) {
    case 'criar_solido':
      return [{ tipo: 'remover_solido', solido: op.solido }];
    case 'remover_solido':
      return [{ tipo: 'criar_solido', solido: op.solido }];
    case 'atualizar_solido':
      return [{ tipo: 'atualizar_solido', antes: op.depois, depois: op.antes }];
    case 'adicionar_vertices':
      return [{ tipo: 'remover_vertices', solidoId: op.solidoId, vertices: op.vertices }];
    case 'adicionar_arestas':
      return [{ tipo: 'remover_arestas', solidoId: op.solidoId, arestas: op.arestas }];
    case 'adicionar_faces':
      return [{ tipo: 'remover_faces', solidoId: op.solidoId, faces: op.faces }];
    case 'remover_vertices':
      return [{ tipo: 'adicionar_vertices', solidoId: op.solidoId, vertices: op.vertices }];
    case 'remover_arestas':
      return [{ tipo: 'adicionar_arestas', solidoId: op.solidoId, arestas: op.arestas }];
    case 'remover_faces':
      return [{ tipo: 'adicionar_faces', solidoId: op.solidoId, faces: op.faces }];
    case 'importar_solidos':
      return op.depois.map((solido): OperacaoModelador => ({ tipo: 'remover_solido', solido }));
    case 'pintar_face':
      return [{ tipo: 'pintar_face', solidoId: op.solidoId, faceIds: op.faceIds, antes: op.depois, depois: op.antes }];
    case 'aplicar_booleana':
      return [
        { tipo: 'criar_solido', solido: op.antes.solidoB },
        { tipo: 'atualizar_solido', antes: op.depois.resultado, depois: op.antes.solidoA },
      ];
    case 'criar_vertice':
    case 'criar_aresta':
    case 'criar_face':
      return [];
  }
}

export function aplicarPasso(
  estado: EstadoModelador,
  operacoes: readonly OperacaoModelador[],
  direcao: 'direta' | 'reversa',
): ResultadoAplicacao {
  const sequencia =
    direcao === 'direta'
      ? [...operacoes]
      : [...operacoes].reverse().flatMap((op) => inverterOperacao(op));

  let atual = estado;
  for (const op of sequencia) {
    const resultado = aplicarOperacao(atual, op);
    if (!resultado.ok) return resultado;
    atual = resultado.estado;
  }
  return { ok: true, estado: atual };
}