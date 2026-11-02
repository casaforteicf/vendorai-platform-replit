'use client';

import type { ReactElement } from 'react';
import type { FerramentaModelador } from '../modelador/desenho';

export interface PropsToolbar {
  ferramenta: FerramentaModelador;
  aoEscolher: (ferramenta: FerramentaModelador) => void;
  aoNovoSolido: () => void;
  aoDesfazer: () => void;
  aoRefazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  temSolido: boolean;
}

const FERRAMENTAS: ReadonlyArray<{ id: FerramentaModelador; rotulo: string }> = [
  { id: 'linha', rotulo: 'Linha' },
  { id: 'retangulo', rotulo: 'Retângulo' },
  { id: 'circulo', rotulo: 'Círculo' },
  { id: 'arco', rotulo: 'Arco' },
];

function estiloBotao(ativo: boolean, desabilitado: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    marginBottom: 6,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid ' + (ativo ? '#2e7d32' : '#d5ddd5'),
    background: ativo ? '#2e7d32' : '#ffffff',
    color: ativo ? '#ffffff' : '#1f2933',
    fontWeight: ativo ? 600 : 500,
    cursor: desabilitado ? 'not-allowed' : 'pointer',
    opacity: desabilitado ? 0.5 : 1,
    fontSize: 13,
  };
}

export function ToolbarModelador(props: PropsToolbar) {
  const botao = (chave: string, rotulo: string, aoClicar: () => void, ativo: boolean, desabilitado: boolean): ReactElement => (
    <button key={chave} type="button" onClick={aoClicar} disabled={desabilitado} style={estiloBotao(ativo, desabilitado)}>
      {rotulo}
    </button>
  );

  return (
    <div style={{ width: 132, padding: 10, borderRight: '1px solid #e2e8e2', background: '#fbfcfb' }}>
      {botao('novo-solido', '+ Novo sólido', props.aoNovoSolido, false, false)}
      <div style={{ height: 1, background: '#e2e8e2', margin: '10px 0' }} />
      {FERRAMENTAS.map((f) => botao(f.id, f.rotulo, () => props.aoEscolher(f.id), props.ferramenta === f.id, !props.temSolido))}
      <div style={{ height: 1, background: '#e2e8e2', margin: '10px 0' }} />
      {botao('desfazer', 'Desfazer', props.aoDesfazer, false, !props.podeDesfazer)}
      {botao('refazer', 'Refazer', props.aoRefazer, false, !props.podeRefazer)}
    </div>
  );
}