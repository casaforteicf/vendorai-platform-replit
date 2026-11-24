/**
 * Atalhos de teclado (mapa SketchUp) — puro e testável.
 *
 * A UI só despacha a ação; a decisão de qual tecla faz o quê vive aqui.
 * Regra: com Ctrl/Cmd/Alt pressionado, só Ctrl+Z e Ctrl+Shift+Z valem.
 */

import type { FerramentaModelador } from '../modelador/desenho';
import type { ModoGizmo } from '../modelador/snap';

export type AcaoAtalho =
  | { tipo: 'ferramenta'; ferramenta: FerramentaModelador }
  | { tipo: 'gizmo'; modo: Exclude<ModoGizmo, null> }
  | { tipo: 'offset' }
  | { tipo: 'excluir' }
  | { tipo: 'desfazer'; refazer: boolean };

export interface TeclaPressionada {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const FERRAMENTAS: Readonly<Record<string, FerramentaModelador>> = {
  l: 'linha',
  r: 'retangulo',
  c: 'circulo',
  a: 'arco',
  p: 'pushpull',
};

export function resolverAtalho(tecla: TeclaPressionada): AcaoAtalho | null {
  const ctrl = tecla.ctrlKey === true || tecla.metaKey === true;
  const minuscula = tecla.key.toLowerCase();

  if (ctrl && minuscula === 'z') {
    return { tipo: 'desfazer', refazer: tecla.shiftKey === true };
  }
  if (ctrl || tecla.altKey === true) return null;

  // Espaço = Select do SketchUp
  if (tecla.code === 'Space' || tecla.key === ' ') {
    return { tipo: 'ferramenta', ferramenta: 'selecionar' };
  }

  const ferramenta = FERRAMENTAS[minuscula];
  if (ferramenta !== undefined) return { tipo: 'ferramenta', ferramenta };

  // Gizmo: M mover · Q (ou O) rotacionar · S escalar
  if (minuscula === 'm') return { tipo: 'gizmo', modo: 'mover' };
  if (minuscula === 'q' || minuscula === 'o') return { tipo: 'gizmo', modo: 'rotacionar' };
  if (minuscula === 's') return { tipo: 'gizmo', modo: 'escalar' };

  if (minuscula === 'f') return { tipo: 'offset' };
  if (minuscula === 'e') return { tipo: 'excluir' };

  return null;
}
