/**
 * Offset de face (item 7) — borda paralela interna, em planta (X, Z).
 *
 * Uso no fluxo SketchUp: seleciona a face → offset 15 cm → aparece a borda interna →
 * puxa a parte de dentro para baixo, criando a parede com espessura.
 *
 * Puro: polígono 2D entra, polígono 2D sai. Só convexo por enquanto — côncavo exige
 * tratamento de auto-interseção, que fica registrado como limite.
 */

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
