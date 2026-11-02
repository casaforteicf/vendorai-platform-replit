'use client';

/** Casca comum: header 52px + navegação única (7 ambientes) à esquerda.
 *  Zero redundância: a navegação existe em UM lugar só. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icone } from '../design/icones';
import type { NomeIcone } from '../design/icones';

export type AmbienteId =
  | 'projetos'
  | 'modelagem'
  | 'materiais'
  | 'render'
  | 'especificacoes'
  | 'orcamento'
  | 'entrega';

interface Ambiente {
  id: AmbienteId;
  rotulo: string;
  icone: NomeIcone;
  href: string | null;
}

const AMBIENTES: readonly Ambiente[] = [
  { id: 'projetos', rotulo: 'Projetos', icone: 'projetos', href: '/' },
  { id: 'modelagem', rotulo: 'Modelagem 2D/3D', icone: 'modelagem', href: '/modelagem' },
  { id: 'materiais', rotulo: 'Materiais', icone: 'materiais', href: null },
  { id: 'render', rotulo: 'Render', icone: 'render', href: null },
  { id: 'especificacoes', rotulo: 'Especificações', icone: 'especificacoes', href: null },
  { id: 'orcamento', rotulo: 'Orçamento', icone: 'orcamento', href: null },
  { id: 'entrega', rotulo: 'Entrega', icone: 'entrega', href: null },
];

export interface PropsAppShell {
  projeto?: string;
  acoes?: ReactNode;
  children: ReactNode;
}

export function AppShell({ projeto, acoes, children }: PropsAppShell) {
  const caminho = usePathname() ?? '/';

  return (
    <div className="arqdor-studio-ui arq-shell">
      <header className="arq-header">
        <div className="arq-brand">
          <span className="arq-brand-mark" aria-hidden="true">A</span>
          ARQDOR Studio
        </div>
        {projeto !== undefined ? (
          <span className="arq-header-project">
            projeto ativo: <strong>{projeto}</strong>
          </span>
        ) : null}
        <div className="arq-header-spacer" />
        {acoes}
      </header>

      <div className="arq-body">
        <nav className="arq-nav" aria-label="Ambientes do Arqdor Studio">
          {AMBIENTES.map((ambiente) => {
            const ativo = ambiente.id === 'projetos' ? caminho === '/' : caminho.startsWith('/' + ambiente.id);
            if (ambiente.href === null) {
              return (
                <button key={ambiente.id} type="button" className="arq-nav-item" disabled title={'Disponível em fase posterior: ' + ambiente.rotulo}>
                  <Icone nome={ambiente.icone} />
                  <span>{ambiente.rotulo}</span>
                </button>
              );
            }
            return (
              <Link
                key={ambiente.id}
                href={ambiente.href}
                className="arq-nav-item"
                aria-current={ativo ? 'page' : undefined}
              >
                <Icone nome={ambiente.icone} />
                <span>{ambiente.rotulo}</span>
              </Link>
            );
          })}
        </nav>

        <div className="arq-main">{children}</div>
      </div>
    </div>
  );
}