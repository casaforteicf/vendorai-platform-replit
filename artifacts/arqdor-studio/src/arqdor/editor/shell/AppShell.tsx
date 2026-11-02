'use client';

/** Casca oficial: sidebar escura + topbar verde + área de conteúdo. */

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export interface PropsAppShell {
  projeto?: string;
  salvo?: boolean;
  busca?: string;
  aoBuscar?: (valor: string) => void;
  children: ReactNode;
}

export function AppShell({ projeto, salvo, busca, aoBuscar, children }: PropsAppShell) {
  return (
    <div className="arq-app">
      <Sidebar />
      <div className="arq-content-area">
        <Topbar projeto={projeto} salvo={salvo} busca={busca} aoBuscar={aoBuscar} />
        {children}
      </div>
    </div>
  );
}