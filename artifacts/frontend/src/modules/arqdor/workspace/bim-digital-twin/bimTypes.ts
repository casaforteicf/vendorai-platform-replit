export type BIMView =
  | "dashboard"
  | "viewer"
  | "explorer"
  | "clashes"
  | "versions"
  | "comparison"
  | "properties"
  | "exports"
  | "ai";

export type ElementStatus = "ok" | "warning" | "clash" | "missing" | "updated";
export type ClashSeverity = "baixo" | "medio" | "alto" | "critico";
export type ModelVersionStatus = "current" | "archived" | "review" | "published";
export type ExportFormat = "ifc" | "gltf" | "glb" | "usdz" | "dwg" | "pdf";

export type BIMModel = {
  id: string;
  name: string;
  version: string;
  discipline: string;
  elements: number;
  clashes: number;
  updatedAt: string;
  status: ModelVersionStatus;
};

export type BIMElement = {
  id: string;
  name: string;
  category: string;
  discipline: string;
  level: string;
  material: string;
  dimensions: string;
  status: ElementStatus;
  linkedSpecification: string;
  linkedBudget: string;
};

export type ClashItem = {
  id: string;
  title: string;
  elementA: string;
  elementB: string;
  disciplineA: string;
  disciplineB: string;
  severity: ClashSeverity;
  status: "open" | "review" | "resolved";
  recommendation: string;
};

export type ModelVersion = {
  id: string;
  name: string;
  version: string;
  author: string;
  date: string;
  changes: number;
  status: ModelVersionStatus;
};

export type ExportJob = {
  id: string;
  name: string;
  format: ExportFormat;
  status: "ready" | "processing" | "done" | "failed";
  size: string;
  createdAt: string;
};

export type TwinInsight = {
  id: string;
  title: string;
  description: string;
  impact: string;
  action: string;
};
