import type { PurchaseRequest } from "./ProcurementRepository";

export type ProcurementValidationResult = {
  valid: boolean;
  missingApproval: PurchaseRequest[];
  missingProduct: PurchaseRequest[];
  missingQuantity: PurchaseRequest[];
  missingSupplier: PurchaseRequest[];
};

export function validatePurchaseRequests(requests: PurchaseRequest[]): ProcurementValidationResult {
  return {
    valid: requests.every(
      (item) =>
        item.approvalId &&
        item.canonicalProductId &&
        item.quantity > 0 &&
        Boolean(item.unit)
    ),
    missingApproval: requests.filter((item) => !item.approvalId),
    missingProduct: requests.filter((item) => !item.canonicalProductId),
    missingQuantity: requests.filter((item) => !item.quantity || item.quantity <= 0 || !item.unit),
    missingSupplier: requests.filter((item) => !item.supplierId),
  };
}
