/**
 * Catálogo de materiais — puro e imutável.
 *
 * Cada operação devolve um NOVO catálogo: quem chama decide quando publicar. Isso evita o clássico
 * "alterei o preço no meio do cálculo do orçamento".
 */

import { CATALOGO_PADRAO, MATERIAL_INDEFINIDO } from './schema';
import type { FontePreco, Material } from './schema';

export type Catalogo = readonly Material[];

export function catalogoPadrao(): Catalogo {
  return CATALOGO_PADRAO.map((material) => ({ ...material }));
}

export function obterMaterial(catalogo: Catalogo, id: string | null): Material {
  if (id === null) return MATERIAL_INDEFINIDO;
  const encontrado = catalogo.find((material) => material.id === id);
  return encontrado ?? MATERIAL_INDEFINIDO;
}

export function existeMaterial(catalogo: Catalogo, id: string): boolean {
  return catalogo.some((material) => material.id === id);
}

export type ResultadoCatalogo =
  | { ok: true; catalogo: Catalogo }
  | { ok: false; erro: 'MATERIAL_DUPLICADO' | 'PRECO_INVALIDO' | 'MATERIAL_NAO_ENCONTRADO' };

export function adicionarMaterial(catalogo: Catalogo, material: Material): ResultadoCatalogo {
  if (!Number.isFinite(material.precoUnitario) || material.precoUnitario < 0) {
    return { ok: false, erro: 'PRECO_INVALIDO' };
  }
  if (existeMaterial(catalogo, material.id)) {
    return { ok: false, erro: 'MATERIAL_DUPLICADO' };
  }
  return { ok: true, catalogo: [...catalogo, { ...material }] };
}

/**
 * Atualiza o preço vigente. `fontePreco` registra a procedência — sobrescrever um preço SINAPI
 * com resposta de fornecedor vira fonte COTACAO, e isso precisa ficar rastreável.
 */
export function atualizarPrecoUnitario(
  catalogo: Catalogo,
  materialId: string,
  precoUnitario: number,
  fontePreco: FontePreco,
  atualizadoEm?: string,
): ResultadoCatalogo {
  if (!Number.isFinite(precoUnitario) || precoUnitario < 0) {
    return { ok: false, erro: 'PRECO_INVALIDO' };
  }
  if (!existeMaterial(catalogo, materialId)) {
    return { ok: false, erro: 'MATERIAL_NAO_ENCONTRADO' };
  }
  return {
    ok: true,
    catalogo: catalogo.map((material) =>
      material.id === materialId
        ? { ...material, precoUnitario, fontePreco, atualizadoEm: atualizadoEm ?? material.atualizadoEm }
        : material,
    ),
  };
}

export function listarPorCategoria(catalogo: Catalogo, categoria: Material['categoria']): Material[] {
  return catalogo.filter((material) => material.categoria === categoria).map((material) => ({ ...material }));
}
