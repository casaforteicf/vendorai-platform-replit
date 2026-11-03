'use client';

/**
 * Casca fixa: sidebar (esquerda) + coluna direita (header sobre conteúdo).
 *
 * `imersivo` remove a sidebar: o editor ocupa a tela toda e voltar ao dashboard passa a ser
 * o botão de menu na topbar (padrão de app de modelagem, não de portal).
 */

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export interface PropsAppShell {
  projeto?: string;
  salvo?: boolean;
  acoes?: ReactNode;
  busca?: string;
  aoBuscar?: (valor: string) => void;
  /** Modo imersão: sem sidebar, conteúdo em tela cheia. */
  imersivo?: boolean;
  children: ReactNode;
}

export function AppShell({ projeto, salvo, acoes, busca, aoBuscar, imersivo, children }: PropsAppShell) {
  if (imersivo === true) {
    return (
      <div className="arq-app arq-app-imersivo">
        <div className="arq-content-area">
          <Topbar
            projeto={projeto}
            salvo={salvo}
            acoes={acoes}
            busca={busca}
            aoBuscar={aoBuscar}
            imersivo
          />
          <div className="arq-content arq-content-imersivo">{children}</div>
        </div>
      </div>
    );
  }

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
