// ─── Provider interfaces — the plugin contract ────────────────────────────────
// NO module may depend directly on Nano Banana or any specific AI.
// Every AI capability is injected via these interfaces.

import type { Project } from '../../../pages/arch/arqdor/domain/arqdor-domain-types'
import type { RenderJob, RenderReview, CorrectionItem, MemoryPreference } from '../shared/platform-types'

// ─── Core provider result ─────────────────────────────────────────────────────

export interface ProviderResult<T> {
  ok:    boolean
  data?: T
  error?: string
  usage?: { tokens?: number; cost?: number }
}

// ─── Image Analysis Provider ──────────────────────────────────────────────────

export interface DetectedObject {
  id:         string
  name:       string
  category:   string
  confidence: number
  boundingBox?: { x: number; y: number; w: number; h: number }
}

export interface DetectedMaterial {
  name:       string
  color:      string
  finish:     string
  confidence: number
  region?:    string
}

export interface ImageAnalysisResult {
  objects:   DetectedObject[]
  materials: DetectedMaterial[]
  style:     string
  atmosphere: string
  rawDescription: string
}

export interface ImageAnalysisProvider {
  readonly id:   string
  readonly name: string
  analyze(imageUrl: string): Promise<ProviderResult<ImageAnalysisResult>>
  detectObjects(imageUrl: string): Promise<ProviderResult<DetectedObject[]>>
  detectMaterials(imageUrl: string): Promise<ProviderResult<DetectedMaterial[]>>
}

// ─── Prompt Provider ──────────────────────────────────────────────────────────

export interface PromptBuildOptions {
  includeCore:    boolean
  includeProject: boolean
  includeObjects: boolean
  includeRules:   boolean
  includeDNA:     boolean
  includeRender:  boolean
  includeNegative:boolean
  maxLength?:     number
}

export interface BuiltPrompt {
  sections:     Record<string, string>
  finalPrompt:  string
  negativePrompt: string
  tokenEstimate: number
}

export interface PromptProvider {
  readonly id:   string
  readonly name: string
  buildPrompt(project: Project, options?: Partial<PromptBuildOptions>): Promise<ProviderResult<BuiltPrompt>>
  buildNegativePrompt(project: Project): Promise<ProviderResult<string>>
  optimizePrompt(prompt: string, context: string): Promise<ProviderResult<string>>
}

// ─── Render Provider ──────────────────────────────────────────────────────────

export interface RenderOptions {
  resolution:   string
  steps?:       number
  guidance?:    number
  seed?:        number
  preserveMask?: string // base64 mask for inpainting
  referenceImages?: string[]
}

export interface RenderProvider {
  readonly id:   string
  readonly name: string
  generate(prompt: string, options?: RenderOptions): Promise<ProviderResult<RenderJob>>
  review(renderJob: RenderJob, project: Project): Promise<ProviderResult<RenderReview>>
  correct(review: RenderReview, corrections: CorrectionItem[]): Promise<ProviderResult<RenderJob>>
}

// ─── Render Review Provider ───────────────────────────────────────────────────

export interface RenderReviewProvider {
  readonly id:   string
  readonly name: string
  compare(renderImageUrl: string, project: Project): Promise<ProviderResult<RenderReview>>
  generateCorrections(review: RenderReview): Promise<ProviderResult<CorrectionItem[]>>
  score(renderImageUrl: string, project: Project): Promise<ProviderResult<number>>
}

// ─── Material Recognition Provider ───────────────────────────────────────────

export interface MaterialRecognitionProvider {
  readonly id:   string
  readonly name: string
  recognize(imageUrl: string, region?: { x: number; y: number; w: number; h: number }): Promise<ProviderResult<DetectedMaterial[]>>
  findSimilar(material: DetectedMaterial): Promise<ProviderResult<{ name: string; manufacturer: string; code: string; similarity: number }[]>>
}

// ─── Style Recognition Provider ───────────────────────────────────────────────

export interface StyleProfile {
  primaryStyle:  string
  subStyles:     string[]
  palette:       string[]
  keywords:      string[]
  references:    string[]
}

export interface StyleRecognitionProvider {
  readonly id:   string
  readonly name: string
  detectStyle(imageUrl: string): Promise<ProviderResult<StyleProfile>>
  suggestDNA(images: string[]): Promise<ProviderResult<Partial<import('../../../pages/arch/arqdor/domain/arqdor-domain-types').ProjectDNA>>>
}

// ─── Provider Registry interface ─────────────────────────────────────────────

export interface ProviderRegistry {
  imageAnalysis?: ImageAnalysisProvider
  prompt?: PromptProvider
  render?: RenderProvider
  renderReview?: RenderReviewProvider
  materialRecognition?: MaterialRecognitionProvider
  styleRecognition?: StyleRecognitionProvider
}

// ─── AI Memory Provider ───────────────────────────────────────────────────────

export interface AIMemoryProvider {
  readonly id: string
  readonly name: string
  getPreferences(ownerId: string, category?: string): Promise<MemoryPreference[]>
  recordPreference(ownerId: string, pref: Omit<MemoryPreference, 'id' | 'usageCount'>): Promise<void>
  learnFromProject(project: Project, ownerId: string): Promise<MemoryPreference[]>
}
