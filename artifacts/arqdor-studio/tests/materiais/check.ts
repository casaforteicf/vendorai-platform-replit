/**
 * M1 — Materiais: catálogo, aplicação, cotação e custo. Puro.
 */

import {
  adicionarMaterial,
  atualizarPrecoUnitario,
  catalogoPadrao,
  obterMaterial,
} from '../../src/arqdor/editor/materiais/catalogo';
import {
  aplicarMaterialEmElemento,
  aplicarMaterialEmFace,
  materialDaFace,
  materiaisEfetivos,
  removerMaterialDoElemento,
} from '../../src/arqdor/editor/materiais/aplicar';
import {
  exportarParaCotacao,
  importarCotacao,
  itensDeCotacao,
} from '../../src/arqdor/editor/materiais/cotacao';
import { custoDoQuantitativo } from '../../src/arqdor/editor/materiais/custos';
import { quantitativos } from '../../src/arqdor/editor/orcamento/quantitativos';
import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import type { ElementoBim } from '../../src/arqdor/editor/bim/schema';

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

console.log('M1 — Materiais: catálogo, aplicação, cotação e custo');

// ---------- 1. catálogo ----------
const catalogo = catalogoPadrao();
ok(obterMaterial(catalogo, 'nao-existe').id === 'MAT-INDEFINIDO', 'catálogo: material desconhecido cai no fallback');
ok(obterMaterial(catalogo, null).id === 'MAT-INDEFINIDO', 'catálogo: materialId nulo cai no fallback');

const duplicado = adicionarMaterial(catalogo, obterMaterial(catalogo, 'MAT-ALV-BLOCO'));
ok(!duplicado.ok && duplicado.erro === 'MATERIAL_DUPLICADO', 'catálogo: id duplicado recusado');

const comPreco = atualizarPrecoUnitario(catalogo, 'MAT-ALV-BLOCO', 52.4, 'COTACAO', '2026-11-03');
ok(comPreco.ok, 'catálogo: atualização de preço aceita');
if (comPreco.ok) {
  const atualizado = obterMaterial(comPreco.catalogo, 'MAT-ALV-BLOCO');
  ok(perto(atualizado.precoUnitario, 52.4), 'catálogo: preço novo aplicado');
  ok(atualizado.fontePreco === 'COTACAO', 'catálogo: procedência vira COTACAO');
  ok(atualizado.precoReferencia !== undefined, 'catálogo: preço de referência preservado');
  ok(perto(obterMaterial(catalogo, 'MAT-ALV-BLOCO').precoUnitario, 45.9), 'catálogo: original não foi mutado');
}

const precoNegativo = atualizarPrecoUnitario(catalogo, 'MAT-ALV-BLOCO', -1, 'COTACAO');
ok(!precoNegativo.ok && precoNegativo.erro === 'PRECO_INVALIDO', 'catálogo: preço negativo recusado');

// ---------- 2. aplicação por elemento e por face ----------
const parede: ElementoBim = {
  id: 'el_p1',
  projetoId: 'pr1',
  tipo: 'parede',
  nivel: 1,
  geometria: { ponto_a: [0, 0], ponto_b: [4, 0], altura: 2.8, espessura: 0.15 },
  propriedades: {},
  camadaId: 'c1',
  materialId: 'MAT-ALV-BLOCO',
};
const parede2: ElementoBim = { ...parede, id: 'el_p2', materialId: 'MAT-ALV-BLOCO' };

const porElemento = aplicarMaterialEmElemento([parede], 'el_p1', 'MAT-REB-MASSA');
ok(porElemento.ok && porElemento.elementos[0].materialId === 'MAT-REB-MASSA', 'aplicar: material por elemento');
ok(parede.materialId === 'MAT-ALV-BLOCO', 'aplicar: elemento original não foi mutado');

const elementoInexistente = aplicarMaterialEmElemento([parede], 'nao-existe', 'MAT-REB-MASSA');
ok(!elementoInexistente.ok && elementoInexistente.erro === 'ELEMENTO_NAO_ENCONTRADO', 'aplicar: elemento inexistente recusado');

const removido = removerMaterialDoElemento([parede], 'el_p1');
ok(removido.ok && removido.elementos[0].materialId === undefined, 'aplicar: remover material do elemento');

const caixa = criarCaixa({
  id: 'sol1',
  nome: 'Caixa',
  posicao: [0, 0, 0],
  dimensoes: { largura: 2, altura: 2, profundidade: 2 },
});
ok(caixa.ok, 'aplicar: sólido de teste criado');
if (caixa.ok) {
  const faceId = caixa.solido.faces[0].id;
  const naFace = aplicarMaterialEmFace(caixa.solido, faceId, 'MAT-PISO-PORC');
  ok(naFace.ok && materialDaFace(naFace.solido, faceId) === 'MAT-PISO-PORC', 'aplicar: material por FACE');
  if (naFace.ok) {
    const efetivo = materiaisEfetivos(naFace.solido, 'MAT-REB-MASSA');
    ok(efetivo.get(faceId) === 'MAT-PISO-PORC', 'aplicar: face vence o material do elemento');
    const outraFace = naFace.solido.faces[1].id;
    ok(efetivo.get(outraFace) === 'MAT-REB-MASSA', 'aplicar: face sem material herda o elemento');
  }
  const faceInexistente = aplicarMaterialEmFace(caixa.solido, 'nao-existe', 'MAT-PISO-PORC');
  ok(!faceInexistente.ok && faceInexistente.erro === 'FACE_NAO_ENCONTRADA', 'aplicar: face inexistente recusada');
}

// ---------- 3. quantitativo agrupa por material e custo ----------
const resumo = quantitativos([parede, parede2]);
const gruposAlvenaria = resumo.grupos.filter((grupo) => grupo.materialId === 'MAT-ALV-BLOCO');
ok(gruposAlvenaria.length === 2, 'quantitativo: mesmo material gera 1 grupo m² + 1 grupo m³');
const grupoM2 = gruposAlvenaria.find((grupo) => grupo.unidade === 'm2');
ok(grupoM2 !== undefined && perto(grupoM2.quantidadeComPerda, 2 * 4 * 2.8 * 1.05), 'quantitativo: duas paredes somam 23,52 m²');

const custos = custoDoQuantitativo(resumo.grupos, catalogo);
ok(custos.linhas.length >= 2, 'custo: uma linha por material + unidade');
const linhaM2 = custos.linhas.find((linha) => linha.materialId === 'MAT-ALV-BLOCO' && linha.unidade === 'm2');
ok(linhaM2 !== undefined && perto(linhaM2.subtotal, linhaM2.quantidade * 45.9), 'custo: subtotal = quantidade × preço');
ok(
  perto(custos.total, custos.linhas.reduce((soma, linha) => soma + linha.subtotal, 0)),
  'custo: total é a soma dos subtotais',
);

const semPreco = adicionarMaterial(catalogo, {
  id: 'MAT-NOVO-SEM-PRECO',
  nome: 'Material novo',
  categoria: 'acabamento',
  unidade: 'm2',
  precoUnitario: 0,
  fontePreco: 'PROPRIO',
});
ok(semPreco.ok, 'custo: material sem preço pode ser cadastrado');
if (semPreco.ok) {
  const paredeNova: ElementoBim = { ...parede, id: 'el_p3', materialId: 'MAT-NOVO-SEM-PRECO' };
  const resumoNovo = quantitativos([paredeNova]);
  const custoNovo = custoDoQuantitativo(resumoNovo.grupos, semPreco.catalogo);
  ok(custoNovo.linhasSemPreco >= 1, 'custo: linha sem preço é sinalizada');
  const linhaSem = custoNovo.linhas.find((linha) => linha.materialId === 'MAT-NOVO-SEM-PRECO');
  ok(linhaSem !== undefined && linhaSem.semPreco && perto(linhaSem.subtotal, 0), 'custo: sem preço → subtotal 0 e flag');
}

// ---------- 4. exportar cotação ----------
const itens = itensDeCotacao(resumo.grupos, catalogo);
ok(itens.length >= 1, 'cotação: itens gerados a partir do quantitativo');
const itemAlvenaria = itens.find((item) => item.materialId === 'MAT-ALV-BLOCO' && item.unidade === 'm2');
ok(itemAlvenaria !== undefined && perto(itemAlvenaria.quantidade, 23.52), 'cotação: quantidade com perda');

const exportado = exportarParaCotacao(itens);
const linhasCsv = exportado.csv.trim().split(/\r?\n/);
ok(linhasCsv[0].startsWith('material_id;nome;categoria;unidade;quantidade;preco_referencia;moeda'), 'cotação: cabeçalho CSV pt-BR');
ok(linhasCsv.length === itens.length + 1, 'cotação: uma linha por item + cabeçalho');
ok(exportado.csv.includes('MAT-ALV-BLOCO'), 'cotação: material presente no CSV');
ok(JSON.parse(exportado.json).itens.length === itens.length, 'cotação: JSON espelha os itens');

// ---------- 5. importar cotação ----------
const planilha = '\uFEFFmaterial_id;preco_unitario\r\nMAT-ALV-BLOCO;52,40\r\nMAT-DESCONHECIDO;10\r\nMAT-PISO-PORC;abc\r\n';
const importado = importarCotacao(planilha, catalogo, { atualizadoEm: '2026-11-03' });
ok(importado.atualizados === 1, 'importação: uma linha válida aplicada');
ok(perto(obterMaterial(importado.catalogo, 'MAT-ALV-BLOCO').precoUnitario, 52.4), 'importação: preço com vírgula lido (52,40)');
ok(obterMaterial(importado.catalogo, 'MAT-ALV-BLOCO').fontePreco === 'COTACAO', 'importação: procedência COTACAO');
ok(importado.ignorados.some((item) => item.motivo === 'DESCONHECIDO'), 'importação: material desconhecido é registrado');
ok(importado.ignorados.some((item) => item.motivo === 'PRECO_INVALIDO'), 'importação: preço inválido é registrado');
ok(perto(obterMaterial(catalogo, 'MAT-ALV-BLOCO').precoUnitario, 45.9), 'importação: catálogo de entrada não foi mutado');

const comVirgula = 'material_id,preco_unitario\nMAT-TELHA-CER,60.5\n';
const importado2 = importarCotacao(comVirgula, catalogo);
ok(importado2.atualizados === 1 && perto(obterMaterial(importado2.catalogo, 'MAT-TELHA-CER').precoUnitario, 60.5), 'importação: aceita vírgula como separador');

const cabecalhoRuim = importarCotacao('nome;quantidade\nPiso;3\n', catalogo);
ok(cabecalhoRuim.erro === 'CABECALHO_INVALIDO' && cabecalhoRuim.atualizados === 0, 'importação: cabeçalho sem preço é recusado');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
