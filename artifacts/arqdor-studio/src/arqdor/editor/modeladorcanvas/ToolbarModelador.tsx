'use client';

import type { FerramentaModelador } from '../modelador/desenho';
import { Icone } from '../design/icones';
import type { NomeIcone } from '../design/icones';
import type { ModoGizmo } from './ModeladorCanvas';

export interface PropsToolbar {
  ferramenta: FerramentaModelador;
  aoEscolher: (ferramenta: FerramentaModelador) => void;
  aoNovoSolido: () => void;
  aoAbrirInsercao: () => void;
  aoDesfazer: () => void;
  aoRefazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  temSolido: boolean;
  gizmo: ModoGizmo;
  aoGizmo: (modo: ModoGizmo) => void;
  /** Ferramenta Offset: abre o campo de distância no inspetor. */
  aoOffset: () => void;
  /** Exclui o sólido selecionado. */
  aoExcluir: () => void;
  podeExcluir: boolean;
}

const FERRAMENTAS: ReadonlyArray<{ id: FerramentaModelador; rotulo: string; icone: NomeIcone; tecla: string }> = [
  { id: 'selecionar', rotulo: 'Selecionar', icone: 'selecionar', tecla: 'Espaço' },
  { id: 'linha', rotulo: 'Linha', icone: 'linha', tecla: 'L' },
  { id: 'retangulo', rotulo: 'Retângulo', icone: 'retangulo', tecla: 'R' },
  { id: 'circulo', rotulo: 'Círculo', icone: 'circulo', tecla: 'C' },
  { id: 'arco', rotulo: 'Arco', icone: 'arco', tecla: 'A' },
  { id: 'pushpull', rotulo: 'Push/Pull', icone: 'pushpull', tecla: 'P' },
];

const GIZMOS: ReadonlyArray<{ id: Exclude<ModoGizmo, null>; rotulo: string; icone: NomeIcone; tecla: string }> = [
  { id: 'mover', rotulo: 'Mover', icone: 'mover', tecla: 'M' },
  { id: 'rotacionar', rotulo: 'Rotacionar', icone: 'rotacionar', tecla: 'Q' },
  { id: 'escalar', rotulo: 'Escalar', icone: 'escalar', tecla: 'S' },
];

/**
 * Rail vertical só com ícones (padrão SketchUp): o rótulo vive em `title`/`aria-label`,
 * nunca ocupando espaço do viewport.
 */
export function ToolbarModelador(props: PropsToolbar) {
  const botao = (
    chave: string,
    rotulo: string,
    icone: NomeIcone,
    ativo: boolean,
    desabilitado: boolean,
    aoClicar: () => void,
  ) => (
    <button
      key={chave}
      type="button"
      className="arq-tool arq-tool-icone"
      aria-pressed={ativo}
      aria-label={rotulo}
      disabled={desabilitado}
      title={rotulo}
      onClick={aoClicar}
    >
      <Icone nome={icone} tamanho={20} />
    </button>
  );

  return (
    <div className="arq-editor-rail" role="toolbar" aria-label="Ferramentas de modelagem">
      {botao('inserir', 'Inserir por medidas', 'retangulo', false, false, props.aoAbrirInsercao)}
      {botao('novo', 'Novo sólido', 'mais', false, false, props.aoNovoSolido)}

      <div className="arq-rail-sep" />

      {FERRAMENTAS.map((f) => {
        const exigeSolido = f.id !== 'selecionar' && f.id !== 'pushpull';
        return botao(
          f.id,
          f.rotulo + ' (' + f.tecla + ')',
          f.icone,
          props.ferramenta === f.id,
          exigeSolido && !props.temSolido,
          () => props.aoEscolher(f.id),
        );
      })}

      <div className="arq-rail-sep" />

      {GIZMOS.map((g) =>
        botao(
          g.id,
          g.rotulo + ' (' + g.tecla + ')',
          g.icone,
          props.gizmo === g.id,
          !props.temSolido,
          () => props.aoGizmo(props.gizmo === g.id ? null : g.id),
        ),
      )}

      <div className="arq-rail-sep" />

      {botao('offset', 'Offset da face', 'offset', false, !props.temSolido, props.aoOffset)}
      {botao('excluir', 'Excluir sólido', 'lixeira', false, !props.podeExcluir, props.aoExcluir)}

      <div className="arq-rail-sep" />

      {botao('desfazer', 'Desfazer (Ctrl+Z)', 'desfazer', false, !props.podeDesfazer, props.aoDesfazer)}
      {botao('refazer', 'Refazer (Ctrl+Shift+Z)', 'refazer', false, !props.podeRefazer, props.aoRefazer)}
    </div>
  );
}
