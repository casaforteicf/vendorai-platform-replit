import type { Aresta, OperacaoModelador, Plano, Solido, Vetor3, Vertice } from '../schema';
import { doEspacoPlano, paraEspacoPlano } from '../plano';
import { idVertice } from './linha';

export type ErroArco = { codigo: 'PONTOS_COLINEARES' } | { codigo: 'ARCO_DEGENERADO' };

export type ResultadoArco =
  | { ok: true; operacoes: OperacaoModelador[] }
  | { ok: false; erro: ErroArco };

/**
 * Arco por 3 pontos (A, B na curva, C no fim).
 * Centro pelo circuncentro em coordenadas do plano; varredura no sentido anti-horário
 * e normalizada — o arco sempre passa por B.
 */
export function criarArco(entrada: {
  solido: Solido;
  plano: Plano;
  a: Vetor3;
  b: Vetor3;
  c: Vetor3;
  segmentos?: number;
}): ResultadoArco {
  const n = Math.max(2, Math.floor(entrada.segmentos ?? 16));
  const [ax, ay] = paraEspacoPlano(entrada.a, entrada.plano);
  const [bx, by] = paraEspacoPlano(entrada.b, entrada.plano);
  const [cx, cy] = paraEspacoPlano(entrada.c, entrada.plano);

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return { ok: false, erro: { codigo: 'PONTOS_COLINEARES' } };

  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const raio = Math.hypot(ax - ux, ay - uy);
  if (raio < 1e-6) return { ok: false, erro: { codigo: 'ARCO_DEGENERADO' } };

  const ang = (x: number, y: number): number => {
    const t = Math.atan2(y - uy, x - ux);
    return t < 0 ? t + 2 * Math.PI : t;
  };
  const a0 = ang(ax, ay);
  const aM = ang(bx, by);
  const a1 = ang(cx, cy);

  const normalizar = (v: number): number => (v - a0 + 2 * Math.PI) % (2 * Math.PI);
  const delta = normalizar(a1);
  const passaPorB = normalizar(aM) <= delta;

  const vertices: Vertice[] = [];
  const total = Math.max(2, Math.round(n * (delta / (2 * Math.PI))));
  for (let i = 0; i <= total; i += 1) {
    const t = a0 + delta * (passaPorB ? i / total : i / total);
    const uv: [number, number] = [ux + raio * Math.cos(t), uy + raio * Math.sin(t)];
    vertices.push({ id: idVertice(), posicao: doEspacoPlano(uv, entrada.plano) });
  }

  const arestas: Aresta[] = vertices.slice(0, -1).map((v, i) => ({
    id: idVertice(),
    verticeA: v.id,
    verticeB: vertices[i + 1].id,
  }));

  return {
    ok: true,
    operacoes: [
      { tipo: 'adicionar_vertices', solidoId: entrada.solido.id, vertices },
      { tipo: 'adicionar_arestas', solidoId: entrada.solido.id, arestas },
    ],
  };
}