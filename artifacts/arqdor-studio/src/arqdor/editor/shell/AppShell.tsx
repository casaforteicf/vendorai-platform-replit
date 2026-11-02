'use client';

/** Casca fixa: sidebar (esquerda) + coluna direita (header sobre conteúdo). */

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export interface PropsAppShell {
  projeto?: string;
  salvo?: boolean;
  acoes?: ReactNode;
  busca?: string;
  aoBuscar?: (valor: string) => void;
  children: ReactNode;
}

export function AppShell({ projeto, salvo, acoes, busca, aoBuscar, children }: PropsAppShell) {
  return (
    <div className="arq-app">
      <Sidebar />
      <div className="arq-content-area">
        <Topbar projeto={projeto} salvo={salvo} acoes={acoes} busca={busca} aoBuscar={aoBuscar} />
        <div className="arq-content">{children}</div>
      </div>
    </div>
  );
}