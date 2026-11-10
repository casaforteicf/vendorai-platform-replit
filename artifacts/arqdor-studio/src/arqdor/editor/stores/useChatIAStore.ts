/**
 * Estado do painel de chat (UI) — separado do motor.
 * O botão "Vendi IA" da sidebar abre; o painel é renderizado pela casca.
 */

import { create } from 'zustand';

export interface ChatIAState {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
}

export const useChatIAStore = create<ChatIAState>((set, get) => ({
  aberto: false,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
  alternar: () => set({ aberto: !get().aberto }),
}));
