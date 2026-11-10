/**
 * Compatibilização — a tela usa `detectarConflitos`; aqui provamos o motor com um tubo real.
 * A parede vem do fluxo completo (retângulo → push/pull → materializar), como na UI.
 */

import { detectarConflitos } from '../../src/arqdor/editor/mep/colisao';
import type { ElementoMEP } from '../../src/arqdor/editor/mep/schema';
import { PLANO_CHAO, aplicarPasso, calcularPushPull, criarRetangulo, materializarSolido } from '../../src/arqdor/editor';
import type { EstadoModelador, Solido } from '../../src/arqdor/editor';

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

console.log('Compatibilização — tubo contra parede');

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
const extrusao = calcularPushPull(comFace.estado.solidos[0], comFace.estado.solidos[0].faces[0].id, 2.8);
if (!extrusao.ok) throw new Error('push/pull falhou');
const comVolume = aplicarPasso(comFace.estado, extrusao.operacoes, 'direta');
if (!comVolume.ok) throw new Error('aplicar falhou');
const parede = materializarSolido(comVolume.estado.solidos[0], { projetoId: 'proj_1', camadaId: 'camada_estrutura' });
if (!parede.ok) throw new Error('materializar falhou');

const tuboQueCruza: ElementoMEP = {
  id: 'mep_1',
  tipo: 'tubo_agua_fria',
  caminho: [
    [2, 1.5, -1],
    [2, 1.5, 1],
  ],
  diametroMm: 50,
  alturaM: 1.5,
  camada: 'hidraulica',
};

const resultado = detectarConflitos([tuboQueCruza], [parede.elemento]);
ok(resultado.conflitos.length === 1, 'tubo atravessando a parede gera 1 conflito');
if (resultado.conflitos.length === 1) {
  const conflito = resultado.conflitos[0];
  ok(conflito.mepId === 'mep_1', 'conflito aponta para o tubo');
  ok(conflito.elementoId === parede.elemento.id, 'conflito aponta para a parede');
  ok(conflito.tipoElemento === 'parede', 'conflito identifica o tipo do elemento');
  ok(conflito.volumeM3 > 0, 'volume de interseção positivo');
}

const tuboLonge: ElementoMEP = { ...tuboQueCruza, id: 'mep_2', caminho: [[8, 1.5, -1], [8, 1.5, 1]] };
ok(detectarConflitos([tuboLonge], [parede.elemento]).conflitos.length === 0, 'tubo fora da parede não gera conflito');

const tuboParalelo: ElementoMEP = { ...tuboQueCruza, id: 'mep_3', caminho: [[0.5, 1.5, 1], [3.5, 1.5, 1]] };
ok(detectarConflitos([tuboParalelo], [parede.elemento]).conflitos.length === 0, 'tubo paralelo e afastado não gera conflito');

const tomadaNaParede: ElementoMEP = {
  id: 'mep_4',
  tipo: 'tomada',
  caminho: [
    [2, 1.2, 0.02],
    [2, 1.2, 0.02],
  ],
  paredeId: parede.elemento.id,
  camada: 'eletrica',
};
const comTomada = detectarConflitos([tomadaNaParede], [parede.elemento]);
ok(comTomada.conflitos.length === 0, 'tomada encostada na própria parede não é conflito');
ok(comTomada.ignorados.length === 1, 'tomada entra na lista de contatos intencionais');

const comMargemGrande = detectarConflitos([tuboParalelo], [parede.elemento], { margemM: 1.2 });
ok(comMargemGrande.conflitos.length === 1, 'margem grande amplia a caixa e encontra conflito');

ok(detectarConflitos([], [parede.elemento]).conflitos.length === 0, 'sem MEP não há conflito');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
