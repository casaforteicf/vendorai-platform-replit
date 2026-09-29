export type SpecificationObject = {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  category: string;
  canonicalProductId?: string;
  materialId?: string;
  supplierId?: string;
  quantity: number;
  unit: string;
  origemMedida?: "projeto" | "catalogo" | "confirmado" | "estimativa_ia" | "pendente";
  larguraCm?: string | null;
  alturaCm?: string | null;
  profundidadeCm?: string | null;
  comprimentoCm?: string | null;
  espessuraCm?: string | null;
  areaBrutaM2?: string | null;
  descontoVaosM2?: string | null;
  areaLiquidaM2?: string | null;
  perimetroM?: string | null;
  perdaPercentual?: string | null;
  peitorilCm?: string | null;
  modulos?: number | null;
  portas?: number | null;
  gavetas?: number | null;
  prateleiras?: number | null;
  posicaoReferencia?: string | null;
  status: "draft" | "review" | "approved" | "rejected";
};

export type SpecificationPayload = {
  projectId: string;
  environmentId: string;
  objects: SpecificationObject[];
};

export class SpecificationRepository {
  constructor(private readonly baseUrl = "/arch/specification") {}

  async listByProject(projectId: string): Promise<SpecificationObject[]> {
    const response = await fetch(`${this.baseUrl}?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar especificações");
    return response.json();
  }

  async create(payload: SpecificationPayload): Promise<SpecificationPayload> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Falha ao criar especificação");
    return response.json();
  }

  async approve(id: string): Promise<SpecificationObject> {
    const response = await fetch(`${this.baseUrl}/${id}/approve`, { method: "POST" });
    if (!response.ok) throw new Error("Falha ao aprovar especificação");
    return response.json();
  }
}
