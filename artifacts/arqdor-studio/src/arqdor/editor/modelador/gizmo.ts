/**
 * Gizmo — mover, rotacionar e escalar.
 * Toda transformação vira UMA `atualizar_solido` com snapshot `antes`/`depois`,
 * para que um arrasto inteiro do gizmo seja um único passo de undo.
 */

import type { OperacaoModelador, Solido, Vetor3 } from './schema';
import { add } from './plano';
import { comporRotacao, eulerParaQuaternion, multiplicarQuaternion, quaternionParaEuler } from './gizmo-math';
import type { Quaternion } from './gizmo-math';

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

/**
 * Aplica um DELTA de rotação compondo em quatérnion.
 * Somar ângulos de Euler (`r + delta`) quebra assim que há mais de um eixo: o sólido escapa
 * da seta. A composição preserva a orientação corrente.
 */
export function gerarOpRotacionar(solido: Solido, deltaEuler: Vetor3): OperacaoModelador {
  return {
    tipo: 'atualizar_solido',
    antes: solido,
    depois: {
      ...solido,
      transformacao: {
        ...solido.transformacao,
        rotacao: comporRotacao(solido.transformacao.rotacao, deltaEuler),
      },
    },
  };
}

/**
 * Leva o sólido até uma rotação ALVO (é o que o TransformControls entrega no arrasto).
 * O delta é calculado como q_atual⁻¹ · q_alvo, não por subtração de Euler.
 */
export function gerarOpRotacionarPara(solido: Solido, rotacaoAlvo: Vetor3): OperacaoModelador {
  const alvo = eulerParaQuaternion(rotacaoAlvo);
  const atual = eulerParaQuaternion(solido.transformacao.rotacao);
  const atualInverso: Quaternion = [-atual[0], -atual[1], -atual[2], atual[3]];
  // delta aplicado DEPOIS: q_delta = q_alvo · q_atual⁻¹  (e compor faz q_delta · q_atual = q_alvo)
  const delta = quaternionParaEuler(multiplicarQuaternion(alvo, atualInverso));
  return gerarOpRotacionar(solido, delta);
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