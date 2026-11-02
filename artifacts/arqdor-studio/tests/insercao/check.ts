/**
 * Inserção paramétrica — caixa por medidas, com topologia e efeito no BIM.
 * O sólido nasce como o usuário digita; nada de desenho com mouse.
 */

import { PRESETS_INSERCAO, criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import { aplicarPasso, ESTADO_INICIAL } from '../../src/arqdor/editor';
import type { EstadoModelador } from '../../src/arqdor/editor';
import { materializarSolido } from '../../src/arqdor/editor/bim/materializar';

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
  return Math.abs(a - b) <= 1e-9;
}

console.log('Inserção paramétrica — sólido por medidas');

const parede = criarCaixa({
  id: 'solido_1',
  nome: 'Parede',
  posicao: [0, 0, 0],
  dimensoes: { largura: 4, altura: 2.8, profundidade: 0.15 },
});
ok(parede.ok, 'caixa da parede criada');
if (!parede.ok) throw new Error('caixa falhou');
ok(parede.solido.vertices.length === 8, 'caixa tem 8 vértices');
ok(parede.solido.arestas.length === 12, 'caixa tem 12 arestas');
ok(parede.solido.faces.length === 6, 'caixa tem 6 faces');

const xs = parede.solido.vertices.map((v) => v.posicao[0]);
const ys = parede.solido.vertices.map((v) => v.posicao[1]);
const zs = parede.solido.vertices.map((v) => v.posicao[2]);
ok(perto(Math.max(...xs) - Math.min(...xs), 4), 'largura em X = 4');
ok(perto(Math.max(...ys) - Math.min(...ys), 2.8), 'altura em Y = 2,8');
ok(perto(Math.max(...zs) - Math.min(...zs), 0.15), 'profundidade em Z = 0,15');
ok(perto(Math.min(...xs), 0) && perto(Math.min(...ys), 0) && perto(Math.min(...zs), 0), 'posição é o canto mínimo');

const estado: EstadoModelador = { ...ESTADO_INICIAL };
const criado = aplicarPasso(estado, [{ tipo: 'criar_solido', solido: parede.solido }], 'direta');
ok(criado.ok && criado.estado.solidos.length === 1, 'operação criar_solido aplica');

if (criado.ok) {
  const removido = aplicarPasso(criado.estado, [{ tipo: 'remover_solido', solido: parede.solido }], 'direta');
  ok(removido.ok && removido.estado.solidos.length === 0, 'remover_solido aplica');
  const desfeito = removido.ok
    ? aplicarPasso(removido.estado, [{ tipo: 'remover_solido', solido: parede.solido }], 'reversa')
    : removido;
  ok(desfeito.ok && desfeito.estado.solidos.length === 1, 'undo do excluir devolve o sólido');

  const movido = aplicarPasso(
    criado.estado,
    [
      {
        tipo: 'atualizar_solido',
        antes: parede.solido,
        depois: { ...parede.solido, transformacao: { posicao: [10, 0, 5], rotacao: [0, 0, 0], escala: [2, 1, 1] } },
      },
    ],
    'direta',
  );
  ok(movido.ok && movido.estado.solidos[0].transformacao.posicao[0] === 10, 'posição editável grava no estado');
  ok(movido.ok && movido.estado.solidos[0].transformacao.escala[0] === 2, 'escala editável grava no estado');
}

// classificação BIM a partir das medidas
const paredeBim = materializarSolido(parede.solido, { projetoId: 'p', camadaId: 'c' });
ok(paredeBim.ok && paredeBim.elemento.tipo === 'parede', 'medidas de parede → Parede no BIM');

const laje = criarCaixa({ id: 'solido_2', nome: 'Laje', posicao: [0, 0, 0], dimensoes: { largura: 4, altura: 0.12, profundidade: 3 } });
if (laje.ok) {
  const lajeBim = materializarSolido(laje.solido, { projetoId: 'p', camadaId: 'c' });
  ok(lajeBim.ok && lajeBim.elemento.tipo === 'laje', 'medidas de laje → Laje no BIM');
}

const caixa = criarCaixa({ id: 'solido_3', nome: 'Bloco', posicao: [0, 0, 0], dimensoes: { largura: 1, altura: 1, profundidade: 1 } });
if (caixa.ok) {
  const blocoBim = materializarSolido(caixa.solido, { projetoId: 'p', camadaId: 'c' });
  ok(blocoBim.ok && blocoBim.elemento.tipo === 'mobiliario', 'cubo 1×1×1 → Mobiliário no BIM');
}

// presets coerentes
const presetParede = criarCaixa({ id: 'solido_4', nome: 'Parede preset', posicao: [0, 0, 0], dimensoes: PRESETS_INSERCAO.parede.dimensoes });
ok(presetParede.ok, 'preset "parede" é um sólido válido');

// validação
const invalida = criarCaixa({ id: 'solido_5', nome: 'Zero', posicao: [0, 0, 0], dimensoes: { largura: 0, altura: 2.8, profundidade: 0.15 } });
ok(!invalida.ok && invalida.erro.codigo === 'DIMENSAO_INVALIDA', 'largura zero → DIMENSAO_INVALIDA');

const negativa = criarCaixa({ id: 'solido_6', nome: 'Negativa', posicao: [0, 0, 0], dimensoes: { largura: 4, altura: -1, profundidade: 0.15 } });
ok(!negativa.ok && negativa.erro.codigo === 'DIMENSAO_INVALIDA', 'altura negativa → DIMENSAO_INVALIDA');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
