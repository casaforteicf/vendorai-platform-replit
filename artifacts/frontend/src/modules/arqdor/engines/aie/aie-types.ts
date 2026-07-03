// ─── ARQ INTELLIGENCE ENGINE — Core Types ────────────────────────────────────
// Architecture-only: no external AI integration.
// All engines are pure functions: ProjectContext → EngineResult

// ════════════════════════════════════════════════════════════════════════════
// PROJECT CONTEXT — input to all engines
// ════════════════════════════════════════════════════════════════════════════

export interface ProjectObject {
  id:             string
  name:           string
  category:       string
  material?:      string
  finish?:        string
  color?:         string
  dimensions?:    { width: number; height: number; depth: number; unit: string }
  position?:      { x: number; y: number; z: number }
  visualWeight?:  number
  designIntent?:  string[]
  componentId?:   string
  manufacturerId?:string
  locked?:        boolean
}

export interface ProjectMaterial {
  id:           string
  name:         string
  category:     string
  manufacturer: string
  finish:       string
  gloss:        number
  palette:      string[]
  usedByObjects: string[]
}

export interface ProjectStyle {
  name:        string
  designIntent: string[]
  palette:     string[]
  restrictions: string[]
}

export interface ProjectContext {
  id:          string
  name:        string
  style?:      ProjectStyle
  objects:     ProjectObject[]
  materials:   ProjectMaterial[]
  renderGoal?: string
  cameraAngle?: string
  lightingType?: string
  photographyProfile?: string
  lastRenderUrl?: string
  dna?: string
}

// ════════════════════════════════════════════════════════════════════════════
// SCORES (0–100 each)
// ════════════════════════════════════════════════════════════════════════════

export interface ProjectScores {
  geometry:      number   // Object completeness + dimensions
  material:      number   // Material coverage + consistency
  composition:   number   // Visual balance + hierarchy
  lighting:      number   // Lighting definition
  photography:   number   // Camera/photography profile
  consistency:   number   // Style + material coherence
  renderReadiness: number // Combined readiness score
  promptQuality: number   // Prompt completeness
  overall:       number   // Weighted overall
}

export interface ScoreDetail {
  score:     number
  label:     string
  icon:      string
  issues:    string[]
  tips:      string[]
  passing:   boolean      // ≥ 70
}

// ════════════════════════════════════════════════════════════════════════════
// DESIGN INTENT ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface DesignIntentResult {
  objectsWithIntent:    number
  objectsWithoutIntent: number
  dominantIntents:      string[]
  intentConflicts:      IntentConflict[]
  coverageScore:        number  // 0–100
}

export interface IntentConflict {
  objectA:   string
  objectB:   string
  conflict:  string
  severity:  'LOW' | 'MEDIUM' | 'HIGH'
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSITION ENGINE
// ════════════════════════════════════════════════════════════════════════════

export type SymmetryType = 'SYMMETRIC' | 'ASYMMETRIC_BALANCED' | 'ASYMMETRIC_UNBALANCED'
export type RhythmType   = 'REGULAR' | 'PROGRESSIVE' | 'ALTERNATING' | 'RANDOM'

export interface CompositionMetrics {
  totalVisualWeight:   number
  weightDistribution:  WeightDistribution
  dominantAxis:        'HORIZONTAL' | 'VERTICAL' | 'DIAGONAL' | 'RADIAL'
  symmetry:            SymmetryType
  rhythm:              RhythmType
  contrastLevel:       'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'
  hierarchy:           HierarchyLevel[]
  attentionCenter:     AttentionCenter
  score:               number
}

export interface WeightDistribution {
  left:   number  // 0–100 %
  right:  number
  top:    number
  bottom: number
  center: number
}

export interface HierarchyLevel {
  level:   1 | 2 | 3    // 1 = hero, 2 = primary, 3 = secondary
  objects: string[]
}

export interface AttentionCenter {
  x:      number  // 0–1 relative to scene width
  y:      number  // 0–1 relative to scene height
  object: string  // dominant object at center of attention
}

// ════════════════════════════════════════════════════════════════════════════
// VISUAL WEIGHT ENGINE
// ════════════════════════════════════════════════════════════════════════════

export type AttentionZone = 'HERO' | 'PRIMARY' | 'SECONDARY' | 'BACKGROUND'

export interface VisualWeightResult {
  weights:   ObjectWeight[]
  totalLoad: number        // sum of all weights
  balance:   number        // 0–100, 100 = perfect balance
}

export interface ObjectWeight {
  objectId:     string
  objectName:   string
  weight:       number      // 0–100
  zone:         AttentionZone
  contribution: number      // % of total visual load
}

// ════════════════════════════════════════════════════════════════════════════
// CONSISTENCY ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface ConsistencyResult {
  score:            number   // 0–100
  woodCount:        number
  metalCount:       number
  stoneCount:       number
  hardwareConsistent: boolean
  paletteRange:     number   // number of distinct palette families
  languageScore:    number   // how cohesive the style language is
  issues:           ConsistencyIssue[]
}

export interface ConsistencyIssue {
  type:        'MATERIAL_CONFLICT' | 'PALETTE_MISMATCH' | 'HARDWARE_INCONSISTENCY' | 'STYLE_BREAK' | 'TOO_MANY_WOODS'
  description: string
  objects:     string[]
  severity:    'LOW' | 'MEDIUM' | 'HIGH'
}

// ════════════════════════════════════════════════════════════════════════════
// MATERIAL ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface MaterialEngineResult {
  coverage:        number    // % of objects with defined material
  uniqueMaterials: number
  compatible:      boolean
  paletteConflicts: PaletteConflict[]
  missingMaterials: string[] // objects without material
  finishConflicts:  FinishConflict[]
  score:            number
}

export interface PaletteConflict {
  material1:  string
  material2:  string
  reason:     string
}

export interface FinishConflict {
  objectA:    string
  finishA:    string
  objectB:    string
  finishB:    string
  reason:     string
}

// ════════════════════════════════════════════════════════════════════════════
// LIGHTING ENGINE
// ════════════════════════════════════════════════════════════════════════════

export type LightingType = 'NATURAL' | 'ARTIFICIAL' | 'INDIRECT' | 'TASK' | 'ACCENT' | 'MIXED'
export type ColorTemperature = 'WARM' | 'NEUTRAL' | 'COOL' | 'MIXED'
export type LightDirection  = 'FRONT' | 'SIDE' | 'BACK' | 'TOP' | 'AMBIENT'

export interface LightingProfile {
  primaryType:      LightingType
  colorTemperature: ColorTemperature
  kelvin:           number           // e.g. 2700, 4000, 6500
  direction:        LightDirection
  intensity:        'LOW' | 'MEDIUM' | 'HIGH'
  hdri?:            string
  shadows:          'SOFT' | 'HARD' | 'NONE'
  defined:          boolean
  score:            number
}

// ════════════════════════════════════════════════════════════════════════════
// PHOTOGRAPHY ENGINE
// ════════════════════════════════════════════════════════════════════════════

export type LensType = '24mm' | '28mm' | '35mm' | '50mm' | '85mm' | '100mm'
export type CompositionRule = 'RULE_OF_THIRDS' | 'GOLDEN_RATIO' | 'SYMMETRIC' | 'LEADING_LINES'
export type DOFType = 'SHALLOW' | 'MEDIUM' | 'DEEP'
export type MoodType = 'WARM' | 'COOL' | 'NEUTRAL' | 'DRAMATIC' | 'AIRY' | 'MOODY'

export interface PhotographyProfile {
  lens:            LensType
  cameraHeight:    number           // meters from floor
  compositionRule: CompositionRule
  mood:            MoodType
  contrast:        'LOW' | 'MEDIUM' | 'HIGH'
  exposure:        'UNDEREXPOSED' | 'NORMAL' | 'OVEREXPOSED'
  whiteBalance:    'AUTO' | 'DAYLIGHT' | 'TUNGSTEN' | 'CLOUDY'
  dof:             DOFType
  perspective:     'EYE_LEVEL' | 'LOW_ANGLE' | 'HIGH_ANGLE' | 'BIRD_EYE'
  narrative:       string
  defined:         boolean
  score:           number
}

// ════════════════════════════════════════════════════════════════════════════
// RECOMMENDATION ENGINE
// ════════════════════════════════════════════════════════════════════════════

export type RecommendationSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type RecommendationCategory =
  | 'MATERIAL' | 'COMPOSITION' | 'LIGHTING' | 'PHOTOGRAPHY'
  | 'CONSISTENCY' | 'DESIGN_INTENT' | 'GEOMETRY' | 'RENDER_READINESS'

export interface Recommendation {
  id:           string
  category:     RecommendationCategory
  severity:     RecommendationSeverity
  message:      string
  detail?:      string
  action?:      string
  autoApply:    false   // never auto-apply
}

// ════════════════════════════════════════════════════════════════════════════
// VALIDATION ENGINE
// ════════════════════════════════════════════════════════════════════════════

export type ValidationStatus = 'PASS' | 'WARN' | 'FAIL'

export interface ValidationResult {
  id:          string
  rule:        string
  status:      ValidationStatus
  message:     string
  affectedObjects?: string[]
  resolution?: string
}

export interface ValidationSummary {
  pass:    number
  warn:    number
  fail:    number
  results: ValidationResult[]
  score:   number  // 0–100
}

// ════════════════════════════════════════════════════════════════════════════
// REVIEW ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface ReviewComparison {
  projectId:   string
  renderUrl:   string
  differences: ReviewDifference[]
  matchScore:  number    // 0–100 how close render matches project
  suggestions: string[]
  status:      'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION'
}

export interface ReviewDifference {
  type:         'MATERIAL' | 'GEOMETRY' | 'LIGHTING' | 'COMPOSITION'
  description:  string
  severity:     'MINOR' | 'MAJOR' | 'CRITICAL'
  object?:      string
}

// ════════════════════════════════════════════════════════════════════════════
// CORRECTION ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface CorrectionPrompt {
  projectId:      string
  differences:    ReviewDifference[]
  correctionText: string           // the generated correction prompt
  focusAreas:     string[]
  preserveAreas:  string[]
  estimatedImpact:'LOW' | 'MEDIUM' | 'HIGH'
}

// ════════════════════════════════════════════════════════════════════════════
// LEARNING ENGINE
// ════════════════════════════════════════════════════════════════════════════

export interface LearningProfile {
  architectId:    string
  preferredWoods:       string[]
  preferredStones:      string[]
  preferredMetals:      string[]
  preferredBrands:      string[]
  preferredLens:        LensType
  preferredLighting:    LightingType
  preferredStyles:      string[]
  preferredColorTemp:   ColorTemperature
  projectCount:         number
  lastUpdated:          string
  confidenceScore:      number   // 0–100 how much data we have
}

// ════════════════════════════════════════════════════════════════════════════
// RENDER READINESS
// ════════════════════════════════════════════════════════════════════════════

export interface RenderReadiness {
  score:         number    // 0–100
  ready:         boolean   // score >= 80
  missing:       ReadinessItem[]
  warnings:      ReadinessItem[]
  passed:        ReadinessItem[]
}

export interface ReadinessItem {
  label:        string
  description?: string
  blocking:     boolean   // if true, prevents render
}

// ════════════════════════════════════════════════════════════════════════════
// AIE FULL RESULT
// ════════════════════════════════════════════════════════════════════════════

export interface AIEResult {
  projectId:      string
  timestamp:      string
  scores:         ProjectScores
  designIntent:   DesignIntentResult
  composition:    CompositionMetrics
  visualWeight:   VisualWeightResult
  consistency:    ConsistencyResult
  material:       MaterialEngineResult
  lighting:       LightingProfile
  photography:    PhotographyProfile
  recommendations: Recommendation[]
  validation:     ValidationSummary
  review?:        ReviewComparison
  learning:       LearningProfile
  renderReadiness: RenderReadiness
}
