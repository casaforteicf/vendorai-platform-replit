/**
 * Prova de comportamento do BIM: store (undo/redo), ordenação, áreas e derivar2d.
 */

import {
  aplicarOperacaoBim,
  aplicarPassoBim,
  camadaFallback,
  derivar2d,
  estadoInicialCamadas,
  ESTADO_BIM_INICIAL,
  hidratarObjetos,
  inverterOperacaoBim,
  metricasArea,
  ordenarPorNivel,
} from '../../src/arqdor/editor';
import type { ElementoBim, GeometriaLaje, GeometriaParede } from '../../src/arqdor/editor';

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

const projetoId = 'p1';
const camada = 'camada_estrutura';

function parede(id: string, nivel: number, altura = 3, espessura = 0.15): ElementoBim {
  const g: GeometriaParede = { ponto_a: [0, 0], ponto_b: [4, 0], altura, espessura };
  return { id, projetoId, tipo: 'parede', nivel, geometria: g, propriedades: {}, camadaId: camada };
}

function laje(id: string, nivel: number): ElementoBim {
  const g: GeometriaLaje = { contorno: [[0, 0], [4, 0], [4, 3], [0, 3]], espessura: 0.12 };
  return { id, projetoId, tipo: 'laje', nivel, geometria: g, propriedades: {}, camadaId: camada };
}

function porta(id: string, paredeId: string, largura: number, altura: number): ElementoBim {
  return {
    id,
    projetoId,
    tipo: 'porta',
    nivel: 0,
    geometria: { parede_id: paredeId, offset: 1, largura, altura },
    propriedades: {},
    camadaId: camada,
  };
}

console.log('BIM — store, areas e derivar2d');

// 1. derivar parede: 2 faces + 2 tampas
const p = parede('parede-1', 0);
const linhasParede = derivar2d([p]);
ok(linhasParede.length === 4, 'parede gera 4 linhas (2 faces + 2 tampas)');
ok(linhasParede.every((l) => l.camadaId === camada), 'camada propagada para as linhas');

// 2. furo gera linha tracejada
const comFuro: ElementoBim = {
  ...p,
  geometria: { ...(p.geometria as GeometriaParede), aberturas: [{ id: 'f1', tipo: 'furo', offset: 2, altura: 1.2, diametro: 0.1, elementoMepId: 'mep-1' }] },
};
const linhasFuro = derivar2d([comFuro]);
ok(linhasFuro.length === 5, 'furo adiciona 1 linha');
ok(linhasFuro.filter((l) => l.tracejada === true).length === 1, 'linha do furo e tracejada');

// 3. porta gera 2 linhas de esquadria
const linhasPorta = derivar2d([p, porta('porta-1', 'parede-1', 0.8, 2.1)]);
ok(linhasPorta.filter((l) => l.tipo === 'esquadria').length === 2, 'porta gera 2 linhas de esquadria');

// 4. laje: contorno fechado
const l = laje('laje-1', 0);
ok(derivar2d([l]).length === 4, 'laje gera 4 linhas de contorno');

// 5. areas: parede bruta 12 m2, porta 1.68, liquida 10.32
const estadoAreas = { elementos: [p, porta('porta-1', 'parede-1', 0.8, 2.1)] };
const m = metricasArea(estadoAreas);
ok(Math.abs(m.total.areaParedeBruta - 12) < 1e-9, 'area bruta da parede = 12 m2');
ok(Math.abs(m.total.areaAberturas - 1.68) < 1e-9, 'vao da porta = 1.68 m2');
ok(Math.abs(m.total.areaParedeLiquida - 10.32) < 1e-9, 'area liquida desconta o vao');
ok(Math.abs(metricasArea({ elementos: [l] }).total.areaLaje - 12) < 1e-9, 'area da laje 4x3 = 12 m2');

// 6. furo desconta area circular
const comFuroAreas = { elementos: [comFuro] };
ok(Math.abs(metricasArea(comFuroAreas).total.areaAberturas - Math.PI * 0.05 * 0.05) < 1e-9, 'furo desconta pi*r^2');

// 7. ordenacao por nivel e tipo
const bagunçado = { elementos: [porta('porta-1', 'parede-1', 0.8, 2.1), parede('parede-2', 1), l, p] };
const ordenado = ordenarPorNivel(bagunçado);
ok(ordenado[0].nivel === 0 && ordenado[0].tipo === 'laje', 'nivel 0 comeca pela laje');
ok(ordenado[1].tipo === 'parede', 'depois a parede do nivel 0');
ok(ordenado[ordenado.length - 1].nivel === 1, 'nivel 1 fica no fim');

// 8. store: criar, inverter, reverter
const criado = aplicarOperacaoBim(ESTADO_BIM_INICIAL, { tipo: 'criar_elemento_bim', elemento: p });
ok(criado.ok && criado.estado.elementos.length === 1, 'criar elemento aplica');
const inverso = inverterOperacaoBim({ tipo: 'criar_elemento_bim', elemento: p });
const revertido = aplicarPassoBim(criado.ok ? criado.estado : ESTADO_BIM_INICIAL, inverso, 'direta');
ok(revertido.ok && revertido.estado.elementos.length === 0, 'inverso remove o elemento');
ok(!aplicarOperacaoBim(ESTADO_BIM_INICIAL, { tipo: 'remover_elemento_bim', elemento: p }).ok, 'remover inexistente falha');

// 9. abertura: so em parede
const emLaje = aplicarOperacaoBim({ elementos: [l] }, {
  tipo: 'adicionar_abertura',
  elementoId: 'laje-1',
  abertura: { id: 'f9', tipo: 'furo', offset: 1, altura: 1, diametro: 0.1, elementoMepId: 'm' },
});
ok(!emLaje.ok && emLaje.erro.codigo === 'NAO_E_PAREDE', 'abertura em laje recusada');

const comAbertura = aplicarOperacaoBim({ elementos: [p] }, {
  tipo: 'adicionar_abertura',
  elementoId: 'parede-1',
  abertura: { id: 'f2', tipo: 'furo', offset: 1, altura: 1.2, diametro: 0.1, elementoMepId: 'mep-2' },
});
ok(comAbertura.ok, 'abertura em parede aceita');
if (comAbertura.ok) {
  const volta = aplicarPassoBim(comAbertura.estado, [
    { tipo: 'remover_abertura', elementoId: 'parede-1', abertura: { id: 'f2', tipo: 'furo', offset: 1, altura: 1.2, diametro: 0.1, elementoMepId: 'mep-2' } },
  ], 'reversa');
  ok(volta.ok, 'reversa de remover_abertura reaplica o furo');
}

// 10. movel precisa de posicao (D5)
const movelSemPos: ElementoBim = {
  id: 'movel-1', projetoId, tipo: 'mobiliario', nivel: 0,
  geometria: { dimensoes: { largura: 1, altura: 2, profundidade: 0.6 } },
  propriedades: {}, camadaId: camada,
};
ok(derivar2d([movelSemPos]).length === 0, 'movel sem posicao nao e derivado (D5)');
const movelComPos: ElementoBim = { ...movelSemPos, geometria: { dimensoes: { largura: 1, altura: 2, profundidade: 0.6 }, posicao: [2, 1.5] } };
ok(derivar2d([movelComPos]).length === 4, 'movel com posicao gera 4 linhas');

// 11. hidratacao de elemento legado sem camadaId
const camadas = estadoInicialCamadas();
const legado = hidratarObjetos(camadas, [{ ...p, camadaId: undefined } as unknown as { id: string; camadaId?: string }]);
ok(legado.migrados === 1 && legado.objetos[0].camadaId === camadaFallback(camadas), 'elemento legado recebe camada padrao');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));