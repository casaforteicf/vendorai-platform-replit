/**
 * Inserção paramétrica — caixa por medidas exatas.
 *
 * Decisão de UX: `posicao` é o CANTO MÍNIMO da caixa (não o centro). É o que o usuário espera
 * ao digitar "X=0, Z=0, largura=4": a parede ocupa 0..4 em X. Centro obrigaria a fazer conta
 * de cabeça e foi a origem de erro em ferramentas CAD.
 *
 * Puro: sem three, sem React. Emite o sólido completo (8 vértices, 12 arestas, 6 faces) para
 * o motor, que é quem aplica a operação.
 */

import type { Aresta, Face, Solido, Vetor3, Vertice } from './schema';

export interface DimensoesCaixa {
  /** Eixo X. */
  largura: number;
  /** Eixo Y (altura). */
  altura: number;
  /** Eixo Z (profundidade). */
  profundidade: number;
}

export interface OpcoesCaixa {
  id: string;
  nome: string;
  /** Canto mínimo da caixa, em metros. */
  posicao: Vetor3;
  dimensoes: DimensoesCaixa;
}

export type ErroCaixa = { codigo: 'DIMENSAO_INVALIDA'; campo: keyof DimensoesCaixa; valor: number };

export type ResultadoCaixa = { ok: true; solido: Solido } | { ok: false; erro: ErroCaixa };

export const DIMENSOES_MINIMAS = { largura: 0.01, altura: 0.01, profundidade: 0.01 } as const;

function vertice(id: string, posicao: Vetor3): Vertice {
  return { id, posicao };
}

function aresta(id: string, a: string, b: string): Aresta {
  return { id, verticeA: a, verticeB: b };
}

export function criarCaixa(opcoes: OpcoesCaixa): ResultadoCaixa {
  const { largura, altura, profundidade } = opcoes.dimensoes;

  for (const campo of ['largura', 'altura', 'profundidade'] as const) {
    const valor = opcoes.dimensoes[campo];
    if (!Number.isFinite(valor) || valor < DIMENSOES_MINIMAS[campo]) {
      return { ok: false, erro: { codigo: 'DIMENSAO_INVALIDA', campo, valor } };
    }
  }

  const [x0, y0, z0] = opcoes.posicao;
  const x1 = x0 + largura;
  const y1 = y0 + altura;
  const z1 = z0 + profundidade;

  const v = {
    v1: opcoes.id + '_v1',
    v2: opcoes.id + '_v2',
    v3: opcoes.id + '_v3',
    v4: opcoes.id + '_v4',
    v5: opcoes.id + '_v5',
    v6: opcoes.id + '_v6',
    v7: opcoes.id + '_v7',
    v8: opcoes.id + '_v8',
  };

  const vertices: Vertice[] = [
    vertice(v.v1, [x0, y0, z0]),
    vertice(v.v2, [x1, y0, z0]),
    vertice(v.v3, [x1, y0, z1]),
    vertice(v.v4, [x0, y0, z1]),
    vertice(v.v5, [x0, y1, z0]),
    vertice(v.v6, [x1, y1, z0]),
    vertice(v.v7, [x1, y1, z1]),
    vertice(v.v8, [x0, y1, z1]),
  ];

  const arestas: Aresta[] = [
    aresta(opcoes.id + '_a1', v.v1, v.v2),
    aresta(opcoes.id + '_a2', v.v2, v.v3),
    aresta(opcoes.id + '_a3', v.v3, v.v4),
    aresta(opcoes.id + '_a4', v.v4, v.v1),
    aresta(opcoes.id + '_a5', v.v5, v.v6),
    aresta(opcoes.id + '_a6', v.v6, v.v7),
    aresta(opcoes.id + '_a7', v.v7, v.v8),
    aresta(opcoes.id + '_a8', v.v8, v.v5),
    aresta(opcoes.id + '_a9', v.v1, v.v5),
    aresta(opcoes.id + '_a10', v.v2, v.v6),
    aresta(opcoes.id + '_a11', v.v3, v.v7),
    aresta(opcoes.id + '_a12', v.v4, v.v8),
  ];

  /** Ordem antihorária vista de fora — a normal aponta para fora da caixa. */
  // Winding verificado por produto vetorial: normal aponta para FORA em todas as 6 faces.
  // (A primeira versão estava invertida em todas — o sólido saía "do avesso" e a booleana errava.)
  const faces: Face[] = [
    { id: opcoes.id + '_f_base', vertices: [v.v1, v.v2, v.v3, v.v4] },
    { id: opcoes.id + '_f_topo', vertices: [v.v5, v.v8, v.v7, v.v6] },
    { id: opcoes.id + '_f_frente', vertices: [v.v1, v.v5, v.v6, v.v2] },
    { id: opcoes.id + '_f_fundo', vertices: [v.v4, v.v3, v.v7, v.v8] },
    { id: opcoes.id + '_f_esquerda', vertices: [v.v1, v.v4, v.v8, v.v5] },
    { id: opcoes.id + '_f_direita', vertices: [v.v2, v.v6, v.v7, v.v3] },
  ];

  return {
    ok: true,
    solido: {
      id: opcoes.id,
      nome: opcoes.nome,
      vertices,
      arestas,
      faces,
      transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
    },
  };
}

/** Presets do painel — mesma regra, valores de obra. */
export const PRESETS_INSERCAO = {
  parede: { nome: 'Parede', dimensoes: { largura: 4, altura: 2.8, profundidade: 0.15 } },
  laje: { nome: 'Laje', dimensoes: { largura: 4, altura: 0.12, profundidade: 3 } },
  pilar: { nome: 'Pilar', dimensoes: { largura: 0.3, altura: 2.8, profundidade: 0.3 } },
  caixa: { nome: 'Caixa', dimensoes: { largura: 1, altura: 1, profundidade: 1 } },
} as const;

export type NomePreset = keyof typeof PRESETS_INSERCAO;
