import {
  MARGEM_PADRAO_M,
  aabbDaParede,
  detectarConflitos,
  expandir,
  intersecciona,
  volumeInterseccao,
} from '../../src/arqdor/editor';
import type { ElementoBim, ElementoMEP, GeometriaParede } from '../../src/arqdor/editor';

let passou = 0;
let falhou = 0;
function ok(c: boolean, n: string): void {
  if (c) { passou += 1; console.log('  ok   ' + n); } else { falhou += 1; console.log('  FALHA ' + n); }
}

const projetoId = 'p1';
const camadaId = 'camada_estrutura';

const parede: ElementoBim = {
  id: 'parede-1', projetoId, tipo: 'parede', nivel: 0,
  geometria: { ponto_a: [0, 0], ponto_b: [4, 0], altura: 3, espessura: 0.15 } as GeometriaParede,
  propriedades: {}, camadaId,
};

const lajeNivel1: ElementoBim = {
  id: 'laje-1', projetoId, tipo: 'laje', nivel: 1,
  geometria: { contorno: [[0, 0], [4, 0], [4, 3], [0, 3]], espessura: 0.12 },
  propriedades: {}, camadaId,
};

function tubo(id: string, caminho: [number, number, number][], diametroMm = 50, paredeId?: string): ElementoMEP {
  return { id, tipo: 'tubo_agua_fria', caminho, camada: 'hidraulica', diametroMm, paredeId };
}

console.log('Compatibilizacao — AABB');

const atravessando = tubo('mep-1', [[2, 1.2, -2], [2, 1.2, 2]], 50);
const longe = tubo('mep-2', [[10, 4, 10], [12, 4, 12]], 50);

const res1 = detectarConflitos([atravessando, longe], [parede]);
ok(res1.conflitos.length === 1, 'tubo atravessando a parede gera 1 conflito');
ok(res1.conflitos[0].mepId === 'mep-1', 'conflito aponta o tubo correto');
ok(res1.conflitos[0].elementoId === 'parede-1', 'conflito aponta a parede');
ok(res1.conflitos[0].volumeM3 > 0, 'conflito tem volume de interseccao');

// margem faz diferenca
const tangente = tubo('mep-3', [[2, 1.2, 0.2], [2, 1.2, 1.0]], 50);
const semMargem = detectarConflitos([tangente], [parede], { margemM: 0 });
const comMargem = detectarConflitos([tangente], [parede], { margemM: 0.3 });
ok(semMargem.conflitos.length === 0, 'sem margem o tubo tangente nao conflita');
ok(comMargem.conflitos.length === 1, 'com margem de 0,3 m passa a conflitar');
ok(MARGEM_PADRAO_M === 0.05, 'margem padrao 5 cm');

// tomada ancorada na parede nao e conflito
const tomada: ElementoMEP = {
  id: 'mep-tomada', tipo: 'tomada', caminho: [[2, 1.2, 0.05]], camada: 'eletrica', paredeId: 'parede-1',
};
const comTomada = detectarConflitos([tomada], [parede]);
ok(comTomada.conflitos.length === 0, 'tomada na propria parede nao conflita');
ok(comTomada.ignorados.length === 1 && comTomada.ignorados[0].motivo === 'tomada_na_parede', 'contato intencional registrado com motivo');

const tomadaSolta: ElementoMEP = { ...tomada, id: 'mep-tomada-2', paredeId: undefined };
ok(detectarConflitos([tomadaSolta], [parede]).conflitos.length === 1, 'tomada sem paredeId conflita');

// nivel sem altura (D7): laje do nivel 1 fica a 3 m
const tuboNoTeto = tubo('mep-4', [[2, 3.05, 1], [2, 3.05, 2]], 50);
const tuboBaixo = tubo('mep-5', [[2, 1.2, 1], [2, 1.2, 2]], 50);
ok(detectarConflitos([tuboNoTeto], [lajeNivel1]).conflitos.length === 1, 'tubo a 3,05 m conflita com laje do nivel 1');
ok(detectarConflitos([tuboBaixo], [lajeNivel1]).conflitos.length === 0, 'tubo a 1,2 m nao conflita com a laje do nivel 1');

// sem geometria
const vazio: ElementoMEP = { id: 'mep-vazio', tipo: 'tomada', caminho: [], camada: 'eletrica' };
ok(detectarConflitos([vazio], [parede]).elementosSemGeometria.length === 1, 'mep sem caminho e reportado');

// ordenacao por volume
const dois = detectarConflitos([
  tubo('mep-a', [[2, 1.2, -2], [2, 1.2, 2]], 200),
  tubo('mep-b', [[2, 0.1, -0.2], [2, 0.1, 0.2]], 25),
], [parede]);
ok(dois.conflitos.length === 2 && dois.conflitos[0].volumeM3 >= dois.conflitos[1].volumeM3, 'conflitos ordenados por volume');

// primitivas
const caixa = aabbDaParede(parede.geometria as GeometriaParede);
const expandida = expandir(caixa, 0.1);
ok(intersecciona(caixa, expandida), 'aabb expandida intersecta a original');
ok(volumeInterseccao(caixa, expandida) > 0, 'volume da interseccao positivo');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));