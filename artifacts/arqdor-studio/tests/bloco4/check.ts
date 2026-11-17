/**
 * Bloco 4 — telhado de duas águas e escada reta.
 * Geometria pura: roda sem navegador.
 */

import { criarTelhadoDuasAguas } from '../../src/arqdor/editor/modelador/telhado';
import { criarEscadaReta } from '../../src/arqdor/editor/modelador/escada';
import { malhaFechada, volumeAssinado } from '../../src/arqdor/editor/modelador/orientacao';

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

console.log('Bloco 4 — telhado duas águas e escada reta');

// ---------- 1. telhado ----------
const telhado = criarTelhadoDuasAguas({
  id: 't1',
  nome: 'Telhado',
  posicao: [0, 0, 0],
  larguraX: 6,
  profundidadeZ: 8,
  altura: 2,
});
ok(telhado.ok, 'telhado 6 × 8 com cumeeira 2 m criado');
if (telhado.ok) {
  const s = telhado.solido;
  ok(s.vertices.length === 6, 'telhado: 6 vértices (4 da base + 2 da cumeeira)');
  ok(s.faces.length === 5, 'telhado: 5 faces (2 águas, 2 empenas, base)');
  ok(s.arestas.length === 9, 'telhado: 9 arestas');
  ok(malhaFechada(s.faces), 'telhado: malha fechada (cada aresta em 2 faces)');
  ok(perto(volumeAssinado(s.vertices, s.faces), 48), 'telhado: volume = 48 m³');
  ok(volumeAssinado(s.vertices, s.faces) > 0, 'telhado: faces apontando para fora');
}

const comBeiral = criarTelhadoDuasAguas({
  id: 't2',
  nome: 'Telhado com beiral',
  posicao: [0, 0, 0],
  larguraX: 6,
  profundidadeZ: 8,
  altura: 2,
  beiral: 0.5,
});
ok(
  comBeiral.ok && perto(volumeAssinado(comBeiral.solido.vertices, comBeiral.solido.faces), 63),
  'telhado: beiral 0,5 m expande a base e o volume (63 m³)',
);

const telhadoInvalido = criarTelhadoDuasAguas({
  id: 't3',
  nome: 'T',
  posicao: [0, 0, 0],
  larguraX: 0,
  profundidadeZ: 8,
  altura: 2,
});
ok(!telhadoInvalido.ok && telhadoInvalido.erro.codigo === 'MEDIDA_INVALIDA', 'telhado: largura zero recusada');

// ---------- 2. escada ----------
const escada = criarEscadaReta({
  id: 'e1',
  nome: 'Escada',
  posicao: [0, 0, 0],
  largura: 1,
  alturaTotal: 2.8,
  profundidadeDegrau: 0.28,
});
ok(escada.ok, 'escada reta 2,8 m (run 0,28) criada');
if (escada.ok) {
  const s = escada.solido;
  const degraus = Math.ceil(2.8 / 0.18);
  const run = 0.28;
  const rise = 2.8 / degraus;
  ok(s.vertices.length === 2 * (2 + 2 * degraus), 'escada: 2 vértices por ponto do perfil');
  ok(s.faces.length === 2 * degraus + 4, 'escada: 1 face por aresta do perfil + 2 laterais');
  ok(malhaFechada(s.faces), 'escada: malha fechada');
  ok(
    perto(volumeAssinado(s.vertices, s.faces), run * rise * (degraus * (degraus + 1)) / 2),
    'escada: volume = largura × área do perfil',
  );
  ok(volumeAssinado(s.vertices, s.faces) > 0, 'escada: faces apontando para fora');
  const alturas = new Set(s.vertices.map((v) => v.posicao[1].toFixed(3)));
  ok(alturas.size === degraus + 1, 'escada: um nível por degrau (mais a base)');
}

const escadaInvalida = criarEscadaReta({
  id: 'e2',
  nome: 'E',
  posicao: [0, 0, 0],
  largura: 1,
  alturaTotal: 2.8,
  profundidadeDegrau: 0.28,
  numeroDegraus: 0,
});
ok(!escadaInvalida.ok && escadaInvalida.erro.campo === 'numeroDegraus', 'escada: zero degraus recusado');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
