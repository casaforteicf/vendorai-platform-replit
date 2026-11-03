'use client';

/** Store do modelador — casca fina sobre o motor puro (nenhuma regra de geometria aqui). */

import { criarCaixa } from '../modelador/caixa';
import type { DimensoesCaixa } from '../modelador/caixa';
import { criarTelhadoDuasAguas } from '../modelador/telhado';
import { criarEscadaReta } from '../modelador/escada';
import { create } from 'zustand';
import type { FerramentaModelador } from '../modelador/desenho';
import type { OperacaoModelador, Solido, Transformacao, Vetor3 } from '../modelador/schema';
import type { ErroStore, EstadoModelador } from '../modelador/store-core';
import { ESTADO_INICIAL, aplicarPasso, novoSolidoId } from '../modelador/store-core';

const IDENTIDADE: Transformacao = { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] };

export interface ModeladorState {
  estado: EstadoModelador;
  historico: EstadoModelador[];
  indice: number;
  ferramenta: FerramentaModelador;
  solidoSelecionadoId: string | null;
  ultimoErro: ErroStore | null;
  criarSolido: () => void;
  /** Insere um sólido com medidas exatas (canto mínimo + dimensões). */
  inserirCaixa: (entrada: { nome: string; posicao: Vetor3; dimensoes: DimensoesCaixa }) => void;
  /** Telhado de duas águas (Bloco 4) a partir da base retangular. */
  inserirTelhado: (entrada: {
    nome: string;
    posicao: Vetor3;
    larguraX: number;
    profundidadeZ: number;
    altura: number;
    beiral?: number;
  }) => void;
  /** Escada reta (Bloco 4) com piso/espelho reais. */
  inserirEscada: (entrada: {
    nome: string;
    posicao: Vetor3;
    largura: number;
    alturaTotal: number;
    profundidadeDegrau: number;
    numeroDegraus?: number;
  }) => void;
  /** Remove o sólido (e a seleção). Undo restaura. */
  removerSolido: (solidoId: string) => void;
  aplicar: (operacoes: OperacaoModelador[]) => void;
  desfazer: () => void;
  refazer: () => void;
  setFerramenta: (ferramenta: FerramentaModelador) => void;
  selecionar: (id: string | null) => void;
  carregar: (estado: EstadoModelador) => void;
}

export const useModeladorStore = create<ModeladorState>((set, get) => ({
  estado: ESTADO_INICIAL,
  historico: [ESTADO_INICIAL],
  indice: 0,
  ferramenta: 'linha',
  solidoSelecionadoId: null,
  ultimoErro: null,

  criarSolido: () => {
    const { estado, historico, indice } = get();
    const { id, proximoSolidoN } = novoSolidoId(estado);
    const solido: Solido = {
      id,
      nome: 'Sólido ' + String(proximoSolidoN),
      vertices: [],
      arestas: [],
      faces: [],
      transformacao: IDENTIDADE,
    };
    const resultado = aplicarPasso(estado, [{ tipo: 'criar_solido', solido }], 'direta');
    if (!resultado.ok) {
      set({ ultimoErro: resultado.erro });
      return;
    }
    const novo: EstadoModelador = { ...resultado.estado, proximoSolidoN };
    set({
      estado: novo,
      historico: [...historico.slice(0, indice + 1), novo],
      indice: indice + 1,
      solidoSelecionadoId: id,
      ultimoErro: null,
    });
  },

  inserirCaixa: (entrada) => {
    const { estado, historico, indice } = get();
    const { id, proximoSolidoN } = novoSolidoId(estado);
    const caixa = criarCaixa({ id, nome: entrada.nome, posicao: entrada.posicao, dimensoes: entrada.dimensoes });
    if (!caixa.ok) {
      set({ ultimoErro: { codigo: 'ESTADO_INCONSISTENTE', detalhe: caixa.erro.codigo } });
      return;
    }
    const resultado = aplicarPasso(estado, [{ tipo: 'criar_solido', solido: caixa.solido }], 'direta');
    if (!resultado.ok) {
      set({ ultimoErro: resultado.erro });
      return;
    }
    const novo: EstadoModelador = { ...resultado.estado, proximoSolidoN };
    set({
      estado: novo,
      historico: [...historico.slice(0, indice + 1), novo],
      indice: indice + 1,
      solidoSelecionadoId: id,
      ultimoErro: null,
    });
  },

  inserirTelhado: (entrada) => {
    const { estado, historico, indice } = get();
    const { id, proximoSolidoN } = novoSolidoId(estado);
    const telhado = criarTelhadoDuasAguas({ id, ...entrada });
    if (!telhado.ok) {
      set({ ultimoErro: { codigo: 'ESTADO_INCONSISTENTE', detalhe: telhado.erro.codigo } });
      return;
    }
    const resultado = aplicarPasso(estado, [{ tipo: 'criar_solido', solido: telhado.solido }], 'direta');
    if (!resultado.ok) {
      set({ ultimoErro: resultado.erro });
      return;
    }
    const novo: EstadoModelador = { ...resultado.estado, proximoSolidoN };
    set({
      estado: novo,
      historico: [...historico.slice(0, indice + 1), novo],
      indice: indice + 1,
      solidoSelecionadoId: id,
      ultimoErro: null,
    });
  },

  inserirEscada: (entrada) => {
    const { estado, historico, indice } = get();
    const { id, proximoSolidoN } = novoSolidoId(estado);
    const escada = criarEscadaReta({ id, ...entrada });
    if (!escada.ok) {
      set({ ultimoErro: { codigo: 'ESTADO_INCONSISTENTE', detalhe: escada.erro.codigo } });
      return;
    }
    const resultado = aplicarPasso(estado, [{ tipo: 'criar_solido', solido: escada.solido }], 'direta');
    if (!resultado.ok) {
      set({ ultimoErro: resultado.erro });
      return;
    }
    const novo: EstadoModelador = { ...resultado.estado, proximoSolidoN };
    set({
      estado: novo,
      historico: [...historico.slice(0, indice + 1), novo],
      indice: indice + 1,
      solidoSelecionadoId: id,
      ultimoErro: null,
    });
  },

  removerSolido: (solidoId) => {
    const { estado, historico, indice, solidoSelecionadoId } = get();
    const alvo = estado.solidos.find((item) => item.id === solidoId);
    if (alvo === undefined) return;
    const resultado = aplicarPasso(estado, [{ tipo: 'remover_solido', solido: alvo }], 'direta');
    if (!resultado.ok) {
      set({ ultimoErro: resultado.erro });
      return;
    }
    set({
      estado: resultado.estado,
      historico: [...historico.slice(0, indice + 1), resultado.estado],
      indice: indice + 1,
      solidoSelecionadoId: solidoSelecionadoId === solidoId ? null : solidoSelecionadoId,
      ultimoErro: null,
    });
  },

  aplicar: (operacoes) => {
    const { estado, historico, indice } = get();
    const resultado = aplicarPasso(estado, operacoes, 'direta');
    if (!resultado.ok) {
      set({ ultimoErro: resultado.erro });
      return;
    }
    if (resultado.estado === estado) return;
    set({
      estado: resultado.estado,
      historico: [...historico.slice(0, indice + 1), resultado.estado],
      indice: indice + 1,
      ultimoErro: null,
    });
  },

  desfazer: () => {
    const { historico, indice } = get();
    if (indice <= 0) return;
    set({ estado: historico[indice - 1], indice: indice - 1, ultimoErro: null });
  },

  refazer: () => {
    const { historico, indice } = get();
    if (indice >= historico.length - 1) return;
    set({ estado: historico[indice + 1], indice: indice + 1, ultimoErro: null });
  },

  setFerramenta: (ferramenta) => set({ ferramenta }),
  selecionar: (id) => set({ solidoSelecionadoId: id }),

  carregar: (estado) => set({ estado, historico: [estado], indice: 0, solidoSelecionadoId: null, ultimoErro: null }),
}));