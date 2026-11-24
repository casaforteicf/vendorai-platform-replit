/**
 * Esquadrias (D13) — vão paramétrico com validação de limites e efeito contábil.
 *
 * Nada de parede sintética: a parede nasce do fluxo real (retângulo → push/pull → materializar).
 */

import { abrirVao, idVaoDe, vaosDaParede } from '../../src/arqdor/editor/bim/esquadrias';
import { PLANO_CHAO, aplicarPasso, calcularPushPull, criarRetangulo, materializarSolido } from '../../src/arqdor/editor';
import type { EstadoModelador, ElementoBim, Solido } from '../../src/arqdor/editor';
import { derivar2d } from '../../src/arqdor/editor';
import { metricasArea } from '../../src/arqdor/editor/bim/store-core';
import { quantitativos } from '../../src/arqdor/editor/orcamento/quantitativos';

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
  return Math.abs(a - b) <= 1e-6;
}

console.log('Esquadrias — porta e janela como vão contábil');

const VAZIO: Solido = {
  id: 'solido_p1',
  nome: 'Parede',
  vertices: [],
  arestas: [],
  faces: [],
  transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
};

const comFace = aplicarPasso(
  { solidos: [VAZIO], proximoSolidoN: 1 } as EstadoModelador,
  criarRetangulo({ solido: VAZIO, plano: PLANO_CHAO, a: [0, 0, 0], b: [4, 0, 0.15] }),
  'direta',
);
if (!comFace.ok) throw new Error('retângulo falhou');
const face = comFace.estado.solidos[0].faces[0].id;
const extrusao = calcularPushPull(comFace.estado.solidos[0], face, 2.8);
if (!extrusao.ok) throw new Error('push/pull falhou: ' + extrusao.erro.codigo);
const comVolume = aplicarPasso(comFace.estado, extrusao.operacoes, 'direta');
if (!comVolume.ok) throw new Error('aplicar falhou');

const parede = materializarSolido(comVolume.estado.solidos[0], { projetoId: 'proj_1', camadaId: 'camada_estrutura' });
if (!parede.ok || parede.elemento.tipo !== 'parede') throw new Error('parede não materializou');
const elementoParede = parede.elemento;
const contexto = { projetoId: 'proj_1', camadaId: 'camada_estrutura' };

// ---------- porta ----------
const porta = abrirVao(elementoParede, 'porta', { offset: 0.5, largura: 0.8, altura: 2.1 }, contexto);
ok(porta.ok && porta.elemento.tipo === 'porta', 'porta: criada na parede');
if (porta.ok && porta.elemento.tipo === 'porta') {
  const g = porta.elemento.geometria;
  ok('parede_id' in g && g.parede_id === elementoParede.id, 'porta: aponta para a parede');
  ok(
    'offset' in g && 'largura' in g && 'altura' in g
      ? perto(g.offset, 0.5) && perto(g.largura, 0.8) && perto(g.altura, 2.1)
      : false,
    'porta: medidas preservadas',
  );
}

// ---------- janela ----------
const janela = abrirVao(elementoParede, 'janela', { offset: 2, largura: 1.2, altura: 1.2, peitoril: 1 }, contexto);
ok(janela.ok && janela.elemento.tipo === 'janela', 'janela: criada na parede');
if (janela.ok && janela.elemento.tipo === 'janela') {
  ok('peitoril' in janela.elemento.geometria && perto(janela.elemento.geometria.peitoril, 1), 'janela: peitoril registrado');
}

// ---------- limites ----------
const fora = abrirVao(elementoParede, 'porta', { offset: 3.5, largura: 0.8, altura: 2.1 }, contexto);
ok(!fora.ok && fora.erro.codigo === 'VAO_NAO_CABE', 'porta além do fim da parede → VAO_NAO_CABE');

const largo = abrirVao(elementoParede, 'porta', { offset: 0, largura: 5, altura: 2.1 }, contexto);
ok(!largo.ok && largo.erro.codigo === 'VAO_NAO_CABE', 'vão mais largo que a parede → VAO_NAO_CABE');

const alto = abrirVao(elementoParede, 'porta', { offset: 0.5, largura: 0.8, altura: 3.5 }, contexto);
ok(!alto.ok && alto.erro.codigo === 'ALTURA_EXCEDE_PAREDE', 'porta mais alta que a parede → ALTURA_EXCEDE_PAREDE');

const janelaAlta = abrirVao(elementoParede, 'janela', { offset: 0.5, largura: 1, altura: 1.5, peitoril: 1.6 }, contexto);
ok(!janelaAlta.ok && janelaAlta.erro.codigo === 'ALTURA_EXCEDE_PAREDE', 'janela com peitoril+altura acima → ALTURA_EXCEDE_PAREDE');

const zeroLargura = abrirVao(elementoParede, 'porta', { offset: 0, largura: 0, altura: 2.1 }, contexto);
ok(!zeroLargura.ok && zeroLargura.erro.codigo === 'MEDIDA_INVALIDA', 'largura zero → MEDIDA_INVALIDA');

const naoLaje = abrirVao(
  { ...elementoParede, tipo: 'laje', geometria: { contorno: [[0, 0], [1, 0], [1, 1]], espessura: 0.12 } },
  'porta',
  { offset: 0, largura: 0.8, altura: 2.1 },
  contexto,
);
ok(!naoLaje.ok && naoLaje.erro.codigo === 'NAO_E_PAREDE', 'elemento que não é parede → NAO_E_PAREDE');

// ---------- id determinístico ----------
ok(idVaoDe('p1', 'porta', 0.5) === idVaoDe('p1', 'porta', 0.5), 'id do vão é determinístico');
ok(idVaoDe('p1', 'porta', 0.5) !== idVaoDe('p1', 'porta', 0.6), 'offsets diferentes geram ids diferentes');

// ---------- efeito contábil ----------
const aberturas: ElementoBim[] = [];
if (porta.ok) aberturas.push(porta.elemento);
if (janela.ok) aberturas.push(janela.elemento);
const elementos = [elementoParede, ...aberturas];
ok(vaosDaParede(elementos, elementoParede.id).length === 2, 'duas aberturas contadas na parede');

const qtd = quantitativos(elementos);
const alvenaria = qtd.grupos.find((grupo) => grupo.categoria === 'alvenaria' && grupo.unidade === 'm2');
if (alvenaria !== undefined) {
  const esperado = 4 * 2.8 - 0.8 * 2.1 - 1.2 * 1.2;
  ok(perto(alvenaria.quantidadeBruta, esperado), 'orçamento desconta os dois vãos da alvenaria');
}

const areas = metricasArea({ elementos });
ok(perto(areas.total.areaAberturas, 0.8 * 2.1 + 1.2 * 1.2), 'métricas de área somam os vãos');
ok(areas.total.areaParedeLiquida < areas.total.areaParedeBruta, 'área líquida menor que a bruta');

const linhas = derivar2d(elementos);
ok(linhas.filter((linha) => linha.tipo === 'esquadria').length === 4, 'planta 2D desenha os batentes dos 2 vãos');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
