/**
 * Precisão de arquiteto — medidas digitadas, snap com cor/eixo, métricas de hover e offset.
 * Tudo puro: roda sem navegador.
 */

import { formatarMedida, interpretarMedida } from '../../src/arqdor/editor/modelador/medida';
import { corDoSnap, deltaEixo, ehPontoMedio, eixoDominante, travarNoEixo } from '../../src/arqdor/editor/modelador/snap';
import type { SnapResultado } from '../../src/arqdor/editor/modelador/snap';
import { metricasAresta, metricasFace } from '../../src/arqdor/editor/modelador/metricas';
import { offsetPoligono } from '../../src/arqdor/editor/modelador/offset';
import type { Ponto2D } from '../../src/arqdor/editor/modelador/offset';
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
function perto(a: number, b: number, t = 1e-6): boolean {
  return Math.abs(a - b) <= t;
}

console.log('Precisão — medidas, snap, métricas e offset');

// ---------- 1. barra de medidas ----------
const m1 = interpretarMedida('2,8');
ok(m1.tipo === 'escalar' && perto(m1.tipo === 'escalar' ? m1.valor : 0, 2.8), '"2,8" → 2,8');

const m2 = interpretarMedida('2.8m');
ok(m2.tipo === 'escalar' && perto(m2.tipo === 'escalar' ? m2.valor : 0, 2.8), '"2.8m" → 2,8');

const m3 = interpretarMedida('-1,5');
ok(m3.tipo === 'escalar' && perto(m3.tipo === 'escalar' ? m3.valor : 0, -1.5), '"-1,5" → −1,5 (push para dentro)');

const m4 = interpretarMedida('3x4');
ok(m4.tipo === 'dimensoes' && perto(m4.largura, 3) && perto(m4.profundidade, 4), '"3x4" → 3 × 4');

const m5 = interpretarMedida('3 x 4');
ok(m5.tipo === 'dimensoes', '"3 x 4" → dimensões');

const m6 = interpretarMedida('2,5;4');
ok(m6.tipo === 'dimensoes' && perto(m6.largura, 2.5) && perto(m6.profundidade, 4), '"2,5;4" → 2,5 × 4');

ok(interpretarMedida('').tipo === 'vazio', 'vazio → vazio');
ok(interpretarMedida('abc').tipo === 'invalido', '"abc" → inválido');
ok(formatarMedida(2.8) === '2,80 m', 'readout formata 2,80 m');

// ---------- 2. snap: cor e trava de eixo ----------
const snapVertice: SnapResultado = { tipo: 'vertice', posicao: [0, 0, 0], referencia: { solidoId: 's', verticeId: 'v' }, prioridade: 100, distanciaTela: 2 };
ok(corDoSnap(snapVertice) === '#00c896', 'vértice → verde');

const snapMeio: SnapResultado = { tipo: 'aresta_ponto', posicao: [0, 0, 0], referencia: { solidoId: 's', arestaId: 'a', t: 0.5 }, prioridade: 70, distanciaTela: 2 };
ok(corDoSnap(snapMeio) === '#e879a6', 'aresta → rosa');
ok(ehPontoMedio(snapMeio), 't = 0,5 é ponto médio');

const snapEixoZ: SnapResultado = { tipo: 'eixo_z', posicao: [0, 0, 0], referencia: { eixo: 'z' }, prioridade: 30, distanciaTela: 1 };
ok(corDoSnap(snapEixoZ) === '#3b82f6', 'eixo Z → azul');

const origem: Vetor3 = [1, 2, 3];
ok(eixoDominante(origem, [6, 2.2, 3]) === 'x', 'deslocamento maior em X → eixo X');
ok(eixoDominante(origem, [1.1, 7, 3]) === 'y', 'deslocamento maior em Y → eixo Y');
ok(eixoDominante(origem, [1, 2, 9]) === 'z', 'deslocamento maior em Z → eixo Z');

const travado = travarNoEixo(origem, [6, 2.2, 3], 'x');
ok(travado[0] === 6 && travado[1] === 2 && travado[2] === 3, 'trava no eixo X zera a deriva');
ok(perto(deltaEixo(origem, [6, 2.2, 3], 'x'), 5), 'delta no eixo X = 5 m');

// ---------- 4. métricas de hover ----------
const quadrado: Vetor3[] = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]];
const face = metricasFace(quadrado);
ok(perto(face.largura, 4) && perto(face.altura, 3), 'face 4×3 → largura 4, altura 3');
ok(perto(face.area, 12), 'face 4×3 → área 12 m²');
ok(perto(Math.abs(face.normal[1]), 1), 'normal da face horizontal é ±Y');

const arestaDeitada = metricasAresta([0, 0, 0], [4, 0, 0]);
ok(perto(arestaDeitada.comprimento, 4) && perto(arestaDeitada.anguloGraus, 0), 'aresta horizontal: 4 m, 0°');

const arestaVertical = metricasAresta([0, 0, 0], [0, 2.8, 0]);
ok(perto(arestaVertical.comprimento, 2.8) && perto(arestaVertical.anguloGraus, 90), 'aresta vertical: 2,8 m, 90°');

const arestaDiagonal = metricasAresta([0, 0, 0], [3, 3, 0]);
ok(perto(arestaDiagonal.anguloGraus, 45), 'diagonal 3×3 → 45°');

// ---------- 7. offset ----------
const sala: Ponto2D[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
const recuo = offsetPoligono(sala, 0.15);
ok(recuo.ok, 'offset de 15 cm executou');
if (recuo.ok) {
  ok(perto(recuo.areaInterna, 3.7 * 3.7), 'área interna = (4 − 0,30)² = 13,69 m²');
  ok(recuo.contorno.length === 4, 'contorno mantém 4 cantos');
  const xs = recuo.contorno.map((p) => p[0]);
  ok(perto(Math.min(...xs), 0.15) && perto(Math.max(...xs), 3.85), 'borda paralela a 15 cm');
}

const colapso = offsetPoligono(sala, 2.5);
ok(!colapso.ok && colapso.erro === 'OFFSET_COLAPSOU', 'offset maior que a sala → colapso');

const expansao = offsetPoligono(sala, -0.5);
ok(expansao.ok && perto(expansao.areaInterna, 25), 'offset negativo expande para 5×5 = 25 m²');

const degenerado = offsetPoligono([[0, 0], [1, 0]], 0.1);
ok(!degenerado.ok && degenerado.erro === 'POLIGONO_INVALIDO', 'menos de 3 pontos → inválido');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
