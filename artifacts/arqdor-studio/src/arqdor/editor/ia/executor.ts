/**
 * IA — executor de plano (M4).
 *
 * Recebe as tool_calls, roda cada ferramenta (que só devolve operações), aplica sobre uma CÓPIA
 * do estado e devolve **um único `Passo`**. Se qualquer ferramenta falhar, nada é aplicado: o
 * estado de trabalho é descartado e o erro volta tipado. O chamador (UI/store) aplica o passo.
 *
 * Regra D9: a IA não escreve no store; ela produz o passo que o store aplicaria.
 */

import type { ElementoBim, OperacaoBIM } from '../bim/schema';
import type { OperacaoModelador } from '../modelador/schema';
import { aplicarPasso } from '../modelador/store-core';
import type { OperacoesPorEscopo, Passo } from '../transacao';
import type { IAErro, IATipo, ToolCallIA, TransacaoIA } from './schema';
import { obterFerramenta } from './ferramentas';
import type { Efeito, EstadoIa } from './ferramentas';

export interface PlanoIa {
  tipo: IATipo;
  prompt: string;
  toolCalls: readonly ToolCallIA[];
  contexto?: Record<string, unknown>;
}

export interface OpcoesExecucao {
  /** Necessário quando alguma ferramenta não é reversível (ex.: preço de catálogo). */
  confirmado?: boolean;
  maxOperacoes?: number;
  /** Injetável para teste. */
  id?: string;
}

export type ResultadoM4 =
  | { ok: true; transacao: TransacaoIA; passo: Passo | null; estado: EstadoIa; efeitos: Efeito[] }
  | { ok: false; erro: IAErro; transacao: TransacaoIA };

const MAX_OPERACOES_PADRAO = 20;

function aplicarBim(
  elementos: readonly ElementoBim[],
  operacoes: readonly OperacaoBIM[],
): { ok: true; elementos: ElementoBim[] } | { ok: false; detalhe: string } {
  let atual = [...elementos];
  for (const operacao of operacoes) {
    if (operacao.tipo === 'criar_elemento_bim') {
      if (atual.some((elemento) => elemento.id === operacao.elemento.id)) {
        return { ok: false, detalhe: 'elemento duplicado: ' + operacao.elemento.id };
      }
      atual = [...atual, operacao.elemento];
      continue;
    }
    if (operacao.tipo === 'atualizar_elemento_bim') {
      if (!atual.some((elemento) => elemento.id === operacao.depois.id)) {
        return { ok: false, detalhe: 'elemento inexistente: ' + operacao.depois.id };
      }
      atual = atual.map((elemento) => (elemento.id === operacao.depois.id ? operacao.depois : elemento));
      continue;
    }
    if (operacao.tipo === 'remover_elemento_bim') {
      const antes = atual.length;
      atual = atual.filter((elemento) => elemento.id !== operacao.elemento.id);
      if (atual.length === antes) return { ok: false, detalhe: 'elemento inexistente: ' + operacao.elemento.id };
      continue;
    }
    return { ok: false, detalhe: 'operação BIM fora do escopo da IA' };
  }
  return { ok: true, elementos: atual };
}

function aplicarEscopos(
  estado: EstadoIa,
  escopos: OperacoesPorEscopo,
): { ok: true; estado: EstadoIa } | { ok: false; erro: IAErro } {
  let resultado = estado;

  if (escopos.modelador !== undefined && escopos.modelador.length > 0) {
    const passo = aplicarPasso(resultado.modelador, escopos.modelador, 'direta');
    if (!passo.ok) {
      return { ok: false, erro: { codigo: 'TOOL_CALL_INVALIDA', tool: 'modelador', detalhe: passo.erro.codigo } };
    }
    resultado = { ...resultado, modelador: passo.estado };
  }

  if (escopos.bim !== undefined && escopos.bim.length > 0) {
    const aplicado = aplicarBim(resultado.elementos, escopos.bim);
    if (!aplicado.ok) {
      return { ok: false, erro: { codigo: 'TOOL_CALL_INVALIDA', tool: 'bim', detalhe: aplicado.detalhe } };
    }
    resultado = { ...resultado, elementos: aplicado.elementos };
  }

  return { ok: true, estado: resultado };
}

function montarPasso(
  id: string,
  modelador: readonly OperacaoModelador[],
  bim: readonly OperacaoBIM[],
): Passo | null {
  const temModelador = modelador.length > 0;
  const temBim = bim.length > 0;
  if (!temModelador && !temBim) return null;
  if (temModelador && !temBim) {
    return { escopo: 'modelador', id, operacoes: [...modelador] };
  }
  return {
    escopo: 'cross',
    id,
    operacoes: {
      ...(temModelador ? { modelador: [...modelador] } : {}),
      bim: [...bim],
    },
    // sólido antes do elemento que o referencia — a reversão percorre ao contrário
    ordem: temModelador ? ['modelador', 'bim'] : ['bim'],
  };
}

export function executarPlano(
  plano: PlanoIa,
  estadoInicial: EstadoIa,
  opcoes: OpcoesExecucao = {},
): ResultadoM4 {
  const id = opcoes.id ?? 'ia_' + Date.now().toString(36);
  const transacao: TransacaoIA = {
    id,
    tipo: plano.tipo,
    prompt: plano.prompt,
    contexto: plano.contexto ?? {},
    toolCalls: [],
    status: 'pendente',
  };

  const maximo = opcoes.maxOperacoes ?? MAX_OPERACOES_PADRAO;
  const encerrar = (erro: IAErro): ResultadoM4 => {
    transacao.status = 'erro';
    return { ok: false, erro, transacao };
  };

  if (plano.toolCalls.length === 0) {
    return encerrar({ codigo: 'TOOL_CALL_INVALIDA', tool: 'plano', detalhe: 'nenhuma tool_call' });
  }
  if (plano.toolCalls.length > maximo) {
    return encerrar({
      codigo: 'TOOL_CALL_INVALIDA',
      tool: 'plano',
      detalhe: plano.toolCalls.length + ' operações acima do limite de ' + String(maximo),
    });
  }

  let estado = estadoInicial;
  const modelador: OperacaoModelador[] = [];
  const bim: OperacaoBIM[] = [];
  const efeitos: Efeito[] = [];
  const chamadas: ToolCallIA[] = [];

  for (const chamada of plano.toolCalls) {
    const ferramenta = obterFerramenta(chamada.nome);
    if (ferramenta === null) {
      chamadas.push({ ...chamada, resultado: { ok: false, erro: 'OPERACAO_NAO_SUPORTADA' } });
      transacao.toolCalls = chamadas;
      return encerrar({ codigo: 'OPERACAO_NAO_SUPORTADA', tool: chamada.nome });
    }

    if (ferramenta.requerConfirmacao === true && opcoes.confirmado !== true) {
      chamadas.push({ ...chamada, resultado: { ok: false, erro: 'PROMPT_INSEGURO' } });
      transacao.toolCalls = chamadas;
      return encerrar({
        codigo: 'PROMPT_INSEGURO',
        motivo: 'ação não reversível exige confirmação humana: ' + ferramenta.nome,
      });
    }

    const resultado = ferramenta.executar(chamada.argumentos ?? {}, estado);
    if (!resultado.ok) {
      chamadas.push({ ...chamada, resultado: { ok: false, erro: resultado.erro.codigo } });
      transacao.toolCalls = chamadas;
      return encerrar(resultado.erro);
    }

    const aplicado = aplicarEscopos(estado, resultado.escopos);
    if (!aplicado.ok) {
      chamadas.push({ ...chamada, resultado: { ok: false, erro: aplicado.erro.codigo } });
      transacao.toolCalls = chamadas;
      return encerrar(aplicado.erro);
    }
    estado = aplicado.estado;

    if (resultado.escopos.modelador !== undefined) modelador.push(...resultado.escopos.modelador);
    if (resultado.escopos.bim !== undefined) bim.push(...resultado.escopos.bim);

    if (resultado.efeito !== undefined) {
      efeitos.push(resultado.efeito);
      if (resultado.efeito.tipo === 'catalogo') {
        estado = { ...estado, catalogo: resultado.efeito.catalogo };
      }
    }

    chamadas.push({ ...chamada, resultado: { ok: true } });
  }

  const passo = montarPasso(id, modelador, bim);
  transacao.toolCalls = chamadas;
  transacao.status = 'aplicada';
  if (passo !== null) transacao.passo = passo;

  return { ok: true, transacao, passo, estado, efeitos };
}
