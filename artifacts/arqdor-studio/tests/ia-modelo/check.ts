/**
 * Cliente do modelo (contrato) + ponte com o store. Sem rede: `fetch` é falso e injetado.
 */

import {
  DEEPSEEK_OFICIAL,
  OPENROUTER_DEEPSEEK,
  conversarComModelo,
  montarCorpoRequisicao,
  montarMensagens,
} from '../../src/arqdor/editor/ia/cliente-modelo';
import { definicoesFerramentas, ESQUEMAS } from '../../src/arqdor/editor/ia/esquemas';
import { aplicarPassoCom, aplicarPassoDaIA } from '../../src/arqdor/editor/ia/integracao';
import type { AplicadoresPasso } from '../../src/arqdor/editor/ia/integracao';
import type { ConfiguracaoModelo } from '../../src/arqdor/editor/ia/cliente-modelo';
import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import type { Passo } from '../../src/arqdor/editor/transacao';

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

console.log('IA — cliente do modelo e ponte com o store');

type FetchLike = typeof globalThis.fetch;

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RequisicaoCapturada {
  url: string;
  init: RequestInit;
}

function fetchFalso(gerar: () => Promise<Response>) {
  const capturado: { atual: RequisicaoCapturada | null } = { atual: null };
  const fn = (async (url: string, init: RequestInit) => {
    capturado.atual = { url, init };
    return gerar();
  }) as unknown as FetchLike;
  return { fn, capturado };
}

const config = (buscar: FetchLike, extra: Partial<ConfiguracaoModelo> = {}): ConfiguracaoModelo => ({
  baseUrl: DEEPSEEK_OFICIAL.baseUrl,
  apiKey: 'chave-de-teste',
  modelo: DEEPSEEK_OFICIAL.modelo,
  fetch: buscar,
  ...extra,
});

// ---------- 1. esquemas e definições ----------
const definicoes = definicoesFerramentas();
ok(definicoes.length === 6, 'esquemas: 6 definições de ferramenta');
ok(definicoes.every((item) => item.type === 'function' && item.function.parameters !== undefined), 'esquemas: todas no formato function');
const caixaSchema = ESQUEMAS['criar_caixa'] as { required?: string[] };
ok(Array.isArray(caixaSchema.required) && caixaSchema.required.includes('largura'), 'esquemas: criar_caixa exige largura');
ok(OPENROUTER_DEEPSEEK.modelo === 'deepseek/deepseek-chat' && DEEPSEEK_OFICIAL.modelo === 'deepseek-chat', 'esquemas: presets DeepSeek direto e OpenRouter');

// ---------- 2. mensagens e corpo ----------
const mensagens = montarMensagens({ contexto: 'Sólidos: 2', pergunta: 'Crie uma parede' });
ok(mensagens.length === 3 && mensagens[0].role === 'system', 'mensagens: instruções + contexto + pergunta');
ok(mensagens[1].content.includes('Sólidos: 2'), 'mensagens: contexto incluído');

const corpo = montarCorpoRequisicao(config(async () => resposta({})), mensagens);
ok(corpo['model'] === 'deepseek-chat' && corpo['tool_choice'] === 'auto', 'corpo: modelo e tool_choice');
ok(Array.isArray(corpo['tools']) && (corpo['tools'] as unknown[]).length === 6, 'corpo: ferramentas enviadas');
ok(corpo['temperature'] === 0.2, 'corpo: temperatura padrão');

// O runner carrega os testes como CJS: `await` de topo não é permitido — vai dentro de executar().
export async function executar(): Promise<void> {
// ---------- 3. resposta em texto ----------
const textoFalso = fetchFalso(async () =>
  resposta({ choices: [{ message: { content: 'Parede criada.' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }),
);
const texto = await conversarComModelo(config(textoFalso.fn), mensagens);
ok(texto.ok && texto.motivo === 'texto' && texto.texto === 'Parede criada.', 'resposta: texto reconhecido');
ok(texto.ok && texto.toolCalls.length === 0, 'resposta: sem tool calls');
ok(texto.ok && texto.uso?.prompt === 100, 'resposta: uso de tokens lido');
const capturada = textoFalso.capturado.atual;
ok(capturada !== null && capturada.url === DEEPSEEK_OFICIAL.baseUrl, 'requisição: endpoint configurado');
ok(capturada !== null && capturada.init.method === 'POST', 'requisição: método POST');
const headers = capturada?.init.headers as Record<string, string> | undefined;
ok(headers?.Authorization === 'Bearer chave-de-teste', 'requisição: cabeçalho de autorização');

// ---------- 4. tool calls ----------
const toolFalso = fetchFalso(async () =>
  resposta({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { function: { name: 'criar_caixa', arguments: '{"largura":4,"altura":2,"profundidade":3}' } },
            { function: { name: 'colocar_movel', arguments: '{"familiaId":"FAM-CADEIRA","posicao":[1,2]}' } },
          ],
        },
      },
    ],
  }),
);
const comTools = await conversarComModelo(config(toolFalso.fn), mensagens);
ok(comTools.ok && comTools.motivo === 'tool_calls', 'tool calls: motivo correto');
ok(comTools.ok && comTools.toolCalls.length === 2, 'tool calls: duas chamadas convertidas');
ok(comTools.ok && comTools.toolCalls[0].nome === 'criar_caixa' && comTools.toolCalls[0].argumentos['largura'] === 4, 'tool calls: nome e argumentos');

// ---------- 5. falhas de contrato ----------
const jsonInvalido = fetchFalso(async () =>
  resposta({ choices: [{ message: { tool_calls: [{ function: { name: 'criar_caixa', arguments: '{nao-e-json' } }] } }] }),
);
const invalido = await conversarComModelo(config(jsonInvalido.fn), mensagens);
ok(!invalido.ok && invalido.erro.codigo === 'TOOL_CALL_INVALIDA', 'falha: arguments inválido → TOOL_CALL_INVALIDA');

const erroHttp = fetchFalso(async () => resposta({ erro: 'x' }, 500));
const http = await conversarComModelo(config(erroHttp.fn), mensagens);
ok(!http.ok && http.erro.codigo === 'API_INDISPONIVEL', 'falha: HTTP 500 → API_INDISPONIVEL');

const semRede = fetchFalso(async () => {
  throw new Error('sem rede');
});
const rede = await conversarComModelo(config(semRede.fn), mensagens);
ok(!rede.ok && rede.erro.codigo === 'API_INDISPONIVEL', 'falha: exceção de rede → API_INDISPONIVEL');

const semChoices = fetchFalso(async () => resposta({}));
const vazio = await conversarComModelo(config(semChoices.fn), mensagens);
ok(!vazio.ok && vazio.erro.codigo === 'API_INDISPONIVEL', 'falha: resposta sem choices → API_INDISPONIVEL');

const limiteFalso = fetchFalso(async () =>
  resposta({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 5000, completion_tokens: 1 } }),
);
const limitado = await conversarComModelo(config(limiteFalso.fn, { limiteTokensPrompt: 1000 }), mensagens);
ok(!limitado.ok && limitado.erro.codigo === 'LIMITE_TOKENS', 'falha: prompt acima do teto → LIMITE_TOKENS');

// ---------- 6. ponte com o store (duas fases) ----------
const caixa = criarCaixa({ id: 's1', nome: 'C', posicao: [0, 0, 0], dimensoes: { largura: 1, altura: 1, profundidade: 1 } });
if (!caixa.ok) throw new Error('caixa de teste não criada');

const registro: string[] = [];
const aplicadores = (opcoes: { validarBim?: boolean } = {}): AplicadoresPasso => ({
  validarModelador: () => true,
  validarBim: () => opcoes.validarBim !== false,
  aplicarModelador: () => {
    registro.push('modelador');
  },
  aplicarBim: () => {
    registro.push('bim');
  },
});

const passoModelador: Passo = { escopo: 'modelador', id: 'p1', operacoes: [{ tipo: 'criar_solido', solido: caixa.solido }] };
ok(aplicarPassoCom(null, aplicadores()).ok, 'ponte: passo nulo é leitura (nada a aplicar)');
ok(aplicarPassoCom(passoModelador, aplicadores()).ok, 'ponte: passo de modelador aplicado');

const passoCross: Passo = {
  escopo: 'cross',
  id: 'p2',
  operacoes: { modelador: [{ tipo: 'criar_solido', solido: caixa.solido }], bim: [] },
  ordem: ['modelador', 'bim'],
};
registro.length = 0;
ok(aplicarPassoCom(passoCross, aplicadores()).ok, 'ponte: passo cross aplicado');
ok(registro.join(',') === 'modelador', 'ponte: respeita a ordem e não aplica escopo vazio');

const falhaModelador = aplicarPassoCom(passoModelador, {
  ...aplicadores(),
  validarModelador: () => false,
});
ok(!falhaModelador.ok && falhaModelador.erro === 'FALHA_MODELADOR', 'ponte: validação do modelador falha → nada aplicado');
ok(registro.join(',') === 'modelador', 'ponte: falha na validação não escreve nada');

const passoMep: Passo = { escopo: 'mep', id: 'p3', operacoes: [] };
ok(!aplicarPassoCom(passoMep, aplicadores()).ok, 'ponte: escopo MEP ainda não suportado');

ok(aplicarPassoDaIA(null).ok, 'ponte: fiação real carrega e trata passo nulo');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
}
