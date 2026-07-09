export type CanonicalProductContract = {
  canonicalProductId: string;
  productName: string;
  category: string;
  materialId?: string;
  supplierId?: string;
  manufacturerId?: string;
  unit: string;
  estimatedPrice?: number;
};

export function buildCanonicalProductId(category: string, name: string): string {
  return `${category}-${name}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
