'use client';

/**
 * Materiais (M1) — catálogo visual (protótipo; o DeepSeek refaz o layout).
 *
 * Consome o motor: `catalogoPadrao`, `adicionarMaterial`, `atualizarPrecoUnitario`.
 * O catálogo NÃO faz parte do DocumentoArqdor — é estado de catálogo, não de projeto.
 */

import { useMemo, useRef, useState } from 'react';
import { adicionarMaterial, atualizarPrecoUnitario, catalogoPadrao } from './catalogo';
import type { Catalogo } from './catalogo';
import { exportarParaCotacao, importarCotacao, itensDeCotacao } from './cotacao';
import { quantitativos } from '../orcamento/quantitativos';
import { useBIMStore } from '../stores/useBIMStore';
import {
  COMPOSICOES_PADRAO,
  custoComposicao,
  exportarComposicoesCsv,
  importarComposicoesCsv,
} from './composicoes';
import type { Composicao, InsumoComposicao } from './composicoes';
import type { Categoria, Unidade } from '../orcamento/quantitativos';
import type { FontePreco, Material } from './schema';

export interface PainelMateriaisProps {
  aberto: boolean;
  aoFechar: () => void;
  /** Renderiza dentro do inspetor (sem overlay fixo). */
  inline?: boolean;
}

const CATEGORIAS: readonly Categoria[] = ['alvenaria', 'estrutura', 'acabamento', 'esquadria', 'mobiliario', 'cobertura', 'mep'];
const UNIDADES: readonly Unidade[] = ['m2', 'm3', 'm', 'un'];

const ROTULO_CATEGORIA: Record<Categoria, string> = {
  alvenaria: 'Alvenaria',
  estrutura: 'Estrutura',
  acabamento: 'Acabamento',
  esquadria: 'Esquadria',
  mobiliario: 'Mobiliário',
  cobertura: 'Cobertura',
  mep: 'MEP',
};

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function corFonte(fonte: FontePreco): string {
  if (fonte === 'SINAPI') return '#38bdf8';
  if (fonte === 'COTACAO') return '#f59e0b';
  return '#00c896';
}

export function PainelMateriais({ aberto, aoFechar, inline }: PainelMateriaisProps) {
  const [catalogo, setCatalogo] = useState<Catalogo>(() => catalogoPadrao());
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<'todas' | Categoria>('todas');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [preco, setPreco] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [abaMat, setAbaMat] = useState<'catalogo' | 'composicoes'>('catalogo');
  const [composicoes, setComposicoes] = useState<Composicao[]>(() => COMPOSICOES_PADRAO.map((item) => ({ ...item, insumos: [...item.insumos] })));
  const [rascunho, setRascunho] = useState<{ nome: string; unidade: Unidade; insumos: InsumoComposicao[] }>({
    nome: '',
    unidade: 'm2',
    insumos: [],
  });
  const [insumoId, setInsumoId] = useState('');
  const [insumoQtd, setInsumoQtd] = useState('');
  const composicoesRef = useRef<HTMLInputElement | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const [novo, setNovo] = useState<{ nome: string; categoria: Categoria; unidade: Unidade; preco: string }>({
    nome: '',
    categoria: 'acabamento',
    unidade: 'm2',
    preco: '',
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return catalogo.filter((material) => {
      if (categoria !== 'todas' && material.categoria !== categoria) return false;
      if (termo.length === 0) return true;
      return material.nome.toLowerCase().includes(termo) || material.id.toLowerCase().includes(termo);
    });
  }, [catalogo, busca, categoria]);

  if (!aberto) return null;

  const selecionado: Material | null = catalogo.find((material) => material.id === selecionadoId) ?? null;

  const salvarPreco = (): void => {
    if (selecionado === null) return;
    const valor = Number(preco.replace(',', '.'));
    const resultado = atualizarPrecoUnitario(catalogo, selecionado.id, valor, 'PROPRIO', new Date().toISOString());
    if (!resultado.ok) {
      setAviso(
        resultado.erro === 'PRECO_INVALIDO' ? 'Preço inválido (use número ≥ 0).' : 'Material não encontrado.',
      );
      return;
    }
    setCatalogo(resultado.catalogo);
    setAviso('Preço atualizado com fonte própria.');
    setPreco('');
  };

  const criar = (): void => {
    if (novo.nome.trim().length === 0) {
      setAviso('Informe o nome do material.');
      return;
    }
    const material: Material = {
      id: 'MAT-' + Date.now().toString(36).toUpperCase(),
      nome: novo.nome.trim(),
      categoria: novo.categoria,
      unidade: novo.unidade,
      precoUnitario: Number(novo.preco.replace(',', '.')) || 0,
      fontePreco: 'PROPRIO',
      atualizadoEm: new Date().toISOString(),
    };
    const resultado = adicionarMaterial(catalogo, material);
    if (!resultado.ok) {
      setAviso(resultado.erro === 'PRECO_INVALIDO' ? 'Preço inválido.' : 'Material duplicado.');
      return;
    }
    setCatalogo(resultado.catalogo);
    setNovo({ nome: '', categoria: 'acabamento', unidade: 'm2', preco: '' });
    setAviso('Material criado.');
  };

  const enviarCotacao = (): void => {
    const elementos = useBIMStore.getState().bim.elementos;
    const resumo = quantitativos(elementos);
    const itens = itensDeCotacao(resumo.grupos, catalogo);
    if (itens.length === 0) {
      setAviso('Nada a cotar: o modelo ainda não tem elemento BIM com material.');
      return;
    }
    const { csv } = exportarParaCotacao(itens);
    // BOM para o Excel pt-BR abrir em UTF-8 sem acentos quebrados.
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cotacao-arqdor.csv';
    link.click();
    URL.revokeObjectURL(url);
    setAviso(String(itens.length) + ' item(ns) exportados para cotação (' + String(resumo.grupos.length) + ' grupo(s) no quantitativo).');
  };

  const importarArquivo = async (arquivo: File): Promise<void> => {
    const texto = await arquivo.text();
    const resultado = importarCotacao(texto, catalogo);
    if (resultado.erro === 'CABECALHO_INVALIDO') {
      setAviso('CSV sem as colunas obrigatórias (material_id e preço).');
      return;
    }
    setCatalogo(resultado.catalogo);
    const motivos = resultado.ignorados
      .slice(0, 4)
      .map((item) => item.materialId + ' (' + item.motivo + ')')
      .join(', ');
    setAviso(
      String(resultado.atualizados) + ' preço(s) atualizado(s) pela cotação.' +
        (resultado.ignorados.length > 0
          ? ' ' + String(resultado.ignorados.length) + ' ignorado(s): ' + motivos
          : ''),
    );
  };

  const adicionarInsumo = (): void => {
    const qtd = Number(insumoQtd.replace(',', '.'));
    if (insumoId.length === 0 || !(qtd > 0)) {
      setAviso('Escolha o insumo e uma quantidade maior que zero.');
      return;
    }
    setRascunho((atual) => ({ ...atual, insumos: [...atual.insumos, { materialId: insumoId, quantidade: qtd }] }));
    setInsumoQtd('');
    setAviso(null);
  };

  const criarComposicao = (): void => {
    if (rascunho.nome.trim().length === 0) {
      setAviso('Informe o nome da composição.');
      return;
    }
    if (rascunho.insumos.length === 0) {
      setAviso('Adicione ao menos um insumo.');
      return;
    }
    const nova: Composicao = {
      id: 'COMP-' + Date.now().toString(36).toUpperCase(),
      nome: rascunho.nome.trim(),
      unidade: rascunho.unidade,
      insumos: rascunho.insumos,
    };
    setComposicoes((atual) => [...atual, nova]);
    setRascunho({ nome: '', unidade: 'm2', insumos: [] });
    setAviso('Composição criada: ' + nova.nome + '.');
  };

  const importarComposicoes = async (arquivo: File): Promise<void> => {
    const texto = await arquivo.text();
    const resultado = importarComposicoesCsv(texto);
    if (resultado.erro === 'CABECALHO_INVALIDO') {
      setAviso('CSV sem o cabeçalho esperado: composicao_id;composicao_nome;unidade;insumo_id;quantidade.');
      return;
    }
    setComposicoes((atual) => [...atual, ...resultado.composicoes]);
    setAviso(
      String(resultado.composicoes.length) + ' composição(ões) importada(s).' +
        (resultado.ignorados.length > 0 ? ' ' + String(resultado.ignorados.length) + ' linha(s) ignorada(s).' : ''),
    );
  };

  const exportarComposicoes = (): void => {
    const csv = exportarComposicoesCsv(composicoes);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'composicoes-arqdor.csv';
    link.click();
    URL.revokeObjectURL(url);
    setAviso(String(composicoes.length) + ' composição(ões) exportada(s).');
  };

  const campo = {
    padding: '7px 9px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.12)',
    background: 'rgba(0,0,0,.32)',
    color: '#fff',
    font: 'inherit',
    fontSize: 12,
  } as const;

  return (
    <div
      style={{
        position: inline === true ? 'static' : 'fixed',
        right: inline === true ? undefined : 16,
        top: inline === true ? undefined : 72,
        width: inline === true ? '100%' : 420,
        maxHeight: inline === true ? 'none' : '82vh',
        overflowY: inline === true ? 'visible' : 'auto',
        background: inline === true ? 'transparent' : '#0f1f1a',
        border: inline === true ? 'none' : '1px solid rgba(255,255,255,.12)',
        borderRadius: inline === true ? 0 : 12,
        boxShadow: inline === true ? 'none' : '0 18px 40px rgba(0,0,0,.45)',
        zIndex: inline === true ? undefined : 70,
        fontFamily: 'Montserrat, Segoe UI, sans-serif',
        color: '#e6eeea',
        padding: inline === true ? 0 : 12,
      }}
      role="dialog"
      aria-label="Catálogo de materiais"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#00c896' }}>MATERIAIS</span>
        <span style={{ fontSize: 10.5, color: '#8fa39c' }}>{filtrados.length} de {catalogo.length}</span>
        <button
          type="button"
          onClick={aoFechar}
          style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: '#9fb3ad', cursor: 'pointer', fontSize: 16 }}
          aria-label="Fechar materiais"
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }} role="tablist" aria-label="Seção de materiais">
        {(['catalogo', 'composicoes'] as const).map((aba) => (
          <button
            key={aba}
            type="button"
            role="tab"
            aria-selected={abaMat === aba}
            onClick={() => setAbaMat(aba)}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid ' + (abaMat === aba ? 'rgba(0,200,150,.5)' : 'transparent'),
              background: abaMat === aba ? 'rgba(0,200,150,.14)' : 'rgba(0,0,0,.22)',
              color: abaMat === aba ? '#e6eeea' : '#8fa39c',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {aba === 'catalogo' ? 'Catálogo' : 'Composições'}
          </button>
        ))}
      </div>

      {abaMat === 'catalogo' ? (
      <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar material" aria-label="Buscar material" style={{ ...campo, flex: 1 }} />
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as 'todas' | Categoria)} aria-label="Filtrar por categoria" style={campo}>
          <option value="todas">Todas</option>
          {CATEGORIAS.map((item) => (
            <option key={item} value={item}>
              {ROTULO_CATEGORIA[item]}
            </option>
          ))}
        </select>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtrados.map((material) => {
          const ativo = material.id === selecionadoId;
          return (
            <li key={material.id}>
              <button
                type="button"
                onClick={() => {
                  setSelecionadoId(material.id);
                  setAviso(null);
                }}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 4,
                  padding: '7px 9px',
                  borderRadius: 8,
                  border: '1px solid ' + (ativo ? 'rgba(0,200,150,.55)' : 'transparent'),
                  background: ativo ? 'rgba(0,200,150,.12)' : 'rgba(0,0,0,.22)',
                  color: '#e6eeea',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>{material.nome}</span>
                <span style={{ fontSize: 11.5, color: '#cfe0da' }}>{moeda(material.precoUnitario)}</span>
                <span style={{ fontSize: 10, color: '#8fa39c' }}>
                  {ROTULO_CATEGORIA[material.categoria]} · {material.unidade}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: corFonte(material.fontePreco), justifySelf: 'end' }}>
                  {material.fontePreco}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selecionado !== null ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontSize: 10.5, color: '#8fa39c', marginBottom: 6 }}>
            Editar preço de <strong style={{ color: '#e6eeea' }}>{selecionado.nome}</strong> ({selecionado.unidade})
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder={String(selecionado.precoUnitario)}
              inputMode="decimal"
              aria-label="Novo preço unitário"
              style={{ ...campo, flex: 1, textAlign: 'right' }}
            />
            <button type="button" onClick={salvarPreco} style={{ padding: '7px 12px', borderRadius: 8, border: 0, background: '#00c896', color: '#06231b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Salvar preço
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 10.5, color: '#8fa39c', marginBottom: 6 }}>Cotação</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={enviarCotacao}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(0,200,150,.35)', background: 'rgba(0,200,150,.12)', color: '#00c896', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}
          >
            Enviar para Cotação
          </button>
          <button
            type="button"
            onClick={() => arquivoRef.current?.click()}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#e6eeea', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}
          >
            Importar Cotação
          </button>
          <input
            ref={arquivoRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo !== undefined) void importarArquivo(arquivo);
              evento.target.value = '';
            }}
          />
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#6b7c76', lineHeight: 1.45 }}>
          Exporta o quantitativo do modelo (BIM) em CSV com separador &quot;;&quot;. A importação aceita o mesmo
          formato e devolve quais linhas foram recusadas e por quê.
        </p>
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 10.5, color: '#8fa39c', marginBottom: 6 }}>Novo material</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome" aria-label="Nome do novo material" style={{ ...campo, gridColumn: '1 / -1' }} />
          <select value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value as Categoria })} aria-label="Categoria do novo material" style={campo}>
            {CATEGORIAS.map((item) => (
              <option key={item} value={item}>
                {ROTULO_CATEGORIA[item]}
              </option>
            ))}
          </select>
          <select value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value as Unidade })} aria-label="Unidade do novo material" style={campo}>
            {UNIDADES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} placeholder="Preço unitário" inputMode="decimal" aria-label="Preço do novo material" style={{ ...campo, textAlign: 'right' }} />
          <button type="button" onClick={criar} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(0,200,150,.35)', background: 'rgba(0,200,150,.12)', color: '#00c896', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Criar material
          </button>
        </div>
      </div>

      </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => composicoesRef.current?.click()}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(0,200,150,.35)', background: 'rgba(0,200,150,.12)', color: '#00c896', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}
            >
              Importar CSV
            </button>
            <button
              type="button"
              onClick={exportarComposicoes}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#e6eeea', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}
            >
              Exportar CSV
            </button>
            <input
              ref={composicoesRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(evento) => {
                const arquivo = evento.target.files?.[0];
                if (arquivo !== undefined) void importarComposicoes(arquivo);
                evento.target.value = '';
              }}
            />
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {composicoes.map((composicao) => {
              const custo = custoComposicao(composicao, catalogo);
              return (
                <li
                  key={composicao.id}
                  style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(0,0,0,.22)', border: '1px solid rgba(255,255,255,.06)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{composicao.nome}</span>
                    <span style={{ fontSize: 11.5, color: '#cfe0da' }}>
                      {moeda(custo.custo)}/{composicao.unidade}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#8fa39c', marginTop: 2 }}>
                    {composicao.insumos.length} insumo(s)
                    {custo.faltando.length > 0 ? ' · sem preço: ' + custo.faltando.join(', ') : ' · custo completo'}
                  </div>
                </li>
              );
            })}
          </ul>

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: 10.5, color: '#8fa39c', marginBottom: 6 }}>Nova composição</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
              <input
                value={rascunho.nome}
                onChange={(evento) => setRascunho({ ...rascunho, nome: evento.target.value })}
                placeholder="Nome (ex.: Alvenaria de bloco)"
                aria-label="Nome da composição"
                style={campo}
              />
              <select
                value={rascunho.unidade}
                onChange={(evento) => setRascunho({ ...rascunho, unidade: evento.target.value as Unidade })}
                aria-label="Unidade da composição"
                style={campo}
              >
                {UNIDADES.map((unidade) => (
                  <option key={unidade} value={unidade}>
                    {unidade}
                  </option>
                ))}
              </select>
              <select
                value={insumoId}
                onChange={(evento) => setInsumoId(evento.target.value)}
                aria-label="Insumo"
                style={campo}
              >
                <option value="">Insumo…</option>
                {catalogo.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nome}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={insumoQtd}
                  onChange={(evento) => setInsumoQtd(evento.target.value)}
                  placeholder="Qtd"
                  inputMode="decimal"
                  aria-label="Quantidade do insumo"
                  style={{ ...campo, width: 68, textAlign: 'right' }}
                />
                <button
                  type="button"
                  onClick={adicionarInsumo}
                  style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(0,0,0,.25)', color: '#e6eeea', fontSize: 11, cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>

            {rascunho.insumos.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {rascunho.insumos.map((insumo, indice) => (
                  <li key={String(indice)} style={{ fontSize: 10.5, color: '#8fa39c' }}>
                    {insumo.quantidade} × {insumo.materialId}
                  </li>
                ))}
              </ul>
            ) : null}

            <button
              type="button"
              onClick={criarComposicao}
              style={{ marginTop: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: 0, background: '#00c896', color: '#06231b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              Criar composição
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 10, color: '#6b7c76', lineHeight: 1.45 }}>
              CSV: composicao_id;composicao_nome;unidade;insumo_id;quantidade (linhas do mesmo id viram insumos).
            </p>
          </div>
        </>
      )}

      {aviso !== null ? <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#8fa39c' }}>{aviso}</p> : null}
    </div>
  );
}
