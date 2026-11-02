'use client';

import type { FerramentaModelador } from '../modelador/desenho';
import { Icone } from '../design/icones';
import type { NomeIcone } from '../design/icones';
import type { ModoGizmo } from './ModeladorCanvas';

export interface PropsToolbar {
  ferramenta: FerramentaModelador;
  aoEscolher: (ferramenta: FerramentaModelador) => void;
  aoNovoSolido: () => void;
  aoDesfazer: () => void;
  aoRefazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  temSolido: boolean;
  gizmo: ModoGizmo;

  aoGizmo: (modo: ModoGizmo) => void;
}

const FERRAMENTAS: ReadonlyArray<{ id: FerramentaModelador; rotulo: string; icone: NomeIcone; tecla: string }> = [
  { id: 'selecionar', rotulo: 'Selecionar', icone: 'selecionar', tecla: 'S' },
  { id: 'linha', rotulo: 'Linha', icone: 'linha', tecla: 'L' },
  { id: 'retangulo', rotulo: 'Retângulo', icone: 'retangulo', tecla: 'R' },
  { id: 'circulo', rotulo: 'Círculo', icone: 'circulo', tecla: 'C' },
  { id: 'arco', rotulo: 'Arco', icone: 'arco', tecla: 'A' },
  { id: 'pushpull', rotulo: 'Push/Pull', icone: 'pushpull', tecla: 'P' },
];

const GIZMOS: ReadonlyArray<{ id: Exclude<ModoGizmo, null>; rotulo: string; icone: NomeIcone; tecla: string }> = [
  { id: 'mover', rotulo: 'Mover', icone: 'mover', tecla: 'M' },
  { id: 'rotacionar', rotulo: 'Rotacionar', icone: 'rotacionar', tecla: 'O' },
  { id: 'escalar', rotulo: 'Escalar', icone: 'escalar', tecla: 'E' },
];

export function ToolbarModelador(props: PropsToolbar) {
  const botao = (
    chave: string,
    rotulo: string,
    icone: NomeIcone,
    ativo: boolean,
    desabilitado: boolean,
    aoClicar: () => void,
    dica: string,
  ) => (
    <button
      key={chave}
      type="button"
      className="arq-tool"
      aria-pressed={ativo}
      disabled={desabilitado}
      title={dica}
      onClick={aoClicar}
    >
      <Icone nome={icone} />
      <span>{rotulo}</span>
    </button>
  );

  return (
    <div className="arq-editor-rail" role="toolbar" aria-label="Ferramentas de modelagem">
      <div className="arq-rail-label">Sólido</div>
      {botao('novo', 'Novo sólido', 'mais', false, false, props.aoNovoSolido, 'Cria um sólido vazio')}

      <div className="arq-rail-label">Ferramentas</div>
      {FERRAMENTAS.map((f) => {
        const exigeSolido = f.id !== 'selecionar' && f.id !== 'pushpull';
        return botao(
          f.id,
          f.rotulo,
          f.icone,
          props.ferramenta === f.id,
          exigeSolido && !props.temSolido,
          () => props.aoEscolher(f.id),
          f.rotulo + ' (' + f.tecla + ')',
        );
      })}

      <div className="arq-rail-label">Gizmo</div>
      {GIZMOS.map((g) =>
        botao(g.id, g.rotulo, g.icone, props.gizmo === g.id, !props.temSolido, () => props.aoGizmo(props.gizmo === g.id ? null : g.id), g.rotulo + ' (' + g.tecla + ')'),
      )}


      <div className="arq-rail-label">Histórico</div>
      {botao('desfazer', 'Desfazer', 'desfazer', false, !props.podeDesfazer, props.aoDesfazer, 'Desfazer (Ctrl+Z)')}
      {botao('refazer', 'Refazer', 'refazer', false, !props.podeRefazer, props.aoRefazer, 'Refazer (Ctrl+Shift+Z)')}
    </div>
  );
}