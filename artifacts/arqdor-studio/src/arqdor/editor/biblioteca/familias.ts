/**
 * Biblioteca de Interiores — famílias (M2).
 *
 * Família é CATÁLOGO: identidade estável + dimensões + LOD. Não é o móvel paramétrico do
 * modelador (`moveis/`), que tem painéis e ferragens. Colocar uma família gera um sólido e um
 * `ElementoBim` de mobiliário; o vínculo é opcional (ADR-003).
 *
 * LOD existe por custo: no viewport todo móvel é caixa; o asset detalhado só entra no render.
 */

import type { Categoria } from '../orcamento/quantitativos';

export type CategoriaFamilia = 'assento' | 'mesa' | 'armario' | 'cama' | 'eletro' | 'decor';

export interface DimensoesFamilia {
  largura: number;
  altura: number;
  profundidade: number;
}

export interface FamiliaMovel {
  id: string;
  nome: string;
  categoria: CategoriaFamilia;
  dimensoes: DimensoesFamilia;
  /** Caixa no preview (viewport); asset detalhado só no render. */
  lod: { simples: 'caixa'; detalhado?: string };
  materialPadraoId?: string;
  tags?: readonly string[];
}

/** Catálogo inicial — medidas de mercado, não medidas de projeto. */
export const FAMILIAS_PADRAO: readonly FamiliaMovel[] = [
  {
    id: 'FAM-CADEIRA',
    nome: 'Cadeira de jantar',
    categoria: 'assento',
    dimensoes: { largura: 0.45, altura: 0.9, profundidade: 0.45 },
    lod: { simples: 'caixa' },
    tags: ['jantar', 'madeira'],
  },
  {
    id: 'FAM-MESA-JANTAR',
    nome: 'Mesa de jantar 6 lugares',
    categoria: 'mesa',
    dimensoes: { largura: 1.6, altura: 0.75, profundidade: 0.9 },
    lod: { simples: 'caixa' },
    tags: ['jantar'],
  },
  {
    id: 'FAM-ARMARIO',
    nome: 'Armário 4 portas',
    categoria: 'armario',
    dimensoes: { largura: 2, altura: 2.2, profundidade: 0.6 },
    lod: { simples: 'caixa' },
    tags: ['quarto', 'sala'],
  },
  {
    id: 'FAM-CAMA-CASAL',
    nome: 'Cama de casal',
    categoria: 'cama',
    dimensoes: { largura: 1.58, altura: 0.6, profundidade: 1.98 },
    lod: { simples: 'caixa' },
    tags: ['quarto'],
  },
  {
    id: 'FAM-GELADEIRA',
    nome: 'Geladeira frost free',
    categoria: 'eletro',
    dimensoes: { largura: 0.7, altura: 1.8, profundidade: 0.7 },
    lod: { simples: 'caixa' },
    tags: ['cozinha', 'eletro'],
  },
  {
    id: 'FAM-LUMINARIA',
    nome: 'Luminária de piso',
    categoria: 'decor',
    dimensoes: { largura: 0.35, altura: 1.6, profundidade: 0.35 },
    lod: { simples: 'caixa' },
    tags: ['sala', 'iluminação'],
  },
];

/** Categoria do orçamento para todo móvel de biblioteca. */
export const CATEGORIA_ORCAMENTO_MOVEL: Categoria = 'mobiliario';

export function obterFamilia(familias: readonly FamiliaMovel[], id: string): FamiliaMovel | null {
  return familias.find((familia) => familia.id === id) ?? null;
}

export interface FiltroFamilia {
  categoria?: CategoriaFamilia;
  /** Busca simples no nome e nas tags, sem acento e sem caixa. */
  termo?: string;
  larguraMaxima?: number;
  profundidadeMaxima?: number;
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function buscarFamilias(
  familias: readonly FamiliaMovel[],
  filtro: FiltroFamilia = {},
): FamiliaMovel[] {
  const termo = filtro.termo === undefined ? null : normalizar(filtro.termo.trim());
  return familias.filter((familia) => {
    if (filtro.categoria !== undefined && familia.categoria !== filtro.categoria) return false;
    if (filtro.larguraMaxima !== undefined && familia.dimensoes.largura > filtro.larguraMaxima) return false;
    if (filtro.profundidadeMaxima !== undefined && familia.dimensoes.profundidade > filtro.profundidadeMaxima) return false;
    if (termo === null || termo.length === 0) return true;
    const alvo = normalizar(familia.nome + ' ' + (familia.tags ?? []).join(' '));
    return alvo.includes(termo);
  });
}

/** Só famílias com dimensão válida podem ser colocadas. */
export function familiaValida(familia: FamiliaMovel): boolean {
  return (
    Number.isFinite(familia.dimensoes.largura) &&
    Number.isFinite(familia.dimensoes.altura) &&
    Number.isFinite(familia.dimensoes.profundidade) &&
    familia.dimensoes.largura > 0 &&
    familia.dimensoes.altura > 0 &&
    familia.dimensoes.profundidade > 0
  );
}
