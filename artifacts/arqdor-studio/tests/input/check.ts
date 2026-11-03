/**
 * Camada de input — atalhos e seleção múltipla. Puro.
 */

import { resolverAtalho } from '../../src/arqdor/editor/input/atalhos';
import { resolverNivel } from '../../src/arqdor/editor/modelador/selecao-nivel';
import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import {
  alternarSelecao,
  principalDaSelecao,
  selecaoSimples,
} from '../../src/arqdor/editor/modelador/selecao';

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

console.log('Input — atalhos de teclado e seleção múltipla');

// ---------- 1. ferramentas ----------
ok(resolverAtalho({ key: ' ', code: 'Space' })?.tipo === 'ferramenta', 'atalho: Espaço vira ferramenta');
ok(JSON.stringify(resolverAtalho({ key: ' ', code: 'Space' })) === JSON.stringify({ tipo: 'ferramenta', ferramenta: 'selecionar' }), 'atalho: Espaço = Selecionar');
ok(JSON.stringify(resolverAtalho({ key: 'l' })) === JSON.stringify({ tipo: 'ferramenta', ferramenta: 'linha' }), 'atalho: L = Linha');
ok(JSON.stringify(resolverAtalho({ key: 'R' })) === JSON.stringify({ tipo: 'ferramenta', ferramenta: 'retangulo' }), 'atalho: R = Retângulo (aceita maiúscula)');
ok(JSON.stringify(resolverAtalho({ key: 'c' })) === JSON.stringify({ tipo: 'ferramenta', ferramenta: 'circulo' }), 'atalho: C = Círculo');
ok(JSON.stringify(resolverAtalho({ key: 'a' })) === JSON.stringify({ tipo: 'ferramenta', ferramenta: 'arco' }), 'atalho: A = Arco');
ok(JSON.stringify(resolverAtalho({ key: 'p' })) === JSON.stringify({ tipo: 'ferramenta', ferramenta: 'pushpull' }), 'atalho: P = Push/Pull');

// ---------- 2. gizmo, offset, excluir ----------
ok(JSON.stringify(resolverAtalho({ key: 'm' })) === JSON.stringify({ tipo: 'gizmo', modo: 'mover' }), 'atalho: M = Mover');
ok(JSON.stringify(resolverAtalho({ key: 'q' })) === JSON.stringify({ tipo: 'gizmo', modo: 'rotacionar' }), 'atalho: Q = Rotacionar');
ok(JSON.stringify(resolverAtalho({ key: 'o' })) === JSON.stringify({ tipo: 'gizmo', modo: 'rotacionar' }), 'atalho: O também rotaciona');
ok(JSON.stringify(resolverAtalho({ key: 's' })) === JSON.stringify({ tipo: 'gizmo', modo: 'escalar' }), 'atalho: S = Escalar');
ok(resolverAtalho({ key: 'f' })?.tipo === 'offset', 'atalho: F = Offset');
ok(resolverAtalho({ key: 'e' })?.tipo === 'excluir', 'atalho: E = Excluir');

// ---------- 3. desfazer / refazer e modificadores ----------
ok(JSON.stringify(resolverAtalho({ key: 'z', ctrlKey: true })) === JSON.stringify({ tipo: 'desfazer', refazer: false }), 'atalho: Ctrl+Z desfaz');
ok(JSON.stringify(resolverAtalho({ key: 'Z', metaKey: true, shiftKey: true })) === JSON.stringify({ tipo: 'desfazer', refazer: true }), 'atalho: Cmd/Ctrl+Shift+Z refaz');
ok(resolverAtalho({ key: 'l', ctrlKey: true }) === null, 'atalho: Ctrl+L não dispara ferramenta');
ok(resolverAtalho({ key: 'l', altKey: true }) === null, 'atalho: Alt+L não dispara nada');
ok(resolverAtalho({ key: 'x' }) === null, 'atalho: tecla desconhecida não faz nada');

// ---------- 4. seleção múltipla ----------
ok(JSON.stringify(selecaoSimples('a')) === '["a"]', 'seleção: clique simples seleciona só um');
ok(selecaoSimples(null).length === 0, 'seleção: clique no vazio limpa');

const comB = alternarSelecao(['a'], 'b');
ok(JSON.stringify(comB) === '["a","b"]', 'seleção: Ctrl adiciona ao conjunto');
ok(principalDaSelecao(comB) === 'b', 'seleção: último adicionado é o principal');

const semA = alternarSelecao(comB, 'a');
ok(JSON.stringify(semA) === '["b"]', 'seleção: Ctrl em item já selecionado remove');
ok(principalDaSelecao(semA) === 'b', 'seleção: principal continua válido após remoção');

ok(principalDaSelecao(alternarSelecao(['a'], 'a')) === null, 'seleção: remover o último zera o principal');
ok(alternarSelecao([], 'a').length === 1, 'seleção: Ctrl no vazio só adiciona');

// ---------- 5. nível de seleção: Alt = loop, Alt+Shift = sólido ----------
const caixaLoop = criarCaixa({
  id: 'sel1',
  nome: 'Caixa',
  posicao: [0, 0, 0],
  dimensoes: { largura: 1, altura: 1, profundidade: 1 },
});
ok(caixaLoop.ok, 'nível: sólido de teste criado');
if (caixaLoop.ok) {
  const solido = caixaLoop.solido;
  const face = solido.faces[0];
  const aresta = solido.arestas[0];

  const simples = resolverNivel({ solido, faceId: face.id, arestaId: null });
  ok(simples.nivel === 'face' && simples.arestas === 0, 'nível: clique simples em face');

  const loop = resolverNivel({ solido, faceId: face.id, arestaId: null, altKey: true });
  ok(loop.nivel === 'loop' && loop.ids.length === 4, 'nível: Alt+face = loop com 4 arestas');

  const inteiro = resolverNivel({ solido, faceId: face.id, arestaId: null, altKey: true, shiftKey: true });
  ok(inteiro.nivel === 'sólido' && inteiro.arestas === solido.arestas.length, 'nível: Alt+Shift = sólido inteiro');

  const naAresta = resolverNivel({ solido, faceId: null, arestaId: aresta.id });
  ok(naAresta.nivel === 'aresta', 'nível: clique simples em aresta');

  const loopDaAresta = resolverNivel({ solido, faceId: null, arestaId: aresta.id, altKey: true });
  ok(loopDaAresta.nivel === 'loop' && loopDaAresta.ids.length > 0, 'nível: Alt+aresta = loop');
}

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
