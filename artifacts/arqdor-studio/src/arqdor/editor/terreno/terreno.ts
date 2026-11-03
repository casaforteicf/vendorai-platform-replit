/**
 * Terreno — plano texturizado de referência.
 *
 * O terreno é um sólido (quad com uma face) marcado por nome. Nunca é materializado como
 * `ElementoBim`, então não entra no quantitativo/orçamento — é referência visual.
 */

import type { Aresta, Face, Solido, Vertice } from '../modelador/schema';
import { interpretarLocalizacao } from './localizacao';
import { atribuicaoTerreno, metrosPorPixel, tileDaLocalizacao, urlTerreno } from './tiles';
import type { OpcoesGoogle, ProvedorTerreno } from './tiles';

export const PREFIXO_TERRENO = '__terreno__';
export const LADO_PADRAO_M = 120;
export const MATERIAL_TERRENO = 'MAT-TERRENO';

export interface EntradaTerreno {
  id: string;
  /** Texto do usuário: coordenadas ou link de mapa. */
  localizacao: string;
  largura?: number;
  profundidade?: number;
  zoom?: number;
  provedor?: ProvedorTerreno;
  chaveGoogle?: string;
}

export interface TexturaTerreno {
  url: string | null;
  atribuicao: string;
  lat: number;
  lng: number;
  zoom: number;
  metrosPorPixel: number;
}

export type ErroTerreno = 'LOCALIZACAO_INVALIDA' | 'DIMENSOES_INVALIDAS' | 'PROVEDOR_REQUER_CHAVE';

export type ResultadoTerreno =
  | { ok: true; solido: Solido; textura: TexturaTerreno; resumo: string }
  | { ok: false; erro: ErroTerreno };

export function ehTerreno(solido: Solido): boolean {
  return solido.nome.startsWith(PREFIXO_TERRENO);
}

/** Terreno é referência: nunca contabiliza no orçamento. */
export function contabilizaNoOrcamento(solido: Solido): boolean {
  return !ehTerreno(solido);
}

export function criarTerreno(entrada: EntradaTerreno): ResultadoTerreno {
  const lido = interpretarLocalizacao(entrada.localizacao);
  if (!lido.ok) return { ok: false, erro: 'LOCALIZACAO_INVALIDA' };

  const largura = entrada.largura ?? LADO_PADRAO_M;
  const profundidade = entrada.profundidade ?? LADO_PADRAO_M;
  if (!(largura > 0) || !(profundidade > 0)) return { ok: false, erro: 'DIMENSOES_INVALIDAS' };

  const provedor = entrada.provedor ?? 'osm';
  const zoom = entrada.zoom ?? lido.localizacao.zoom ?? 17;
  const { lat, lng } = lido.localizacao;
  const tile = tileDaLocalizacao(lat, lng, zoom);

  if (provedor === 'google' && (entrada.chaveGoogle === undefined || entrada.chaveGoogle.trim().length === 0)) {
    return { ok: false, erro: 'PROVEDOR_REQUER_CHAVE' };
  }

  const google: OpcoesGoogle | undefined =
    provedor === 'google'
      ? { chave: entrada.chaveGoogle ?? '', larguraPx: 640, alturaPx: 640, centro: { lat, lng }, zoom }
      : undefined;

  const url = urlTerreno(provedor, tile, google);
  const mpp = metrosPorPixel(lat, zoom);

  const meiaL = largura / 2;
  const meiaP = profundidade / 2;
  const vertices: Vertice[] = [
    { id: entrada.id + '_v1', posicao: [-meiaL, 0, -meiaP] },
    { id: entrada.id + '_v2', posicao: [meiaL, 0, -meiaP] },
    { id: entrada.id + '_v3', posicao: [meiaL, 0, meiaP] },
    { id: entrada.id + '_v4', posicao: [-meiaL, 0, meiaP] },
  ];
  const arestas: Aresta[] = [
    { id: entrada.id + '_a1', verticeA: vertices[0].id, verticeB: vertices[1].id },
    { id: entrada.id + '_a2', verticeA: vertices[1].id, verticeB: vertices[2].id },
    { id: entrada.id + '_a3', verticeA: vertices[2].id, verticeB: vertices[3].id },
    { id: entrada.id + '_a4', verticeA: vertices[3].id, verticeB: vertices[0].id },
  ];
  const faces: Face[] = [
    {
      id: entrada.id + '_f_piso',
      vertices: vertices.map((vertice) => vertice.id),
      material: { materialId: MATERIAL_TERRENO },
      triangulada: false,
    },
  ];

  const solido: Solido = {
    id: entrada.id,
    // O nome carrega a medida: é o que a status bar/seleção mostram ao usuário.
    nome:
      PREFIXO_TERRENO + lat.toFixed(5) + ',' + lng.toFixed(5) + '@' + String(zoom) +
      ' · ' + String(Math.round(largura)) + '×' + String(Math.round(profundidade)) + ' m',
    vertices,
    arestas,
    faces,
    transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] },
  };

  return {
    ok: true,
    solido,
    textura: { url, atribuicao: atribuicaoTerreno(provedor), lat, lng, zoom, metrosPorPixel: Math.round(mpp * 1000) / 1000 },
    resumo:
      lat.toFixed(5) + ', ' + lng.toFixed(5) + ' · zoom ' + String(zoom) + ' · ' +
      String(largura) + ' × ' + String(profundidade) + ' m · ' + atribuicaoTerreno(provedor),
  };
}
