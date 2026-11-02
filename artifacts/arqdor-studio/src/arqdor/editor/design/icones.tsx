'use client';

/** Ícones inline (stroke 1.5, 20px) — sem dependência de biblioteca de ícones. */

import type { ReactElement } from 'react';

export type NomeIcone =
  | 'projetos'
  | 'modelagem'
  | 'materiais'
  | 'render'
  | 'especificacoes'
  | 'orcamento'
  | 'entrega'
  | 'mais'
  | 'camadas'
  | 'linha'
  | 'retangulo'
  | 'circulo'
  | 'arco'
  | 'desfazer'
  | 'refazer';

const CAMINHOS: Record<NomeIcone, ReactElement> = {
  projetos: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>,
  modelagem: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  materiais: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16M4 12h16" /></>,
  render: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M8 5l1.5-2h5L16 5" /></>,
  especificacoes: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  orcamento: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  entrega: <><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M3 8v8l9 4 9-4V8" /><path d="M12 12v8" /></>,
  mais: <><path d="M12 5v14M5 12h14" /></>,
  camadas: <><path d="M12 3l8 4-8 4-8-4 8-4z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4" /></>,
  linha: <><path d="M4 20L20 4" /><circle cx="4" cy="20" r="1.6" /><circle cx="20" cy="4" r="1.6" /></>,
  retangulo: <><rect x="4" y="6" width="16" height="12" rx="1" /></>,
  circulo: <><circle cx="12" cy="12" r="8" /></>,
  arco: <><path d="M4 18a10 10 0 0 1 10-10" /><circle cx="4" cy="18" r="1.5" /><circle cx="18" cy="18" r="1.5" /></>,
  desfazer: <><path d="M9 7L4 12l5 5" /><path d="M4 12h9a6 6 0 0 1 0 12h-1" /></>,
  refazer: <><path d="M15 7l5 5-5 5" /><path d="M20 12h-9a6 6 0 0 0 0 12h1" /></>,
};

export function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }): ReactElement {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}