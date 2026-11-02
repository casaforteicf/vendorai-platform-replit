/**
 * Snap (Bloco 6) — ímã em vértice e aresta, com prioridade e raio em pixels.
 * A projeção é injetada (no app é o three; aqui é uma função trivial), como manda o contrato.
 */

import { calcularSnap } from '../../src/arqdor/editor/modelador/snap';
import type { CandidatoSnap } from '../../src/arqdor/editor/modelador/snap';
import type { Vetor3 } from '../../src/arqdor/editor';

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

console.log('Snap — vértice, aresta e prioridade');

/** Projeção de teste: mundo (x,y,z) → tela (x*100, z*100). Y é ignorado. */
const projetar = (p: Vetor3): { x: number; y: number } => ({ x: p[0] * 100, y: p[2] * 100 });

const candidatos: CandidatoSnap[] = [
  { tipo: 'vertice', solidoId: 's1', verticeId: 'v1', posicao: [1, 0, 1] },
  { tipo: 'aresta_ponto', solidoId: 's1', arestaId: 'a1', a: [0, 0, 0], b: [2, 0, 0] },
];

// perto de um vértice
const vertice = calcularSnap({ ponteiro: { x: 104, y: 103 }, projetar, candidatos });
ok(vertice !== null && vertice.tipo === 'vertice', 'perto do vértice → snap de vértice');
if (vertice !== null && vertice.tipo === 'vertice') {
  ok(vertice.referencia.verticeId === 'v1', 'referência aponta o vértice');
  ok(vertice.posicao[0] === 1 && vertice.posicao[2] === 1, 'posição é a do vértice');
  ok(vertice.distanciaTela < 6, 'distância na tela calculada');
}

// perto do meio de uma aresta
const aresta = calcularSnap({ ponteiro: { x: 50, y: 8 }, projetar, candidatos });
ok(aresta !== null && aresta.tipo === 'aresta_ponto', 'perto da aresta → snap de aresta');
if (aresta !== null && aresta.tipo === 'aresta_ponto') {
  ok(aresta.referencia.arestaId === 'a1', 'referência aponta a aresta');
  ok(Math.abs(aresta.referencia.t - 0.25) < 1e-6, 'parâmetro t = 0,25 no ponto mais próximo');
  ok(Math.abs(aresta.posicao[0] - 0.5) < 1e-6, 'posição interpolada na aresta');
}

// vértice tem prioridade sobre aresta quando os dois estão no raio:
// aresta de z=1 passa exatamente sob o vértice (mesma distância na tela)
const comArestaSobreposta: CandidatoSnap[] = [
  ...candidatos,
  { tipo: 'aresta_ponto', solidoId: 's1', arestaId: 'a2', a: [0, 0, 1], b: [2, 0, 1] },
];
const ambos = calcularSnap({ ponteiro: { x: 100, y: 102 }, projetar, candidatos: comArestaSobreposta });
ok(ambos !== null && ambos.tipo === 'vertice', 'vértice ganha da aresta (prioridade)');

// fora do raio: nada
const longe = calcularSnap({ ponteiro: { x: 500, y: 500 }, projetar, candidatos });
ok(longe === null, 'fora do raio → null (cai na grade)');

// com fallback de grade
const comGrade = calcularSnap({ ponteiro: { x: 500, y: 500 }, projetar, candidatos, grade: [5, 0, 5] });
ok(comGrade !== null && comGrade.tipo === 'grade', 'fallback devolve snap de grade');
ok(comGrade !== null && comGrade.posicao[0] === 5, 'grade devolve o ponto informado');

// raio customizado
const raioGrande = calcularSnap({ ponteiro: { x: 500, y: 500 }, projetar, candidatos, raioPx: 1000 });
ok(raioGrande !== null && raioGrande.tipo !== 'grade', 'raio maior alcança o candidato');

// projeção nula (atrás da câmera) é ignorada
const semProjecao = calcularSnap({ ponteiro: { x: 0, y: 0 }, projetar: () => null, candidatos });
ok(semProjecao === null, 'projeção nula é ignorada');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
