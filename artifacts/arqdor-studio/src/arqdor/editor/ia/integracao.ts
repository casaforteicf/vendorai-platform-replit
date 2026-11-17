/**
 * IA — ponte com o store.
 *
 * Duas fases, de propósito:
 *   1. VALIDAR todos os escopos sobre o estado atual (nenhuma escrita);
 *   2. APLICAR na `ordem` do passo.
 *
 * Sem a fase 1, um passo cross com a parte BIM inválida deixaria a parte do modelador já
 * aplicada — o estado ficaria a meio caminho. Esta camada é a única que escreve.
 */

import type { OperacaoBIM } from '../bim/schema';
import type { OperacaoModelador } from '../modelador/schema';
import { aplicarPasso } from '../modelador/store-core';
import { aplicarPassoBim } from '../bim/store-core';
import type { Passo } from '../transacao';
import { useModeladorStore } from '../stores/useModeladorStore';
import { useBIMStore } from '../stores/useBIMStore';

export interface AplicadoresPasso {
  validarModelador(operacoes: readonly OperacaoModelador[]): boolean;
  validarBim(operacoes: readonly OperacaoBIM[]): boolean;
  aplicarModelador(operacoes: readonly OperacaoModelador[]): void;
  aplicarBim(operacoes: readonly OperacaoBIM[]): void;
}

export type ErroAplicacao = 'FALHA_MODELADOR' | 'FALHA_BIM' | 'ESCOPO_NAO_SUPORTADO';

export type ResultadoAplicacao =
  | { ok: true; aplicado: boolean }
  | { ok: false; erro: ErroAplicacao };

export function aplicarPassoCom(
  passo: Passo | null,
  aplicadores: AplicadoresPasso,
): ResultadoAplicacao {
  // Passo nulo = ação de leitura (cotação, render, memorial): nada a aplicar.
  if (passo === null) return { ok: true, aplicado: false };

  if (passo.escopo === 'mep') return { ok: false, erro: 'ESCOPO_NAO_SUPORTADO' };

  const modelador: readonly OperacaoModelador[] =
    passo.escopo === 'modelador' ? passo.operacoes : passo.operacoes.modelador ?? [];
  const bim: readonly OperacaoBIM[] = passo.escopo === 'cross' ? passo.operacoes.bim ?? [] : [];

  if (passo.escopo === 'cross') {
    for (const escopo of passo.ordem) {
      if (escopo !== 'modelador' && escopo !== 'bim') return { ok: false, erro: 'ESCOPO_NAO_SUPORTADO' };
    }
  }

  // Fase 1 — validar tudo antes de escrever qualquer coisa.
  if (modelador.length > 0 && !aplicadores.validarModelador(modelador)) {
    return { ok: false, erro: 'FALHA_MODELADOR' };
  }
  if (bim.length > 0 && !aplicadores.validarBim(bim)) {
    return { ok: false, erro: 'FALHA_BIM' };
  }

  // Fase 2 — aplicar respeitando a ordem do passo.
  const ordem = passo.escopo === 'cross' ? passo.ordem : (['modelador'] as const);
  for (const escopo of ordem) {
    if (escopo === 'modelador' && modelador.length > 0) aplicadores.aplicarModelador(modelador);
    if (escopo === 'bim' && bim.length > 0) aplicadores.aplicarBim(bim);
  }

  return { ok: true, aplicado: true };
}

/** Aplicadores reais: validam sobre o estado atual e só então escrevem no store. */
export function criarAplicadoresStore(): AplicadoresPasso {
  return {
    validarModelador: (operacoes) =>
      aplicarPasso(useModeladorStore.getState().estado, [...operacoes], 'direta').ok,
    validarBim: (operacoes) =>
      aplicarPassoBim(useBIMStore.getState().bim, operacoes, 'direta').ok,
    aplicarModelador: (operacoes) => {
      useModeladorStore.getState().aplicar([...operacoes]);
    },
    aplicarBim: (operacoes) => {
      useBIMStore.getState().aplicar([...operacoes]);
    },
  };
}

/** Entrada única para a UI: recebe o passo do executor e aplica de verdade. */
export function aplicarPassoDaIA(passo: Passo | null): ResultadoAplicacao {
  return aplicarPassoCom(passo, criarAplicadoresStore());
}
