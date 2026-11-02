/** Prova de comportamento: push/pull fechado, gizmo (mover/rotacionar/escalar) e undo. */

import {
  aplicarPasso,
  calcularPushPull,
  criarRetangulo,
  gerarOpEscalar,
  gerarOpMover,
  gerarOpRotacionar,
  PLANO_CHAO,
} from '../../src/arqdor/editor';
import type { EstadoModelador, Solido } from '../../src/arqdor/editor';

let passou = 0;
let falhou = 0;
function ok(condicao: boolean, nome: string): void {
  if (condicao) { passou += 1; console.log('  ok   ' + nome); } else { falhou += 1; console.log('  FALHA ' + nome); }
}

console.log('Editor — push/pull, gizmo e undo');

const vazio: Solido = {
  id: 'solido_1',
  nome: 'Sólido 1',
  vertices: [],
  arestas: [],
  faces: [],
  transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
};

const base: EstadoModelador = { solidos: [vazio], proximoSolidoN: 1 };
const comRetangulo = aplicarPasso(base, criarRetangulo({ solido: vazio, plano: PLANO_CHAO, a: [0, 0, 0], b: [4, 0, 3] }), 'direta');
ok(comRetangulo.ok, 'retangulo aplicado');
const solidoComFace = comRetangulo.ok ? comRetangulo.estado.solidos[0] : vazio;
ok(solidoComFace.faces.length === 1, 'retangulo cria 1 face');
ok(solidoComFace.vertices.length === 4, 'retangulo cria 4 vertices');

const faceId = solidoComFace.faces[0].id;
const pushpull = calcularPushPull(solidoComFace, faceId, 2.8);
ok(pushpull.ok, 'push/pull calculado');

let estadoFinal = comRetangulo.ok ? comRetangulo.estado : base;
if (pushpull.ok) {
  const aplicado = aplicarPasso(estadoFinal, pushpull.operacoes, 'direta');
  ok(aplicado.ok, 'push/pull aplicado');
  if (aplicado.ok) {
    estadoFinal = aplicado.estado;
    const caixa = estadoFinal.solidos[0];
    ok(caixa.vertices.length === 8, 'caixa tem 8 vertices');
    ok(caixa.arestas.length === 12, 'caixa tem 12 arestas');
    ok(caixa.faces.length === 6, 'caixa FECHADA tem 6 faces (D9)');

    const desfeito = aplicarPasso(estadoFinal, pushpull.operacoes, 'reversa');
    ok(desfeito.ok, 'undo do push/pull aplica');
    if (desfeito.ok) {
      ok(desfeito.estado.solidos[0].faces.length === 1, 'undo volta ao retangulo original');
      ok(desfeito.estado.solidos[0].vertices.length === 4, 'undo remove os vertices do topo');
    }
  }
}

// Push/pull negativo (empurrar)
const negativo = calcularPushPull(solidoComFace, faceId, -1.5);
ok(negativo.ok, 'push/pull negativo aceito');

// Altura zero é recusada
const zero = calcularPushPull(solidoComFace, faceId, 0);
ok(!zero.ok && zero.erro.codigo === 'ALTURA_NULA', 'altura zero recusada');

// Face inexistente
const semFace = calcularPushPull(solidoComFace, 'face-inexistente', 1);
ok(!semFace.ok && semFace.erro.codigo === 'FACE_NAO_ENCONTRADA', 'face inexistente recusada');

// Gizmo — mover
const movido = aplicarPasso(base, [gerarOpMover(vazio, [1.5, 0, -2])], 'direta');
ok(movido.ok, 'mover aplica');
if (movido.ok) {
  const t = movido.estado.solidos[0].transformacao.posicao;
  ok(t[0] === 1.5 && t[1] === 0 && t[2] === -2, 'mover registra a posicao');
}

// Gizmo — rotacionar (radianos)
const girado = aplicarPasso(base, [gerarOpRotacionar(vazio, [0, Math.PI / 2, 0])], 'direta');
ok(girado.ok, 'rotacionar aplica');
if (girado.ok) {
  ok(Math.abs(girado.estado.solidos[0].transformacao.rotacao[1] - Math.PI / 2) < 1e-9, 'rotacao em radianos (Y)');
}

// Gizmo — escalar (fator)
const escalado = aplicarPasso(base, [gerarOpEscalar(vazio, [2, 1, 0.5])], 'direta');
ok(escalado.ok, 'escalar aplica');
if (escalado.ok) {
  const e = escalado.estado.solidos[0].transformacao.escala;
  ok(e[0] === 2 && e[1] === 1 && e[2] === 0.5, 'escala multiplicada');
}

// Undo do gizmo
const undoGizmo = aplicarPasso(base, [gerarOpMover(vazio, [1, 0, 0])], 'reversa');
ok(undoGizmo.ok && undoGizmo.estado.solidos[0].transformacao.posicao[0] === 0, 'undo do mover restaura a posicao original');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));