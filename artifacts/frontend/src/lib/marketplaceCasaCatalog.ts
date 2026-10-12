/** UI-01 — Marketplace Casa vertical layered over the existing marketplace engine.
 * No second inventory, checkout, order, commission or customer database.
 */
export type CasaCategory = "imoveis" | "terrenos" | "construcao" | "reforma" |
  "moveis" | "decoracao" | "eletrodomesticos" | "automacao" | "profissionais";

export const CASA_CATEGORIES: ReadonlyArray<{ key: CasaCategory; label: string }> = [
  { key: "imoveis", label: "Imóveis" },
  { key: "terrenos", label: "Terrenos e loteamentos" },
  { key: "construcao", label: "Construção e materiais" },
  { key: "reforma", label: "Reforma e serviços" },
  { key: "moveis", label: "Móveis e planejados" },
  { key: "decoracao", label: "Decoração e iluminação" },
  { key: "eletrodomesticos", label: "Eletrodomésticos" },
  { key: "automacao", label: "Automação residencial" },
  { key: "profissionais", label: "Profissionais e fornecedores" },
];
export type CasaTransactionFlow = "catalog_checkout" | "quotation" | "visit_and_proposal";
export function marketplaceCasaFlow(category: CasaCategory): CasaTransactionFlow {
  if (category === "imoveis" || category === "terrenos") return "visit_and_proposal";
  if (category === "construcao" || category === "reforma" || category === "profissionais") return "quotation";
  return "catalog_checkout";
}
export interface CasaListingReference {
  listingId: string;
  sourceMarketplaceId: string;
  category: CasaCategory;
  tenantId: string;
  projectId?: string;
  businessId?: string;
}
/** The public index is anonymous; member-only project/business links are excluded. */
export function publicCasaListing(reference: CasaListingReference) {
  return { listingId: reference.listingId, category: reference.category };
}

/**
 * Marketplace public taxonomy projection.
 * Keep source items private by default: publishing is an explicit opt-in.
 * Callers MUST scope listings to the public marketplace and enforce tenant
 * authorization server-side before passing records to this projection.
 */
export interface CasaPublishableListing {
  id: string;
  category: CasaCategory;
  subcategory?: string | null;
  publishToPraca: boolean;
  status: "draft" | "pending" | "published" | "paused" | "archived";
  approved: boolean;
  isActive: boolean;
  eligible: boolean;
}

export function isPublicCasaListing(listing: CasaPublishableListing): boolean {
  return listing.publishToPraca === true
    && listing.status === "published"
    && listing.approved === true
    && listing.isActive === true
    && listing.eligible === true;
}

/** Hide empty public categories while keeping the full taxonomy in admin. */
export function visibleCasaCategories(
  listings: readonly CasaPublishableListing[],
  categories: ReadonlyArray<{ key: CasaCategory; label: string }> = CASA_CATEGORIES,
) {
  const active = new Set(listings.filter(isPublicCasaListing).map(item => item.category));
  return categories.filter(category => active.has(category.key));
}

/** A subcategory is visible only if it contains a public, eligible listing. */
export function visibleCasaSubcategories(
  listings: readonly CasaPublishableListing[],
  category: CasaCategory,
): string[] {
  return Array.from(new Set(
    listings
      .filter(item => item.category === category && isPublicCasaListing(item))
      .map(item => item.subcategory?.trim() ?? "")
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Adapter for the existing product catalogue opt-in (vendeNoPracaAi).
 * Null/undefined are private by default, never interpreted as consent.
 * Not a substitute for backend moderation and merchant authorization.
 */
export interface PracaSourceItem {
  id: string;
  vendeNoPracaAi: boolean | null | undefined;
  ativo: boolean | null | undefined;
  categoriaPraca: CasaCategory | null | undefined;
  subcategoriaPraca?: string | null;
  statusPublicacao?: CasaPublishableListing["status"];
  aprovado?: boolean;
}

export function projectPracaSourceItem(source: PracaSourceItem): CasaPublishableListing | null {
  if (!source.categoriaPraca || !CASA_CATEGORIES.some(c => c.key === source.categoriaPraca)) return null;
  return {
    id: source.id,
    category: source.categoriaPraca,
    subcategory: source.subcategoriaPraca,
    publishToPraca: source.vendeNoPracaAi === true,
    status: source.statusPublicacao ?? "draft",
    approved: source.aprovado === true,
    isActive: source.ativo === true,
    eligible: true,
  };
}
