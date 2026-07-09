export type Supplier = {
  id: string;
  supplierTaxId?: string;
  name: string;
  category: string;
  status: "active" | "inactive" | "pending";
};

export class SupplierRepository {
  constructor(private readonly baseUrl = "/arch/marketplace/suppliers") {}

  async list(): Promise<Supplier[]> {
    const response = await fetch(this.baseUrl);
    if (!response.ok) throw new Error("Falha ao buscar fornecedores");
    return response.json();
  }

  async findByTaxId(supplierTaxId: string): Promise<Supplier | null> {
    const response = await fetch(`${this.baseUrl}?supplierTaxId=${supplierTaxId}`);
    if (!response.ok) throw new Error("Falha ao buscar fornecedor por documento");
    const data = await response.json();
    return Array.isArray(data) ? data[0] ?? null : data;
  }
}
