export type PurchaseRequest = {
  id?: string;
  projectId: string;
  environmentId?: string;
  budgetId: string;
  approvalId: string;
  canonicalProductId: string;
  supplierId?: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice?: number;
  status?: "draft" | "requested" | "quoted" | "approved" | "ordered" | "received" | "cancelled";
};

export type PurchaseOrder = {
  id: string;
  purchaseRequestId: string;
  supplierId: string;
  total: number;
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled";
};

export class ProcurementRepository {
  constructor(private readonly baseUrl = "/arch/procurement") {}

  async listRequests(projectId: string): Promise<PurchaseRequest[]> {
    const response = await fetch(`${this.baseUrl}/requests?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar solicitações de compra");
    return response.json();
  }

  async createRequest(payload: PurchaseRequest): Promise<PurchaseRequest> {
    const response = await fetch(`${this.baseUrl}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Falha ao criar solicitação de compra");
    return response.json();
  }

  async createRequests(payloads: PurchaseRequest[]): Promise<PurchaseRequest[]> {
    const response = await fetch(`${this.baseUrl}/requests/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: payloads }),
    });
    if (!response.ok) throw new Error("Falha ao criar solicitações em lote");
    return response.json();
  }

  async listOrders(projectId: string): Promise<PurchaseOrder[]> {
    const response = await fetch(`${this.baseUrl}/orders?projectId=${projectId}`);
    if (!response.ok) throw new Error("Falha ao buscar pedidos de compra");
    return response.json();
  }
}
