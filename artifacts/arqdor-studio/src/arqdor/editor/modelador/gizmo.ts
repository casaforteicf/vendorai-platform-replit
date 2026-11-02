/**
 * Gizmo — mover, rotacionar e escalar.
 * Toda transformação vira UMA `atualizar_solido` com snapshot `antes`/`depois`,
 * para que um arrasto inteiro do gizmo seja um único passo de undo.
 */

import type { OperacaoModelador, Solido, Vetor3 } from './schema';
import { add } from './plano';

const RAD = Math.PI / 180;

export function gerarOpMover(solido: Solido, delta: Vetor3): OperacaoModelador {
  return {
    tipo: 'atualizar_solido',
    antes: solido,
    depois: {
      ...solido,
      transformacao: {
        ...solido.transformacao,
        posicao: add(solido.transformacao.posicao, delta),
      },
    },
  };
}

export function gerarOpRotacionar(solido: Solido, deltaEuler: Vetor3): OperacaoModelador {
  const r = solido.transformacao.rotacao;
  return {
    tipo: 'atualizar_solido',
    antes: solido,
    depois: {
      ...solido,
      transformacao: {
        ...solido.transformacao,
        rotacao: [r[0] + deltaEuler[0], r[1] + deltaEuler[1], r[2] + deltaEuler[2]] as Vetor3,
      },
    },
  };
}

export function gerarOpEscalar(solido: Solido, fator: Vetor3): OperacaoModelador {
  const e = solido.transformacao.escala;
  return {
    tipo: 'atualizar_solido',
    antes: solido,
    depois: {
      ...solido,
      transformacao: {
        ...solido.transformacao,
        escala: [e[0] * fator[0], e[1] * fator[1], e[2] * fator[2]] as Vetor3,
      },
    },
  };
}

/** Converte rotação do arrasto (graus) em radianos — o store guarda radianos. */
export function deltaGrausParaRadiano(deltaGraus: Vetor3): Vetor3 {
  return [deltaGraus[0] * RAD, deltaGraus[1] * RAD, deltaGraus[2] * RAD];
}