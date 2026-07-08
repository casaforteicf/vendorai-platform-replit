export type ProductionView =
  | "dashboard"
  | "orders"
  | "pipeline"
  | "timeline"
  | "quality"
  | "installation"
  | "suppliers"
  | "ai";

export type ProductionStatus =
  | "especificado"
  | "orcado"
  | "comprado"
  | "producao"
  | "montagem"
  | "qualidade"
  | "expedicao"
  | "instalacao"
  | "finalizado";

export type Priority = "baixa" | "media" | "alta" | "critica";

export type WorkOrder = {
  id: string;
  code: string;
  project: string;
  environment: string;
  objectName: string;
  discipline: string;
  supplier: string;
  responsible: string;
  quantity: number;
  startDate: string;
  dueDate: string;
  status: ProductionStatus;
  priority: Priority;
  cost: string;
  progress: number;
  aiNote: string;
};

export type ProductionSupplier = {
  id: string;
  name: string;
  discipline: string;
  score: number;
  activeOrders: number;
  avgDelay: string;
  status: "apto" | "atencao" | "bloqueado";
};

export type QualityCheck = {
  id: string;
  label: string;
  checked: boolean;
  category: string;
};
