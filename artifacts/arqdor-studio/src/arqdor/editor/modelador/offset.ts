/**
 * Offset de face (item 7) — borda paralela interna, em planta (X, Z).
 *
 * Uso no fluxo SketchUp: seleciona a face → offset 15 cm → aparece a borda interna →
 * puxa a parte de dentro para baixo, criando a parede com espessura.
 *
 * Puro: polígono 2D entra, polígono 2D sai. Só convexo por enquanto — côncavo exige
 * tratamento de auto-interseção, que fica registrado como limite.
 */

import type { Aresta, Solido, Vertice, Vetor3 } from './schema';

const EPS = 1e-9;

export type Ponto2D = [number, number];

/** Área assinada: positiva em CCW (no plano X,Z). */
export function areaAssinada(pontos: readonly Ponto2D[]): number {
  let soma = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a[0] * b[1] - b[0] * a[1];
  }
  return soma / 2;
}

interface Linha {
  p: Ponto2D;
  d: Ponto2D;
}

function intersectar(l1: Linha, l2: Linha): Ponto2D | null {
  const denom = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
  if (Math.abs(denom) < EPS) return null;
  const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / denom;
  return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t];
}

export type OffsetResultado =
  | { ok: true; contorno: Ponto2D[]; areaInterna: number }
  | { ok: false; erro: 'POLIGONO_INVALIDO' | 'OFFSET_COLAPSOU' | 'PARALELAS' };

/**
 * Encostar a borda `distancia` metros para dentro.
 * `distancia` negativa expande para fora.
 */
export function offsetPoligono(pontos: readonly Ponto2D[], distancia: number): OffsetResultado {
  if (pontos.length < 3) return { ok: false, erro: 'POLIGONO_INVALIDO' };
  if (!Number.isFinite(distancia) || Math.abs(distancia) < EPS) {
    return { ok: false, erro: 'POLIGONO_INVALIDO' };
  }

  const n = pontos.length;
  const ccw = areaAssinada(pontos) > 0;
  const linhas: Linha[] = [];

  for (let i = 0; i < n; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const comprimento = Math.hypot(dx, dz);
    if (comprimento < EPS) return { ok: false, erro: 'POLIGONO_INVALIDO' };
    const ux = dx / comprimento;
    const uz = dz / comprimento;
    // normal interna: para CCW em (x,z), girar a direção 90° para dentro
    const nx = ccw ? -uz : uz;
    const nz = ccw ? ux : -ux;
    linhas.push({ p: [a[0] + nx * distancia, a[1] + nz * distancia], d: [ux, uz] });
  }

  const contorno: Ponto2D[] = [];
  for (let i = 0; i < n; i += 1) {
    const anterior = linhas[(i - 1 + n) % n];
    const atual = linhas[i];
    const ponto = intersectar(anterior, atual);
    if (ponto === null) return { ok: false, erro: 'PARALELAS' };
    contorno.push(ponto);
  }

  // Colapso: se alguma aresta do contorno inverteu o sentido, o offset "atravessou" o
  // polígono (caso clássico: encolher mais que metade da largura). Área positiva não basta —
  // um quadrado 4×4 com offset 2,5 gera um quadrado 1×1 com arestas todas invertidas.
  for (let i = 0; i < n; i += 1) {
    const atual = contorno[i];
    const proximo = contorno[(i + 1) % n];
    const dx = proximo[0] - atual[0];
    const dz = proximo[1] - atual[1];
    const comprimento = Math.hypot(dx, dz);
    if (comprimento < EPS) return { ok: false, erro: 'OFFSET_COLAPSOU' };
    const produto = (dx / comprimento) * linhas[i].d[0] + (dz / comprimento) * linhas[i].d[1];
    if (produto < 0) return { ok: false, erro: 'OFFSET_COLAPSOU' };
  }

  const areaInterna = Math.abs(areaAssinada(contorno));
  const areaOriginal = Math.abs(areaAssinada(pontos));
  const virou = areaAssinada(contorno) > 0 !== ccw;
  if (areaInterna < EPS || virou || (distancia > 0 && areaInterna >= areaOriginal)) {
    return { ok: false, erro: 'OFFSET_COLAPSOU' };
  }

  return { ok: true, contorno, areaInterna };
}

export type OffsetFaceErro =
  | 'FACE_INEXISTENTE'
  | 'FACE_DEGENERADA'
  | 'OFFSET_COLAPSOU'
  | 'POLIGONO_INVALIDO';

export type OffsetFaceResultado =
  | { ok: true; vertices: Vertice[]; arestas: Aresta[]; areaInterna: number; contorno: Ponto2D[] }
  | { ok: false; erro: OffsetFaceErro };

function produto(a: Vetor3, b: Vetor3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizar(v: Vetor3): Vetor3 | null {
  const comprimento = Math.hypot(v[0], v[1], v[2]);
  if (comprimento < EPS) return null;
  return [v[0] / comprimento, v[1] / comprimento, v[2] / comprimento];
}

/** Normal pelo método de Newell — vale para polígono em qualquer orientação. */
function normalDaFace(pontos: readonly Vetor3[]): Vetor3 | null {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pontos.length; i += 1) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalizar([x, y, z]);
}

/** Base ortonormal do plano da face: origem + u (primeira aresta) + v (normal × u). */
function baseDaFace(pontos: readonly Vetor3[]): { origem: Vetor3; u: Vetor3; v: Vetor3 } | null {
  const normal = normalDaFace(pontos);
  if (normal === null) return null;
  const primeira = pontos[1];
  const u = normalizar([
    primeira[0] - pontos[0][0],
    primeira[1] - pontos[0][1],
    primeira[2] - pontos[0][2],
  ]);
  if (u === null) return null;
  const v = normalizar([
    normal[1] * u[2] - normal[2] * u[1],
    normal[2] * u[0] - normal[0] * u[2],
    normal[0] * u[1] - normal[1] * u[0],
  ]);
  if (v === null) return null;
  return { origem: pontos[0], u, v };
}

/**
 * Offset de face em QUALQUER plano — o contorno é resolvido na base da própria face
 * (u = primeira aresta, v = normal × u), não mais só em planta (X, Z). Face vertical
 * deixou de ser recusada.
 *
 * Ids determinísticos: repetir o mesmo offset devolve os mesmos ids, então undo/redo e
 * reaplicação não duplicam geometria invisível.
 */
export function offsetDaFace(
  solido: Solido,
  faceId: string,
  distancia: number,
  prefixo = 'off',
): OffsetFaceResultado {
  const face = solido.faces.find((item) => item.id === faceId);
  if (face === undefined) return { ok: false, erro: 'FACE_INEXISTENTE' };

  const mapa = new Map(solido.vertices.map((vertice) => [vertice.id, vertice.posicao]));
  const pontos: Vetor3[] = [];
  for (const id of face.vertices) {
    const posicao = mapa.get(id);
    if (posicao === undefined) return { ok: false, erro: 'FACE_DEGENERADA' };
    pontos.push(posicao);
  }
  if (pontos.length < 3) return { ok: false, erro: 'FACE_DEGENERADA' };

  const base = baseDaFace(pontos);
  if (base === null) return { ok: false, erro: 'FACE_DEGENERADA' };

  const recuo = offsetPoligono(
    pontos.map((ponto): Ponto2D => {
      const relativo: Vetor3 = [
        ponto[0] - base.origem[0],
        ponto[1] - base.origem[1],
        ponto[2] - base.origem[2],
      ];
      return [produto(relativo, base.u), produto(relativo, base.v)];
    }),
    distancia,
  );
  if (!recuo.ok) {
    return { ok: false, erro: recuo.erro === 'POLIGONO_INVALIDO' ? 'POLIGONO_INVALIDO' : 'OFFSET_COLAPSOU' };
  }

  const vertices: Vertice[] = recuo.contorno.map((ponto, indice) => ({
    id: solido.id + '/' + faceId + '/' + prefixo + String(indice),
    posicao: [
      base.origem[0] + base.u[0] * ponto[0] + base.v[0] * ponto[1],
      base.origem[1] + base.u[1] * ponto[0] + base.v[1] * ponto[1],
      base.origem[2] + base.u[2] * ponto[0] + base.v[2] * ponto[1],
    ] as Vetor3,
  }));
  const arestas: Aresta[] = vertices.map((vertice, indice) => ({
    id: solido.id + '/' + faceId + '/' + prefixo + 'a' + String(indice),
    verticeA: vertice.id,
    verticeB: vertices[(indice + 1) % vertices.length].id,
  }));

  return { ok: true, vertices, arestas, areaInterna: recuo.areaInterna, contorno: recuo.contorno };
}
