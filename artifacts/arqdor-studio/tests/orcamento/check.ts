/**
 * Prova de comportamento do Pilar 4: medição, vão contábil, perda, agrupamento e Praça.ai.
 */

import {
  BANDA_PRACA,
  COEFICIENTE_PERDA_PADRAO,
  MAPA_PRACA_PADRAO,
  categoriaDe,
  codigoPracaDe,
  medirElemento,
  paraPraca,
  quantitativos,
  validarPrecoPraca,
  vaosPorParede,
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
const camadaId = 'camada_estrutura';
const perto = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

function parede(id: string, materialId?: string, nivel = 0): ElementoBim {
  const g: GeometriaParede = { ponto_a: [0, 0], ponto_b: [4, 0], altura: 3, espessura: 0.15 };
  return { id, projetoId, tipo: 'parede', nivel, geometria: g, propriedades: {}, camadaId, materialId };
}

function laje(id: string, materialId?: string): ElementoBim {
  const g: GeometriaLaje = { contorno: [[0, 0], [4, 0], [4, 3], [0, 3]], espessura: 0.12 };
  return { id, projetoId, tipo: 'laje', nivel: 0, geometria: g, propriedades: {}, camadaId, materialId };
}

function porta(id: string, paredeId: string): ElementoBim {
  return {
    id, projetoId, tipo: 'porta', nivel: 0,
    geometria: { parede_id: paredeId, offset: 1, largura: 0.8, altura: 2.1 },
    propriedades: {}, camadaId,
  };
}

console.log('Pilar 4 — quantitativos');

const p = parede('parede-1', 'MAT-ALV');
const l = laje('laje-1', 'MAT-CONC');
const d = porta('porta-1', 'parede-1');
const elementos = [p, l, d];

// 1. medição com desconto de vão
const vaos = vaosPorParede(elementos);
const medParede = medirElemento(p, vaos);
const areaParede = medParede.find((m) => m.unidade === 'm2');
const volParede = medParede.find((m) => m.unidade === 'm3');
ok(areaParede !== undefined && perto(areaParede.quantidade, 12 - 0.8 * 2.1), 'area da parede desconta a porta (10,32 m2)');
ok(volParede !== undefined && perto(volParede.quantidade, (12 - 1.68) * 0.15), 'volume da parede usa area liquida (1,548 m3)');

// 2. laje
const medLaje = medirElemento(l, vaos);
ok(perto((medLaje.find((m) => m.unidade === 'm2')?.quantidade ?? 0), 12), 'area da laje 4x3 = 12 m2');
ok(perto((medLaje.find((m) => m.unidade === 'm3')?.quantidade ?? 0), 1.44), 'volume da laje = 1,44 m3');

// 3. telhado inclinado
const telhado: ElementoBim = {
  id: 'telhado-1', projetoId, tipo: 'telhado', nivel: 0,
  geometria: { contorno: [[0, 0], [4, 0], [4, 3], [0, 3]], inclinacaoGraus: 30 },
  propriedades: {}, camadaId,
};
const medTelhado = medirElemento(telhado, vaos);
ok(perto(medTelhado[0].quantidade, 12 / Math.cos((30 * Math.PI) / 180)), 'area inclinada = projetada / cos(30)');

// 4. esquadria e mobiliario
ok(medirElemento(d, vaos).length === 2, 'porta mede em un e m2');
const movel: ElementoBim = {
  id: 'movel-1', projetoId, tipo: 'mobiliario', nivel: 0,
  geometria: { dimensoes: { largura: 1, altura: 2, profundidade: 0.6 }, posicao: [2, 1] },
  propriedades: {}, camadaId,
};
ok(medirElemento(movel, vaos).length === 1 && medirElemento(movel, vaos)[0].unidade === 'un', 'movel mede em un');

// 5. categoria
ok(categoriaDe('parede') === 'alvenaria', 'parede -> alvenaria');
ok(categoriaDe('laje') === 'estrutura', 'laje -> estrutura');

// 6. coeficiente de perda
const resumo = quantitativos(elementos);
const itemArea = resumo.itens.find((i) => i.elementoId === 'parede-1' && i.unidade === 'm2');
ok(itemArea !== undefined && perto(itemArea.coeficientePerda, COEFICIENTE_PERDA_PADRAO.alvenaria), 'perda padrao de alvenaria aplicada');
ok(itemArea !== undefined && perto(itemArea.quantidadeComPerda, (12 - 1.68) * COEFICIENTE_PERDA_PADRAO.alvenaria), 'quantidade com perda calculada');

// 7. override por categoria e por material
const comOverride = quantitativos(elementos, { coeficientes: { alvenaria: 1.2 } });
ok(perto((comOverride.itens.find((i) => i.elementoId === 'parede-1' && i.unidade === 'm2')?.coeficientePerda ?? 0), 1.2), 'override por categoria vence');
const comMaterial = quantitativos(elementos, { coeficientePorMaterial: { 'MAT-ALV': 1.5 } });
ok(perto((comMaterial.itens.find((i) => i.elementoId === 'parede-1' && i.unidade === 'm2')?.coeficientePerda ?? 0), 1.5), 'override por material vence a categoria');

// 8. agrupamento: material e unidade separam
const materiais = new Set(resumo.grupos.map((g) => g.materialId));
ok(materiais.size >= 2, 'grupos separam por material');
const chaves = resumo.grupos.map((g) => g.chave);
ok(new Set(chaves).size === chaves.length, 'chaves de grupo unicas');
const gruposParede = resumo.grupos.filter((g) => g.materialId === 'MAT-ALV');
ok(gruposParede.length === 2, 'mesma parede gera grupo m2 e grupo m3');

// 9. totais por unidade
const totalM2 = resumo.totalPorUnidade.find((t) => t.unidade === 'm2');
ok(totalM2 !== undefined && totalM2.quantidadeComPerda > 0, 'total por unidade soma m2');

// 10. Praça.ai: código por categoria e por material
ok(MAPA_PRACA_PADRAO.alvenaria === 'PRC-ALV-001', 'mapa padrao tem codigo de alvenaria');
const itemParede = resumo.itens.find((i) => i.elementoId === 'parede-1' && i.unidade === 'm2');
ok(itemParede !== undefined && codigoPracaDe(itemParede) === 'PRC-ALV-001', 'codigo Praça por categoria');
ok(itemParede !== undefined && codigoPracaDe(itemParede, { 'MAT-ALV': 'PRC-CUSTOM-9' }) === 'PRC-CUSTOM-9', 'codigo Praça por material vence');
const praca = paraPraca(resumo.grupos);
ok(praca.every((i) => i.codigoPraca.startsWith('PRC-')), 'todas as linhas do Praça tem codigo');
ok(praca.length >= 3, 'linhas do Praça agregadas por codigo+unidade');

// 11. banda de preço
ok(validarPrecoPraca(100, 120).ok, 'preco dentro da banda');
const baixo = validarPrecoPraca(100, 40);
ok(!baixo.ok && baixo.motivo === 'ABAIXO_DO_PISO', 'preco abaixo do piso recusado');
const alto = validarPrecoPraca(100, 400);
ok(!alto.ok && alto.motivo === 'ACIMA_DO_TETO', 'preco acima do teto recusado');
const invalido = validarPrecoPraca(0, 100);
ok(!invalido.ok && invalido.motivo === 'REFERENCIA_INVALIDA', 'referencia zero recusada');
ok(BANDA_PRACA.minimo === 0.5 && BANDA_PRACA.maximo === 3, 'banda 0,5x a 3x');

// 12. furo desconta area
const comFuro: ElementoBim = {
  ...p,
  geometria: { ...(p.geometria as GeometriaParede), aberturas: [{ id: 'f1', tipo: 'furo', offset: 2, altura: 1.2, diametro: 0.1, elementoMepId: 'm1' }] },
};
const medFuro = medirElemento(comFuro, new Map());
ok(perto(medFuro[0].quantidade, 12 - Math.PI * 0.05 * 0.05), 'furo desconta pi*r^2 da area');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));