export type SpecObjectStatus =
  | "draft"
  | "identified"
  | "specified"
  | "priced"
  | "approved"
  | "sent-to-budget"
  | "archived";

export type CatalogItemType =
  | "product"
  | "material"
  | "manufacturer"
  | "supplier"
  | "component"
  | "finish";

export type MeasurementSource = "project" | "field" | "confirmed" | "manual" | "ai_estimate" | "pending";
export type QuantitySource = "project" | "catalog" | "confirmed" | "manual" | "ai_estimate" | "pending";
export type SpecSourceType = "project" | "render" | "catalog" | "manual" | "ai_suggestion";
export type SpecApprovalContext = "technical" | "architect" | "client" | "fabrication" | "installation";
export type SpecApprovalDecision = "approved" | "rejected" | "revision_requested";

export type SpecApproval = {
  id: string;
  specObjectId: string;
  context: SpecApprovalContext;
  decision: SpecApprovalDecision;
  actorId?: string | null;
  actorName?: string | null;
  note?: string | null;
  projectRevision?: string | null;
  createdAt?: string | null;
};

export type CatalogItem = {
  id: string;
  type: CatalogItemType;
  name: string;
  code?: string | null;
  category?: string | null;
  manufacturer?: string | null;
  supplier?: string | null;
  material?: string | null;
  unit?: string | null;
  price?: number | null;
  laborPrice?: number | null;
  imageUrl?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export type SpecObject = {
  id: string;
  tenantId?: string | null;
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  renderId?: string | null;
  sourceObjectId?: string | null;
  sourceType?: SpecSourceType | null;
  projectRevision?: string | null;
  revisionImpact?: "unchanged" | "quantity_changed" | "geometry_changed" | "new" | "removed" | "needs_review" | null;
  geometryHash?: string | null;
  removedFromProjectAt?: string | null;

  name: string;
  description?: string | null;
  category?: string | null;
  region?: string | null;
  quantity: number;
  unit: string;
  quantitySource?: QuantitySource | null;

  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  volumeM3?: number | null;
  measurementSource?: MeasurementSource | null;
  measurementRevision?: string | null;
  lastProjectSyncAt?: string | null;
  measurementConfirmedAt?: string | null;
  measurementConfirmedBy?: string | null;

  wasteFactor?: number | null;
  purchaseQuantity?: number | null;
  packageYield?: number | null;

  catalogProductId?: string | null;
  catalogMaterialId?: string | null;
  manufacturerId?: string | null;
  supplierId?: string | null;

  productName?: string | null;
  materialName?: string | null;
  manufacturerName?: string | null;
  supplierName?: string | null;

  materialValue: number;
  laborValue: number;
  totalValue: number;

  notes?: string | null;
  technicalApprovalStatus?: "pending" | SpecApprovalDecision;
  technicalApprovedAt?: string | null;
  technicalApprovedBy?: string | null;
  technicalApprovalNote?: string | null;
  status: SpecObjectStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SpecObjectPayload = {
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  renderId?: string | null;
  sourceObjectId?: string | null;
  sourceType?: SpecSourceType | null;
  projectRevision?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  region?: string | null;
  quantity: number;
  unit: string;
  quantitySource?: QuantitySource | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  volumeM3?: number | null;
  measurementSource?: MeasurementSource | null;
  measurementRevision?: string | null;
  wasteFactor?: number | null;
  purchaseQuantity?: number | null;
  packageYield?: number | null;
  catalogProductId?: string | null;
  catalogMaterialId?: string | null;
  manufacturerId?: string | null;
  supplierId?: string | null;
  productName?: string | null;
  materialName?: string | null;
  manufacturerName?: string | null;
  supplierName?: string | null;
  materialValue: number;
  laborValue: number;
  notes?: string | null;
  status?: SpecObjectStatus;
};

export type BulkFromRenderPayload = {
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  renderId: string;
  preservePrompt: boolean;
  extractObjects: boolean;
};

export type CatalogResponse = {
  items: CatalogItem[];
  total?: number;
};

export type SpecObjectsResponse = {
  items: SpecObject[];
  total?: number;
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
