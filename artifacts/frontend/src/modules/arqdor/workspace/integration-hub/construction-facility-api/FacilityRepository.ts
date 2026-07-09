export type FacilityAsset = {
  id?: string;
  projectId: string;
  constructionPhaseId?: string;
  productionOrderId?: string;
  canonicalProductId?: string;
  name: string;
  category: string;
  location: string;
  supplierId?: string;
  installDate?: string;
  status: "operational" | "maintenance" | "attention" | "inactive";
};

export type FacilityTicket = {
  id?: string;
  projectId: string;
  facilityAssetId: string;
  title: string;
  priority: "baixa" | "media" | "alta" | "critica";
  status: "open" | "in_progress" | "waiting" | "resolved";
};

export class FacilityRepository {
  constructor(private readonly baseUrl = "/arch/facility") {}

  async listAssets(projectId: string): Promise<FacilityAsset[]> {
    const response = await fetch(`${this.baseUrl}/assets?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar ativos de facility");
    return response.json();
  }

  async createAsset(payload: FacilityAsset): Promise<FacilityAsset> {
    const response = await fetch(`${this.baseUrl}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Falha ao criar ativo de facility");
    return response.json();
  }

  async listTickets(projectId: string): Promise<FacilityTicket[]> {
    const response = await fetch(`${this.baseUrl}/tickets?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar chamados de facility");
    return response.json();
  }
}
