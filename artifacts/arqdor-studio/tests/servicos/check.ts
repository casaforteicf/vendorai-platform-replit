/**
 * Orçamento por serviço — composição no elemento, sem mexer no orçamento de quem não usa.
 */

import type { ElementoBim } from '../../src/arqdor/editor/bim/schema';
import { custoDeServicos } from '../../src/arqdor/editor/orcamento/servicos';
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

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
