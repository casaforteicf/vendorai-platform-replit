// ─── Vendor.ai Integration Types ─────────────────────────────────────────────
// Maps arqdor.ai workspace entities to Vendor.ai platform hubs.
// Architecture only — no live API calls; all bridges use mock data.

// ════════════════════════════════════════════════════════════════════════════
// HUB IDENTIFIERS
// ════════════════════════════════════════════════════════════════════════════

export type HubId =
  | 'CRM' | 'KNOWLEDGE' | 'AGENTS' | 'WORKFLOWS' | 'MARKETPLACE'
  | 'ANALYTICS' | 'FILES' | 'NOTIFICATIONS' | 'TASKS' | 'BILLING'

export interface HubMeta {
  id:          HubId
  label:       string
  icon:        string
  description: string
  connected:   boolean
  docsUrl?:    string
}

// ════════════════════════════════════════════════════════════════════════════
// CRM INTEGRATION
// ════════════════════════════════════════════════════════════════════════════

export type DealEtapa = 'em_aquecimento' | 'novo' | 'qualificado' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'

export interface CrmLead {
  id:          string
  name:        string
  email?:      string
  phone?:      string
  propensityScore?: number
  roiEstimate?: string
}

export interface CrmDeal {
  id:          string
  name:        string
  value:       number
  etapa:       DealEtapa
  leadId:      string
  probability: number
}

export interface CrmPipeline {
  id:    string
  name:  string
  deals: CrmDeal[]
}

export interface ProjectCrmLinkage {
  projectId:   string
  leadId?:     string
  dealId?:     string
  pipelineId?: string
  lead?:       CrmLead
  deal?:       CrmDeal
}

// ════════════════════════════════════════════════════════════════════════════
// AI AGENTS
// ════════════════════════════════════════════════════════════════════════════

export type AgentRole =
  | 'ARQUITETO_IA' | 'DESIGNER_IA' | 'RENDER_IA' | 'ESPECIFICADOR_IA'
  | 'COMPRADOR_IA' | 'COMERCIAL_IA' | 'MARKETING_IA'

export interface AgentSpec {
  id:          string
  role:        AgentRole
  name:        string
  description: string
  icon:        string
  capabilities: string[]
  status:      'ACTIVE' | 'INACTIVE' | 'TRAINING'
  model:       string
  vertical:    'ARCH'
}

// ════════════════════════════════════════════════════════════════════════════
// WORKFLOW HUB
// ════════════════════════════════════════════════════════════════════════════

export type WorkflowTrigger =
  | 'PROJECT_APPROVED' | 'RENDER_COMPLETED' | 'MATERIAL_CONFIRMED'
  | 'CRM_DEAL_WON' | 'COPILOT_TASK_DONE'

export interface WorkflowAutomation {
  id:          string
  name:        string
  trigger:     WorkflowTrigger
  triggerLabel: string
  steps:       WorkflowStep[]
  active:      boolean
}

export interface WorkflowStep {
  id:     string
  label:  string
  icon:   string
  hubId:  HubId
  action: string
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS HUB
// ════════════════════════════════════════════════════════════════════════════

export interface ArqAnalyticsMetric {
  key:        string
  label:      string
  value:      number | string
  unit?:      string
  trend?:     'UP' | 'DOWN' | 'STABLE'
  trendPct?:  number
}

export interface ArqAnalyticsSnapshot {
  tenantId:        string
  period:          string
  projectsCreated: number
  avgRenderReady:  number
  avgFidelityScore: number
  topMaterials:    string[]
  topManufacturers:string[]
  rendersGenerated: number
  avgProjectTime:  string
  metrics:         ArqAnalyticsMetric[]
}

// ════════════════════════════════════════════════════════════════════════════
// TASK HUB
// ════════════════════════════════════════════════════════════════════════════

export type VendorTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type VendorTaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface VendorTask {
  id:          string
  title:       string
  description?: string
  sourceType:  'COPILOT_RECOMMENDATION' | 'AIE_ALERT' | 'MANUAL'
  sourceRef?:  string   // recommendation id or alert id
  assigneeId?: string
  dueDate?:    string
  priority:    VendorTaskPriority
  status:      VendorTaskStatus
  projectId:   string
  tenantId:    string
  createdAt:   string
}

// ════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE HUB
// ════════════════════════════════════════════════════════════════════════════

export type KnowledgeCategory =
  | 'NORMAS' | 'MATERIAIS' | 'BOAS_PRATICAS' | 'MEMORIAIS'
  | 'FAQS' | 'CATALOGOS' | 'GUIAS_TECNICOS'

export interface KnowledgeEntry {
  id:          string
  category:    KnowledgeCategory
  title:       string
  summary:     string
  tags:        string[]
  relevance?:  number  // 0–100 for current project context
}

// ════════════════════════════════════════════════════════════════════════════
// FILES HUB
// ════════════════════════════════════════════════════════════════════════════

export type FileCategory =
  | 'RENDER' | 'REFERENCE' | 'PBR_TEXTURE' | 'PDF' | 'CATALOG' | 'BLUEPRINT'

export interface ManagedFile {
  id:          string
  name:        string
  category:    FileCategory
  url:         string
  sizeKb:      number
  projectId:   string
  uploadedAt:  string
  uploadedBy:  string
}

// ════════════════════════════════════════════════════════════════════════════
// MARKETPLACE HUB
// ════════════════════════════════════════════════════════════════════════════

export type MarketplaceCategory = 'MATERIAL' | 'COMPONENT' | 'TEMPLATE' | 'DNA' | 'PROMPT_PACK' | 'PROJECT'

export interface MarketplaceProduct {
  id:          string
  name:        string
  category:    MarketplaceCategory
  author:      string
  price:       number
  currency:    'BRL'
  rating:      number
  downloads:   number
  thumbnail?:  string
  tags:        string[]
}
