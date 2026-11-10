/**
 * Escada no BIM Core — quantitativo e projeção 2D. Puro.
 */

import type { ElementoBim } from '../../src/arqdor/editor/bim/schema';
import { derivar2d } from '../../src/arqdor/editor/bim/derivar2d';
import {
  categoriaDe,
  quantitativos,
} from '../../src/arqdor/editor/orcamento/quantitativos';
import { custoDoQuantitativo } from '../../src/arqdor/editor/materiais/custos';
import { catalogoPadrao, adicionarMaterial } from '../../src/arqdor/editor/materiais/catalogo';

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

console.log('Escada — TipoElemento, quantitativo e planta 2D');

const escada: ElementoBim = {
  id: 'el_esc1',
  projetoId: 'pr1',
  tipo: 'escada',
  nivel: 1,
  geometria: {
    posicao: [1, 2],
    largura: 1,
    comprimento: 4.48,
    alturaTotal: 2.8,
    numeroDegraus: 16,
  },
  propriedades: {},
  camadaId: 'c1',
  materialId: 'MAT-LAJ-CONC',
};

// ---------- 1. classificação ----------
ok(categoriaDe('escada') === 'estrutura', 'escada é classificada como estrutura');

// ---------- 2. quantitativo ----------
const resumo = quantitativos([escada]);
const porUnidade = new Map(resumo.grupos.map((grupo) => [grupo.unidade, grupo]));
ok(resumo.grupos.length === 4, 'quantitativo: 4 grupos (m², m³, un, m)');

const area = porUnidade.get('m2');
ok(area !== undefined && perto(area.quantidadeComPerda, 1 * 4.48 * 1.03), 'quantitativo: área em planta 4,48 m² com perda de estrutura');

const concreto = porUnidade.get('m3');
// prisma de degraus: largura × piso × espelho × n(n+1)/2  (piso 0,28 · espelho 0,175 · n 16)
const esperadoConcreto = (1 * 0.28 * 0.175 * 16 * 17) / 2;
ok(concreto !== undefined && perto(concreto.quantidadeComPerda, esperadoConcreto * 1.03), 'quantitativo: concreto pelo prisma de degraus (6,664 m³)');

const degraus = porUnidade.get('un');
ok(degraus !== undefined && degraus.quantidadeComPerda === 16, 'quantitativo: 16 degraus (un não recebe perda)');

const espelho = porUnidade.get('m');
ok(espelho !== undefined && perto(espelho.quantidadeComPerda, 2.8 * 1.03), 'quantitativo: espelhos somam 2,80 m');

// caixa envolvente daria 1 × 4,48 × 2,8 = 12,54 m³ — o dobro. Prova de que não é caixa.
ok(
  concreto !== undefined && concreto.quantidadeComPerda < 1 * 4.48 * 2.8 * 1.03,
  'quantitativo: concreto não usa a caixa envolvente',
);

// ---------- 3. orçamento ----------
const catalogo = catalogoPadrao();
const custos = custoDoQuantitativo(resumo.grupos, catalogo);
const linhaConcreto = custos.linhas.find((linha) => linha.materialId === 'MAT-LAJ-CONC' && linha.unidade === 'm3');
ok(linhaConcreto !== undefined && perto(linhaConcreto.subtotal, linhaConcreto.quantidade * 620), 'orçamento: concreto entra com preço do catálogo');
ok(custos.linhas.some((linha) => linha.unidade === 'un' && linha.quantidade === 16), 'orçamento: degraus entram como unidade');

const semPreco = adicionarMaterial(catalogo, {
  id: 'MAT-ESC-PROP',
  nome: 'Escada — concreto próprio',
  categoria: 'estrutura',
  unidade: 'm3',
  precoUnitario: 0,
  fontePreco: 'PROPRIO',
});
ok(semPreco.ok, 'orçamento: material alternativo aceito');

// ---------- 4. planta 2D ----------
const linhas = derivar2d([escada]);
const contorno = linhas.filter((linha) => linha.tracejada !== true);
const degrausLinhas = linhas.filter((linha) => linha.tracejada === true);
ok(contorno.length === 4, 'planta: retângulo do contorno com 4 linhas');
ok(degrausLinhas.length === 15, 'planta: uma linha por degrau (n − 1 = 15)');
ok(linhas.every((linha) => linha.tipo === 'escada'), 'planta: todas as linhas são do tipo escada');
ok(
  contorno.every((linha) => linha.x1 >= 1 - 1e-9 && linha.x1 <= 2 + 1e-9 && linha.y1 >= 2 - 1e-9 && linha.y1 <= 6.48 + 1e-9),
  'planta: contorno respeita a posição em planta (1,2) e a largura',
);
const ysDegraus = degrausLinhas.map((linha) => linha.y1).sort((a, b) => a - b);
ok(perto(ysDegraus[0], 2 + 0.28), 'planta: primeiro degrau a um piso do início');
ok(perto(ysDegraus[ysDegraus.length - 1], 2 + 0.28 * 15), 'planta: último degrau antes do fim');

// ---------- 5. guarda-corpo de dados inválidos ----------
const quebrada: ElementoBim = {
  ...escada,
  geometria: { posicao: [0, 0], largura: 1, comprimento: 4, alturaTotal: 2.8, numeroDegraus: 0 },
};
ok(quantitativos([quebrada]).grupos.length === 0, 'dados inválidos: zero degraus não gera quantitativo');
ok(derivar2d([quebrada]).length === 0, 'dados inválidos: zero degraus não gera planta');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
