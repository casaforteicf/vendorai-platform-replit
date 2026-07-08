export type ProcurementView =
  | "dashboard"
  | "requests"
  | "quotations"
  | "orders"
  | "receiving"
  | "inventory"
  | "logistics"
  | "ai";

export type RequestStatus = "draft" | "pending" | "quoted" | "approved" | "ordered" | "received" | "cancelled";
export type RequestPriority = "low" | "medium" | "high" | "critical";

export type PurchaseRequest = {
  id: string;
  code: string;
  project: string;
  environment: string;
  discipline: string;
  itemName: string;
  requestedBy: string;
  supplierSuggestion: string;
  quantity: number;
  unit: string;
  targetDate: string;
  estimatedValue: number;
  status: RequestStatus;
  priority: RequestPriority;
  aiNote: string;
};

export type ProcurementSupplier = {
  id: string;
  name: string;
  category: string;
  score: number;
  leadTime: string;
  activeQuotes: number;
  status: "preferred" | "approved" | "review" | "blocked";
};

export type ProcurementMetric = {
  label: string;
  value: string;
  description: string;
};
