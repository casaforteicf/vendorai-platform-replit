export type RenderStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "approved"
  | "archived";

export type RenderKind =
  | "original"
  | "improvement"
  | "material-change"
  | "post-render-adjustment"
  | "variation";

export type AdjustmentMode =
  | "improve"
  | "change-material"
  | "change-lighting"
  | "remove-object"
  | "add-object"
  | "preserve-and-refine";

export type RenderGalleryItem = {
  id: string;
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  parentRenderId?: string | null;
  kind: RenderKind;
  status: RenderStatus;
  title: string;
  prompt?: string | null;
  imageUrl: string;
  thumbUrl?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  engine?: string | null;
  materialChanges?: MaterialChange[];
  metadata?: Record<string, unknown>;
};

export type MaterialChange = {
  id: string;
  target: string;
  fromMaterial?: string;
  toMaterial: string;
  notes?: string;
};

export type RenderGalleryResponse = {
  items: RenderGalleryItem[];
  total?: number;
};

export type AdjustRenderPayload = {
  mode: AdjustmentMode;
  prompt: string;
  targetRegion?: string;
  materialChanges?: MaterialChange[];
  preserveGeometry: boolean;
  preserveCamera: boolean;
  createNewVersion: boolean;
};

export type ApproveRenderPayload = {
  renderId: string;
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  notes?: string;
};

export type SendToSpecificationPayload = {
  renderId: string;
  projectId: string;
  ambienteId?: string | null;
  cenaId?: string | null;
  extractObjects: boolean;
  preservePrompt: boolean;
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};
