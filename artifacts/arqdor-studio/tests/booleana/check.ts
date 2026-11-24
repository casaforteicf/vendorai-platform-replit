/**
 * Booleanas (Bloco 5) — motor manifold-3d.
 * Volumes conferidos à mão: dois cubos 2×2×2 com sobreposição de 1×2×2.
 */

import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import {
  aplicarBooleana,
  booleanaDisponivel,
  injetarModuloBooleana,
  volumeSolido,
} from '../../src/arqdor/editor/modelador/booleana';
import { ESTADO_INICIAL, aplicarPasso } from '../../src/arqdor/editor';
import type { Solido } from '../../src/arqdor/editor';

let passou = 0;
let falhou = 0;
function ok(condicao: boolean, nome: string): void {
  if (condicao) {
    passou += 1;
    console.log('  ok   ' + nome);
  } else {
    falhou += 1;
    console.log('  FALHA ' + nome);
  }
}
function perto(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-4;
}

export async function executar(): Promise<void> {
  console.log('Booleanas — manifold-3d');

  const caixaA = criarCaixa({ id: 'solido_1', nome: 'A', posicao: [0, 0, 0], dimensoes: { largura: 2, altura: 2, profundidade: 2 } });
  const caixaB = criarCaixa({ id: 'solido_2', nome: 'B', posicao: [1, 0, 0], dimensoes: { largura: 2, altura: 2, profundidade: 2 } });
  if (!caixaA.ok || !caixaB.ok) throw new Error('caixas inválidas');
  const a: Solido = caixaA.solido;
  const b: Solido = caixaB.solido;

  // antes de carregar, o motor tem de recusar com o erro do contrato
  ok(!booleanaDisponivel(), 'antes de inicializar: indisponível');
  const semWasm = aplicarBooleana(a, b, 'uniao');
  ok(!semWasm.ok && semWasm.erro.codigo === 'WASM_NAO_CARREGADO', 'sem WASM → WASM_NAO_CARREGADO');

  // manifold-3d é ESM-only: importa nativamente (o bundle de teste é CJS) e injeta.
  const importar = new Function('s', 'return import(s)') as (s: string) => Promise<{ default: () => Promise<unknown> }>;
  const pacote = await importar('manifold-3d');
  const instancia = await pacote.default();
  injetarModuloBooleana(instancia);
  ok(booleanaDisponivel(), 'WASM carregado e injetado');

  ok(perto(volumeSolido(a) ?? 0, 8), 'volume do sólido A = 8 m³');

  const uniao = aplicarBooleana(a, b, 'uniao');
  ok(uniao.ok, 'união executou');
  if (uniao.ok) {
    ok(perto(volumeSolido(uniao.solido) ?? 0, 12), 'união: volume 12 m³ (8 + 8 − 4)');
    ok(uniao.solido.id === a.id, 'união: resultado herda o id de A (E9)');
    ok(uniao.solido.faces.every((f) => f.triangulada === true), 'união: faces trianguladas');
    ok(uniao.solido.vertices.length > 0 && uniao.solido.arestas.length > 0, 'união: topologia preenchida');
    ok(uniao.solido.transformacao.posicao[0] === 0, 'união: transformação zerada (mundo baked)');
  }

  const diferenca = aplicarBooleana(a, b, 'diferenca');
  ok(diferenca.ok && perto(volumeSolido(diferenca.ok ? diferenca.solido : a) ?? 0, 4), 'diferença: volume 4 m³');

  const intersecao = aplicarBooleana(a, b, 'intersecao');
  ok(intersecao.ok && perto(volumeSolido(intersecao.ok ? intersecao.solido : a) ?? 0, 4), 'interseção: volume 4 m³');

  // aplica no estado: B é consumido, A é substituído no lugar
  if (diferenca.ok) {
    const estado = { ...ESTADO_INICIAL, solidos: [a, b], proximoSolidoN: 2 };
    const aplicado = aplicarPasso(estado, [diferenca.operacao], 'direta');
    ok(aplicado.ok && aplicado.estado.solidos.length === 1, 'estado: B consumido, resta 1 sólido');
    ok(aplicado.ok && aplicado.estado.solidos[0].id === a.id, 'estado: o sólido que fica é o A');

    if (aplicado.ok) {
      const desfeito = aplicarPasso(aplicado.estado, [diferenca.operacao], 'reversa');
      ok(desfeito.ok && desfeito.estado.solidos.length === 2, 'undo da booleana devolve A e B');
    }
  }

  // sólidos sem interseção: união soma, diferença não muda A
  const longe = criarCaixa({ id: 'solido_3', nome: 'C', posicao: [10, 0, 0], dimensoes: { largura: 1, altura: 1, profundidade: 1 } });
  if (longe.ok) {
    const uniaoLonge = aplicarBooleana(a, longe.solido, 'uniao');
    ok(uniaoLonge.ok && perto(volumeSolido(uniaoLonge.ok ? uniaoLonge.solido : a) ?? 0, 9), 'união de sólidos separados soma volumes');
    const difLonge = aplicarBooleana(a, longe.solido, 'diferenca');
    ok(difLonge.ok && perto(volumeSolido(difLonge.ok ? difLonge.solido : a) ?? 0, 8), 'diferença sem toque mantém A');
  }

  console.log('');
  console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
  if (falhou > 0) throw new Error('falhas: ' + String(falhou));
}
