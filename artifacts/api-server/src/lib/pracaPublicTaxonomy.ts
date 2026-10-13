/**
 * Public Praça.ai category projection. Feed only marketplace-approved listing
 * rows from a server-side, authorization-scoped query; never use tenant admin
 * category counts to decide public navigation visibility.
 */
export interface PracaTaxonomyNode {
  id: string;
  parentId: string | null;
  name: string;
  active: boolean;
  approved: boolean;
}

export interface PracaPublicListingCategory {
  categoryId: string | null;
  publishToPraca: boolean;
  published: boolean;
  active: boolean;
  approved: boolean;
  eligible: boolean;
}

export interface PracaVisibleCategory extends PracaTaxonomyNode {
  publicListingCount: number;
}

export function publicPracaCategories(
  categories: readonly PracaTaxonomyNode[],
  listings: readonly PracaPublicListingCategory[],
): PracaVisibleCategory[] {
  const nodes = new Map(categories.map(c => [c.id, c]));
  const counts = new Map<string, number>();
  for (const listing of listings) {
    if (!listing.categoryId || !listing.publishToPraca || !listing.published ||
        !listing.active || !listing.approved || !listing.eligible) continue;
    let id: string | null = listing.categoryId;
    const visited = new Set<string>();
    const chain: string[] = [];
    while (id && !visited.has(id)) {
      visited.add(id);
      const node = nodes.get(id);
      if (!node || !node.active || !node.approved) {
        chain.length = 0; // reject broken, disabled or unapproved ancestors
        break;
      }
      chain.push(id);
      id = node.parentId;
    }
    if (id) continue; // cyclic taxonomy: never expose
    for (const categoryId of chain) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }
  return categories.filter(c => counts.has(c.id)).map(c => ({
    ...c,
    publicListingCount: counts.get(c.id)!,
  }));
}
