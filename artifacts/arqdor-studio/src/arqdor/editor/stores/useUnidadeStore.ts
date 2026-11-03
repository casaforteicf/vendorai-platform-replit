/**
 * Unidade de exibição/entrada (UI). O motor continua em metros.
 */

import { create } from 'zustand';
import type { Unidade } from '../modelador/unidades';

export interface UnidadeState {
  unidade: Unidade;
  setUnidade: (unidade: Unidade) => void;
}

export const useUnidadeStore = create<UnidadeState>((set) => ({
  unidade: 'm',
  setUnidade: (unidade) => set({ unidade }),
}));
