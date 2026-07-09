export type ProcurementContract = {
  purchaseRequestId?: string;
  projectId: string;
  budgetId: string;
  approvalId: string;
  environmentId?: string;
  canonicalProductId: string;
  supplierId?: string;
  supplierTaxId?: string;
  quantity: number;
  unit: string;
  estimatedUnitPrice?: number;
  status: "requested" | "quoted" | "approved" | "ordered" | "received";
};

export type ProcurementEvent =
  | {
      event: "purchase.request.created";
      purchaseRequestId: string;
      projectId: string;
      canonicalProductId: string;
    }
  | {
      event: "purchase.order.created";
      purchaseOrderId: string;
      projectId: string;
      supplierId: string;
    }
  | {
      event: "purchase.received";
      purchaseOrderId: string;
      projectId: string;
      receivedAt: string;
    };
