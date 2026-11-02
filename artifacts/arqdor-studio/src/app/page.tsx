'use client';

/** Área "Projetos" — layout da Tela 1 aprovada.
 *  Cards reais vêm do localStorage; quando não há nenhum, usa massa de exemplo
 *  (sinalizada na tela) só para o layout ficar visível. */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../arqdor/editor/design/icones';
import { criarProjeto, listarProjetos } from '../arqdor/editor/persistencia/apiStore';
import { definirAtivo, novoDocumento, projetoAtivoId } from '../arqdor/editor/persistencia/localStore';
import type { ResumoProjeto } from '../lib/db/tipos';
import { AppShell } from '../arqdor/editor/shell/AppShell';

type Status = 'Em andamento' | 'Planejamento' | 'Proposta' | 'Concluído' | 'Arquivado';

interface Cartao {
  id: string;
  nome: string;
  status: Status;
  tipo: 'Residencial' | 'Comercial' | 'Institucional';
  local: string;
  area: string;
  progresso: number;
  entrega: string;
  equipe: string[];
  favorito: boolean;
  exemplo: boolean;
}

const COR_STATUS: Record<Status, string> = {
  'Em andamento': '#00c896',
  Planejamento: '#3b82f6',
  Proposta: '#f59e0b',
  Concluído: '#0b3d2e',
  Arquivado: '#9ca3af',
};

const COR_TIPO: Record<Cartao['tipo'], string> = {
  Residencial: '#00c896',
  Comercial: '#3b82f6',
  Institucional: '#f59e0b',
};

const EXEMPLOS: Cartao[] = [
  { id: 'ex1', nome: 'Casa Zanella', status: 'Em andamento', tipo: 'Residencial', local: 'Joaçaba/SC', area: '250,00 m²', progresso: 65, entrega: 'Dez/2026', equipe: ['MP', 'FP', '+3'], favorito: true, exemplo: true },
  { id: 'ex2', nome: 'Residência Reisdorfer', status: 'Planejamento', tipo: 'Residencial', local: 'Chapecó/SC', area: '330,00 m²', progresso: 20, entrega: 'Abr/2027', equipe: ['MP', 'FR', '+1'], favorito: true, exemplo: true },
  { id: 'ex3', nome: 'Condomínio Solar', status: 'Proposta', tipo: 'Residencial', local: 'Luzerna/SC', area: '240,00 m²', progresso: 40, entrega: 'Jul/2027', equipe: ['MP', 'CL'], favorito: false, exemplo: true },
  { id: 'ex4', nome: 'Clínica TEA', status: 'Em andamento', tipo: 'Comercial', local: 'Florianópolis/SC', area: '1.200,00 m²', progresso: 55, entrega: 'Mar/2027', equipe: ['MP', 'AR', '+4'], favorito: true, exemplo: true },
  { id: 'ex5', nome: 'Casa Pimenta Bueno', status: 'Planejamento', tipo: 'Residencial', local: 'Pimenta Bueno/RO', area: '280,00 m²', progresso: 30, entrega: 'Jun/2027', equipe: ['MP', '+2'], favorito: true, exemplo: true },
  { id: 'ex6', nome: 'CM Informática', status: 'Concluído', tipo: 'Comercial', local: 'Joaçaba/SC', area: '1.950,00 m²', progresso: 100, entrega: 'Nov/2026', equipe: ['MP', 'FR', '+5'], favorito: false, exemplo: true },
];

const ABAS: ReadonlyArray<{ id: 'todos' | Status; rotulo: string }> = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'Em andamento', rotulo: 'Em andamento' },
  { id: 'Planejamento', rotulo: 'Planejamento' },
  { id: 'Proposta', rotulo: 'Proposta' },
  { id: 'Concluído', rotulo: 'Concluído' },
  { id: 'Arquivado', rotulo: 'Arquivado' },
];

function formatarData(iso: string): string {
  if (iso.length === 0) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 0) return 'P';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function Donut({ fatias }: { fatias: ReadonlyArray<{ valor: number; cor: string }> }) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);
  const raio = 42;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <svg width="108" height="108" viewBox="0 0 108 108" role="img" aria-label="Distribuição por tipo de projeto">
      <circle cx="54" cy="54" r={raio} fill="none" stroke="#eef1ef" strokeWidth="14" />
      {total > 0
        ? fatias.map((fatia) => {
            const comprimento = (fatia.valor / total) * circunferencia;
            const elemento = (
              <circle
                key={fatia.cor}
                cx="54"
                cy="54"
                r={raio}
                fill="none"
                stroke={fatia.cor}
                strokeWidth="14"
                strokeDasharray={String(comprimento) + ' ' + String(circunferencia - comprimento)}
                strokeDashoffset={-acumulado}
                strokeLinecap="butt"
              />
            );
            acumulado += comprimento;
            return elemento;
          })
        : null}
    </svg>
  );
}

export default function PaginaProjetos() {
  const [reais, setReais] = useState<ResumoProjeto[]>([]);

  const [aba, setAba] = useState<'todos' | Status>('todos');
  const [busca, setBusca] = useState('');
  const [pronto, setPronto] = useState(false);
  const [backend, setBackend] = useState<'postgres' | 'arquivo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState<ResumoProjeto | null>(null);
  const router = useRouter();

  useEffect(() => {
    let vivo = true;
    void listarProjetos()
      .then(({ backend, projetos }) => {
        if (!vivo) return;
        setReais(projetos);
        setBackend(backend);
        const idAtivo = projetoAtivoId();
        setAtivo(idAtivo !== null ? projetos.find((item) => item.id === idAtivo) ?? null : null);
        setPronto(true);
      })
      .catch((falha: unknown) => {
        if (!vivo) return;
        setErro('Servidor indisponível: ' + (falha instanceof Error ? falha.message : String(falha)));
        setPronto(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const cartoes = useMemo<Cartao[]>(() => {
    const meus: Cartao[] = reais.map((projeto) => ({
      id: projeto.id,
      nome: projeto.nome,
      status: 'Em andamento',
      tipo: 'Residencial',
      local: '—',
      area: String(projeto.objetos) + ' objeto(s)',
      progresso: projeto.objetos > 0 ? Math.min(95, 20 + projeto.objetos * 15) : 10,
      entrega: formatarData(projeto.atualizadoEm),
      equipe: [iniciais(projeto.nome)],
      favorito: false,
      exemplo: false,
    }));
    const base = meus.length > 0 ? meus : EXEMPLOS;
    if (busca.trim().length === 0) return base;
    const alvo = busca.trim().toLowerCase();
    return base.filter((cartao) => cartao.nome.toLowerCase().includes(alvo) || cartao.local.toLowerCase().includes(alvo));
  }, [reais, busca]);

  const filtrados = aba === 'todos' ? cartoes : cartoes.filter((cartao) => cartao.status === aba);
  const contagem = (id: 'todos' | Status): number =>
    id === 'todos' ? cartoes.length : cartoes.filter((cartao) => cartao.status === id).length;

  const porTipo = useMemo(() => {
    const mapa = new Map<Cartao['tipo'], number>();
    for (const cartao of cartoes) mapa.set(cartao.tipo, (mapa.get(cartao.tipo) ?? 0) + 1);
    return [...mapa.entries()].map(([tipo, valor]) => ({ tipo, valor, cor: COR_TIPO[tipo] }));
  }, [cartoes]);

  const emAndamento = cartoes.filter((c) => c.status === 'Em andamento').length;
  const planejamento = cartoes.filter((c) => c.status === 'Planejamento').length;
  const usandoExemplo = cartoes.length > 0 && cartoes.every((c) => c.exemplo);

  const novoProjeto = async (): Promise<void> => {
    setErro(null);
    try {
      const documento = novoDocumento('Projeto ' + new Date().toLocaleDateString('pt-BR'));
      const salvo = await criarProjeto(documento);
      definirAtivo(salvo.projeto.id);
      router.push('/modelagem');
    } catch (falha: unknown) {
      setErro('Não foi possível criar o projeto: ' + (falha instanceof Error ? falha.message : String(falha)));
    }
  };

  const abrir = (id: string): void => {
    if (id.startsWith('ex')) return;
    definirAtivo(id);
    router.push('/modelagem');
  };

  return (
    <AppShell busca={busca} aoBuscar={setBusca} projeto={ativo !== null ? ativo.nome : undefined}>
      <div className="arq-workspace">
        <div className="arq-main-col">
          <div className="arq-page-head">
            <div>
              <h1 className="arq-page-title">Projetos</h1>
              <p className="arq-page-sub">Gerencie seus projetos de arquitetura e interiores</p>
            </div>
            <div className="arq-head-actions">
              <button type="button" className="arq-btn arq-btn-primary" onClick={novoProjeto}>
                  <Icone nome="mais" tamanho={16} />
                  Novo projeto
                </button>
              <button type="button" className="arq-btn" disabled title="Disponível em fase posterior">
                <Icone nome="importar" tamanho={16} />
                Importar
              </button>
              <button type="button" className="arq-btn" aria-pressed="true" title="Visualização em grade" style={{ borderColor: 'var(--arq-verde)', color: 'var(--arq-verde-escuro)' }}>
                <Icone nome="grade" tamanho={16} />
              </button>
              <button type="button" className="arq-btn" disabled title="Visualização em lista">
                <Icone nome="lista" tamanho={16} />
              </button>
            </div>
          </div>

          <div className="arq-tabs" role="tablist" aria-label="Filtro de projetos">
            {ABAS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className="arq-tab"
                aria-selected={aba === item.id}
                onClick={() => setAba(item.id)}
              >
                {item.rotulo}
                <span className="contagem">{String(contagem(item.id))}</span>
              </button>
            ))}
            <div className="arq-tabs-spacer" />
            <button type="button" className="arq-btn" disabled title="Filtros avançados" style={{ marginLeft: 'auto' }}>
              <Icone nome="filtro" tamanho={15} />
              Filtros
            </button>
            <button type="button" className="arq-btn" disabled>
              Mais recentes ▾
            </button>
          </div>

          {erro !== null ? (
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#b91c1c' }}>{erro}</p>
          ) : null}

          {usandoExemplo ? (
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#6b7280' }}>
              Dados de exemplo para visualização — crie um projeto para começar.
            </p>
          ) : null}

          <div className="arq-cards">
            {filtrados.map((cartao) => (
              <button key={cartao.id} type="button" className="arq-card" onClick={() => abrir(cartao.id)}>
                <span className="arq-card-capa">
                  <span className="arq-status">
                    <span className="ponto" style={{ background: COR_STATUS[cartao.status] }} />
                    {cartao.status}
                  </span>
                  <span className="arq-favorito" data-fav={cartao.favorito ? 'true' : 'false'}>
                    <Icone nome="estrela" tamanho={14} />
                  </span>
                </span>

                <span className="arq-card-corpo">
                  <span className="arq-card-titulo">{cartao.nome}</span>
                  <span className="arq-card-meta">
                    <span><Icone nome="pessoa" tamanho={13} />{cartao.tipo}</span>
                    <span><Icone nome="local" tamanho={13} />{cartao.local}</span>
                  </span>
                  <span className="arq-card-area">{cartao.area}</span>
                  <span className="arq-progresso">
                    <span className="trilha"><span className="barra" style={{ width: String(cartao.progresso) + '%' }} /></span>
                    <span className="pct">{String(cartao.progresso)}%</span>
                  </span>
                </span>

                <span className="arq-card-rodape">
                  <span className="arq-avatares">
                    {cartao.equipe.map((quem, indice) => (
                      <span key={quem + String(indice)} className={quem.startsWith('+') ? 'mini mais' : 'mini'}>{quem}</span>
                    ))}
                  </span>
                  <span className="arq-entrega">
                    <Icone nome="calendario" tamanho={13} />
                    Entrega<br />{cartao.entrega}
                  </span>
                  <span className="arq-kebab" aria-hidden="true">⋯</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="arq-aside-col">
          <section className="arq-painel">
            <div className="arq-painel-head">
              <Icone nome="visao" tamanho={16} />
              <h2>Visão geral</h2>
            </div>
            <div className="arq-visao">
              <div className="arq-visao-num">
                <div className="linha"><strong>{String(cartoes.length)}</strong><span>Projetos</span></div>
                <div className="linha"><strong>{String(emAndamento)}</strong><span>Em andamento</span></div>
                <div className="linha"><strong>{String(planejamento)}</strong><span>Planejamento</span></div>
              </div>
              <div className="arq-donut">
                <Donut fatias={porTipo} />
              </div>
            </div>
            <div className="arq-legenda">
              {porTipo.map((fatia) => (
                <div key={fatia.tipo} className="item">
                  <span className="ponto" style={{ background: fatia.cor }} />
                  {fatia.tipo}
                  <b>{String(fatia.valor)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="arq-painel">
            <div className="arq-painel-head">
              <Icone nome="acoes" tamanho={16} />
              <h2>Ações rápidas</h2>
            </div>
            <div className="arq-acoes">
              <button type="button" className="arq-btn arq-btn-primary" onClick={novoProjeto} style={{ width: '100%', justifyContent: 'center' }}>
                <Icone nome="mais" tamanho={16} />
                Novo projeto
              </button>
              <button type="button" className="arq-acao" disabled><Icone nome="importar" tamanho={16} />Importar arquivo</button>
              <button type="button" className="arq-acao" disabled><Icone nome="pasta" tamanho={16} />Nova pasta</button>
              <button type="button" className="arq-acao" disabled><Icone nome="equipe" tamanho={16} />Convidar equipe</button>
              <button type="button" className="arq-acao" disabled><Icone nome="etiqueta" tamanho={16} />Tag e categorias</button>
              <button type="button" className="arq-acao" disabled><Icone nome="lixeira" tamanho={16} />Lixeira</button>
            </div>
          </section>

          <section className="arq-painel">
            <div className="arq-painel-head">
              <Icone nome="historico" tamanho={16} />
              <h2>Projetos recentes</h2>
            </div>
            <div className="arq-recentes">
              {cartoes.slice(0, 3).map((cartao) => (
                <div key={cartao.id} className="arq-recente">
                  <span className="thumb" aria-hidden="true" />
                  <span className="txt">
                    <strong>{cartao.nome}</strong>
                    <span>Atualizado {cartao.exemplo ? 'há 2 horas' : cartao.entrega}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}