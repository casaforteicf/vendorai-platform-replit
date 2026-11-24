/**
 * Proxy do chat IA — a chave fica NO SERVIDOR.
 *
 * O cliente nunca vê `DEEPSEEK_API_KEY`: o browser conversa com esta rota, e a rota conversa com
 * a DeepSeek. Também é aqui que as instruções de domínio entram (parede = caixa de 15 cm).
 */

import { NextResponse } from 'next/server';
import { DEEPSEEK_OFICIAL, conversarComModelo, montarMensagens } from '../../../../arqdor/editor/ia/cliente-modelo';

const INSTRUCOES = [
  'Você é o Vendi IA, assistente de arquitetura do Arqdor Studio.',
  'Responda em português do Brasil, curto e direto.',
  'Todas as medidas são em metros.',
  'Regras de domínio: uma "parede" é uma caixa (criar_caixa) com profundidade 0,15 m; uma "laje" tem espessura entre 0,10 e 0,20 m.',
  'Quando o pedido tiver as medidas necessárias, chame a ferramenta em vez de só descrever.',
  'Se faltar informação essencial, pergunte ao usuário em vez de inventar medidas.',
].join(' ');

interface CorpoPedido {
  pergunta?: unknown;
  contexto?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env['DEEPSEEK_API_KEY'] ?? process.env['OPENROUTER_API_KEY'];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    return NextResponse.json({ erro: 'IA_NAO_CONFIGURADA' }, { status: 503 });
  }

  let corpo: CorpoPedido;
  try {
    corpo = (await request.json()) as CorpoPedido;
  } catch {
    return NextResponse.json({ erro: 'PEDIDO_INVALIDO' }, { status: 400 });
  }

  const pergunta = typeof corpo.pergunta === 'string' ? corpo.pergunta.trim() : '';
  if (pergunta.length === 0) {
    return NextResponse.json({ erro: 'PEDIDO_INVALIDO' }, { status: 400 });
  }
  const contexto = typeof corpo.contexto === 'string' ? corpo.contexto : '';

  const baseUrl = process.env['DEEPSEEK_BASE_URL'] ?? DEEPSEEK_OFICIAL.baseUrl;
  const modelo = process.env['DEEPSEEK_MODEL'] ?? DEEPSEEK_OFICIAL.modelo;

  const mensagens = montarMensagens({ contexto, pergunta, instrucoes: INSTRUCOES });
  const resultado = await conversarComModelo(
    { baseUrl, apiKey, modelo, fetch, temperatura: 0.1, maxTokens: 800 },
    mensagens,
  );

  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro.codigo }, { status: 502 });
  }

  return NextResponse.json({
    texto: resultado.texto,
    toolCalls: resultado.toolCalls,
  });
}
