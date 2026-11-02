'use client';

/** Área "Projetos" — cards reais (localStorage) e uma única ação primária no topo. */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { criarProjeto, definirAtivo, listarProjetos } from '../arqdor/editor/persistencia/localStore';
import type { ResumoProjeto } from '../arqdor/editor/persistencia/localStore';
import { AppShell } from '../arqdor/editor/shell/AppShell';

function formatarData(iso: string): string {
  if (iso.length === 0) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PaginaProjetos() {
  const [projetos, setProjetos] = useState<ResumoProjeto[]>([]);
  const [nome, setNome] = useState('');
  const [pronto, setPronto] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setProjetos(listarProjetos());
    setPronto(true);
  }, []);

  const abrir = (id: string): void => {
    definirAtivo(id);
    router.push('/modelagem');
  };

  return (
    <AppShell
      acoes={
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            const documento = criarProjeto(nome);
            setProjetos(listarProjetos());
            setNome('');
            router.push('/modelagem?projeto=' + documento.projeto.id);
          }}
          style={{ display: 'flex', gap: 6 }}
        >
          <input
            className="arq2-field"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Nome do novo projeto"
            aria-label="Nome do novo projeto"
            style={{ width: 210 }}
          />
          <button type="submit" className="arq-primary">
            Novo projeto
          </button>
        </form>
      }
    >
      <div className="arq-dashboard">
        <h1 className="arq-dashboard-title">Projetos</h1>
        <p className="arq-dashboard-sub">
          {pronto ? String(projetos.length) + ' projeto(s) salvo(s) neste navegador.' : 'Carregando…'}
        </p>

        {projetos.length === 0 ? (
          <div className="arq-empty">
            Nenhum projeto ainda. Use <strong>Novo projeto</strong> no topo para criar o primeiro.
          </div>
        ) : (
          <div className="arq-cards">
            {projetos.map((projeto) => (
              <button key={projeto.id} type="button" className="arq-card" onClick={() => abrir(projeto.id)}>
                <span className="arq-card-name">{projeto.nome}</span>
                <span className="arq-card-meta">atualizado em {formatarData(projeto.atualizadoEm)}</span>
                <span className="arq-card-meta">{String(projeto.objetos)} objeto(s)</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}