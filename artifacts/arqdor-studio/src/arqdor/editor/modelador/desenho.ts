/**
 * Máquina de estados do desenho.
 *
 * D8 (descoberto ao ligar a UI): a versão anterior tinha fases fixas (ocioso/1 ponto/2 pontos)
 * e o terceiro clique do arco SOBRESCREVIA o segundo — o arco de 3 pontos nunca recebia o C.
 * Agora o estado guarda a lista de pontos; quantos são necessários vem da ferramenta.
 */

import type { OperacaoModelador, Plano, Solido, Vetor3 } from './schema';
import { criarArco } from './ferramentas/arco';
import { criarCirculo } from './ferramentas/circulo';
import { criarLinha } from './ferramentas/linha';
import { criarRetangulo } from './ferramentas/retangulo';

export type FerramentaModelador = 'selecionar' | 'linha' | 'retangulo' | 'circulo' | 'arco' | 'pushpull';

export interface EstadoDesenho {
  ferramenta: FerramentaModelador;
  pontos: Vetor3[];
}

export function iniciar(ferramenta: FerramentaModelador): EstadoDesenho {
  return { ferramenta, pontos: [] };
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
    case 'pushpull':
      return 0;
  }
}

export interface ResultadoClique {
  estado: EstadoDesenho;
  /** true quando já há pontos suficientes para gerar operações. */
  pronto: boolean;
}

export function clicar(estado: EstadoDesenho, ponto: Vetor3): ResultadoClique {
  const necessario = cliquesNecessarios(estado.ferramenta);
  if (necessario === 0) return { estado, pronto: false };

  const pontos = [...estado.pontos, ponto];
  return { estado: { ferramenta: estado.ferramenta, pontos }, pronto: pontos.length >= necessario };
}

export function cancelar(estado: EstadoDesenho): EstadoDesenho {
  return { ferramenta: estado.ferramenta, pontos: [] };
}

export type ErroDesenho =
  | { codigo: 'COMANDO_INCOMPLETO' }
  | { codigo: 'FERRAMENTA_SEM_DESENHO'; ferramenta: FerramentaModelador }
  | { codigo: 'ARCO_INVALIDO'; motivo: 'PONTOS_COLINEARES' | 'ARCO_DEGENERADO' };

export type ResultadoOperacoes =
  | { ok: true; operacoes: OperacaoModelador[] }
  | { ok: false; erro: ErroDesenho };

export function operacoesDoComando(
  estado: EstadoDesenho,
  contexto: { solido: Solido; plano: Plano; segmentos?: number },
): ResultadoOperacoes {
  const necessario = cliquesNecessarios(estado.ferramenta);
  if (necessario === 0) {
    return { ok: false, erro: { codigo: 'FERRAMENTA_SEM_DESENHO', ferramenta: estado.ferramenta } };
  }
  if (estado.pontos.length < necessario) return { ok: false, erro: { codigo: 'COMANDO_INCOMPLETO' } };

  const [a, b] = estado.pontos;

  switch (estado.ferramenta) {
    case 'linha':
      return { ok: true, operacoes: criarLinha({ solido: contexto.solido, a, b }) };

    case 'retangulo':
      return { ok: true, operacoes: criarRetangulo({ solido: contexto.solido, plano: contexto.plano, a, b }) };

    case 'circulo': {
      const raio = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      return {
        ok: true,
        operacoes: criarCirculo({
          solido: contexto.solido,
          plano: contexto.plano,
          centro: a,
          raio,
          segmentos: contexto.segmentos,
        }),
      };
    }

    case 'arco': {
      const c = estado.pontos[2];
      const resultado = criarArco({
        solido: contexto.solido,
        plano: contexto.plano,
        a,
        b,
        c,
        segmentos: contexto.segmentos,
      });
      if (!resultado.ok) return { ok: false, erro: { codigo: 'ARCO_INVALIDO', motivo: resultado.erro.codigo } };
      return { ok: true, operacoes: resultado.operacoes };
    }

    case 'selecionar':
    case 'pushpull':
      return { ok: false, erro: { codigo: 'FERRAMENTA_SEM_DESENHO', ferramenta: estado.ferramenta } };
  }
}