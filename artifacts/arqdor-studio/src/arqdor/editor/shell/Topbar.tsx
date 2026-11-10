'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icone } from '../design/icones';
import { useUnidadeStore } from '../stores/useUnidadeStore';
import type { Unidade } from '../modelador/unidades';

const UNIDADES: readonly Unidade[] = ['mm', 'cm', 'm', 'pol'];

function SeletorUnidade() {
  const unidade = useUnidadeStore((s) => s.unidade);
  const setUnidade = useUnidadeStore((s) => s.setUnidade);
  return (
    <select
      className="arq-select-unidade"
      value={unidade}
      onChange={(evento) => setUnidade(evento.target.value as Unidade)}
      title="Unidade de entrada e exibição (interno continua em metros)"
      aria-label="Unidade de medida"
    >
      {UNIDADES.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}

export interface PropsTopbar {
  projeto?: string;
  salvo?: boolean;
  acoes?: ReactNode;
  busca?: string;
  aoBuscar?: (valor: string) => void;
  /** Modo imersão: botão de menu no lugar da sidebar e sem campo de busca. */
  imersivo?: boolean;
  /** Acessos do editor imersivo (sem sidebar). */
  aoVendi?: () => void;
  aoTerreno?: () => void;
}

function SvgIcone({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export function Topbar({ projeto, salvo, acoes, busca, aoBuscar, imersivo, aoVendi, aoTerreno }: PropsTopbar) {
  if (imersivo === true) {
    return (
      <header className="arq-topbar arq-topbar-ed">
        <Link className="arq-topbar-back" href="/" title="Sair do modo imersão" aria-label="Voltar ao dashboard">
          <SvgIcone d="M15 19l-7-7 7-7" />
        </Link>

        <button type="button" className="arq-topbar-project" title="Projeto ativo">
          <span className="arq-topbar-project-thumb" aria-hidden="true">
            <SvgIcone d="M3 12l9-9 9 9M5 10v10h14V10" />
          </span>
          <span className="arq-topbar-project-info">
            <span className="arq-topbar-project-label">Projeto</span>
            <span className="arq-topbar-project-name">{projeto ?? 'Nenhum projeto ativo'}</span>
          </span>
        </button>

        <button type="button" className="arq-topbar-vendi" onClick={aoVendi} title="Abrir o Vendi IA">
          <SvgIcone d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z" />
          <span>Vendi IA</span>
          <span className="arq-topbar-vendi-dot" aria-hidden="true" />
        </button>

        <button type="button" className="arq-topbar-terreno" onClick={aoTerreno} title="Importar terreno por coordenadas">
          <SvgIcone d="M3 20l4-8 4 4 4-10 6 14H3z" />
          <span>Terreno</span>
        </button>

        <div className="arq-topbar-right">
          <SeletorUnidade />
          {acoes !== undefined ? <div className="arq-topbar-acoes">{acoes}</div> : null}
          {salvo === true ? (
            <span className="arq-salvo">
              <Icone nome="salvo" tamanho={16} />
              Salvo
            </span>
          ) : null}
          <div className="arq-topbar-avatar-wrap">
            <span className="arq-topbar-avatar">MP</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="arq-topbar">
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

      <button type="button" className="arq-projeto-ativo" title="Projeto ativo">
        <span className="capa" aria-hidden="true" />
        <span className="txt">
          <strong>{projeto ?? 'Nenhum projeto ativo'}</strong>
          <span>{projeto !== undefined ? 'Projeto ativo' : 'abrir em Projetos'}</span>
        </span>
      </button>

      <div className="arq-topbar-right">
        <SeletorUnidade />
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