/**
 * derivar2d — transforma o modelo paramétrico em planta (linhas 2D).
 * Puro: recebe `ElementoBim[]`, devolve `Linha2D[]`. Nada de three/React.
 */

import type {
  ElementoBim,
  Geometria,
  GeometriaJanela,
  GeometriaMobiliario,
  GeometriaParede,
  GeometriaPorta,
} from './schema';

export type TipoLinha2D = 'parede' | 'abertura' | 'esquadria' | 'laje' | 'mobiliario' | 'telhado';

export interface Linha2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tipo: TipoLinha2D;
  elementoId: string;
  camadaId: string;
  tracejada?: boolean;
}

const EPS = 1e-9;

function linha(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tipo: TipoLinha2D,
  elementoId: string,
  camadaId: string,
  tracejada = false,
): Linha2D {
  return { x1, y1, x2, y2, tipo, elementoId, camadaId, tracejada };
}

/** Eixos locais da parede: u ao longo, n normal (meia espessura). */
function eixos(g: GeometriaParede): { ux: number; uy: number; nx: number; ny: number; comprimento: number } | null {
  const dx = g.ponto_b[0] - g.ponto_a[0];
  const dy = g.ponto_b[1] - g.ponto_a[1];
  const comprimento = Math.hypot(dx, dy);
  if (comprimento < EPS) return null;
  const ux = dx / comprimento;
  const uy = dy / comprimento;
  const meia = g.espessura / 2;
  return { ux, uy, nx: -uy * meia, ny: ux * meia, comprimento };
}

export function derivarParede(el: ElementoBim, g: GeometriaParede): Linha2D[] {
  const e = eixos(g);
  if (e === null) return [];

  const ax = g.ponto_a[0];
  const ay = g.ponto_a[1];
  const bx = g.ponto_b[0];
  const by = g.ponto_b[1];

  const saida: Linha2D[] = [
    linha(ax + e.nx, ay + e.ny, bx + e.nx, by + e.ny, 'parede', el.id, el.camadaId),
    linha(ax - e.nx, ay - e.ny, bx - e.nx, by - e.ny, 'parede', el.id, el.camadaId),
    linha(ax + e.nx, ay + e.ny, ax - e.nx, ay - e.ny, 'parede', el.id, el.camadaId),
    linha(bx + e.nx, by + e.ny, bx - e.nx, by - e.ny, 'parede', el.id, el.camadaId),
  ];

  for (const abertura of g.aberturas ?? []) {
    const cx = ax + e.ux * abertura.offset;
    const cy = ay + e.uy * abertura.offset;
    saida.push(linha(cx + e.nx, cy + e.ny, cx - e.nx, cy - e.ny, 'abertura', el.id, el.camadaId, true));
  }

  return saida;
}

function derivarEsquadria(el: ElementoBim, g: GeometriaPorta | GeometriaJanela, paredes: Map<string, GeometriaParede>): Linha2D[] {
  const parede = paredes.get(g.parede_id);
  if (parede === undefined) return [];
  const e = eixos(parede);
  if (e === null) return [];

  const ax = parede.ponto_a[0];
  const ay = parede.ponto_a[1];
  const saida: Linha2D[] = [];
  for (const offset of [g.offset, g.offset + g.largura]) {
    const cx = ax + e.ux * offset;
    const cy = ay + e.uy * offset;
    saida.push(linha(cx + e.nx, cy + e.ny, cx - e.nx, cy - e.ny, 'esquadria', el.id, el.camadaId));
  }
  return saida;
}

function derivarContorno(el: ElementoBim, contorno: readonly (readonly [number, number])[], tipo: TipoLinha2D): Linha2D[] {
  if (contorno.length < 2) return [];
  const saida: Linha2D[] = [];
  for (let i = 0; i < contorno.length; i += 1) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    saida.push(linha(a[0], a[1], b[0], b[1], tipo, el.id, el.camadaId));
  }
  return saida;
}

/** Móvel em planta. Sem `posicao` (D5) não há como posicionar — devolve vazio. */
function derivarMobiliario(el: ElementoBim, g: GeometriaMobiliario): Linha2D[] {
  if (g.posicao === undefined) return [];
  const [cx, cy] = g.posicao;
  const w = g.dimensoes.largura;
  const d = g.dimensoes.profundidade;
  const rad = ((g.rotacaoGraus ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const cantos: [number, number][] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos] as [number, number]);

  return derivarContorno(el, cantos, 'mobiliario');
}

export function derivar2d(elementos: readonly ElementoBim[]): Linha2D[] {
  const paredes = new Map<string, GeometriaParede>();
  for (const el of elementos) {
    if (el.tipo === 'parede') paredes.set(el.id, el.geometria as GeometriaParede);
  }

  const linhas: Linha2D[] = [];
  for (const el of elementos) {
    const g: Geometria = el.geometria;
    switch (el.tipo) {
      case 'parede':
        linhas.push(...derivarParede(el, g as GeometriaParede));
        break;
      case 'porta':
      case 'janela':
        linhas.push(...derivarEsquadria(el, g as GeometriaPorta | GeometriaJanela, paredes));
        break;
      case 'laje':
        linhas.push(...derivarContorno(el, (g as { contorno: [number, number][] }).contorno, 'laje'));
        break;
      case 'telhado':
        linhas.push(...derivarContorno(el, (g as { contorno: [number, number][] }).contorno, 'telhado'));
        break;
      case 'mobiliario':
        linhas.push(...derivarMobiliario(el, g as GeometriaMobiliario));
        break;
    }
  }
  return linhas;
}