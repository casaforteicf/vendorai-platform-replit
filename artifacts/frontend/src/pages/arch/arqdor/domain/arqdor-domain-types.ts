// ─── Enums ───────────────────────────────────────────────────────────────────

export type RiskLevel    = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW'
export type RuleSeverity = 'CRITICAL'  | 'HIGH'  | 'MEDIUM' | 'LOW'
export type ObjectStatus = 'ACTIVE' | 'APPROVED' | 'LOCKED' | 'DRAFT'
export type SourceOfTruth =
  | 'ORIGINAL_IMAGE' | 'USER_INPUT' | 'MATERIAL_REFERENCE'
  | 'MATERIAL_LIBRARY' | 'MEMORIAL' | 'AI_DETECTION'

export type ObjectCategory =
  | 'AMBIENTE'     | 'ESTRUTURA'   | 'PISO'        | 'PAREDE'
  | 'FORRO'        | 'MARCENARIA'  | 'PORTA'        | 'GAVETA'
  | 'PUXADOR'      | 'FERRAGEM'    | 'BANCADA'      | 'PEDRA'
  | 'METAL'        | 'ESQUADRIA'   | 'VIDRO'        | 'ILUMINACAO'
  | 'MOBILIARIO'   | 'PAISAGISMO'  | 'DECORACAO'    | 'EQUIPAMENTOS'
  | 'CIRCULACAO'   | 'PERSONALIZADO'

export type RelationshipType =
  | 'ABOVE'            | 'BELOW'           | 'NEXT_TO'
  | 'ALIGNED_WITH'     | 'ATTACHED_TO'     | 'SAME_MATERIAL_AS'
  | 'SAME_FINISH_AS'   | 'SAME_HARDWARE_AS'| 'PART_OF'
  | 'CONTAINS'         | 'SUPPORTS'        | 'RELATED_TO'

// ─── AI Subsystem ─────────────────────────────────────────────────────────────

export interface AIPermissions {
  canChangeGeometry:    boolean
  canChangeMaterial:    boolean
  canChangeFinish:      boolean
  canChangeColor:       boolean
  canChangeLighting:    boolean
  canChangeDecoration:  boolean
  canMoveObject:        boolean
  canReplaceObject:     boolean
  canRemoveObject:      boolean
  canAddRelatedObjects: boolean
}

export interface AIRisk {
  level:        RiskLevel
  reason:       string
  restrictions: string[]
}

// ─── Structural ───────────────────────────────────────────────────────────────

export interface Relationship {
  id:           string
  fromObjectId: string
  toObjectId:   string
  type:         RelationshipType
  description:  string
}

export interface ObjectRule {
  id:          string
  objectId:    string
  type:        string
  condition:   string
  restriction: string
  message:     string
  severity:    RuleSeverity
}

export interface HistoryEntry {
  id:            string
  objectId:      string
  field:         string
  previousValue: string
  newValue:      string
  author:        string
  timestamp:     string
}

// ─── Material ─────────────────────────────────────────────────────────────────

export interface PBRMaps {
  albedo?:    string
  normal?:    string
  roughness?: string
  metallic?:  string
}

export interface Material {
  id:             string
  name:           string
  category:       string
  manufacturer:   string
  line:           string
  code:           string
  color:          string
  finish:         string
  texture:        string
  grainDirection: boolean
  glossLevel:     number
  pbrMaps:        PBRMaps
  tags:           string[]
  referenceImages:string[]
  notes:          string
}

// ─── Architectural Object ─────────────────────────────────────────────────────

export interface ArchitecturalObject {
  id:              string
  parentId:        string | null
  environmentId:   string
  name:            string
  category:        ObjectCategory
  type:            string
  description:     string
  status:          ObjectStatus
  confidence:      number
  sourceOfTruth:   SourceOfTruth
  materialId?:     string
  material:        Partial<Material>
  finish:          string
  color:           string
  texture:         string
  grainDirection:  boolean
  thickness:       string
  dimensions:      { width: string; height: string; depth: string }
  position:        { x: string; y: string; z: string }
  referenceImages: string[]
  aiPermissions:   AIPermissions
  aiRisk:          AIRisk
  relationships:   Relationship[]
  rules:           ObjectRule[]
  promptNotes:     string
  history:         HistoryEntry[]
}

// ─── Environment ──────────────────────────────────────────────────────────────

export interface Environment {
  id:                  string
  name:                string
  category:            string
  description:         string
  architecturalObjects: ArchitecturalObject[]
}

// ─── Project DNA ──────────────────────────────────────────────────────────────

export interface ProjectDNA {
  architecturalStyle:   string
  designLanguage:       string
  colorPalette:         string[]
  predominantMaterials: string[]
  predominantHardware:  string[]
  detailingLevel:       'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA'
  atmosphere:           string
  targetUse:            string
  renderObjective:      string
  photographyStyle:     string
  realismLevel:         number
}

// ─── Render Config ────────────────────────────────────────────────────────────

export interface RenderConfig {
  renderEngineStyle: string
  resolution:        string
  lens:              string
  cameraHeight:      string
  lightingMood:      string
  hdri:              string
  whiteBalance:      string
  toneMapping:       string
  depthOfField:      boolean
}

// ─── Prompt Structure ─────────────────────────────────────────────────────────

export interface PromptStructure {
  corePrompt:     string
  projectPrompt:  string
  objectPrompt:   string
  rulePrompt:     string
  dnaPrompt:      string
  renderPrompt:   string
  negativePrompt: string
  finalPrompt:    string
}

// ─── Score ────────────────────────────────────────────────────────────────────

export interface RenderReviewScore {
  geometryScore:  number
  materialScore:  number
  lightingScore:  number
  furnitureScore: number
  cameraScore:    number
  overallScore:   number
  detectedIssues: string[]
  suggestedFixes: string[]
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationItem {
  id:       string
  objectId?: string
  field?:   string
  message:  string
  severity: RuleSeverity
}

export interface ValidationResult {
  errors:      ValidationItem[]
  warnings:    ValidationItem[]
  suggestions: ValidationItem[]
}

export interface RuleEvaluationResult {
  allowedActions:      string[]
  blockedActions:      string[]
  warnings:            string[]
  criticalRestrictions:string[]
}

// ─── Project Version ──────────────────────────────────────────────────────────

export interface ProjectVersion {
  id:          string
  label:       string
  description: string
  createdAt:   string
  current:     boolean
}

// ─── Top-level Project ────────────────────────────────────────────────────────

export interface Project {
  id:           string
  name:         string
  description:  string
  createdAt:    string
  updatedAt:    string
  version:      string
  environments: Environment[]
  dna:          ProjectDNA
  renderConfig: RenderConfig
  versions:     ProjectVersion[]
}
