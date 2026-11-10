/**
 * Colocar família no projeto (M2) — gera o sólido e o `ElementoBim` de mobiliário.
 *
 * ADR-003: o vínculo é OPCIONAL e não há FK rígida. O elemento sobrevive sozinho (tem
 * `dimensoes` e `posicao` próprias); `modeladorSolidoId` é só o atalho para a geometria fina.
 * Remover o sólido apenas zera o vínculo — orçamento e render não perdem o móvel.
 */

import type { ElementoBim, GeometriaMobiliario } from '../bim/schema';
import { criarCaixa } from '../modelador/caixa';
import type { Solido } from '../modelador/schema';
import type { FamiliaMovel } from './familias';
import { familiaValida } from './familias';

export interface EntradaColocacao {
  familia: FamiliaMovel;
  /** Posição em planta (x, z) — canto mínimo do móvel. */
  posicao: [number, number];
  /** Rotação em planta, graus, anti-horário. */
  rotacaoGraus?: number;
  nivel?: number;
  projetoId: string;
  camadaId: string;
  /** Id do sólido no modelador; o elemento deriva `el_<id>`. */
  idSolido: string;
  nome?: string;
}

export type ResultadoColocacao =
  | { ok: true; solido: Solido; elemento: ElementoBim }
  | { ok: false; erro: 'FAMILIA_INVALIDA' | 'POSICAO_INVALIDA' };

export function colocarFamilia(entrada: EntradaColocacao): ResultadoColocacao {
  if (!familiaValida(entrada.familia)) return { ok: false, erro: 'FAMILIA_INVALIDA' };
  const [x, z] = entrada.posicao;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { ok: false, erro: 'POSICAO_INVALIDA' };

  const { largura, altura, profundidade } = entrada.familia.dimensoes;
  const caixa = criarCaixa({
    id: entrada.idSolido,
    nome: entrada.nome ?? entrada.familia.nome,
    posicao: [x, 0, z],
    dimensoes: { largura, altura, profundidade },
  });
  if (!caixa.ok) return { ok: false, erro: 'FAMILIA_INVALIDA' };

  const geometria: GeometriaMobiliario = {
    modeladorSolidoId: caixa.solido.id,
    dimensoes: { largura, altura, profundidade },
    categoria: entrada.familia.categoria,
    posicao: [x, z],
    rotacaoGraus: entrada.rotacaoGraus ?? 0,
    familiaId: entrada.familia.id,
  };

  const elemento: ElementoBim = {
    id: 'el_' + entrada.idSolido,
    projetoId: entrada.projetoId,
    tipo: 'mobiliario',
    nivel: entrada.nivel ?? 1,
    geometria,
    propriedades: {
      familiaId: entrada.familia.id,
      familiaNome: entrada.familia.nome,
    },
    camadaId: entrada.camadaId,
    materialId: entrada.familia.materialPadraoId,
  };

  return { ok: true, solido: caixa.solido, elemento };
}

/** Zera o vínculo com o sólido, mantendo o elemento (ADR-003). */
export function desvincularSolido(elemento: ElementoBim): ElementoBim {
  if (elemento.tipo !== 'mobiliario') return elemento;
  const geometria = elemento.geometria as GeometriaMobiliario;
  const { modeladorSolidoId: _descartado, ...resto } = geometria;
  void _descartado;
  return { ...elemento, geometria: resto };
}

/** Refaz o vínculo com um sólido existente. */
export function vincularSolido(elemento: ElementoBim, solidoId: string): ElementoBim {
  if (elemento.tipo !== 'mobiliario') return elemento;
  const geometria = elemento.geometria as GeometriaMobiliario;
  return { ...elemento, geometria: { ...geometria, modeladorSolidoId: solidoId } };
}

/** O elemento tem geometria fina vinculada? */
export function temVinculo(elemento: ElementoBim): boolean {
  if (elemento.tipo !== 'mobiliario') return false;
  return (elemento.geometria as GeometriaMobiliario).modeladorSolidoId !== undefined;
}

/** Família de origem do elemento (null quando colocado à mão, sem biblioteca). */
export function familiaDoElemento(elemento: ElementoBim): string | null {
  if (elemento.tipo !== 'mobiliario') return null;
  return (elemento.geometria as GeometriaMobiliario).familiaId ?? null;
}
