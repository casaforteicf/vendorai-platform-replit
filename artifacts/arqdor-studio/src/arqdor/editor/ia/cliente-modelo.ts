/**
 * IA — cliente do modelo (DeepSeek via API direta ou OpenRouter).
 *
 * Contrato: recebe mensagens, envia contexto + ferramentas no formato de tool calling e devolve
 * `ToolCallIA[]` já normalizado. `fetch` é injetado — o teste de contrato não toca a rede.
 *
 * Nenhuma chave é lida do ambiente aqui: quem chama passa `apiKey`. Assim o módulo não depende de
 * configuração global e o segredo não entra em log acidental.
 */

import type { IAErro, ToolCallIA } from './schema';
import { definicoesFerramentas } from './esquemas';

export interface ConfiguracaoModelo {
  baseUrl: string;
  apiKey: string;
  modelo: string;
  fetch: typeof fetch;
  temperatura?: number;
  maxTokens?: number;
  /** Teto de tokens de prompt; acima disso devolve LIMITE_TOKENS em vez de gastar. */
  limiteTokensPrompt?: number;
}

export const DEEPSEEK_OFICIAL = {
  baseUrl: 'https://api.deepseek.com/chat/completions',
  modelo: 'deepseek-chat',
} as const;

export const OPENROUTER_DEEPSEEK = {
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  modelo: 'deepseek/deepseek-chat',
} as const;

export interface MensagemModelo {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RespostaModelo {
  ok: true;
  texto: string | null;
  toolCalls: ToolCallIA[];
  uso: { prompt: number; completion: number } | null;
  motivo: 'tool_calls' | 'texto';
}

export type ResultadoModelo = RespostaModelo | { ok: false; erro: IAErro };

const INSTRUCOES_PADRAO =
  'Você é o Vendi IA, assistente de arquitetura do Arqdor Studio. ' +
  'Responda em português do Brasil, de forma curta. ' +
  'Quando precisar alterar o projeto, chame as ferramentas; nunca invente medidas que não estejam no contexto.';

export function montarMensagens(entrada: {
  contexto: string;
  pergunta: string;
  instrucoes?: string;
}): MensagemModelo[] {
  return [
    { role: 'system', content: entrada.instrucoes ?? INSTRUCOES_PADRAO },
    { role: 'system', content: 'Contexto do projeto:\n' + entrada.contexto },
    { role: 'user', content: entrada.pergunta },
  ];
}

export function montarCorpoRequisicao(
  config: ConfiguracaoModelo,
  mensagens: readonly MensagemModelo[],
): Record<string, unknown> {
  return {
    model: config.modelo,
    messages: mensagens,
    tools: definicoesFerramentas(),
    tool_choice: 'auto',
    temperature: config.temperatura ?? 0.2,
    ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
  };
}

interface RespostaBruta {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function conversarComModelo(
  config: ConfiguracaoModelo,
  mensagens: readonly MensagemModelo[],
): Promise<ResultadoModelo> {
  const indisponivel: IAErro = { codigo: 'API_INDISPONIVEL', provedor: 'deepseek' };

  let resposta: Response;
  try {
    resposta = await config.fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify(montarCorpoRequisicao(config, mensagens)),
    });
  } catch {
    return { ok: false, erro: indisponivel };
  }

  if (!resposta.ok) return { ok: false, erro: indisponivel };

  let corpo: RespostaBruta;
  try {
    corpo = (await resposta.json()) as RespostaBruta;
  } catch {
    return { ok: false, erro: indisponivel };
  }

  const escolha = corpo.choices?.[0]?.message;
  if (escolha === undefined) return { ok: false, erro: indisponivel };

  const uso =
    corpo.usage === undefined
      ? null
      : { prompt: corpo.usage.prompt_tokens ?? 0, completion: corpo.usage.completion_tokens ?? 0 };

  if (config.limiteTokensPrompt !== undefined && uso !== null && uso.prompt > config.limiteTokensPrompt) {
    return { ok: false, erro: { codigo: 'LIMITE_TOKENS', usado: uso.prompt, limite: config.limiteTokensPrompt } };
  }

  const toolCalls: ToolCallIA[] = [];
  for (const chamada of escolha.tool_calls ?? []) {
    const nome = chamada.function?.name;
    if (typeof nome !== 'string' || nome.trim().length === 0) continue;

    let argumentos: Record<string, unknown> = {};
    const bruto = chamada.function?.arguments;
    if (typeof bruto === 'string' && bruto.trim().length > 0) {
      let lido: unknown;
      try {
        lido = JSON.parse(bruto);
      } catch {
        return { ok: false, erro: { codigo: 'TOOL_CALL_INVALIDA', tool: nome, detalhe: 'JSON inválido em arguments' } };
      }
      if (typeof lido !== 'object' || lido === null || Array.isArray(lido)) {
        return { ok: false, erro: { codigo: 'TOOL_CALL_INVALIDA', tool: nome, detalhe: 'arguments não é objeto' } };
      }
      argumentos = lido as Record<string, unknown>;
    }
    toolCalls.push({ nome: nome.trim(), argumentos });
  }

  const texto =
    typeof escolha.content === 'string' && escolha.content.trim().length > 0 ? escolha.content : null;

  return {
    ok: true,
    texto,
    toolCalls,
    uso,
    motivo: toolCalls.length > 0 ? 'tool_calls' : 'texto',
  };
}

export interface ClienteModelo {
  conversar(mensagens: readonly MensagemModelo[]): Promise<ResultadoModelo>;
  ferramentas(): ReturnType<typeof definicoesFerramentas>;
}

export function criarClienteModelo(config: ConfiguracaoModelo): ClienteModelo {
  return {
    conversar: (mensagens) => conversarComModelo(config, mensagens),
    ferramentas: () => definicoesFerramentas(),
  };
}
