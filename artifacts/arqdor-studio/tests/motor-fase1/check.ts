/**
 * Motor da Fase 1 — gizmo, offset, corte de vão e roteamento MEP.
 * Tudo puro: roda sem navegador.
 */

import { comporRotacao, eulerParaQuaternion, girarVetor, quaternionParaEuler } from '../../src/arqdor/editor/modelador/gizmo-math';
import { gerarOpRotacionarPara } from '../../src/arqdor/editor/modelador/gizmo';
import { offsetDaFace } from '../../src/arqdor/editor/modelador/offset';
import { cortarVao } from '../../src/arqdor/editor/modelador/vao-booleano';
import { malhaFechada, volumeAssinado } from '../../src/arqdor/editor/modelador/orientacao';
import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import { rotearTubo, comprimentoCaminho } from '../../src/arqdor/editor/mep/roteador';
import { ROTEAMENTO_PADRAO } from '../../src/arqdor/editor/mep/schema';
import type { Solido, Vetor3 } from '../../src/arqdor/editor/modelador/schema';

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
function vetorPerto(a: Vetor3, b: Vetor3, t = 1e-6): boolean {
  return perto(a[0], b[0], t) && perto(a[1], b[1], t) && perto(a[2], b[2], t);
}

console.log('Motor Fase 1 — gizmo, offset, vão e MEP');

// ---------- 1. gizmo: quatérnion em vez de soma de Euler ----------
const euler: Vetor3 = [0.3, -0.7, 1.1];
const volta = quaternionParaEuler(eulerParaQuaternion(euler));
ok(vetorPerto(volta, euler, 1e-9), 'gizmo: Euler → quatérnion → Euler preserva a rotação');

const a: Vetor3 = [0, Math.PI / 2, 0];
const b: Vetor3 = [Math.PI / 2, 0, 0];
const composta = comporRotacao(a, b);
const v: Vetor3 = [0, 0, 1];
ok(
  vetorPerto(girarVetor(v, composta), girarVetor(girarVetor(v, a), b), 1e-9),
  'gizmo: compor(a,b) equivale a aplicar a e depois b',
);
const c: Vetor3 = [0, 0, Math.PI / 2];
const associativa = comporRotacao(comporRotacao(a, b), c);
ok(
  vetorPerto(girarVetor(v, associativa), girarVetor(girarVetor(girarVetor(v, a), b), c), 1e-9),
  'gizmo: composição é associativa em três rotações',
);

const caixaGizmo = criarCaixa({
  id: 'g1',
  nome: 'Caixa',
  posicao: [0, 0, 0],
  dimensoes: { largura: 1, altura: 1, profundidade: 1 },
});
if (caixaGizmo.ok) {
  const op = gerarOpRotacionarPara(caixaGizmo.solido, [Math.PI / 2, 0, 0]);
  const depois = op.tipo === 'atualizar_solido' ? op.depois : caixaGizmo.solido;
  ok(vetorPerto(depois.transformacao.rotacao, [Math.PI / 2, 0, 0], 1e-9), 'gizmo: arrastar até o alvo chega exato');
  const op2 = gerarOpRotacionarPara(depois, [Math.PI / 2, Math.PI / 2, 0]);
  const depois2 = op2.tipo === 'atualizar_solido' ? op2.depois : depois;
  ok(
    vetorPerto(girarVetor([1, 0, 0], depois2.transformacao.rotacao), girarVetor([1, 0, 0], [Math.PI / 2, Math.PI / 2, 0]), 1e-9),
    'gizmo: segundo arrasto compõe sobre a orientação anterior',
  );
}

// ---------- 2. offset em qualquer plano ----------
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
const horizontal = offsetDaFace(laje, 'f1', 0.15);
ok(horizontal.ok && horizontal.vertices.length === 4, 'offset: face horizontal gera 4 vértices');
ok(horizontal.ok && perto(horizontal.areaInterna, 13.69), 'offset: horizontal área 13,69 m²');

const parede: Solido = {
  ...laje,
  id: 's2',
  vertices: [
    { id: 'a', posicao: [0, 0, 0] },
    { id: 'b', posicao: [4, 0, 0] },
    { id: 'c', posicao: [4, 2.8, 0] },
    { id: 'd', posicao: [0, 2.8, 0] },
  ],
  faces: [{ id: 'fv', vertices: ['a', 'b', 'c', 'd'] }],
};
const vertical = offsetDaFace(parede, 'fv', 0.15);
ok(vertical.ok, 'offset: face vertical executa');
ok(vertical.ok && vertical.vertices.every((vert) => perto(vert.posicao[2], 0)), 'offset: vertical mantém o plano z = 0');
ok(vertical.ok && perto(vertical.areaInterna, 3.7 * 2.5), 'offset: vertical área 9,25 m²');

const raiz = Math.SQRT1_2;
const inclinada: Solido = {
  ...laje,
  id: 's3',
  vertices: [
    { id: 'p0', posicao: [0, 0, 0] },
    { id: 'p1', posicao: [1, 0, 0] },
    { id: 'p2', posicao: [1, raiz, raiz] },
    { id: 'p3', posicao: [0, raiz, raiz] },
  ],
  faces: [{ id: 'fi', vertices: ['p0', 'p1', 'p2', 'p3'] }],
};
const inclinado = offsetDaFace(inclinada, 'fi', 0.1);
ok(inclinado.ok, 'offset: face inclinada 45° executa');
ok(
  inclinado.ok && inclinado.vertices.every((vert) => perto(vert.posicao[1], vert.posicao[2])),
  'offset: face inclinada mantém o plano y = z',
);
ok(inclinado.ok && perto(inclinado.areaInterna, 0.64), 'offset: inclinada área (1 − 0,2)² = 0,64 m²');

// ---------- 3. corte de vão (booleana) ----------
const paredeCaixa = criarCaixa({
  id: 'p1',
  nome: 'Parede',
  posicao: [0, 0, 0],
  dimensoes: { largura: 4, altura: 2.8, profundidade: 0.15 },
});
ok(paredeCaixa.ok, 'vão: parede 4 × 2,8 × 0,15 criada');
if (paredeCaixa.ok) {
  const porta = cortarVao(paredeCaixa.solido, { offset: 1, largura: 0.9, altura: 2.1, peitoril: 0 });
  ok(porta.ok, 'vão: porta 0,9 × 2,1 cortada');
  if (porta.ok) {
    const s = porta.solido;
    ok(s.vertices.length === 16, 'vão: 16 vértices (8 por face da parede)');
    ok(s.faces.length === 16, 'vão: 16 faces (2 anéis + 4 revelos + casca)');
    ok(malhaFechada(s.faces), 'vão: malha fechada (cada aresta em 2 faces)');
    ok(perto(volumeAssinado(s.vertices, s.faces), 1.68 - 0.2835), 'vão: volume = parede − vão (1,3965 m³)');
    ok(s.vertices.every((vert) => vert.posicao[1] >= -1e-9), 'vão: peitoril zero não fura o piso');
  }

  const janela = cortarVao(paredeCaixa.solido, { offset: 1, largura: 0.9, altura: 1.2, peitoril: 1 });
  ok(janela.ok && perto(volumeAssinado(janela.solido.vertices, janela.solido.faces), 1.68 - 0.162), 'vão: janela com peitoril 1 m (1,518 m³)');

  const fora = cortarVao(paredeCaixa.solido, { offset: 3.5, largura: 0.9, altura: 2.1, peitoril: 0 });
  ok(!fora.ok && fora.erro.codigo === 'VAO_FORA_DA_PAREDE', 'vão: fora da parede recusado');
}

// ---------- 4. MEP: roteamento ----------
const reta = rotearTubo({
  de: [0, 1.2, 0],
  para: [4, 1.2, 0],
  diametroMm: 25,
  camada: 'hidraulica',
  opcoes: ROTEAMENTO_PADRAO,
});
ok(reta !== null, 'mep: rota reta encontrada');
if (reta !== null) {
  ok(reta.caminho.every((p) => perto(p[1], ROTEAMENTO_PADRAO.alturaPlanoM)), 'mep: rota corre no plano da camada');
  ok(perto(comprimentoCaminho(reta.caminho), 4, 1e-6), 'mep: comprimento da reta = 4 m');
}

const emL = rotearTubo({
  de: [0, 1.2, 0],
  para: [4, 1.2, 3],
  diametroMm: 25,
  camada: 'eletrica',
  opcoes: ROTEAMENTO_PADRAO,
});
ok(emL !== null, 'mep: rota em L encontrada');
if (emL !== null) {
  ok(perto(comprimentoCaminho(emL.caminho), 7, 0.0), 'mep: L percorre 4 + 3 = 7 m');
  ok(emL.caminho.length <= 4, 'mep: waypoints simplificados (sem escadinha)');
}

const tetoBaixo = rotearTubo({
  de: [0, 1.2, 0],
  para: [4, 1.2, 3],
  diametroMm: 25,
  camada: 'eletrica',
  opcoes: { ...ROTEAMENTO_PADRAO, maxCelulas: 5 },
});
ok(tetoBaixo === null, 'mep: estourar maxCelulas devolve null');

const comObstaculo = rotearTubo({
  de: [0, 1.2, 0],
  para: [4, 1.2, 0],
  diametroMm: 25,
  camada: 'hidraulica',
  opcoes: ROTEAMENTO_PADRAO,
  obstaculos: [{ x0: 1.5, z0: -0.5, x1: 2.5, z1: 0.5 }],
});
ok(comObstaculo !== null, 'mep: rota com obstáculo encontrada');
if (comObstaculo !== null) {
  const dentro = comObstaculo.caminho.some((p) => p[0] >= 1.5 && p[0] <= 2.5 && p[2] >= -0.5 && p[2] <= 0.5);
  ok(!dentro, 'mep: rota desvia do obstáculo');
  ok(comprimentoCaminho(comObstaculo.caminho) > 4, 'mep: desvio custa mais que a reta');
}

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
