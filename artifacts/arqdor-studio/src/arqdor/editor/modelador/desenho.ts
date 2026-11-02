/**
 * Máquina de estados do desenho.
 *
 * Um comando = uma sequência de cliques até ficar "pronto"; as operações só são
 * geradas no fim, para que o comando inteiro entre como UM PassoUndo.
 */

import type { OperacaoModelador, Plano, Solido, Vetor3 } from './schema';
import { criarArco } from './ferramentas/arco';
import { criarCirculo } from './ferramentas/circulo';
import { criarLinha } from './ferramentas/linha';
import { criarRetangulo } from './ferramentas/retangulo';

export type FerramentaModelador = 'selecionar' | 'linha' | 'retangulo' | 'circulo' | 'arco';

export type EstadoDesenho =
  | { fase: 'ocioso'; ferramenta: FerramentaModelador }
  | { fase: 'um_ponto'; ferramenta: FerramentaModelador; a: Vetor3 }
  | { fase: 'dois_pontos'; ferramenta: FerramentaModelador; a: Vetor3; b: Vetor3 };

export function iniciar(ferramenta: FerramentaModelador): EstadoDesenho {
  return { fase: 'ocioso', ferramenta };
}

export interface ResultadoClique {
  estado: EstadoDesenho;
  /** true quando o comando já tem pontos suficientes para gerar operações. */
  pronto: boolean;
}

/** Quantos cliques cada ferramenta precisa. */
export function cliquesNecessarios(ferramenta: FerramentaModelador): number {
  switch (ferramenta) {
    case 'linha':
    case 'retangulo':
    case 'circulo':
      return 2;
    case 'arco':
      return 3;
    case 'selecionar':
      return 0;
  }
}

export function clicar(estado: EstadoDesenho, ponto: Vetor3): ResultadoClique {
  if (estado.fase === 'ocioso') {
    if (estado.ferramenta === 'linha') return { estado: { fase: 'um_ponto', ferramenta: 'linha', a: ponto }, pronto: false };
    if (estado.ferramenta === 'retangulo') return { estado: { fase: 'um_ponto', ferramenta: 'retangulo', a: ponto }, pronto: false };
    if (estado.ferramenta === 'circulo') return { estado: { fase: 'um_ponto', ferramenta: 'circulo', a: ponto }, pronto: false };
    if (estado.ferramenta === 'arco') return { estado: { fase: 'um_ponto', ferramenta: 'arco', a: ponto }, pronto: false };
    return { estado, pronto: false };
  }

  if (estado.fase === 'um_ponto') {
    if (estado.ferramenta === 'arco') {
      return { estado: { fase: 'dois_pontos', ferramenta: 'arco', a: estado.a, b: ponto }, pronto: false };
    }
    return { estado: { fase: 'dois_pontos', ferramenta: estado.ferramenta, a: estado.a, b: ponto }, pronto: true };
  }

  // dois_pontos
  if (estado.ferramenta === 'arco') {
    return { estado: { fase: 'dois_pontos', ferramenta: 'arco', a: estado.a, b: estado.b }, pronto: true };
  }
  return { estado, pronto: false };
}

export type ErroDesenho =
  | { codigo: 'COMANDO_INCOMPLETO' }
  | { codigo: 'FERRAMENTA_SEM_DESENHO'; ferramenta: FerramentaModelador }
  | { codigo: 'ARCO_INVALIDO'; motivo: 'PONTOS_COLINEARES' | 'ARCO_DEGENERADO' };

export type ResultadoOperacoes =
  | { ok: true; operacoes: OperacaoModelador[] }
  | { ok: false; erro: ErroDesenho };

/**
 * Gera as operações do comando em andamento.
 * `terceiro` só é usado pelo arco (A, B, C).
 */
export function operacoesDoComando(
  estado: EstadoDesenho,
  contexto: { solido: Solido; plano: Plano; terceiro?: Vetor3; segmentos?: number },
): ResultadoOperacoes {
  if (estado.fase === 'ocioso') {
    return { ok: false, erro: { codigo: 'FERRAMENTA_SEM_DESENHO', ferramenta: estado.ferramenta } };
  }

  if (estado.fase === 'um_ponto') {
    return { ok: false, erro: { codigo: 'COMANDO_INCOMPLETO' } };
  }

  const { a, b, ferramenta } = estado;

  switch (ferramenta) {
    case 'linha':
      return { ok: true, operacoes: criarLinha({ solido: contexto.solido, a, b }) };
    case 'retangulo':
      return { ok: true, operacoes: criarRetangulo({ solido: contexto.solido, plano: contexto.plano, a, b }) };
    case 'circulo': {
      const raio = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      return {
        ok: true,
        operacoes: criarCirculo({ solido: contexto.solido, plano: contexto.plano, centro: a, raio, segmentos: contexto.segmentos }),
      };
    }
    case 'arco': {
      const terceiro = contexto.terceiro;
      if (terceiro === undefined) return { ok: false, erro: { codigo: 'COMANDO_INCOMPLETO' } };
      const resultado = criarArco({
        solido: contexto.solido,
        plano: contexto.plano,
        a,
        b,
        c: terceiro,
        segmentos: contexto.segmentos,
      });
      if (!resultado.ok) {
        return { ok: false, erro: { codigo: 'ARCO_INVALIDO', motivo: resultado.erro.codigo } };
      }
      return { ok: true, operacoes: resultado.operacoes };
    }
    case 'selecionar':
      return { ok: false, erro: { codigo: 'FERRAMENTA_SEM_DESENHO', ferramenta } };
  }
}