'use client';

/** Store do modelador — casca fina sobre o motor puro (nenhuma regra de geometria aqui). */

import { create } from 'zustand';
import type { FerramentaModelador } from '../modelador/desenho';
import type { OperacaoModelador, Solido, Transformacao } from '../modelador/schema';
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
  aplicar: (operacoes: OperacaoModelador[]) => void;
  desfazer: () => void;
  refazer: () => void;
  setFerramenta: (ferramenta: FerramentaModelador) => void;
  selecionar: (id: string | null) => void;
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
}));