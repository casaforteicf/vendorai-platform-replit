export type ProposalStatus =
  | "draft"
  | "ready"
  | "sent"
  | "viewed"
  | "partially-approved"
  | "approved"
  | "rejected"
  | "expired"
  | "archived";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "commented"
  | "revision-requested";

export type DeliveryChannel = "portal" | "email" | "whatsapp" | "manual";
export type PortalMode = "internal" | "client";

export type Proposal = {
  id: string;
  tenantId?: string | null;
  projectId: string;
  budgetId: string;
  portalToken?: string | null;
  title: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  status: ProposalStatus;
  version: number;
  subtotalMaterial: number;
  subtotalLabor: number;
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  expiresAt?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  clientNotes?: string | null;
  internalNotes?: string | null;
  publicUrl?: string | null;
  publicView?: boolean;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  tenantPrimaryColor?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProposalItem = {
  id: string;
  proposalId: string;
  budgetItemId?: string | null;
  specObjectId?: string | null;
  item: string;
  description?: string | null;
  quantity: number;
  unit: string;
  materialValue: number;
  laborValue: number;
  total: number;
  visibleToClient: boolean;
  approvalStatus: ApprovalStatus;
  clientComment?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  sortOrder: number;
  productName?: string | null;
  materialName?: string | null;
  manufacturerName?: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
  perimeterM?: number | null;
  volumeM3?: number | null;
  projectRevision?: string | null;
  measurementSource?: string | null;
  measurementRevision?: string | null;
};

export type ProposalEvent = {
  id: string;
  proposalId: string;
  type:
    | "created"
    | "portal-activated"
    | "sent"
    | "viewed"
    | "item-approved"
    | "item-rejected"
    | "comment"
    | "approved"
    | "rejected"
    | "revision-requested";
  actorType: "system" | "internal" | "client";
  actorName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ProposalDelivery = {
  id: string;
  proposalId: string;
  channel: DeliveryChannel;
  destination?: string | null;
  status: "pending" | "sent" | "failed";
  message?: string | null;
  sentAt?: string | null;
  error?: string | null;
};

export type CreateProposalFromBudgetPayload = {
  projectId: string;
  budgetId: string;
  title: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  expiresAt?: string | null;
};

export type ActivatePortalPayload = {
  proposalId: string;
  regenerateToken?: boolean;
  expiresAt?: string | null;
};

export type SendProposalPayload = {
  proposalId: string;
  channels: DeliveryChannel[];
  email?: string | null;
  phone?: string | null;
  message?: string | null;
};

export type ClientApprovalPayload = {
  token: string;
  clientName?: string | null;
  comment?: string | null;
  decision: "approve" | "reject" | "revision";
};

export type ClientItemApprovalPayload = {
  token: string;
  itemId: string;
  decision: "approve" | "reject" | "comment";
  comment?: string | null;
};

export type ProposalResponse = {
  proposal: Proposal | null;
  items: ProposalItem[];
  events: ProposalEvent[];
  deliveries?: ProposalDelivery[];
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
