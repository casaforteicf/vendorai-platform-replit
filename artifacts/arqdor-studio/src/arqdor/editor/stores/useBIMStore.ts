'use client';

/** Store do BIM — camadas e elementos, delegando ao motor puro (D4: fonte única). */

import { create } from 'zustand';
import type { EstadoCamadas } from '../bim/camadas';
import {
  aplicarModo,
  alternarOcultoObjeto,
  alternarVisibilidade,
  criarCamada,
  deletarCamada,
  estadoInicialCamadas,
  revelarTodosObjetos,
} from '../bim/camadas';
import type { ElementoBim, OperacaoBIM } from '../bim/schema';
import type { EstadoBim } from '../bim/store-core';
import { ESTADO_BIM_INICIAL, aplicarPassoBim } from '../bim/store-core';

export interface BIMState {
  camadas: EstadoCamadas;
  bim: EstadoBim;
  setModo: (modoId: string) => void;
  toggleCamada: (camadaId: string) => void;
  novaCamada: (nome: string) => void;
  removerCamada: (camadaId: string) => void;
  toggleOculto: (objetoId: string) => void;
  revelarTodos: () => void;
  aplicar: (operacoes: OperacaoBIM[]) => void;
  carregarExemplo: () => void;
}

export const useBIMStore = create<BIMState>((set, get) => ({
  camadas: estadoInicialCamadas(),
  bim: ESTADO_BIM_INICIAL,

  setModo: (modoId) => {
    const r = aplicarModo(get().camadas, modoId);
    if (r.ok) set({ camadas: r.estado });
  },

  toggleCamada: (camadaId) => {
    const r = alternarVisibilidade(get().camadas, camadaId);
    if (r.ok) set({ camadas: r.estado });
  },

  novaCamada: (nome) => {
    const r = criarCamada(get().camadas, nome);
    if (r.ok) set({ camadas: r.estado });
  },

  removerCamada: (camadaId) => {
    const r = deletarCamada(get().camadas, camadaId);
    if (!r.ok) return;
    const elementos = get().bim.elementos.map((el) =>
      el.camadaId === camadaId ? { ...el, camadaId: r.fallbackId } : el,
    );
    set({ camadas: r.estado, bim: { elementos } });
  },

  toggleOculto: (objetoId) => {
    const r = alternarOcultoObjeto(get().camadas, objetoId);
    if (r.ok) set({ camadas: r.estado });
  },

  revelarTodos: () => {
    const r = revelarTodosObjetos(get().camadas);
    if (r.ok) set({ camadas: r.estado });
  },

  aplicar: (operacoes) => {
    const r = aplicarPassoBim(get().bim, operacoes, 'direta');
    if (r.ok) set({ bim: r.estado });
  },

  carregarExemplo: () => {
    const projetoId = 'projeto-exemplo';
    const parede: ElementoBim = {
      id: 'parede-exemplo', projetoId, tipo: 'parede', nivel: 0,
      camadaId: 'camada_estrutura', materialId: 'MAT-ALV', propriedades: {},
      geometria: { ponto_a: [0, 0], ponto_b: [5, 0], altura: 2.8, espessura: 0.15 },
    };
    const parede2: ElementoBim = {
      id: 'parede-exemplo-2', projetoId, tipo: 'parede', nivel: 0,
      camadaId: 'camada_estrutura', materialId: 'MAT-ALV', propriedades: {},
      geometria: { ponto_a: [5, 0], ponto_b: [5, 4], altura: 2.8, espessura: 0.15 },
    };
    const laje: ElementoBim = {
      id: 'laje-exemplo', projetoId, tipo: 'laje', nivel: 0,
      camadaId: 'camada_estrutura', materialId: 'MAT-CONC', propriedades: {},
      geometria: { contorno: [[0, 0], [5, 0], [5, 4], [0, 4]], espessura: 0.12 },
    };
    const porta: ElementoBim = {
      id: 'porta-exemplo', projetoId, tipo: 'porta', nivel: 0,
      camadaId: 'camada_estrutura', propriedades: {},
      geometria: { parede_id: 'parede-exemplo', offset: 1.2, largura: 0.9, altura: 2.1 },
    };
    set({ bim: { elementos: [laje, parede, parede2, porta] } });
  },
}));