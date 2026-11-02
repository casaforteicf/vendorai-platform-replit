'use client';

import type { Solido } from '../modelador/schema';
import { Icone } from '../design/icones';

export interface FaceEscolhida {
  solidoId: string;
  faceId: string;
}

export interface PropsPainelPropriedades {
  solido: Solido | null;
  face: FaceEscolhida | null;
  altura: string;
  aoMudarAltura: (valor: string) => void;
  aoAplicarPushPull: () => void;
  aoCancelarFace: () => void;
  aoRenomear: (nome: string) => void;
}

function numero(valor: number): string {
  return Math.abs(valor) < 1e-9 ? '0' : valor.toFixed(2);
}

export function PainelPropriedades(props: PropsPainelPropriedades) {
  const { solido, face } = props;

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
          <div className="arq-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
            pos ({numero(solido.transformacao.posicao[0])}, {numero(solido.transformacao.posicao[1])}, {numero(solido.transformacao.posicao[2])})
            <br />
            rot ({numero(solido.transformacao.rotacao[0])}, {numero(solido.transformacao.rotacao[1])}, {numero(solido.transformacao.rotacao[2])})
            <br />
            esc ({numero(solido.transformacao.escala[0])}, {numero(solido.transformacao.escala[1])}, {numero(solido.transformacao.escala[2])})
          </div>
        </div>
      )}

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
    </div>
  );
}