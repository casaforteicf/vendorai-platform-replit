'use client';

import { useState } from 'react';
import type { Solido } from '../modelador/schema';
import { Icone } from '../design/icones';

export interface FaceEscolhida {
  solidoId: string;
  faceId: string;
}

export interface PreviaBim {
  /** 'Parede' | 'Laje' | 'Telhado' | 'Mobiliário' | 'Não conversível' */
  titulo: string;
  detalhe: string;
  conversivel: boolean;
}

export interface PropsPainelPropriedades {
  solido: Solido | null;
  face: FaceEscolhida | null;
  altura: string;
  aoMudarAltura: (valor: string) => void;
  aoAplicarPushPull: () => void;
  aoCancelarFace: () => void;
  aoRenomear: (nome: string) => void;
  /** O que o sólido selecionado viraria no BIM (regra D12). */
  previa: PreviaBim | null;
  /** Já existe elemento BIM para este sólido? */
  materializado: boolean;
  aoMaterializar: () => void;
  /** Não-nulo quando o sólido selecionado já é uma PAREDE no BIM. */
  paredeId: string | null;
  vaosExistentes: number;
  aoTransformar: (transformacao: { posicao: [number, number, number]; escala: [number, number, number] }) => void;
  aoExcluir: () => void;
  aoAbrirVao: (tipo: 'porta' | 'janela', medidas: { offset: number; largura: number; altura: number; peitoril: number }) => void;
}

function numero(valor: number): string {
  return Math.abs(valor) < 1e-9 ? '0' : valor.toFixed(2);
}


function SecaoVaos(props: {
  paredeId: string;
  vaosExistentes: number;
  aoAbrirVao: (tipo: 'porta' | 'janela', medidas: { offset: number; largura: number; altura: number; peitoril: number }) => void;
}) {
  const [offset, setOffset] = useState('0.30');
  const [largura, setLargura] = useState('0.80');
  const [alturaVao, setAlturaVao] = useState('2.10');
  const [peitoril, setPeitoril] = useState('1.00');

  const numero = (valor: string): number => Number(valor.replace(',', '.'));
  const medidas = (comPeitoril: boolean) => ({
    offset: numero(offset),
    largura: numero(largura),
    altura: numero(alturaVao),
    peitoril: comPeitoril ? numero(peitoril) : 0,
  });

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 12, paddingTop: 10 }}>
      <div className="arq-panel-title" style={{ marginBottom: 6 }}>Vãos</div>
      <p className="arq-muted" style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
        Parede {props.paredeId} · {String(props.vaosExistentes)} vão(s). O vão é contábil: desconta
        da área de alvenaria e aparece na planta.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <label className="arq-muted">Offset (m)
          <input className="arq-field" style={{ width: '100%', marginTop: 3 }} value={offset} onChange={(e) => setOffset(e.target.value)} inputMode="decimal" />
        </label>
        <label className="arq-muted">Largura (m)
          <input className="arq-field" style={{ width: '100%', marginTop: 3 }} value={largura} onChange={(e) => setLargura(e.target.value)} inputMode="decimal" />
        </label>
        <label className="arq-muted">Altura (m)
          <input className="arq-field" style={{ width: '100%', marginTop: 3 }} value={alturaVao} onChange={(e) => setAlturaVao(e.target.value)} inputMode="decimal" />
        </label>
        <label className="arq-muted">Peitoril (m)
          <input className="arq-field" style={{ width: '100%', marginTop: 3 }} value={peitoril} onChange={(e) => setPeitoril(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" className="arq-btn arq-btn-primary" style={{ flex: 1, justifyContent: 'center', height: 34 }} onClick={() => props.aoAbrirVao('porta', medidas(false))}>
          Porta
        </button>
        <button type="button" className="arq-btn" style={{ flex: 1, justifyContent: 'center', height: 34 }} onClick={() => props.aoAbrirVao('janela', medidas(true))}>
          Janela
        </button>
      </div>
    </div>
  );
}

function CamposTransformacao(props: {
  solido: Solido;
  aoTransformar: (transformacao: { posicao: [number, number, number]; escala: [number, number, number] }) => void;
}) {
  const [px, setPx] = useState(String(props.solido.transformacao.posicao[0]));
  const [py, setPy] = useState(String(props.solido.transformacao.posicao[1]));
  const [pz, setPz] = useState(String(props.solido.transformacao.posicao[2]));
  const [ex, setEx] = useState(String(props.solido.transformacao.escala[0]));
  const [ey, setEy] = useState(String(props.solido.transformacao.escala[1]));
  const [ez, setEz] = useState(String(props.solido.transformacao.escala[2]));

  const numero = (valor: string): number => Number(valor.replace(',', '.'));

  const confirmar = (): void => {
    const valores = [px, py, pz, ex, ey, ez].map(numero);
    if (!valores.every((valor) => Number.isFinite(valor))) return;
    const [a, b, c, d, e, f] = valores;
    props.aoTransformar({ posicao: [a, b, c], escala: [d === 0 ? 1 : d, e === 0 ? 1 : e, f === 0 ? 1 : f] });
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLInputElement>): void => {
    if (evento.key === 'Enter') confirmar();
  };

  return (
    <>
      <div className="arq-transf-titulo">Posição (m)</div>
      <div className="arq-transf">
        <input className="arq-field" value={px} onChange={(e) => setPx(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} aria-label="Posição X" />
        <input className="arq-field" value={py} onChange={(e) => setPy(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} aria-label="Posição Y" />
        <input className="arq-field" value={pz} onChange={(e) => setPz(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} aria-label="Posição Z" />
      </div>
      <div className="arq-transf-titulo">Escala</div>
      <div className="arq-transf">
        <input className="arq-field" value={ex} onChange={(e) => setEx(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} aria-label="Escala X" />
        <input className="arq-field" value={ey} onChange={(e) => setEy(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} aria-label="Escala Y" />
        <input className="arq-field" value={ez} onChange={(e) => setEz(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} aria-label="Escala Z" />
      </div>
    </>
  );
}
export function PainelPropriedades(props: PropsPainelPropriedades) {
  const { solido, face, previa } = props;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icone nome="modelagem" tamanho={16} />
        <span className="arq-panel-title">Propriedades</span>
      </div>

      {solido === null ? (
        <p className="arq-muted" style={{ margin: '0 0 14px' }}>
          Nenhum sólido selecionado. Clique em um sólido na cena.
        </p>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <label className="arq-muted" htmlFor="nome-solido">Nome</label>
          <input
            id="nome-solido"
            className="arq-field"
            style={{ width: '100%', marginTop: 4 }}
            value={solido.nome}
            onChange={(evento) => props.aoRenomear(evento.target.value)}
          />
          <div className="arq-muted" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <span>{String(solido.vertices.length)} vért.</span>
            <span>{String(solido.arestas.length)} arestas</span>
            <span>{String(solido.faces.length)} faces</span>
          </div>
          <CamposTransformacao
            key={solido.id + ':' + solido.transformacao.posicao.join(',') + ':' + solido.transformacao.escala.join(',')}
            solido={solido}
            aoTransformar={props.aoTransformar}
          />
          <button
            type="button"
            className="arq-btn arq-btn-perigo"
            style={{ width: '100%', justifyContent: 'center', height: 34, marginTop: 10 }}
            onClick={props.aoExcluir}
          >
            <Icone nome="lixeira" tamanho={15} />
            Excluir sólido
          </button>
        </div>
      )}

      {/* Push/Pull — só com face escolhida */}
      {face !== null ? (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
          <div className="arq-panel-title" style={{ marginBottom: 6 }}>Push/Pull</div>
          <p className="arq-muted" style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
            Face selecionada. Informe a altura (m). Positivo puxa, negativo empurra.
          </p>
          <input
            className="arq-field"
            style={{ width: '100%' }}
            value={props.altura}
            onChange={(evento) => props.aoMudarAltura(evento.target.value)}
            aria-label="Altura do push/pull em metros"
            inputMode="decimal"
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" className="arq-btn arq-btn-primary" style={{ flex: 1, justifyContent: 'center', height: 34 }} onClick={props.aoAplicarPushPull}>
              Aplicar
            </button>
            <button type="button" className="arq-btn" style={{ height: 34 }} onClick={props.aoCancelarFace}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* BIM — só aparece com sólido selecionado, e depois que o volume existe */}
      {solido !== null ? (
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 12, paddingTop: 10 }}>
          <div className="arq-panel-title" style={{ marginBottom: 6 }}>BIM</div>

          {props.materializado ? (
            <>
              <span className="arq-badge-bim">
                <Icone nome="modelagem" tamanho={13} />
                BIM · {previa === null ? 'elemento' : previa.titulo}
              </span>
              <p className="arq-muted" style={{ margin: '8px 0', lineHeight: 1.5 }}>
                Este sólido já é um elemento do modelo. Se a geometria mudar, converta de novo para
                atualizar o orçamento.
              </p>
              <button type="button" className="arq-btn" style={{ width: '100%', justifyContent: 'center', height: 34 }} onClick={props.aoMaterializar}>
                Atualizar no BIM
              </button>
            </>
          ) : (
            <>
              <p className="arq-muted" style={{ margin: '0 0 8px', lineHeight: 1.55 }}>
                {previa === null
                  ? 'Selecione um sólido com volume.'
                  : <><span>Vai virar </span><strong>{previa.titulo}</strong>{previa.detalhe.length > 0 ? <><br />{previa.detalhe}</> : null}</>}
              </p>
              <button
                type="button"
                className="arq-btn arq-btn-primary"
                style={{ width: '100%', justifyContent: 'center', height: 34 }}
                disabled={previa === null || !previa.conversivel}
                onClick={props.aoMaterializar}
              >
                Converter em {previa === null ? 'BIM' : previa.titulo}
              </button>
            </>
          )}
        </div>
      ) : null}

      {props.paredeId !== null ? (
        <SecaoVaos paredeId={props.paredeId} vaosExistentes={props.vaosExistentes} aoAbrirVao={props.aoAbrirVao} />
      ) : null}
    </div>
  );
}
