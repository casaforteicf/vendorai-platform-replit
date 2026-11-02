'use client';

import type { FerramentaModelador } from '../modelador/desenho';
import { Icone } from '../design/icones';
import type { NomeIcone } from '../design/icones';

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

const FERRAMENTAS: ReadonlyArray<{ id: FerramentaModelador; rotulo: string; icone: NomeIcone; tecla: string }> = [
  { id: 'linha', rotulo: 'Linha', icone: 'linha', tecla: 'L' },
  { id: 'retangulo', rotulo: 'Retângulo', icone: 'retangulo', tecla: 'R' },
  { id: 'circulo', rotulo: 'Círculo', icone: 'circulo', tecla: 'C' },
  { id: 'arco', rotulo: 'Arco', icone: 'arco', tecla: 'A' },
];

/** Rail de ferramentas do módulo — itens compactos com tooltip (baseline visual). */
export function ToolbarModelador(props: PropsToolbar) {
  return (
    <div className="arq-tool-rail" role="toolbar" aria-label="Ferramentas de modelagem">
      <div className="arq-nav-label">Sólido</div>
      <button type="button" className="arq2-tool-button" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={props.aoNovoSolido}>
        <Icone nome="mais" />
        <span>Novo sólido</span>
      </button>

      <div className="arq-nav-label">Ferramentas</div>
      {FERRAMENTAS.map((f) => (
        <button
          key={f.id}
          type="button"
          className="arq2-tool-button"
          style={{ width: '100%', justifyContent: 'flex-start' }}
          aria-pressed={props.ferramenta === f.id}
          disabled={!props.temSolido}
          title={f.rotulo + ' (' + f.tecla + ')'}
          onClick={() => props.aoEscolher(f.id)}
        >
          <Icone nome={f.icone} />
          <span>{f.rotulo}</span>
        </button>
      ))}

      <div className="arq-nav-label">Histórico</div>
      <button
        type="button"
        className="arq2-tool-button"
        style={{ width: '100%', justifyContent: 'flex-start' }}
        disabled={!props.podeDesfazer}
        onClick={props.aoDesfazer}
        title="Desfazer (Ctrl+Z)"
      >
        <Icone nome="desfazer" />
        <span>Desfazer</span>
      </button>
      <button
        type="button"
        className="arq2-tool-button"
        style={{ width: '100%', justifyContent: 'flex-start' }}
        disabled={!props.podeRefazer}
        onClick={props.aoRefazer}
        title="Refazer (Ctrl+Shift+Z)"
      >
        <Icone nome="refazer" />
        <span>Refazer</span>
      </button>
    </div>
  );
}