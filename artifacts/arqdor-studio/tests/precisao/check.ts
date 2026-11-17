/**
 * Precisão de arquiteto — medidas digitadas, snap com cor/eixo, métricas de hover e offset.
 * Tudo puro: roda sem navegador.
 */

import { formatarMedida, interpretarMedida } from '../../src/arqdor/editor/modelador/medida';
import { corDoSnap, deltaEixo, ehPontoMedio, eixoDominante, travarNoEixo } from '../../src/arqdor/editor/modelador/snap';
import type { SnapResultado } from '../../src/arqdor/editor/modelador/snap';
import { metricasAresta, metricasFace } from '../../src/arqdor/editor/modelador/metricas';
import { offsetDaFace, offsetPoligono } from '../../src/arqdor/editor/modelador/offset';
import type { Ponto2D } from '../../src/arqdor/editor/modelador/offset';
import type { Solido } from '../../src/arqdor/editor/modelador/schema';
import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import { centroNormalDaFace } from '../../src/arqdor/editor/modelador/grip';
import { converterMedida, deMetros, formatarComUnidade, paraMetros } from '../../src/arqdor/editor/modelador/unidades';
import { textoDoArrasto, textoEscalar, textoMover, textoRotacionar } from '../../src/arqdor/editor/modelador/gizmo-hud';
import type { TransformacaoGizmo } from '../../src/arqdor/editor/modelador/gizmo-hud';
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

// ---------- 8. offset ligado à face do sólido (o que a UI aplica) ----------
const laje: Solido = {
  id: 's1',
  nome: 'Laje',
  vertices: [
    { id: 'v0', posicao: [0, 0, 0] },
    { id: 'v1', posicao: [4, 0, 0] },
    { id: 'v2', posicao: [4, 0, 4] },
    { id: 'v3', posicao: [0, 0, 4] },
  ],
  arestas: [],
  faces: [{ id: 'f1', vertices: ['v0', 'v1', 'v2', 'v3'] }],
  transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
};

const offsetFace = offsetDaFace(laje, 'f1', 0.15);
ok(offsetFace.ok, 'offset da face horizontal executou');
if (offsetFace.ok) {
  ok(offsetFace.vertices.length === 4 && offsetFace.arestas.length === 4, 'borda interna: 4 vértices e 4 arestas');
  ok(offsetFace.vertices.every((v) => perto(v.posicao[1], 0)), 'borda interna mantém a cota da face (y = 0)');
  ok(perto(offsetFace.areaInterna, 3.7 * 3.7), 'área interna da face = 13,69 m²');
  ok(offsetFace.arestas[0].verticeA === offsetFace.vertices[0].id, 'arestas fecham sobre o loop de vértices');
}

const offsetDeNovo = offsetDaFace(laje, 'f1', 0.15);
ok(
  offsetDeNovo.ok && offsetFace.ok && offsetDeNovo.vertices[0].id === offsetFace.vertices[0].id,
  'ids determinísticos ao repetir o mesmo offset',
);

const paredeVertical: Solido = {
  ...laje,
  vertices: [
    { id: 'v0', posicao: [0, 0, 0] },
    { id: 'v1', posicao: [4, 0, 0] },
    { id: 'v4', posicao: [0, 2.8, 0] },
    { id: 'v5', posicao: [4, 2.8, 0] },
  ],
  faces: [{ id: 'f2', vertices: ['v0', 'v1', 'v5', 'v4'] }],
};
const vertical = offsetDaFace(paredeVertical, 'f2', 0.15);
ok(vertical.ok, 'offset em face VERTICAL executa');
if (vertical.ok) {
  ok(vertical.vertices.length === 4, 'face vertical: 4 vértices na borda paralela');
  ok(vertical.vertices.every((v) => perto(v.posicao[2], 0)), 'borda paralela mantém o plano da face (z = 0)');
  ok(perto(vertical.areaInterna, 3.7 * 2.5), 'área interna da face vertical = 9,25 m²');
}

const inexistente = offsetDaFace(laje, 'nao-existe', 0.15);
ok(!inexistente.ok && inexistente.erro === 'FACE_INEXISTENTE', 'face inexistente → erro tipado');

const colapsoFace = offsetDaFace(laje, 'f1', 2.5);
ok(!colapsoFace.ok && colapsoFace.erro === 'OFFSET_COLAPSOU', 'offset que atravessa a face → colapso');

// ---------- 9. readout do gizmo (mover / rotacionar / escalar) ----------
ok(textoMover([0, 0, 0], [3, 0, 0]).includes('X +3,00 m'), 'mover: eixo dominante X +3,00 m');
ok(textoMover([0, 0, 0], [0, 2.5, 0]).includes('Y +2,50 m'), 'mover: eixo dominante Y +2,50 m');
ok(textoMover([0, 0, 0], [3, 0, 4]).includes('5,00 m'), 'mover: distância real percorrida (3-4-5)');
ok(textoRotacionar([0, 0, 0], [0, Math.PI / 2, 0]).includes('Y +90,0°'), 'rotacionar: 90° no eixo Y');
ok(textoRotacionar([0, 0, 0], [Math.PI / 4, 0, 0]).includes('X +45,0°'), 'rotacionar: 45° no eixo X');
ok(textoEscalar([1, 1, 1], [2, 1, 1]).includes('X × 2,00'), 'escalar: fator 2 no eixo X');

const t0: TransformacaoGizmo = { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] };
ok(textoDoArrasto(null, t0, t0) === null, 'sem gizmo ativo → sem readout');
ok(
  (textoDoArrasto('mover', t0, { ...t0, posicao: [0, 0, 3] }) ?? '').includes('Z +3,00 m'),
  'readout despacha pelo modo ativo (mover → Z)',
);

// ---------- 10. coordenadas múltiplas (largura; profundidade; altura) ----------
const tres = interpretarMedida('4;2,8;2');
ok(
  tres.tipo === 'dimensoes3' && perto(tres.largura, 4) && perto(tres.profundidade, 2.8) && perto(tres.altura, 2),
  'medida: 4;2,8;2 → largura 4, profundidade 2,8, altura 2',
);
ok(interpretarMedida('4; 2,8 ; 2').tipo === 'dimensoes3', 'medida: aceita espaços entre os pontos e vírgulas');
const duas = interpretarMedida('4;2,8');
ok(duas.tipo === 'dimensoes' && perto(duas.largura, 4), 'medida: 4;2,8 continua sendo 2 dimensões');
ok(interpretarMedida('4;x;2').tipo === 'invalido', 'medida: valor não numérico no trio é inválido');
ok(interpretarMedida('4;2;2;1').tipo === 'invalido', 'medida: quatro valores é inválido');

// ---------- 11. grip da face ----------
const caixaGrip = criarCaixa({
  id: 'grip1',
  nome: 'Caixa',
  posicao: [0, 0, 0],
  dimensoes: { largura: 1, altura: 1, profundidade: 1 },
});
ok(caixaGrip.ok, 'grip: caixa de teste criada');
if (caixaGrip.ok) {
  const topo = caixaGrip.solido.faces.find((face) => face.id.endsWith('_f_topo'));
  ok(topo !== undefined, 'grip: face de topo encontrada');
  if (topo !== undefined) {
    const grip = centroNormalDaFace(caixaGrip.solido, topo.id);
    ok(grip !== null, 'grip: face gera centro e normal');
    if (grip !== null) {
      ok(perto(grip.posicao[1], 1), 'grip: centro no plano da face (y = 1)');
      ok(perto(grip.posicao[0], 0.5) && perto(grip.posicao[2], 0.5), 'grip: centro no meio da face');
      ok(perto(grip.normal[1], 1), 'grip: normal aponta para +Y');
    }
  }
  ok(centroNormalDaFace(caixaGrip.solido, 'nao-existe') === null, 'grip: face inexistente → null');
}

// ---------- 13. unidades (entrada em mm/cm/m/pol, motor em metros) ----------
const emCm = converterMedida(interpretarMedida('2,8'), 'cm');
ok(emCm.tipo === 'escalar' && perto(emCm.valor, 0.028), 'unidades: 2,8 cm vira 0,028 m');
const emMm = converterMedida(interpretarMedida('3x4'), 'mm');
ok(emMm.tipo === 'dimensoes' && perto(emMm.largura, 0.003) && perto(emMm.profundidade, 0.004), 'unidades: 3x4 mm vira 0,003 × 0,004 m');
const emPol = converterMedida(interpretarMedida('2'), 'pol');
ok(emPol.tipo === 'escalar' && perto(emPol.valor, 0.0508), 'unidades: 2 pol vira 0,0508 m');
const emMetros = converterMedida(interpretarMedida('4;2,8;2'), 'm');
ok(emMetros.tipo === 'dimensoes3' && perto(emMetros.altura, 2), 'unidades: metros não convertem');
ok(formatarComUnidade(2.8, 'cm') === '280,0 cm', 'unidades: exibe 2,8 m como 280,0 cm');
ok(formatarComUnidade(0.0254, 'mm') === '25 mm', 'unidades: 1 pol exibe 25 mm');
ok(perto(deMetros(paraMetros(1, 'pol'), 'pol'), 1), 'unidades: ida e volta preserva o valor');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
