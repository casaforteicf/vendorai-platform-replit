/**
 * Push/Pull — extrusão de uma face.
 *
 * Devolve as operações (nunca muta o sólido): adiciona topo, arestas verticais,
 * faces laterais, fecha com a face de topo e remove a face original.
 * Uma família de operações = um único PassoUndo.
 */

import type { Aresta, Face, OperacaoModelador, Solido, Vetor3, Vertice } from './schema';
import { add, normalize, scale } from './plano';

export const TOL_PUSHPULL = 1e-6;

export type ErroPushPull =
  | { codigo: 'FACE_NAO_ENCONTRADA'; faceId: string }
  | { codigo: 'FACE_DEGENERADA'; faceId: string; vertices: number }
  | { codigo: 'ALTURA_NULA'; altura: number };

export type ResultadoPushPull =
  | { ok: true; operacoes: OperacaoModelador[] }
  | { ok: false; erro: ErroPushPull };

function normalDaFace(solido: Solido, face: Face): Vetor3 {
  const pontos: Vetor3[] = [];
  for (const id of face.vertices) {
    const v = solido.vertices.find((candidato) => candidato.id === id);
    if (v !== undefined) pontos.push(v.posicao);
  }
  if (pontos.length < 3) return [0, 1, 0];

  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize([nx, ny, nz]);
}

function novoId(): string {
  return globalThis.crypto.randomUUID();
}

export function calcularPushPull(solido: Solido, faceId: string, altura: number): ResultadoPushPull {
  if (Math.abs(altura) < TOL_PUSHPULL) return { ok: false, erro: { codigo: 'ALTURA_NULA', altura } };

  const face = solido.faces.find((candidata) => candidata.id === faceId);
  if (face === undefined) return { ok: false, erro: { codigo: 'FACE_NAO_ENCONTRADA', faceId } };

  const base: Vertice[] = [];
  for (const id of face.vertices) {
    const v = solido.vertices.find((candidato) => candidato.id === id);
    if (v !== undefined) base.push(v);
  }
  if (base.length < 3) {
    return { ok: false, erro: { codigo: 'FACE_DEGENERADA', faceId, vertices: base.length } };
  }

  const deslocamento = scale(normalDaFace(solido, face), altura);
  const operacoes: OperacaoModelador[] = [];

  const topo: Vertice[] = base.map((v) => ({ id: novoId(), posicao: add(v.posicao, deslocamento) }));
  operacoes.push({ tipo: 'adicionar_vertices', solidoId: solido.id, vertices: topo });

  const verticais: Aresta[] = [];
  for (let i = 0; i < base.length; i += 1) {
    verticais.push({ id: novoId(), verticeA: base[i].id, verticeB: topo[i].id });
  }
  operacoes.push({ tipo: 'adicionar_arestas', solidoId: solido.id, arestas: verticais });

  const arestasTopo: Aresta[] = [];
  for (let i = 0; i < topo.length; i += 1) {
    arestasTopo.push({ id: novoId(), verticeA: topo[i].id, verticeB: topo[(i + 1) % topo.length].id });
  }
  operacoes.push({ tipo: 'adicionar_arestas', solidoId: solido.id, arestas: arestasTopo });

  const laterais: Face[] = [];
  for (let i = 0; i < base.length; i += 1) {
    const j = (i + 1) % base.length;
    laterais.push({ id: novoId(), vertices: [base[i].id, base[j].id, topo[j].id, topo[i].id] });
  }
  operacoes.push({ tipo: 'adicionar_faces', solidoId: solido.id, faces: laterais });

  operacoes.push({
    tipo: 'adicionar_faces',
    solidoId: solido.id,
    faces: [{ id: novoId(), vertices: topo.map((v) => v.id), material: face.material }],
  });

  // A face-base PERMANECE: sem ela o sólido sai aberto (5 faces em vez de 6).
  // D9 registrado: antes a extrusão removia a base e a caixa ficava sem fundo.

  return { ok: true, operacoes };
}