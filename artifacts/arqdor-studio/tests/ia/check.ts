/**
 * M4 — IA: ferramentas, executor atômico e contexto. Puro.
 */

import { executarPlano } from '../../src/arqdor/editor/ia/executor';
import type { PlanoIa } from '../../src/arqdor/editor/ia/executor';
import { listarFerramentas } from '../../src/arqdor/editor/ia/ferramentas';
import type { EstadoIa } from '../../src/arqdor/editor/ia/ferramentas';
import { resumirDocumento } from '../../src/arqdor/editor/ia/contexto';
import { mensagemDoResultado, montarPlanoDoChat } from '../../src/arqdor/editor/ia/chat-core';
import { ESTADO_INICIAL } from '../../src/arqdor/editor/modelador/store-core';
import { catalogoPadrao, obterMaterial } from '../../src/arqdor/editor/materiais/catalogo';
import { FAMILIAS_PADRAO } from '../../src/arqdor/editor/biblioteca/familias';
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
function perto(a: number, b: number, t = 1e-9): boolean {
  return Math.abs(a - b) <= t;
}

console.log('M4 — IA: ferramentas, executor e contexto');

const parede: ElementoBim = {
  id: 'el_p1',
  projetoId: 'p1',
  tipo: 'parede',
  nivel: 1,
  geometria: { ponto_a: [0, 0], ponto_b: [4, 0], altura: 2.8, espessura: 0.15 },
  propriedades: {},
  camadaId: 'c1',
};

const estadoBase = (): EstadoIa => ({
  modelador: ESTADO_INICIAL,
  elementos: [parede],
  catalogo: catalogoPadrao(),
  familias: FAMILIAS_PADRAO,
  projetoId: 'p1',
  camadaAtivaId: 'c1',
});

const plano = (toolCalls: PlanoIa['toolCalls']): PlanoIa => ({ tipo: 'layout', prompt: 'teste', toolCalls });

// ---------- 1. registro ----------
const registradas = listarFerramentas();
ok(registradas.length === 6, 'registro: 6 ferramentas');
const nomes = registradas.map((item) => item.nome).sort().join(',');
ok(
  nomes === 'aplicar_material,colocar_movel,criar_caixa,definir_preco_material,exportar_cotacao,pedir_render',
  'registro: nomes esperados',
);
ok(registradas.filter((item) => item.reversivel).length === 3, 'registro: 3 ferramentas reversíveis');

// ---------- 2. ferramenta inexistente ----------
const desconhecida = executarPlano(plano([{ nome: 'voar', argumentos: {} }]), estadoBase());
ok(!desconhecida.ok && desconhecida.erro.codigo === 'OPERACAO_NAO_SUPORTADA', 'executor: ferramenta inexistente → OPERACAO_NAO_SUPORTADA');
ok(!desconhecida.ok && desconhecida.transacao.status === 'erro', 'executor: transação fica em erro (não finge sucesso)');

// ---------- 3. criar caixa ----------
const caixa = executarPlano(
  plano([{ nome: 'criar_caixa', argumentos: { largura: 4, altura: 2, profundidade: 3 } }]),
  estadoBase(),
);
ok(caixa.ok, 'executor: criar_caixa executou');
if (caixa.ok) {
  ok(caixa.passo !== null && caixa.passo.escopo === 'modelador', 'executor: passo de modelador');
  ok(caixa.estado.modelador.solidos.length === 1, 'executor: um sólido criado');
  ok(caixa.estado.modelador.solidos[0].faces.length === 6, 'executor: caixa com 6 faces');
  ok(caixa.transacao.toolCalls[0].resultado?.ok === true, 'executor: resultado da chamada registrado');
}

// ---------- 4. aplicar material ----------
const material = executarPlano(
  plano([{ nome: 'aplicar_material', argumentos: { elementoId: 'el_p1', materialId: 'MAT-REB-MASSA' } }]),
  estadoBase(),
);
ok(material.ok, 'executor: aplicar_material executou');
if (material.ok) {
  ok(material.passo !== null && material.passo.escopo === 'cross', 'executor: material vira passo cross (BIM)');
  ok(material.estado.elementos[0].materialId === 'MAT-REB-MASSA', 'executor: material gravado no elemento');
}

const materialInexistente = executarPlano(
  plano([{ nome: 'aplicar_material', argumentos: { elementoId: 'el_p1', materialId: 'MAT-QUE-NAO-EXISTE' } }]),
  estadoBase(),
);
ok(!materialInexistente.ok && materialInexistente.erro.codigo === 'TOOL_CALL_INVALIDA', 'executor: material fora do catálogo recusado');

// ---------- 5. colocar móvel (cross-store) ----------
const movel = executarPlano(
  plano([{ nome: 'colocar_movel', argumentos: { familiaId: 'FAM-CADEIRA', posicao: [2, 3] } }]),
  estadoBase(),
);
ok(movel.ok, 'executor: colocar_movel executou');
if (movel.ok && movel.passo !== null && movel.passo.escopo === 'cross') {
  ok(movel.passo.ordem[0] === 'modelador' && movel.passo.ordem[1] === 'bim', 'executor: sólido antes do elemento BIM');
  ok(movel.estado.modelador.solidos.length === 1, 'executor: sólido do móvel criado');
  ok(movel.estado.elementos.length === 2, 'executor: elemento BIM do móvel criado');
}

// ---------- 6. atomicidade: falha no meio não deixa resíduo ----------
const base = estadoBase();
const parcial = executarPlano(
  plano([
    { nome: 'criar_caixa', argumentos: { largura: 1, altura: 1, profundidade: 1 } },
    { nome: 'aplicar_material', argumentos: { elementoId: 'nao-existe', materialId: 'MAT-REB-MASSA' } },
  ]),
  base,
);
ok(!parcial.ok, 'atomicidade: plano com falha é recusado');
ok(base.modelador.solidos.length === 0, 'atomicidade: estado de entrada intacto (nada aplicado)');

// ---------- 7. leitura: cotação e render ----------
const cotacao = executarPlano(plano([{ nome: 'exportar_cotacao', argumentos: {} }]), estadoBase());
ok(cotacao.ok && cotacao.passo === null, 'leitura: exportar_cotacao não gera passo');
if (cotacao.ok) {
  const efeito = cotacao.efeitos[0];
  ok(efeito !== undefined && efeito.tipo === 'cotacao' && efeito.csv.includes('material_id'), 'leitura: CSV de cotação gerado');
}

const render = executarPlano(
  plano([{ nome: 'pedir_render', argumentos: { qualidade: 'preview', resolucao: { largura: 1280, altura: 720 } } }]),
  estadoBase(),
);
ok(render.ok && render.passo === null, 'leitura: pedir_render não gera passo');
if (render.ok) {
  const efeito = render.efeitos[0];
  ok(efeito !== undefined && efeito.tipo === 'render' && efeito.pedido.documentoHash.length > 0, 'leitura: pedido com fingerprint');
}

const renderInvalido = executarPlano(
  plano([{ nome: 'pedir_render', argumentos: { qualidade: 'ultra', resolucao: { largura: 100, altura: 100 } } }]),
  estadoBase(),
);
ok(!renderInvalido.ok && renderInvalido.erro.codigo === 'TOOL_CALL_INVALIDA', 'leitura: qualidade inválida recusada');

// ---------- 8. ação não reversível exige confirmação ----------
const semConfirmacao = executarPlano(
  plano([{ nome: 'definir_preco_material', argumentos: { materialId: 'MAT-ALV-BLOCO', precoUnitario: 50 } }]),
  estadoBase(),
);
ok(!semConfirmacao.ok && semConfirmacao.erro.codigo === 'PROMPT_INSEGURO', 'preço: exige confirmação humana');

const comConfirmacao = executarPlano(
  plano([{ nome: 'definir_preco_material', argumentos: { materialId: 'MAT-ALV-BLOCO', precoUnitario: 50 } }]),
  estadoBase(),
  { confirmado: true },
);
ok(comConfirmacao.ok && comConfirmacao.passo === null, 'preço: confirmado executa sem passo');
if (comConfirmacao.ok) {
  ok(perto(obterMaterial(comConfirmacao.estado.catalogo, 'MAT-ALV-BLOCO').precoUnitario, 50), 'preço: catálogo atualizado');
}

// ---------- 9. limites ----------
const excedeu = executarPlano(
  plano([
    { nome: 'criar_caixa', argumentos: { largura: 1, altura: 1, profundidade: 1 } },
    { nome: 'criar_caixa', argumentos: { largura: 1, altura: 1, profundidade: 1 } },
  ]),
  estadoBase(),
  { maxOperacoes: 1 },
);
ok(!excedeu.ok && excedeu.erro.codigo === 'TOOL_CALL_INVALIDA', 'limite: acima de maxOperacoes é recusado');

const vazio = executarPlano(plano([]), estadoBase());
ok(!vazio.ok, 'limite: plano vazio é recusado');

// ---------- 10. contexto ----------
const resumo = resumirDocumento({
  modelador: ESTADO_INICIAL,
  elementos: [parede],
  catalogo: catalogoPadrao(),
  familias: FAMILIAS_PADRAO,
});
ok(resumo.solidos === 0 && resumo.totalElementos === 1, 'contexto: contagens corretas');
ok(resumo.elementosPorTipo['parede'] === 1, 'contexto: elementos por tipo');
ok(resumo.texto.includes('Elementos: 1'), 'contexto: texto descreve o documento');
ok(resumo.texto.length <= 600, 'contexto: texto respeita o orçamento de caracteres');

const resumoComMaterial = resumirDocumento({
  modelador: ESTADO_INICIAL,
  elementos: [{ ...parede, materialId: 'MAT-REB-MASSA' }],
  catalogo: catalogoPadrao(),
  familias: FAMILIAS_PADRAO,
});
ok(resumoComMaterial.materiais[0]?.id === 'MAT-REB-MASSA', 'contexto: material usado aparece primeiro');

// ---------- 11. chat: plano e mensagens ----------
const planoChat = montarPlanoDoChat(
  { texto: null, toolCalls: [{ nome: 'criar_caixa', argumentos: { largura: 4 } }] },
  'crie uma parede',
);
ok(planoChat !== null && planoChat.tipo === 'layout' && planoChat.toolCalls.length === 1, 'chat: tool call vira plano');
ok(montarPlanoDoChat({ texto: 'oi', toolCalls: [] }, 'oi') === null, 'chat: sem tool call não gera plano');

const mensagemErro = mensagemDoResultado(desconhecida);
ok(mensagemErro.tipo === 'erro' && mensagemErro.texto.includes('OPERACAO_NAO_SUPORTADA'), 'chat: erro tipado vira mensagem');
const mensagemLeitura = mensagemDoResultado(cotacao);
ok(mensagemLeitura.tipo === 'leitura', 'chat: leitura não diz que alterou o projeto');
const mensagemOk = mensagemDoResultado(caixa);
ok(mensagemOk.tipo === 'ok' && mensagemOk.texto.includes('criar_caixa'), 'chat: aplicação cita a ferramenta');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
