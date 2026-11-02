/**
 * TESTES DE CONTRATO NEGATIVOS — Arqdor Studio 2.0
 *
 * Cada `@ts-expect-error` abaixo é uma assertiva: "esta linha DEVE falhar".
 * Se alguém reabrir o buraco (afrouxar o tipo), a linha passa a compilar e o
 * compilador acusa TS2578 ("Unused '@ts-expect-error' directive") — build quebra.
 *
 * Regra 6: `@ts-expect-error` é PROIBIDO em `src/**` (código de produção).
 * Aqui é permitido porque é o mecanismo da assertiva, não uma fuga de tipagem.
 */

import type {
  AplicarPasso,
  Historico,
  OperacaoBIM,
  OperacaoBooleana,
  OperacaoModelador,
  Passo,
  SnapResultado,
  Solido,
} from '../../src/arqdor/editor';

declare const solido: Solido;

// ------------------------------------------------------------------
// R1 — o histórico não é saco de qualquer coisa
// (`OperacaoBIM` genérico aceitava `{ tipo: string } & Record<string, unknown>`)
// ------------------------------------------------------------------

// @ts-expect-error R1: OperacaoBIM não aceita objeto arbitrário
export const r1a: OperacaoBIM = { tipo: 'sei_la', payload: [1, 2, 3] };

// @ts-expect-error R1: passo não aceita operação inexistente
export const r1b: Passo = { escopo: 'modelador', id: 'p1', operacoes: [{ tipo: 'qualquer_coisa' }] };

// @ts-expect-error R1: histórico exige Passo, não objeto solto
export const r1c: Historico = { passos: [{ tipo: 'x' }], indice: 0, limite: 10 };

// @ts-expect-error R1: escopo inválido é recusado
export const r1d: Passo = { escopo: 'inventado', id: 'p2', operacoes: [] };

// ------------------------------------------------------------------
// R2 — undo de remoção exige SNAPSHOT, nunca id
// ------------------------------------------------------------------

// @ts-expect-error R2: remover_solido sem o sólido (sem snapshot não há undo)
export const r2a: OperacaoModelador = { tipo: 'remover_solido', solidoId: 's1' };

// @ts-expect-error R2: remover_faces sem as faces
export const r2b: OperacaoModelador = { tipo: 'remover_faces', solidoId: 's1', faceIds: ['f1'] };

// @ts-expect-error R2: remover_vertices sem os vértices
export const r2c: OperacaoModelador = { tipo: 'remover_vertices', solidoId: 's1', verticeIds: ['v1'] };

// @ts-expect-error R2: removidos por id (string[]) não compila — precisa de Solido[]
export const r2d: OperacaoBooleana = { tipo: 'aplicar_booleana', operacao: 'uniao', solidoA: 'a', solidoB: 'b', antes: { solidoA: solido, solidoB: solido }, depois: { resultado: solido, removidos: ['b'] } };

// ------------------------------------------------------------------
// R3 — tipo de snap e referência são correlacionados
// ------------------------------------------------------------------

// @ts-expect-error R3: tipo 'vertice' com referência de interseção
export const r3a: SnapResultado = { tipo: 'vertice', posicao: [0, 0, 0], referencia: { solidoIdA: 'a', arestaIdA: 'x', solidoIdB: 'b', arestaIdB: 'y' }, prioridade: 1, distanciaTela: 1 };

// @ts-expect-error R3: interseção exige as duas arestas (não aceita vértice)
export const r3b: SnapResultado = { tipo: 'interseccao', posicao: [0, 0, 0], referencia: { solidoId: 'a', verticeId: 'v' }, prioridade: 90, distanciaTela: 1 };

// @ts-expect-error R3: eixo_x exige referência de eixo
export const r3c: SnapResultado = { tipo: 'eixo_x', posicao: [0, 0, 0], referencia: { solidoId: 'a', verticeId: 'v' }, prioridade: 30, distanciaTela: 1 };

// ------------------------------------------------------------------
// Regra 6 — nenhum contrato público pode virar `any`
// ------------------------------------------------------------------

type EhAny<T> = 0 extends 1 & T ? true : false;
type DeveSerFalso<T extends false> = T;

export type GuardaAntiAny = [
  DeveSerFalso<EhAny<Passo>>,
  DeveSerFalso<EhAny<OperacaoBIM>>,
  DeveSerFalso<EhAny<OperacaoModelador>>,
  DeveSerFalso<EhAny<SnapResultado>>,
  DeveSerFalso<EhAny<Solido>>,
  DeveSerFalso<EhAny<AplicarPasso>>,
];