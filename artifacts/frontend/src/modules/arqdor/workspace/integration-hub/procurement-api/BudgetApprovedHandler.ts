import { ProcurementRepository, type PurchaseRequest } from "./ProcurementRepository";

export type BudgetApprovedEvent = {
  event: "budget.approved";
  projectId: string;
  budgetId: string;
  approvalId: string;
  items: Array<{
    environmentId?: string;
    canonicalProductId: string;
    supplierId?: string;
    quantity: number;
    unit: string;
    estimatedUnitPrice?: number;
  }>;
};

export class BudgetApprovedHandler {
  constructor(private readonly procurementRepository = new ProcurementRepository()) {}

  toPurchaseRequests(event: BudgetApprovedEvent): PurchaseRequest[] {
    return event.items.map((item) => ({
      projectId: event.projectId,
      budgetId: event.budgetId,
      approvalId: event.approvalId,
      environmentId: item.environmentId,
      canonicalProductId: item.canonicalProductId,
      supplierId: item.supplierId,
      quantity: item.quantity,
      unit: item.unit,
      estimatedUnitPrice: item.estimatedUnitPrice,
      status: "requested",
    }));
  }

  async handle(event: BudgetApprovedEvent): Promise<PurchaseRequest[]> {
    const requests = this.toPurchaseRequests(event);
    return this.procurementRepository.createRequests(requests);
  }
}
