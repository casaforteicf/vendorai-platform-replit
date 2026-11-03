/**
 * Chat IA — núcleo puro.
 *
 * A UI não decide o que aplicar: ela monta o plano a partir da resposta do modelo e traduz o
 * resultado do executor em texto. Isso mantém o painel fino e testável fora do navegador.
 */

import type { PlanoIa } from './executor';
import type { ResultadoM4 } from './executor';
import type { ToolCallIA } from './schema';

export interface RespostaChat {
  texto: string | null;
  toolCalls: readonly ToolCallIA[];
}

/** Sem tool calls é conversa: não há plano para executar. */
export function montarPlanoDoChat(resposta: RespostaChat, pergunta: string): PlanoIa | null {
  if (resposta.toolCalls.length === 0) return null;
  return {
    tipo: 'layout',
    prompt: pergunta,
    toolCalls: [...resposta.toolCalls],
  };
}

export type TipoMensagemChat = 'ok' | 'leitura' | 'erro';

export interface MensagemResultado {
  tipo: TipoMensagemChat;
  texto: string;
}

/** Traduz o resultado do executor para a linha que aparece no chat. */
export function mensagemDoResultado(resultado: ResultadoM4): MensagemResultado {
  if (!resultado.ok) {
    const detalhe = 'tool' in resultado.erro ? ' (' + resultado.erro.tool + ')' : '';
    return { tipo: 'erro', texto: 'Não foi possível: ' + resultado.erro.codigo + detalhe + '.' };
  }
  if (resultado.passo === null) {
    const resumo = resultado.transacao.toolCalls.map((chamada) => chamada.nome).join(', ');
    return { tipo: 'leitura', texto: 'Ação concluída sem alterar o projeto' + (resumo.length > 0 ? ' (' + resumo + ').' : '.') };
  }
  const nomes = resultado.transacao.toolCalls.map((chamada) => chamada.nome).join(', ');
  return { tipo: 'ok', texto: 'Aplicado no projeto: ' + nomes + '.' };
}
