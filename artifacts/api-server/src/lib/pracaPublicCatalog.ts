import { publicPracaCategories, type PracaPublicListingCategory, type PracaTaxonomyNode } from "./pracaPublicTaxonomy";

export type PracaPublicKind = "product" | "service";
export interface PracaListingCandidate extends PracaPublicListingCategory {
  id: string;
  kind: PracaPublicKind;
  title: string;
  description?: string | null;
  sellerName: string;
  price?: number | null;
  imageUrl?: string | null;
}
export interface PracaPublicCard {
  id: string;
  kind: PracaPublicKind;
  title: string;
  description: string | null;
  categoryId: string;
  sellerName: string;
  price: number | null;
  imageUrl: string | null;
}
export interface PracaPublicCatalog {
  categories: ReturnType<typeof publicPracaCategories>;
  items: PracaPublicCard[];
  total: number;
}

/** Pure view projection, NOT a public database endpoint or authorization gate.
 * Input MUST come from server-side filtered, approved public listings.
 */
export function buildPracaPublicCatalog(
  categories: readonly PracaTaxonomyNode[],
  candidates: readonly PracaListingCandidate[],
  opts: { search?: string; categoryId?: string; kind?: PracaPublicKind } = {},
): PracaPublicCatalog {
  const taxonomy = publicPracaCategories(categories, candidates);
  const visibleIds = new Set(taxonomy.map(c => c.id));
  const byId = new Map(categories.map(c => [c.id, c]));
  const query = (opts.search ?? "").trim().toLocaleLowerCase("pt-BR");
  const isChildOf = (id: string, target: string): boolean => {
    let current: string | null = id;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current === target) return true;
      visited.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return false;
  };
  const items = candidates
    .filter(c => c.publishToPraca && c.published && c.active && c.approved && c.eligible &&
      !!c.categoryId && visibleIds.has(c.categoryId) && !!c.title.trim() &&
      (!opts.kind || c.kind === opts.kind) &&
      (!opts.categoryId || isChildOf(c.categoryId, opts.categoryId)) &&
      (!query || [c.title, c.description ?? "", c.sellerName].some(v => v.toLocaleLowerCase("pt-BR").includes(query))))
    .map(({ id, kind, title, description, sellerName, price, imageUrl, categoryId }) => ({
      id, kind, title, description: description ?? null, sellerName,
      categoryId: categoryId!, price: price ?? null, imageUrl: imageUrl ?? null,
    }));
  return { categories: taxonomy, items, total: items.length };
}
