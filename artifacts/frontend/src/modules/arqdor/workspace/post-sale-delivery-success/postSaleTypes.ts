export type DeliveryStatus =
  | "not-started"
  | "in-progress"
  | "ready-for-review"
  | "delivered"
  | "accepted"
  | "revision-requested"
  | "closed";

export type ChecklistCategory =
  | "execution"
  | "quality"
  | "cleaning"
  | "documentation"
  | "client-approval"
  | "warranty";

export type DocumentType =
  | "photo"
  | "video"
  | "manual"
  | "warranty"
  | "invoice"
  | "as-built"
  | "delivery-term"
  | "other";

export type OpportunityType =
  | "new-room"
  | "maintenance"
  | "complement"
  | "supplier-upsell"
  | "referral"
  | "recurring-service"
  | "new-project";

export type OpportunityStatus =
  | "identified"
  | "contact-pending"
  | "in-nurturing"
  | "proposal"
  | "won"
  | "lost"
  | "archived";

export type SurveyStatus =
  | "not-sent"
  | "sent"
  | "answered"
  | "expired";

export type DeliveryProject = {
  id: string;
  tenantId?: string | null;
  projectId: string;
  proposalId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  status: DeliveryStatus;
  deliveryDate?: string | null;
  acceptedAt?: string | null;
  closedAt?: string | null;
  nps?: number | null;
  satisfactionScore?: number | null;
  summary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type DeliveryChecklistItem = {
  id: string;
  deliveryId: string;
  projectId: string;
  category: ChecklistCategory;
  label: string;
  done: boolean;
  required: boolean;
  responsible?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  sortOrder: number;
};

export type DeliveryTerm = {
  id: string;
  deliveryId: string;
  projectId: string;
  title: string;
  clientName?: string | null;
  content: string;
  accepted: boolean;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
  signatureUrl?: string | null;
  publicToken?: string | null;
  createdAt?: string | null;
};

export type FinalDocument = {
  id: string;
  deliveryId: string;
  projectId: string;
  type: DocumentType;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  visibleToClient: boolean;
  createdAt?: string | null;
};

export type SatisfactionSurvey = {
  id: string;
  deliveryId: string;
  projectId: string;
  status: SurveyStatus;
  nps?: number | null;
  satisfactionScore?: number | null;
  comment?: string | null;
  clientName?: string | null;
  answeredAt?: string | null;
  sentAt?: string | null;
  publicToken?: string | null;
};

export type TestimonialRequest = {
  id: string;
  deliveryId: string;
  projectId: string;
  status: "draft" | "sent" | "received" | "approved" | "published";
  channel: "portal" | "email" | "whatsapp" | "manual";
  message: string;
  testimonial?: string | null;
  rating?: number | null;
  receivedAt?: string | null;
};

export type FutureOpportunity = {
  id: string;
  deliveryId: string;
  projectId: string;
  type: OpportunityType;
  status: OpportunityStatus;
  title: string;
  description?: string | null;
  estimatedValue?: number | null;
  nextAction?: string | null;
  dueDate?: string | null;
  ownerName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type PostSaleEvent = {
  id: string;
  deliveryId?: string | null;
  projectId: string;
  type:
    | "created"
    | "checklist-updated"
    | "document-added"
    | "term-generated"
    | "term-accepted"
    | "survey-sent"
    | "survey-answered"
    | "testimonial-requested"
    | "opportunity-created"
    | "project-closed"
    | "comment";
  message: string;
  actorType: "system" | "internal" | "client";
  actorName?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CreatePostSaleFromProductionPayload = {
  projectId: string;
  proposalId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
};

export type DeliveryChecklistPayload = {
  deliveryId: string;
  projectId: string;
  category: ChecklistCategory;
  label: string;
  done?: boolean;
  required?: boolean;
  responsible?: string | null;
  notes?: string | null;
  sortOrder?: number;
};

export type DeliveryTermPayload = {
  deliveryId: string;
  projectId: string;
  title: string;
  clientName?: string | null;
  content: string;
};

export type FinalDocumentPayload = {
  deliveryId: string;
  projectId: string;
  type: DocumentType;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  visibleToClient?: boolean;
};

export type SatisfactionSurveyPayload = {
  deliveryId: string;
  projectId: string;
  clientName?: string | null;
  nps?: number | null;
  satisfactionScore?: number | null;
  comment?: string | null;
};

export type FutureOpportunityPayload = {
  deliveryId: string;
  projectId: string;
  type: OpportunityType;
  status?: OpportunityStatus;
  title: string;
  description?: string | null;
  estimatedValue?: number | null;
  nextAction?: string | null;
  dueDate?: string | null;
  ownerName?: string | null;
};

export type PostSaleBundleResponse = {
  delivery: DeliveryProject | null;
  checklist: DeliveryChecklistItem[];
  terms: DeliveryTerm[];
  documents: FinalDocument[];
  surveys: SatisfactionSurvey[];
  testimonialRequests: TestimonialRequest[];
  opportunities: FutureOpportunity[];
  events: PostSaleEvent[];
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
