/**
 * Corte de vão (porta/janela) por BOOLEANA DE MALHA — parede retangular atravessada.
 *
 * A parede é tratada como caixa alinhada aos eixos (X comprimento · Y altura · Z espessura).
 * O vão atravessa a espessura: as duas faces externas viram anéis (4 quads cada) e o furo
 * ganha quatro revelos (peitoril, verga, dois ombreiras). Resultado: sólido fechado, sem
 * auto-interseção, com volume = volume da parede − volume do vão.
 *
 * Puro: entra sólido, sai sólido. Nenhum three, nenhum React.
 */

import type { Aresta, Face, Solido, Vetor3, Vertice } from './schema';
import { orientarParaFora } from './orientacao';

export interface MedidasVao {
  /** Distância do início da parede até o começo do vão (m). */
  offset: number;
  largura: number;
  altura: number;
  /** Altura do peitoril (0 para porta). */
  peitoril: number;
}

export type ErroVao =
  | { codigo: 'PAREDE_NAO_AXIAL'; detalhe: string }
  | { codigo: 'MEDIDA_INVALIDA'; campo: keyof MedidasVao; valor: number }
  | { codigo: 'VAO_FORA_DA_PAREDE'; detalhe: string };

export type ResultadoVao = { ok: true; solido: Solido } | { ok: false; erro: ErroVao };

interface Caixa {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

function caixaDaParede(solido: Solido): Caixa | null {
  if (solido.vertices.length === 0) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const v of solido.vertices) {
    x0 = Math.min(x0, v.posicao[0]); x1 = Math.max(x1, v.posicao[0]);
    y0 = Math.min(y0, v.posicao[1]); y1 = Math.max(y1, v.posicao[1]);
    z0 = Math.min(z0, v.posicao[2]); z1 = Math.max(z1, v.posicao[2]);
  }
  return { x0, x1, y0, y1, z0, z1 };
}

export function cortarVao(parede: Solido, medidas: MedidasVao, prefixo = 'vao'): ResultadoVao {
  const caixa = caixaDaParede(parede);
  if (caixa === null) return { ok: false, erro: { codigo: 'PAREDE_NAO_AXIAL', detalhe: 'parede sem vértices' } };

  for (const campo of ['offset', 'largura', 'altura', 'peitoril'] as const) {
    const valor = medidas[campo];
    if (!Number.isFinite(valor) || valor < 0) {
      return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo, valor } };
    }
  }
  if (medidas.largura <= 0 || medidas.altura <= 0) {
    return { ok: false, erro: { codigo: 'MEDIDA_INVALIDA', campo: medidas.largura <= 0 ? 'largura' : 'altura', valor: medidas.largura <= 0 ? medidas.largura : medidas.altura } };
  }

  const comprimento = caixa.x1 - caixa.x0;
  const alturaParede = caixa.y1 - caixa.y0;
  const espessura = caixa.z1 - caixa.z0;
  const xa = caixa.x0 + medidas.offset;
  const xb = xa + medidas.largura;
  const yb = caixa.y0 + medidas.peitoril;
  const yt = yb + medidas.altura;

  if (espessura <= 1e-6) {
    return { ok: false, erro: { codigo: 'PAREDE_NAO_AXIAL', detalhe: 'espessura nula em Z' } };
  }
  if (xb > caixa.x1 + 1e-9 || yt > caixa.y1 + 1e-9) {
    return { ok: false, erro: { codigo: 'VAO_FORA_DA_PAREDE', detalhe: 'vão excede comprimento/altura da parede' } };
  }
  if (comprimento <= 0 || alturaParede <= 0) {
    return { ok: false, erro: { codigo: 'PAREDE_NAO_AXIAL', detalhe: 'dimensões nulas' } };
  }

  const id = parede.id + '/' + prefixo;
  const vertice = (sufixo: string, posicao: Vetor3): Vertice => ({ id: id + sufixo, posicao });

  // frente (z0) e fundo (z1): 4 cantos externos + 4 cantos do vão em cada plano
  const A = vertice('A', [caixa.x0, caixa.y0, caixa.z0]);
  const B = vertice('B', [caixa.x1, caixa.y0, caixa.z0]);
  const C = vertice('C', [caixa.x1, caixa.y1, caixa.z0]);
  const D = vertice('D', [caixa.x0, caixa.y1, caixa.z0]);
  const E = vertice('E', [xa, yb, caixa.z0]);
  const F = vertice('F', [xb, yb, caixa.z0]);
  const G = vertice('G', [xb, yt, caixa.z0]);
  const H = vertice('H', [xa, yt, caixa.z0]);

  const A2 = vertice('A2', [caixa.x0, caixa.y0, caixa.z1]);
  const B2 = vertice('B2', [caixa.x1, caixa.y0, caixa.z1]);
  const C2 = vertice('C2', [caixa.x1, caixa.y1, caixa.z1]);
  const D2 = vertice('D2', [caixa.x0, caixa.y1, caixa.z1]);
  const E2 = vertice('E2', [xa, yb, caixa.z1]);
  const F2 = vertice('F2', [xb, yb, caixa.z1]);
  const G2 = vertice('G2', [xb, yt, caixa.z1]);
  const H2 = vertice('H2', [xa, yt, caixa.z1]);

  const vertices: Vertice[] = [A, B, C, D, E, F, G, H, A2, B2, C2, D2, E2, F2, G2, H2];

  const faces: Face[] = [
    // anel da face da frente
    { id: id + '_f_frente_base', vertices: [A.id, B.id, F.id, E.id] },
    { id: id + '_f_frente_dir', vertices: [B.id, C.id, G.id, F.id] },
    { id: id + '_f_frente_topo', vertices: [C.id, D.id, H.id, G.id] },
    { id: id + '_f_frente_esq', vertices: [D.id, A.id, E.id, H.id] },
    // anel da face de fundo
    { id: id + '_f_fundo_base', vertices: [A2.id, B2.id, F2.id, E2.id] },
    { id: id + '_f_fundo_dir', vertices: [B2.id, C2.id, G2.id, F2.id] },
    { id: id + '_f_fundo_topo', vertices: [C2.id, D2.id, H2.id, G2.id] },
    { id: id + '_f_fundo_esq', vertices: [D2.id, A2.id, E2.id, H2.id] },
    // revelos do furo (peitoril, ombreira direita, verga, ombreira esquerda)
    { id: id + '_f_peitoril', vertices: [E.id, F.id, F2.id, E2.id] },
    { id: id + '_f_ombreira_dir', vertices: [F.id, G.id, G2.id, F2.id] },
    { id: id + '_f_verga', vertices: [G.id, H.id, H2.id, G2.id] },
    { id: id + '_f_ombreira_esq', vertices: [H.id, E.id, E2.id, H2.id] },
    // casca externa restante
    { id: id + '_f_externo_topo', vertices: [C.id, D.id, D2.id, C2.id] },
    { id: id + '_f_externo_base', vertices: [A.id, B.id, B2.id, A2.id] },
    { id: id + '_f_externo_esq', vertices: [D.id, A.id, A2.id, D2.id] },
    { id: id + '_f_externo_dir', vertices: [B.id, C.id, C2.id, B2.id] },
  ];

  // arestas: cada par consecutivo de cada face, deduplicado
  const mapaArestas = new Map<string, Aresta>();
  for (const face of faces) {
    for (let i = 0; i < face.vertices.length; i += 1) {
      const a = face.vertices[i];
      const b = face.vertices[(i + 1) % face.vertices.length];
      const chave = a < b ? a + '|' + b : b + '|' + a;
      if (!mapaArestas.has(chave)) {
        mapaArestas.set(chave, { id: id + '_a' + String(mapaArestas.size + 1), verticeA: a, verticeB: b });
      }
    }
  }

  return {
    ok: true,
    solido: {
      id: parede.id,
      nome: parede.nome,
      vertices,
      arestas: [...mapaArestas.values()],
      faces: orientarParaFora(vertices, faces),
      transformacao: { ...parede.transformacao },
    },
  };
}
