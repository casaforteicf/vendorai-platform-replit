'use client';

/**
 * Ambiente "Orçamento" — consome o BIM Core de verdade: quantitativos agrupados,
 * mapa Praça.ai e o memorial descritivo gerado a partir dos mesmos elementos.
 *
 * Nada aqui é mock: se a lista estiver vazia, é porque o projeto não tem elementos BIM.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ElementoBim } from '../../arqdor/editor/bim/schema';
import type { Memorial } from '../../arqdor/editor/documentacao/memorial';
import { gerarMemorial } from '../../arqdor/editor/documentacao/memorial';
import type { ResumoQuantitativo, Unidade } from '../../arqdor/editor/orcamento/quantitativos';
import { paraPraca, quantitativos } from '../../arqdor/editor/orcamento/quantitativos';
import { obterProjeto, projetoAtivoId } from '../../arqdor/editor/persistencia/localStore';
import { AppShell } from '../../arqdor/editor/shell/AppShell';

interface Dados {
  projeto: string;
  elementos: ElementoBim[];
  resumo: ResumoQuantitativo;
  memorial: Memorial;
}

const ROTULO_UNIDADE: Record<Unidade, string> = { m2: 'm²', m3: 'm³', m: 'm', un: 'un' };

function formatar(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaginaOrcamento() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const id = projetoAtivoId();
    const documento = id !== null ? obterProjeto(id) : null;
    if (documento !== null) {
      const resumo = quantitativos(documento.bim);
      const memorial = gerarMemorial({
        projeto: { nome: documento.projeto.nome },
        elementos: documento.bim,
        quantitativos: resumo,
        geradoEm: new Date().toISOString(),
      });
      setDados({ projeto: documento.projeto.nome, elementos: documento.bim, resumo, memorial });
    }
    setCarregado(true);
  }, []);

  if (!carregado) {
    return (
      <AppShell>
        <div className="arq-workspace">
          <p className="arq-muted">Carregando orçamento…</p>
        </div>
      </AppShell>
    );
  }

  if (dados === null || dados.elementos.length === 0) {
    return (
      <AppShell projeto={dados?.projeto}>
        <div className="arq-workspace">
          <div className="arq-main-col">
            <div className="arq-page-head">
              <div>
                <h1 className="arq-page-title">Orçamento</h1>
                <p className="arq-page-sub">Quantitativos derivados do modelo BIM</p>
              </div>
            </div>
            <div className="arq-vazio">
              <p>
                Nenhum elemento BIM neste projeto. Orçamento, memorial e planta 2D são derivados dos
                elementos — abra a <strong>Modelagem</strong>, crie sólidos e use <strong>Materializar</strong>.
              </p>
              <Link className="arq-btn arq-btn-primary" href="/modelagem">
                Ir para Modelagem
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const praca = paraPraca(dados.resumo.grupos);
  const totalM2 = dados.resumo.totalPorUnidade.find((t) => t.unidade === 'm2');
  const totalM3 = dados.resumo.totalPorUnidade.find((t) => t.unidade === 'm3');
  const totalUn = dados.resumo.totalPorUnidade.find((t) => t.unidade === 'un');

  return (
    <AppShell projeto={dados.projeto}>
      <div className="arq-workspace">
        <div className="arq-main-col">
          <div className="arq-page-head">
            <div>
              <h1 className="arq-page-title">Orçamento</h1>
              <p className="arq-page-sub">
                {String(dados.elementos.length)} elemento(s) BIM · {String(dados.resumo.itens.length)} linha(s) de medição
              </p>
            </div>
            <div className="arq-head-actions">
              <Link className="arq-btn" href="/modelagem">
                Abrir modelagem
              </Link>
            </div>
          </div>

          <div className="arq-resumo">
            <div className="arq-resumo-card">
              <span className="rotulo">Área (m²)</span>
              <strong>{formatar(totalM2?.quantidadeComPerda ?? 0)}</strong>
            </div>
            <div className="arq-resumo-card">
              <span className="rotulo">Volume (m³)</span>
              <strong>{formatar(totalM3?.quantidadeComPerda ?? 0)}</strong>
            </div>
            <div className="arq-resumo-card">
              <span className="rotulo">Itens (un)</span>
              <strong>{formatar(totalUn?.quantidadeComPerda ?? 0)}</strong>
            </div>
          </div>

          <section className="arq-painel" style={{ marginBottom: 16 }}>
            <div className="arq-painel-head">
              <h2>Quantitativos por categoria</h2>
            </div>
            <table className="arq-tabela">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Material</th>
                  <th>Un.</th>
                  <th className="num">Bruto</th>
                  <th className="num">Perda</th>
                  <th className="num">Final</th>
                </tr>
              </thead>
              <tbody>
                {dados.resumo.grupos.map((grupo) => (
                  <tr key={grupo.chave}>
                    <td>{grupo.categoria}</td>
                    <td>{grupo.materialId ?? '—'}</td>
                    <td>{ROTULO_UNIDADE[grupo.unidade]}</td>
                    <td className="num">{formatar(grupo.quantidadeBruta)}</td>
                    <td className="num">
                      {grupo.itens.length > 0 ? formatar(grupo.itens[0].coeficientePerda) + '×' : '—'}
                    </td>
                    <td className="num">{formatar(grupo.quantidadeComPerda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="arq-painel" style={{ marginBottom: 16 }}>
            <div className="arq-painel-head">
              <h2>Mapa Praça.ai</h2>
            </div>
            <table className="arq-tabela">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Un.</th>
                  <th className="num">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {praca.map((item) => (
                  <tr key={item.codigoPraca + item.unidade}>
                    <td>{item.codigoPraca}</td>
                    <td>{ROTULO_UNIDADE[item.unidade]}</td>
                    <td className="num">{formatar(item.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="arq-painel">
            <div className="arq-painel-head">
              <h2>Memorial descritivo</h2>
            </div>
            {dados.memorial.secoes.map((secao) => (
              <div key={secao.id} style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 12 }}>{secao.titulo}</strong>
                {secao.paragrafos.map((paragrafo, indice) => (
                  <p key={secao.id + String(indice)} className="arq-muted" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
                    {paragrafo}
                  </p>
                ))}
              </div>
            ))}
            {dados.memorial.avisos.length > 0 ? (
              <p className="arq-muted" style={{ marginTop: 8 }}>
                Avisos: {dados.memorial.avisos.join(' · ')}
              </p>
            ) : null}
          </section>
        </div>

        <div className="arq-aside-col">
          <section className="arq-painel">
            <div className="arq-painel-head">
              <h2>Como este número nasceu</h2>
            </div>
            <p className="arq-muted" style={{ lineHeight: 1.6, margin: 0 }}>
              Os sólidos do modelador foram materializados em elementos BIM (parede, laje, telhado ou
              móvel). O quantitativo mede cada elemento, desconta vãos e aplica o coeficiente de perda
              da categoria. O memorial usa os mesmos elementos — nenhuma linha é digitada à mão.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
