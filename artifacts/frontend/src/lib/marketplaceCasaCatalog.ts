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
