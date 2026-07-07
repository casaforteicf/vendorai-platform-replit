export type ArqdorProjectStatus =
  | "briefing"
  | "orcamento"
  | "aprovado"
  | "em_execucao"
  | "entregue"
  | "cancelado"
  | "em_conceito"
  | "em_desenvolvimento"
  | "em_aprovacao"
  | "em_especificacao"
  | "em_producao"
  | "em_execucao_tecnica"
  | string;

export type ArqdorWorkspaceKey =
  | "home"
  | "projeto"
  | "studio"
  | "render"
  | "storyboard"
  | "documentacao"
  | "especificacao"
  | "producao"
  | "execucao"
  | "cliente"
  | "biblioteca"
  | string;

export interface ArqdorProject {
  id: string;
  tenantId?: string;
  clienteNome?: string;
  clienteEmail?: string;
  clienteTelefone?: string;
  titulo?: string;
  name?: string;
  title?: string;
  descricao?: string;
  status?: ArqdorProjectStatus;
  pipelineStage?: string;
  tipoObra?: string;
  areaM2?: number | string | null;
  orcamentoTotal?: number | string | null;
  prazoEstimado?: string | null;
  arquitetoResponsavel?: string | null;
  portalToken?: string | null;
  portalAtivo?: boolean;
  totalAmbientes?: number;
  totalRenders?: number;
  ambientes?: unknown[];
  renders?: unknown[];
  coverImageUrl?: string;
  capaUrl?: string;
  imageUrl?: string;
  project_progress?: number;
  progress?: number;
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ArqdorRadarItem {
  id: string;
  title: string;
  description?: string;
  type: "info" | "warning" | "success" | "critical";
  target?: ArqdorWorkspaceKey;
}

export interface ArqdorStateLike {
  projects?: ArqdorProject[];
  projetos?: ArqdorProject[];
  allProjects?: ArqdorProject[];
  currentProject?: ArqdorProject | null;
  selectedProject?: ArqdorProject | null;
  project?: ArqdorProject | null;
  [key: string]: unknown;
}
