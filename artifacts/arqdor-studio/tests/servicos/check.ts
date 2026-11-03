/**
 * Orçamento por serviço — composição no elemento, sem mexer no orçamento de quem não usa.
 */

import type { ElementoBim } from '../../src/arqdor/editor/bim/schema';
import { custoDeServicos } from '../../src/arqdor/editor/orcamento/servicos';
import { orcamentoCompleto } from '../../src/arqdor/editor/orcamento/orcamento-completo';
import { quantitativos } from '../../src/arqdor/editor/orcamento/quantitativos';
import { custoDoQuantitativo } from '../../src/arqdor/editor/materiais/custos';
import { adicionarMaterial, catalogoPadrao } from '../../src/arqdor/editor/materiais/catalogo';
import type { Catalogo } from '../../src/arqdor/editor/materiais/catalogo';
import type { Material } from '../../src/arqdor/editor/materiais/schema';
import type { Composicao } from '../../src/arqdor/editor/materiais/composicoes';

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

console.log('Serviços — composição no orçamento');

const insumo = (id: string, preco: number): Material => ({
  id,
  nome: id,
  categoria: 'alvenaria',
  unidade: 'un',
  precoUnitario: preco,
  fontePreco: 'PROPRIO',
});

let catalogo: Catalogo = catalogoPadrao();
const a = adicionarMaterial(catalogo, insumo('MAT-S1', 10));
if (a.ok) catalogo = a.catalogo;

const composicao: Composicao = {
  id: 'COMP-ALV',
  nome: 'Alvenaria',
  unidade: 'm2',
  insumos: [{ materialId: 'MAT-S1', quantidade: 2 }],
};

const parede = (id: string, servicoId?: string): ElementoBim => ({
  id,
  projetoId: 'p1',
  tipo: 'parede',
  nivel: 1,
  geometria: { ponto_a: [0, 0], ponto_b: [4, 0], altura: 2.8, espessura: 0.15 },
  propriedades: {},
  camadaId: 'c1',
  ...(servicoId === undefined ? {} : { servicoId }),
});

const semServico = custoDeServicos([parede('el_1'), parede('el_2')], catalogo, [composicao]);
ok(semServico.total === 0 && semServico.linhas.length === 0, 'regressão: elemento sem servicoId não gera custo de serviço');

const comServico = custoDeServicos([parede('el_1', 'COMP-ALV')], catalogo, [composicao]);
ok(comServico.linhas.length === 1 && comServico.total === 20, 'serviço: 1 m² × R$ 20 (2 × R$ 10)');
ok(comServico.linhas[0].faltando.length === 0, 'serviço: sem insumo faltando');

const comQuantidade = custoDeServicos([parede('el_1', 'COMP-ALV')], catalogo, [composicao], { el_1: 3 });
ok(comQuantidade.total === 60, 'serviço: quantidade do elemento multiplica o custo');

const composicaoAusente = custoDeServicos([parede('el_9', 'COMP-X')], catalogo, [composicao]);
ok(composicaoAusente.total === 0 && composicaoAusente.semComposicao[0] === 'el_9', 'serviço: composição inexistente é reportada, não cobrada');

const semPreco = custoDeServicos(
  [parede('el_3', 'COMP-SEM')],
  catalogo,
  [{ id: 'COMP-SEM', nome: 'Sem preço', unidade: 'm2', insumos: [{ materialId: 'MAT-NAO-EXISTE', quantidade: 1 }] }],
);
ok(semPreco.total === 0 && semPreco.linhas[0].faltando[0] === 'MAT-NAO-EXISTE', 'serviço: insumo sem preço aparece em faltando');

// ---------- modelo misto: uma parede com serviço, outra sem ----------
const comMaterial = { ...parede('el_mat'), materialId: 'MAT-S1' };
const misto = orcamentoCompleto([comMaterial, parede('el_srv', 'COMP-ALV')], catalogo, [composicao]);
ok(misto.excluidosDoMaterial.length === 1 && misto.excluidosDoMaterial[0] === 'el_srv', 'misto: elemento com serviço sai do quantitativo de material');
ok(!misto.excluidosDoMaterial.includes('el_mat'), 'misto: elemento sem serviço continua no material');
const referencia = custoDoQuantitativo(quantitativos([comMaterial]).grupos, catalogo);
ok(misto.materiais.total === referencia.total, 'misto: material do elemento sem serviço é igual ao cálculo antigo');
ok(misto.servicos.linhas.length === 1 && misto.servicos.linhas[0].quantidade === 11.2, 'misto: serviço usa a metragem real da parede (11,2 m²)');
ok(misto.total === Math.round((referencia.total + 11.2 * 20) * 100) / 100, 'misto: total = material + serviço, sem dupla contagem');

const semNenhumServico = orcamentoCompleto([comMaterial], catalogo, [composicao]);
ok(semNenhumServico.servicos.total === 0 && semNenhumServico.total === referencia.total, 'regressão: modelo sem serviço mantém o total antigo');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
