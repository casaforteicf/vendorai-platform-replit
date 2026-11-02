'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icone } from '../design/icones';
import type { NomeIcone } from '../design/icones';

interface ItemNav { id: string; rotulo: string; icone: NomeIcone; href: string | null }

const PRINCIPAIS: readonly ItemNav[] = [
  { id: 'projetos', rotulo: 'Projetos', icone: 'projetos', href: '/' },
  { id: 'modelagem', rotulo: 'Modelagem', icone: 'modelagem', href: '/modelagem' },
  { id: 'materiais', rotulo: 'Materiais', icone: 'materiais', href: null },
  { id: 'render', rotulo: 'Render', icone: 'render', href: null },
  { id: 'especificacoes', rotulo: 'Especificações', icone: 'especificacoes', href: null },
  { id: 'orcamento', rotulo: 'Orçamento', icone: 'orcamento', href: '/orcamento' },
  { id: 'entrega', rotulo: 'Entrega', icone: 'entrega', href: null },
];

const SECUNDARIOS: readonly ItemNav[] = [
  { id: 'biblioteca', rotulo: 'Biblioteca', icone: 'biblioteca', href: null },
  { id: 'clientes', rotulo: 'Clientes', icone: 'clientes', href: null },
  { id: 'equipe', rotulo: 'Equipe', icone: 'equipe', href: null },
  { id: 'integracoes', rotulo: 'Integrações', icone: 'integracoes', href: null },
];

function Item({ item, atual }: { item: ItemNav; atual: boolean }) {
  if (item.href === null) {
    return (
      <button type="button" className="arq-nav-item" disabled title={'Disponível em fase posterior: ' + item.rotulo}>
        <Icone nome={item.icone} />
        <span>{item.rotulo}</span>
      </button>
    );
  }
  return (
    <Link href={item.href} className="arq-nav-item" aria-current={atual ? 'page' : undefined}>
      <Icone nome={item.icone} />
      <span>{item.rotulo}</span>
    </Link>
  );
}

export function Sidebar() {
  const caminho = usePathname() ?? '/';

  return (
    <aside className="arq-sidebar">
      <div className="arq-sidebar-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arqdor-simbolo.png" alt="Símbolo ARQDOR" />
        <div className="arq-sidebar-wordmark">
          <strong>ARQDOR</strong>
          <span>IDEIAS · PROJETOS · ORÇAMENTOS</span>
        </div>
      </div>

      <nav className="arq-nav" aria-label="Ambientes">
        {PRINCIPAIS.map((item) => (
          <Item
            key={item.id}
            item={item}
            atual={item.id === 'projetos' ? caminho === '/' : caminho.startsWith('/' + item.id)}
          />
        ))}
      </nav>

      <div className="arq-nav-divider" />

      <nav className="arq-nav" aria-label="Gestão">
        {SECUNDARIOS.map((item) => (
          <Item key={item.id} item={item} atual={false} />
        ))}
      </nav>

      <div className="arq-nav-spacer" />

      <div className="arq-vendi">
        <strong>Vendi IA</strong>
        <span>Seu assistente no ARQDOR</span>
        <button type="button" disabled title="Disponível em fase posterior">
          Conversar
        </button>
      </div>

      <nav className="arq-nav" aria-label="Sistema">
        <Item item={{ id: 'config', rotulo: 'Configurações', icone: 'config', href: null }} atual={false} />
        <Item item={{ id: 'ajuda', rotulo: 'Ajuda', icone: 'ajuda', href: null }} atual={false} />
      </nav>
    </aside>
  );
}