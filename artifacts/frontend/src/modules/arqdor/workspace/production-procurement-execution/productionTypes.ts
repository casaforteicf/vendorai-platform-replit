export type ProductionStatus =
  | "draft"
  | "planned"
  | "waiting-supplier"
  | "ordered"
  | "in-production"
  | "ready"
  | "scheduled"
  | "installed"
  | "completed"
  | "blocked"
  | "cancelled";

export type WorkOrderType =
  | "production"
  | "procurement"
  | "installation"
  | "site-service"
  | "delivery"
  | "quality-check";

export type WorkOrderPriority = "low" | "medium" | "high" | "critical";

export type SupplierStatus =
  | "not-requested"
  | "quote-requested"
  | "quote-received"
  | "approved"
  | "ordered"
  | "delivered"
  | "delayed"
  | "cancelled";

export type ExecutionView =
  | "overview"
  | "orders"
  | "suppliers"
  | "schedule"
  | "installation"
  | "quality"
  | "timeline";

export type WorkOrder = {
  id: string;
  tenantId?: string | null;
  projectId: string;
  proposalId?: string | null;
  proposalItemId?: string | null;
  budgetItemId?: string | null;
  specObjectId?: string | null;

  title: string;
  description?: string | null;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: ProductionStatus;

  item?: string | null;
  quantity: number;
  unit: string;
  materialName?: string | null;
  productName?: string | null;
  supplierName?: string | null;
  manufacturerName?: string | null;

  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;

  estimatedCost: number;
  actualCost: number;
  notes?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SupplierOrder = {
  id: string;
  tenantId?: string | null;
  projectId: string;
  workOrderId?: string | null;
  supplierName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  item: string;
  quantity: number;
  unit: string;
  estimatedValue: number;
  confirmedValue: number;
  status: SupplierStatus;
  requestedAt?: string | null;
  expectedDelivery?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
};

export type InstallationTask = {
  id: string;
  projectId: string;
  workOrderId?: string | null;
  title: string;
  team?: string | null;
  location?: string | null;
  scheduledDate?: string | null;
  durationHours: number;
  status: ProductionStatus;
  checklist: ChecklistItem[];
};

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  notes?: string | null;
};

export type QualityCheck = {
  id: string;
  projectId: string;
  workOrderId?: string | null;
  title: string;
  status: "pending" | "approved" | "rejected" | "revision";
  responsible?: string | null;
  notes?: string | null;
  createdAt?: string | null;
};

export type ExecutionEvent = {
  id: string;
  projectId: string;
  workOrderId?: string | null;
  type:
    | "created"
    | "status-change"
    | "supplier-request"
    | "supplier-delivery"
    | "scheduled"
    | "installed"
    | "quality-check"
    | "completed"
    | "blocked"
    | "comment";
  message: string;
  actorType: "system" | "internal" | "supplier" | "client";
  actorName?: string | null;
  createdAt: string;
};

export type CreateFromApprovalPayload = {
  projectId: string;
  proposalId: string;
  onlyApprovedItems: boolean;
};

export type WorkOrderPayload = {
  projectId: string;
  proposalId?: string | null;
  proposalItemId?: string | null;
  budgetItemId?: string | null;
  specObjectId?: string | null;
  title: string;
  description?: string | null;
  type: WorkOrderType;
  priority?: WorkOrderPriority;
  status?: ProductionStatus;
  item?: string | null;
  quantity: number;
  unit: string;
  materialName?: string | null;
  productName?: string | null;
  supplierName?: string | null;
  manufacturerName?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string | null;
};

export type SupplierOrderPayload = {
  projectId: string;
  workOrderId?: string | null;
  supplierName: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  item: string;
  quantity: number;
  unit: string;
  estimatedValue?: number;
  confirmedValue?: number;
  status?: SupplierStatus;
  expectedDelivery?: string | null;
  notes?: string | null;
};

export type ProductionBundleResponse = {
  workOrders: WorkOrder[];
  supplierOrders: SupplierOrder[];
  installationTasks: InstallationTask[];
  qualityChecks: QualityCheck[];
  events: ExecutionEvent[];
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
