export type BudgetStatus =
  | "draft"
  | "in-review"
  | "sent"
  | "approved"
  | "rejected"
  | "archived";

export type BudgetViewMode = "internal" | "client";

export type BudgetItemType =
  | "material"
  | "labor"
  | "product"
  | "service"
  | "package"
  | "other";

export type Budget = {
  id: string;
  tenantId?: string | null;
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  title: string;
  clientName?: string | null;
  status: BudgetStatus;
  version: number;
  subtotalMaterial: number;
  subtotalLabor: number;
  subtotal: number;
  discountType: "percent" | "fixed";
  discountValue: number;
  discountTotal: number;
  grandTotal: number;
  saleTotal?: number | null;
  saleSource?: "manual" | "proposal" | "imported" | "calculated";
  notes?: string | null;
  clientNotes?: string | null;
  internalNotes?: string | null;
  createdAt?: string | null;
  specificationOutdated?: boolean;
  specificationRevision?: string | null;
  updatedAt?: string | null;
};

export type BudgetItem = {
  id: string;
  budgetId: string;
  specObjectId?: string | null;
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  item: string;
  description?: string | null;
  type: BudgetItemType;
  quantity: number;
  unit: string;
  materialValue: number;
  laborValue: number;
  unitTotal: number;
  totalMaterial: number;
  totalLabor: number;
  total: number;
  saleTotal?: number | null;
  supplierName?: string | null;
  manufacturerName?: string | null;
  productName?: string | null;
  materialName?: string | null;
  specificationOutdated?: boolean;
  specificationRevision?: string | null;
  specificationImpact?: string | null;
  visibleToClient: boolean;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BudgetTotals = {
  subtotalMaterial: number;
  subtotalLabor: number;
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
};

export type BudgetPayload = {
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  title: string;
  clientName?: string | null;
  status?: BudgetStatus;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  saleTotal?: number | null;
  saleSource?: "manual" | "proposal" | "imported" | "calculated";
  notes?: string | null;
  clientNotes?: string | null;
  internalNotes?: string | null;
};

export type BudgetItemPayload = {
  budgetId: string;
  specObjectId?: string | null;
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  item: string;
  description?: string | null;
  type?: BudgetItemType;
  quantity: number;
  unit: string;
  materialValue: number;
  laborValue: number;
  supplierName?: string | null;
  manufacturerName?: string | null;
  productName?: string | null;
  materialName?: string | null;
  visibleToClient?: boolean;
  sortOrder?: number;
};

export type CreateBudgetFromSpecPayload = {
  projectId: string;
  ambienteId?: string | null;
  renderId?: string | null;
  title: string;
  clientName?: string | null;
  specObjectIds?: string[];
};

export type BudgetResponse = {
  budget: Budget | null;
  items: BudgetItem[];
  totals: BudgetTotals;
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
