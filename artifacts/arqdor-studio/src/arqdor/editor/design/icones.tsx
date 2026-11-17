'use client';

/** Ícones inline (stroke 1.6, 18-20px) — sem biblioteca externa. */

import type { ReactElement } from 'react';

export type NomeIcone =
  | 'projetos' | 'modelagem' | 'materiais' | 'render' | 'especificacoes' | 'orcamento' | 'entrega'
  | 'biblioteca' | 'clientes' | 'equipe' | 'integracoes' | 'config' | 'ajuda'
  | 'mais' | 'camadas' | 'linha' | 'retangulo' | 'circulo' | 'arco' | 'desfazer' | 'refazer'
  | 'buscar' | 'sino' | 'sol' | 'historico' | 'salvo' | 'grade' | 'lista' | 'filtro'
  | 'calendario' | 'local' | 'estrela' | 'pasta' | 'importar' | 'lixeira' | 'etiqueta'
  | 'visao' | 'acoes' | 'conversar' | 'pessoa'
  | 'pushpull' | 'mover' | 'rotacionar' | 'escalar' | 'selecionar' | 'offset';

const C: Record<NomeIcone, ReactElement> = {
  projetos: <><path d="M3 10.5 12 4l9 6.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  modelagem: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  materiais: <><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" /></>,
  render: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M8 5l1.5-2h5L16 5" /></>,
  especificacoes: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  orcamento: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  entrega: <><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M3 8v8l9 4 9-4V8" /></>,
  biblioteca: <><rect x="4" y="4" width="5" height="16" rx="1" /><rect x="11" y="4" width="4" height="16" rx="1" /><path d="M17 5l3 15" /></>,
  clientes: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" /><circle cx="17" cy="9" r="2.2" /><path d="M15 14c3 0 5 1.6 5 4" /></>,
  equipe: <><circle cx="12" cy="7" r="3.2" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M7 20c0-3 2.2-5 5-5s5 2 5 5M2.5 17c0-2 1.4-3.4 3.2-3.6M21.5 17c0-2-1.4-3.4-3.2-3.6" /></>,
  integracoes: <><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="7" r="2.5" /><circle cx="12" cy="17" r="2.5" /><path d="M9 8.5l2.5 6M15 8.5l-2.5 6M9.5 7h5" /></>,
  config: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" /></>,
  ajuda: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></>,
  mais: <><path d="M12 5v14M5 12h14" /></>,
  camadas: <><path d="M12 3l8 4-8 4-8-4 8-4z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" /></>,
  linha: <><path d="M4 20L20 4" /><circle cx="4" cy="20" r="1.6" /><circle cx="20" cy="4" r="1.6" /></>,
  retangulo: <><rect x="4" y="6" width="16" height="12" rx="1" /></>,
  circulo: <><circle cx="12" cy="12" r="8" /></>,
  arco: <><path d="M4 18a10 10 0 0 1 10-10" /><circle cx="4" cy="18" r="1.5" /><circle cx="18" cy="18" r="1.5" /></>,
  desfazer: <><path d="M9 7L4 12l5 5" /><path d="M4 12h9a6 6 0 0 1 0 12h-1" /></>,
  refazer: <><path d="M15 7l5 5-5 5" /><path d="M20 12h-9a6 6 0 0 0 0 12h1" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  sino: <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z" /><path d="M10 18.5a2 2 0 0 0 4 0" /></>,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  historico: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6" /><path d="M3 4v5h5" /><path d="M12 8v4.5l3 1.8" /></>,
  salvo: <><path d="M7 18h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.3A3.9 3.9 0 0 0 7 18z" /><path d="M9.5 14l2 2 3.5-4" /></>,
  grade: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  lista: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1.2" /><circle cx="4" cy="12" r="1.2" /><circle cx="4" cy="18" r="1.2" /></>,
  filtro: <><path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" /></>,
  calendario: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  local: <><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  estrela: <><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z" /></>,
  pasta: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  importar: <><path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  lixeira: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  etiqueta: <><path d="M3 12l9-9 9 9-9 9z" /><circle cx="9" cy="9" r="1.4" /></>,
  visao: <><circle cx="12" cy="12" r="3" /><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /></>,
  acoes: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h8M16 18h4" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></>,
  conversar: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8" /></>,
  pessoa: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></>,
  selecionar: <><path d="M5 3l13 7.5-5.6 1.5L9.8 18z" /></>,
  pushpull: <><path d="M4 15.5 12 11l8 4.5-8 4.5-8-4.5z" /><path d="M12 9V3M9 6l3-3 3 3" /></>,
  mover: <><path d="M12 3v18M3 12h18" /><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  rotacionar: <><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v5h-5" /></>,
  escalar: <><rect x="4" y="4" width="10" height="10" rx="1" /><path d="M14 10l6-6M20 4h-4M20 4v4" /></>,
  offset: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><rect x="7.5" y="8.5" width="9" height="7" rx="1" /></>,
};

export function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }): ReactElement {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {C[nome]}
    </svg>
  );
}