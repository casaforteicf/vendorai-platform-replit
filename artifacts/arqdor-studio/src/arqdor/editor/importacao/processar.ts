/**
 * Importação — conversão para a geometria do Arqdor.
 *
 * Pipeline: bytes → malha (GLB/DXF) → SÓLIDO único (vértices/arestas/faces) → operação
 * `criar_solido`. O centro do grid recebe o centro da bbox (x,z) e a base do modelo (min y = 0).
 * Uma única operação ⇒ um único `PassoUndo`.
 */

import type { Aresta, Face, OperacaoModelador, Solido, Vertice, Vetor3 } from '../modelador/schema';
import { lerGlb } from './glb';
import type { MalhaImportada } from './glb';
import { lerDxf } from './dxf';

export type FormatoImportacao = 'glb' | 'gltf' | 'dxf' | 'ifc';

export type ErroImportacao = 'FORMATO_DESCONHECIDO' | 'FORMATO_NAO_SUPORTADO' | 'ARQUIVO_INVALIDO' | 'SEM_GEOMETRIA';

export interface EntradaImportacao {
  nome: string;
  bytes: ArrayBuffer;
  idSolido: string;
}

export type ResultadoImportacao =
  | { ok: true; formato: FormatoImportacao; solido: Solido; resumo: string }
  | { ok: false; erro: ErroImportacao; detalhe?: string };

export function detectarFormato(nome: string): FormatoImportacao | null {
  const partes = nome.toLowerCase().split('.');
  if (partes.length < 2) return null;
  const extensao = partes[partes.length - 1];
  if (extensao === 'glb') return 'glb';
  if (extensao === 'gltf') return 'gltf';
  if (extensao === 'dxf') return 'dxf';
  if (extensao === 'ifc') return 'ifc';
  return null;
}

export interface OpcoesSolido {
  id: string;
  nome: string;
}

export type ResultadoSolido =
  | { ok: true; solido: Solido }
  | { ok: false; erro: 'SEM_GEOMETRIA' | 'ARQUIVO_INVALIDO' };

/** Converte a malha em sólido, com dedupe de vértices e centragem no grid. */
export function construirSolido(malha: MalhaImportada, opcoes: OpcoesSolido): ResultadoSolido {
  const total = malha.posicoes.length / 3;
  if (total < 3) return { ok: false, erro: 'SEM_GEOMETRIA' };

  // 1) bbox para centrar (x,z) e apoiar na base (y).
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < total; i += 1) {
    const x = malha.posicoes[i * 3];
    const y = malha.posicoes[i * 3 + 1];
    const z = malha.posicoes[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ)) {
    return { ok: false, erro: 'ARQUIVO_INVALIDO' };
  }
  const deslocamento: Vetor3 = [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2];

  // 2) vértices com dedupe (chave arredondada).
  const vertices: Vertice[] = [];
  const porChave = new Map<string, string>();
  const porIndice = new Map<number, string>();
  const chave = (posicao: Vetor3): string =>
    posicao[0].toFixed(6) + '|' + posicao[1].toFixed(6) + '|' + posicao[2].toFixed(6);

  const idDoIndice = (indice: number): string | null => {
    if (!Number.isInteger(indice) || indice < 0 || indice >= total) return null;
    const existente = porIndice.get(indice);
    if (existente !== undefined) return existente;
    const posicao: Vetor3 = [
      malha.posicoes[indice * 3] + deslocamento[0],
      malha.posicoes[indice * 3 + 1] + deslocamento[1],
      malha.posicoes[indice * 3 + 2] + deslocamento[2],
    ];
    const k = chave(posicao);
    let id = porChave.get(k);
    if (id === undefined) {
      id = opcoes.id + '_v' + String(vertices.length + 1);
      porChave.set(k, id);
      vertices.push({ id, posicao });
    }
    porIndice.set(indice, id);
    return id;
  };

  // 3) faces por triângulo (ignora degenerados).
  const faces: Face[] = [];
  const arestas: Aresta[] = [];
  const arestasVistas = new Set<string>();
  const criarAresta = (a: string, b: string): void => {
    if (a === b) return;
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (arestasVistas.has(k)) return;
    arestasVistas.add(k);
    arestas.push({ id: opcoes.id + '_a' + String(arestas.length + 1), verticeA: a, verticeB: b });
  };

  for (let i = 0; i + 2 < malha.indices.length; i += 3) {
    const ids = [idDoIndice(malha.indices[i]), idDoIndice(malha.indices[i + 1]), idDoIndice(malha.indices[i + 2])];
    if (ids.some((id) => id === null)) continue;
    const [id1, id2, id3] = ids as [string, string, string];
    if (id1 === id2 || id2 === id3 || id1 === id3) continue;
    faces.push({ id: opcoes.id + '_f' + String(faces.length + 1), vertices: [id1, id2, id3], triangulada: true });
    criarAresta(id1, id2);
    criarAresta(id2, id3);
    criarAresta(id3, id1);
  }

  if (faces.length === 0) return { ok: false, erro: 'SEM_GEOMETRIA' };
  if (vertices.length === 0) return { ok: false, erro: 'SEM_GEOMETRIA' };

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

/** Toda a importação entra como UMA operação (um passo de undo). */
export function operacoesDeImportacao(solido: Solido): OperacaoModelador[] {
  return [{ tipo: 'criar_solido', solido }];
}

export function processarArquivo(entrada: EntradaImportacao): ResultadoImportacao {
  const formato = detectarFormato(entrada.nome);
  if (formato === null) return { ok: false, erro: 'FORMATO_DESCONHECIDO' };

  let malha: MalhaImportada;
  if (formato === 'glb') {
    const lido = lerGlb(entrada.bytes);
    if (!lido.ok) return { ok: false, erro: lido.erro === 'SEM_GEOMETRIA' ? 'SEM_GEOMETRIA' : 'ARQUIVO_INVALIDO' };
    malha = lido.malha;
  } else if (formato === 'dxf') {
    const texto = new TextDecoder('utf-8').decode(entrada.bytes);
    const lido = lerDxf(texto);
    if (!lido.ok) return { ok: false, erro: lido.erro };
    malha = lido.malha;
  } else if (formato === 'gltf') {
    return { ok: false, erro: 'FORMATO_NAO_SUPORTADO', detalhe: 'use .glb (glTF binário)' };
  } else {
    return {
      ok: false,
      erro: 'FORMATO_NAO_SUPORTADO',
      detalhe: 'IFC exige o parser web-ifc (dependência pesada) — pendente de aprovação',
    };
  }

  const base = entrada.nome.replace(/\.[^.]+$/, '');
  const construido = construirSolido(malha, { id: entrada.idSolido, nome: 'Importado: ' + base });
  if (!construido.ok) return { ok: false, erro: construido.erro };

  const solido = construido.solido;
  return {
    ok: true,
    formato,
    solido,
    resumo:
      formato.toUpperCase() + ' · ' + String(solido.vertices.length) + ' vértices · ' +
      String(solido.faces.length) + ' triângulos · centrado no grid',
  };
}
