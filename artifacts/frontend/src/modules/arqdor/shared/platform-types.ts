// ─── Platform shared types ────────────────────────────────────────────────────
// These are the canonical types for the entire arqdor.ai platform.
// Domain entities, value objects, and cross-cutting concerns live here.

export type ID   = string
export type ISODate = string
export type Score = number // 0–100

// ─── Render ───────────────────────────────────────────────────────────────────

export type RenderStatus = 'PENDING' | 'GENERATING' | 'REVIEWING' | 'COMPLETED' | 'FAILED'

export interface RenderJob {
  id:          ID
  projectId:   ID
  promptId:    ID
  status:      RenderStatus
  imageUrl?:   string
  score?:      Score
  createdAt:   ISODate
  completedAt?: ISODate
  providerRef?: string
  corrections: CorrectionItem[]
  version:     number
}

export interface CorrectionItem {
  id:          ID
  area:        string
  issue:       string
  severity:    'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  originalPromptFragment: string
  correctedPromptFragment: string
  applied:     boolean
}

export interface RenderReview {
  id:          ID
  renderJobId: ID
  projectId:   ID
  geometryScore:  Score
  materialScore:  Score
  lightingScore:  Score
  furnitureScore: Score
  cameraScore:    Score
  overallScore:   Score
  differences:    DifferenceItem[]
  reviewedAt:  ISODate
}

export interface DifferenceItem {
  objectId:    ID
  objectName:  string
  area:        string
  expected:    string
  rendered:    string
  matchPct:    number
}

// ─── AI Memory ────────────────────────────────────────────────────────────────

export interface AIMemory {
  id:          ID
  ownerId:     ID
  ownerType:   'STUDIO' | 'CLIENT' | 'GLOBAL'
  ownerName:   string
  preferences: MemoryPreference[]
  createdAt:   ISODate
  updatedAt:   ISODate
}

export interface MemoryPreference {
  id:          ID
  category:    'MATERIAL' | 'HARDWARE' | 'STYLE' | 'LIGHTING' | 'CAMERA' | 'OTHER'
  key:         string
  value:       string
  confidence:  number
  usageCount:  number
}

// ─── Exporters / Importers ────────────────────────────────────────────────────

export type ExportFormat = 'PROJECT_JSON' | 'PROMPT_TXT' | 'PROMPT_JSON' | 'WORKSPACE' | 'MATERIAL_LIBRARY'
export type ImportFormat = 'SKETCHUP' | 'REVIT' | 'IFC' | 'OBJ' | 'FBX' | 'IMAGE' | 'PDF'

export interface ExportRequest {
  format:    ExportFormat
  projectId: ID
  options?:  Record<string, unknown>
}

export interface ImportRequest {
  format:    ImportFormat
  source:    string | File
  projectId: ID
  options?:  Record<string, unknown>
}

// ─── Plugin registration ──────────────────────────────────────────────────────

export type ProviderType = 'IMAGE_ANALYSIS' | 'PROMPT' | 'RENDER' | 'RENDER_REVIEW' | 'MATERIAL_RECOGNITION' | 'STYLE_RECOGNITION'

export interface PluginRegistration {
  id:          string
  name:        string
  version:     string
  providerType: ProviderType
  enabled:     boolean
  config:      Record<string, unknown>
}
