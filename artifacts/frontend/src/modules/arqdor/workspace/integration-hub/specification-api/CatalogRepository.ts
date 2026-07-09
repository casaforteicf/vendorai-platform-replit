export type CatalogProduct = {
  id: string;
  canonicalProductId: string;
  name: string;
  category: string;
  materialId?: string;
  supplierId?: string;
  unit: string;
  price?: number;
  status: "active" | "inactive" | "draft";
};

export class CatalogRepository {
  constructor(private readonly baseUrl = "/arch/catalogo") {}

  async list(): Promise<CatalogProduct[]> {
    const response = await fetch(this.baseUrl);
    if (!response.ok) throw new Error("Falha ao buscar catálogo");
    return response.json();
  }

  async findByCanonicalId(canonicalProductId: string): Promise<CatalogProduct | null> {
    const response = await fetch(`${this.baseUrl}?canonicalProductId=${canonicalProductId}`);
    if (!response.ok) throw new Error("Falha ao buscar produto canônico");
    const data = await response.json();
    return Array.isArray(data) ? data[0] ?? null : data;
  }
}
