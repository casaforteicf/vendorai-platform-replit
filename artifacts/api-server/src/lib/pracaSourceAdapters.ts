import type { PracaListingCandidate } from "./pracaPublicCatalog";

/** Existing tenant-catalogue fields. This adapter does not fetch from the DB. */
export interface PracaSourceProduct {
  id: string; nome: string; descricao?: string | null;
  categoriaId: string | null; ativo: boolean | null;
  vendeNoPracaAi: boolean | null; precoPracaAi?: string | number | null;
  precoBase?: string | number | null; imagemUrl?: string | null;
}
export interface PracaSourceService {
  id: string; nome: string; descricao?: string | null;
  categoria: string; ativo: boolean | null; vendeNoPracaAi: boolean;
  precoBase?: string | number | null;
}
export interface PracaPublicationApproval {
  /** An explicitly approved and published listing from the canonical marketplace. */
  published: boolean;
  approved: boolean;
  eligible: boolean;
  sellerName: string;
  /** Must be mapped against the marketplace taxonomy, not tenant category labels. */
  publicCategoryId: string | null;
}
function numericPrice(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
/**
 * Safe integration boundary: an existing opt-in alone never means the public
 * listing was moderated/approved. Requires separate canonical approval.
 */
export function publicCandidateFromProduct(
  product: PracaSourceProduct, approval: PracaPublicationApproval | null,
): PracaListingCandidate | null {
  if (!approval || product.vendeNoPracaAi !== true || product.ativo !== true ||
      !product.categoriaId || !approval.publicCategoryId ||
      !approval.published || !approval.approved || !approval.eligible ||
      !product.nome.trim() || !approval.sellerName.trim()) return null;
  return {
    id: product.id, kind: "product", title: product.nome,
    description: product.descricao, categoryId: approval.publicCategoryId,
    sellerName: approval.sellerName, price: numericPrice(product.precoPracaAi ?? product.precoBase),
    imageUrl: product.imagemUrl, publishToPraca: true,
    published: true, approved: true, eligible: true, active: true,
  };
}
export function publicCandidateFromService(
  service: PracaSourceService, approval: PracaPublicationApproval | null,
): PracaListingCandidate | null {
  if (!approval || service.vendeNoPracaAi !== true || service.ativo !== true ||
      !service.categoria.trim() || !approval.publicCategoryId ||
      !approval.published || !approval.approved || !approval.eligible ||
      !service.nome.trim() || !approval.sellerName.trim()) return null;
  return {
    id: service.id, kind: "service", title: service.nome,
    description: service.descricao, categoryId: approval.publicCategoryId,
    sellerName: approval.sellerName, price: numericPrice(service.precoBase),
    publishToPraca: true, published: true, approved: true, eligible: true, active: true,
  };
}
