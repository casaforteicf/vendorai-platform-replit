/**
 * Compatibilização MEP × estrutura por AABB (D11: AABB no MVP, SAT quando houver falso positivo).
 *
 * Aproximação declarada (D7): `ElementoBim.nivel` é inteiro SEM altura, então o eixo Y é
 * estimado por `alturaNivelPadraoM * nivel`. Sem isso não há como dizer se um tubo a 1,20 m
 * passa por cima ou por dentro de uma laje do pavimento superior.
 */

import type { ElementoBim, GeometriaLaje, GeometriaParede } from '../bim/schema';
import type { ElementoMEP } from './schema';
import type { Vetor3 } from '../modelador/schema';

export interface Aabb {
  min: Vetor3;
  max: Vetor3;
}

export interface OpcoesColisao {
  /** Folga de segurança somada aos dois lados (m). Padrão 5 cm. */
  margemM?: number;
  /** Diâmetro assumido quando o elemento MEP não declara `diametroMm`. */
  diametroPadraoMm?: number;
  /** Altura de piso a piso usada para posicionar o nível (D7). */
  alturaNivelPadraoM?: number;
  /** Tomada/interruptor encostado na própria parede não é conflito. */
  ignorarTomadasNaParede?: boolean;
}

export const MARGEM_PADRAO_M = 0.05;
export const DIAMETRO_PADRAO_MM = 50;
export const ALTURA_NIVEL_PADRAO_M = 3;

function vazio(): Aabb {
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

export function aabbDoSegmento(a: Vetor3, b: Vetor3, raio: number): Aabb {
  return {
    min: [Math.min(a[0], b[0]) - raio, Math.min(a[1], b[1]) - raio, Math.min(a[2], b[2]) - raio],
    max: [Math.max(a[0], b[0]) + raio, Math.max(a[1], b[1]) + raio, Math.max(a[2], b[2]) + raio],
  };
}

export function aabbDaParede(g: GeometriaParede, alturaBase = 0): Aabb {
  const meia = g.espessura / 2;
  const ax = g.ponto_a[0];
  const az = g.ponto_a[1];
  const bx = g.ponto_b[0];
  const bz = g.ponto_b[1];
  return {
    min: [Math.min(ax, bx) - meia, alturaBase, Math.min(az, bz) - meia],
    max: [Math.max(ax, bx) + meia, alturaBase + g.altura, Math.max(az, bz) + meia],
  };
}

export function aabbDaLaje(g: GeometriaLaje, alturaBase = 0): Aabb {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of g.contorno) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) return vazio();
  return {
    min: [minX, alturaBase, minZ],
    max: [maxX, alturaBase + g.espessura, maxZ],
  };
}

export function aabbDoMep(el: ElementoMEP, diametroPadraoMm = DIAMETRO_PADRAO_MM): Aabb | null {
  if (el.caminho.length === 0) return null;
  const diametroM = (el.diametroMm ?? diametroPadraoMm) / 1000;
  const raio = diametroM / 2;

  let caixa = aabbDoSegmento(el.caminho[0], el.caminho[0], raio);
  for (let i = 1; i < el.caminho.length; i += 1) {
    const trecho = aabbDoSegmento(el.caminho[i - 1], el.caminho[i], raio);
    caixa = {
      min: [
        Math.min(caixa.min[0], trecho.min[0]),
        Math.min(caixa.min[1], trecho.min[1]),
        Math.min(caixa.min[2], trecho.min[2]),
      ],
      max: [
        Math.max(caixa.max[0], trecho.max[0]),
        Math.max(caixa.max[1], trecho.max[1]),
        Math.max(caixa.max[2], trecho.max[2]),
      ],
    };
  }
  return caixa;
}

export function expandir(caixa: Aabb, margem: number): Aabb {
  return {
    min: [caixa.min[0] - margem, caixa.min[1] - margem, caixa.min[2] - margem],
    max: [caixa.max[0] + margem, caixa.max[1] + margem, caixa.max[2] + margem],
  };
}

export function intersecciona(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

/** Volume da interseção — serve para ranquear a gravidade do conflito. */
export function volumeInterseccao(a: Aabb, b: Aabb): number {
  if (!intersecciona(a, b)) return 0;
  const dx = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const dy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const dz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return Math.max(0, dx) * Math.max(0, dy) * Math.max(0, dz);
}

export type MotivoIgnorado = 'tomada_na_parede';

export interface Conflito {
  mepId: string;
  elementoId: string;
  tipoElemento: ElementoBim['tipo'];
  nivel: number;
  volumeM3: number;
  caixa: Aabb;
}

export interface ResultadoColisao {
  conflitos: Conflito[];
  /** Contatos intencionais que NÃO são conflito (com motivo). */
  ignorados: Array<{ mepId: string; elementoId: string; motivo: MotivoIgnorado }>;
  elementosSemGeometria: string[];
}

const ESTRUTURAIS: ReadonlyArray<ElementoBim['tipo']> = ['parede', 'laje'];
const NA_PAREDE: ReadonlyArray<ElementoMEP['tipo']> = ['tomada', 'interruptor', 'ponto_luz', 'registro'];

export function detectarConflitos(
  mep: readonly ElementoMEP[],
  bim: readonly ElementoBim[],
  opcoes: OpcoesColisao = {},
): ResultadoColisao {
  const margem = opcoes.margemM ?? MARGEM_PADRAO_M;
  const diametroPadrao = opcoes.diametroPadraoMm ?? DIAMETRO_PADRAO_MM;
  const alturaNivel = opcoes.alturaNivelPadraoM ?? ALTURA_NIVEL_PADRAO_M;
  const ignorarTomadas = opcoes.ignorarTomadasNaParede ?? true;

  const estruturais = bim.filter((el) => ESTRUTURAIS.includes(el.tipo));

  const conflitos: Conflito[] = [];
  const ignorados: ResultadoColisao['ignorados'] = [];
  const semGeometria: string[] = [];

  for (const elementoMep of mep) {
    const caixaMep = aabbDoMep(elementoMep, diametroPadrao);
    if (caixaMep === null) {
      semGeometria.push(elementoMep.id);
      continue;
    }
    const caixaExpandida = expandir(caixaMep, margem);

    for (const estrutural of estruturais) {
      const base = (estrutural.nivel ?? 0) * alturaNivel;
      const caixaEstrutura =
        estrutural.tipo === 'parede'
          ? aabbDaParede(estrutural.geometria as GeometriaParede, base)
          : aabbDaLaje(estrutural.geometria as GeometriaLaje, base);

      if (!intersecciona(caixaExpandida, caixaEstrutura)) continue;

      const ancorado = elementoMep.paredeId !== undefined && elementoMep.paredeId === estrutural.id;
      if (ignorarTomadas && ancorado && NA_PAREDE.includes(elementoMep.tipo)) {
        ignorados.push({ mepId: elementoMep.id, elementoId: estrutural.id, motivo: 'tomada_na_parede' });
        continue;
      }

      conflitos.push({
        mepId: elementoMep.id,
        elementoId: estrutural.id,
        tipoElemento: estrutural.tipo,
        nivel: estrutural.nivel,
        volumeM3: volumeInterseccao(caixaExpandida, caixaEstrutura),
        caixa: caixaExpandida,
      });
    }
  }

  conflitos.sort((a, b) => b.volumeM3 - a.volumeM3);
  return { conflitos, ignorados, elementosSemGeometria: semGeometria };
}