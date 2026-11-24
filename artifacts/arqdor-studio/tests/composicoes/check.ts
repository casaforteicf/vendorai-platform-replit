/**
 * Composições — custo por insumos e importação CSV (formato SINAPI-like).
 */

import { adicionarMaterial, catalogoPadrao } from '../../src/arqdor/editor/materiais/catalogo';
import type { Catalogo } from '../../src/arqdor/editor/materiais/catalogo';
import type { Material } from '../../src/arqdor/editor/materiais/schema';
import {
  exportarComposicoesCsv,
  importarComposicoesCsv,
  custoComposicao,
} from '../../src/arqdor/editor/materiais/composicoes';
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

console.log('Composições — custo e CSV');

const material = (id: string, nome: string, precoUnitario: number): Material => ({
  id,
  nome,
  categoria: 'alvenaria',
  unidade: 'm2',
  precoUnitario,
  fontePreco: 'PROPRIO',
});

let catalogo: Catalogo = catalogoPadrao();
const comCimento = adicionarMaterial(catalogo, material('MAT-TESTE-CIM', 'Cimento', 40));
ok(comCimento.ok, 'catálogo: material de teste criado');
if (comCimento.ok) catalogo = comCimento.catalogo;
const comAreia = adicionarMaterial(catalogo, material('MAT-TESTE-ARE', 'Areia', 100));
if (comAreia.ok) catalogo = comAreia.catalogo;

const composicao: Composicao = {
  id: 'COMP-1',
  nome: 'Alvenaria teste',
  unidade: 'm2',
  insumos: [
    { materialId: 'MAT-TESTE-CIM', quantidade: 0.5 },
    { materialId: 'MAT-TESTE-ARE', quantidade: 0.1 },
  ],
};
const custo = custoComposicao(composicao, catalogo);
ok(custo.custo === 30, 'custo: 0,5 × 40 + 0,1 × 100 = 30,00');
ok(custo.faltando.length === 0, 'custo: sem insumos faltando');

const comFalta = custoComposicao(
  { ...composicao, insumos: [{ materialId: 'NAO-EXISTE', quantidade: 1 }] },
  catalogo,
);
ok(comFalta.custo === 0 && comFalta.faltando[0] === 'NAO-EXISTE', 'custo: insumo desconhecido não vira R$ 0 silencioso');

const csv = [
  'composicao_id;composicao_nome;unidade;insumo_id;quantidade',
  'COMP-A;Alvenaria;m2;MAT-TESTE-CIM;0,5',
  'COMP-A;Alvenaria;m2;MAT-TESTE-ARE;0,1',
  'COMP-B;Reboco;m2;MAT-TESTE-CIM;0,2',
  '',
].join('\n');
const importado = importarComposicoesCsv(csv);
ok(importado.erro === undefined && importado.composicoes.length === 2, 'csv: duas composições agrupadas');
ok(importado.composicoes[0].insumos.length === 2, 'csv: linhas do mesmo id viram insumos da mesma composição');
ok(importado.composicoes[0].insumos[0].quantidade === 0.5, 'csv: quantidade com vírgula é interpretada');

const invalido = importarComposicoesCsv(
  ['composicao_id;composicao_nome;unidade;insumo_id;quantidade', 'COMP-C;X;m2;MAT-TESTE-CIM;abc'].join('\n'),
);
ok(invalido.composicoes.length === 0 && invalido.ignorados[0].motivo === 'QUANTIDADE_INVALIDA', 'csv: quantidade inválida é ignorada com motivo');

const semCabecalho = importarComposicoesCsv('a;b;c');
ok(semCabecalho.erro === 'CABECALHO_INVALIDO', 'csv: cabeçalho inválido recusado');

const idaEVolta = importarComposicoesCsv(exportarComposicoesCsv(importado.composicoes));
ok(idaEVolta.composicoes.length === 2 && idaEVolta.composicoes[0].insumos.length === 2, 'csv: exportar e importar preserva a composição');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
