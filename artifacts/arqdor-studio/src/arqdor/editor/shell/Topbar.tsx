'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icone } from '../design/icones';

export interface PropsTopbar {
  projeto?: string;
  salvo?: boolean;
  acoes?: ReactNode;
  busca?: string;
  aoBuscar?: (valor: string) => void;
  /** Modo imersão: botão de menu no lugar da sidebar e sem campo de busca. */
  imersivo?: boolean;
}

export function Topbar({ projeto, salvo, acoes, busca, aoBuscar, imersivo }: PropsTopbar) {
  return (
    <header className={imersivo === true ? 'arq-topbar arq-topbar-ed' : 'arq-topbar'}>
      {imersivo === true ? (
        <Link className="arq-menu-btn" href="/" title="Voltar ao dashboard" aria-label="Voltar ao dashboard">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </Link>
      ) : (
        <div className="arq-search">
          <Icone nome="buscar" />
          <input
            type="search"
            placeholder="Buscar projetos, clientes, endereços, tags..."
            aria-label="Buscar"
            value={busca ?? ''}
            onChange={(evento) => aoBuscar?.(evento.target.value)}
          />
        </div>
      )}

      <button type="button" className="arq-projeto-ativo" title="Projeto ativo">
        <span className="capa" aria-hidden="true" />
        <span className="txt">
          <strong>{projeto ?? 'Nenhum projeto ativo'}</strong>
          <span>{projeto !== undefined ? 'Projeto ativo' : 'abrir em Projetos'}</span>
        </span>
      </button>

      <div className="arq-topbar-right">
        {acoes !== undefined ? <div className="arq-topbar-acoes">{acoes}</div> : null}
        {salvo === true ? (
          <span className="arq-salvo">
            <Icone nome="salvo" tamanho={16} />
            Salvo
          </span>
        ) : null}
        <button type="button" className="arq-icon-btn" title="Histórico global">
          <Icone nome="historico" tamanho={18} />
        </button>
        <button type="button" className="arq-icon-btn" title="Notificações">
          <Icone nome="sino" tamanho={18} />
          <span className="badge">13</span>
        </button>
        <button type="button" className="arq-icon-btn" title="Tema">
          <Icone nome="sol" tamanho={18} />
        </button>
        <button type="button" className="arq-avatar" title="Perfil">
          MP
        </button>
      </div>
    </header>
  );
}