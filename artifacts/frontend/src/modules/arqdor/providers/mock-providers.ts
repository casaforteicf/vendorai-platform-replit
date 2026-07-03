// ─── Mock providers — no real AI, safe for development ───────────────────────
// Each mock provider returns deterministic data for UI development.
// Replace with real implementations (Nano Banana, OpenAI, etc.) via plugin registry.

import type {
  ImageAnalysisProvider, PromptProvider, RenderProvider, RenderReviewProvider,
  MaterialRecognitionProvider, StyleRecognitionProvider, ProviderResult,
  ImageAnalysisResult, BuiltPrompt, StyleProfile, DetectedMaterial, DetectedObject,
} from './interfaces'
import type { Project } from '../../../pages/arch/arqdor/domain/arqdor-domain-types'
import type { RenderJob, RenderReview, CorrectionItem } from '../shared/platform-types'
import { generateFullPromptStructure } from '../../../pages/arch/arqdor/domain/arqdor-prompt-engine'

function ok<T>(data: T): ProviderResult<T> { return { ok: true, data } }
function fail(error: string): ProviderResult<never> { return { ok: false, error } }
function delay(ms = 800): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

// ─── Mock Image Analysis ──────────────────────────────────────────────────────

export const MockImageAnalysisProvider: ImageAnalysisProvider = {
  id: 'mock-image-analysis',
  name: 'Mock Image Analysis',
  async analyze(imageUrl: string): Promise<ProviderResult<ImageAnalysisResult>> {
    await delay()
    return ok({
      objects: [
        { id:'o1', name:'Bancada', category:'BANCADA',       confidence:92, boundingBox:{ x:0.1, y:0.4, w:0.6, h:0.2 } },
        { id:'o2', name:'Marcenaria Inferior', category:'MARCENARIA', confidence:88 },
        { id:'o3', name:'Torneira', category:'METAL',        confidence:85 },
        { id:'o4', name:'Forno',   category:'EQUIPAMENTOS',  confidence:79 },
      ],
      materials: [
        { name:'Silestone Calacatta', color:'#E8E0D5', finish:'Polido', confidence:89, region:'bancada' },
        { name:'MDF Carvalho',        color:'#9B6C3C', finish:'Amadeirado', confidence:82, region:'marcenaria' },
      ],
      style: 'Contemporâneo Minimalista',
      atmosphere: 'Limpo e funcional com acentos quentes',
      rawDescription: 'Kitchen interior with light oak cabinetry, white stone countertop, and integrated appliances.',
    })
  },
  async detectObjects(imageUrl) { return (await this.analyze(imageUrl)).ok ? ok((await this.analyze(imageUrl)).data!.objects) : fail('Analysis failed') },
  async detectMaterials(imageUrl) { return (await this.analyze(imageUrl)).ok ? ok((await this.analyze(imageUrl)).data!.materials) : fail('Analysis failed') },
}

// ─── Mock Prompt Provider ─────────────────────────────────────────────────────

export const MockPromptProvider: PromptProvider = {
  id: 'mock-prompt',
  name: 'Mock Prompt Engine',
  async buildPrompt(project: Project): Promise<ProviderResult<BuiltPrompt>> {
    await delay(400)
    const structure = generateFullPromptStructure(project)
    return ok({
      sections: {
        core:    structure.corePrompt,
        project: structure.projectPrompt,
        objects: structure.objectPrompt,
        rules:   structure.rulePrompt,
        dna:     structure.dnaPrompt,
        render:  structure.renderPrompt,
        negative:structure.negativePrompt,
      },
      finalPrompt:   structure.finalPrompt,
      negativePrompt:structure.negativePrompt,
      tokenEstimate: Math.floor(structure.finalPrompt.length / 4),
    })
  },
  async buildNegativePrompt(project) { await delay(200); return ok(generateFullPromptStructure(project).negativePrompt) },
  async optimizePrompt(prompt) { await delay(600); return ok(prompt + '\n[Optimized by Mock Engine]') },
}

// ─── Mock Render Provider ─────────────────────────────────────────────────────

export const MockRenderProvider: RenderProvider = {
  id: 'mock-render',
  name: 'Mock Render Engine',
  async generate(prompt): Promise<ProviderResult<RenderJob>> {
    await delay(1200)
    return ok({
      id:          `render-${Date.now()}`,
      projectId:   'proj-apartamento-alpha',
      promptId:    `prompt-${Date.now()}`,
      status:      'COMPLETED',
      imageUrl:    undefined, // no real image in mock
      score:       87,
      createdAt:   new Date().toISOString(),
      completedAt: new Date().toISOString(),
      providerRef: 'mock-ref-001',
      corrections: [],
      version:     1,
    })
  },
  async review(renderJob, project) {
    await delay(800)
    return ok({
      id:            `review-${Date.now()}`,
      renderJobId:   renderJob.id,
      projectId:     project.id,
      geometryScore: 95, materialScore: 88, lightingScore: 82,
      furnitureScore:91, cameraScore:   100, overallScore:  91,
      differences:   [
        { objectId:'coz-marc-inf-pux', objectName:'Puxador Cava', area:'Marcenaria', expected:'Cava fresada sem puxador', rendered:'Puxador linear aparente', matchPct:15 },
        { objectId:'coz-banc-torneira', objectName:'Torneira', area:'Bancada', expected:'Deca monocomando escovado', rendered:'Torneira cromada genérica', matchPct:40 },
      ],
      reviewedAt: new Date().toISOString(),
    })
  },
  async correct(review, corrections) { await delay(1000); return this.generate('[correction prompt]') },
}

// ─── Mock Material Recognition ────────────────────────────────────────────────

export const MockMaterialRecognitionProvider: MaterialRecognitionProvider = {
  id: 'mock-material-recognition',
  name: 'Mock Material Recognition',
  async recognize(imageUrl) {
    await delay(600)
    return ok<DetectedMaterial[]>([
      { name:'Silestone Calacatta Gold', color:'#E8E0D5', finish:'Polido',    confidence:89 },
      { name:'MDF Carvalho Freijó',      color:'#9B6C3C', finish:'Amadeirado',confidence:82 },
    ])
  },
  async findSimilar(material) {
    await delay(400)
    return ok([
      { name:'Portobello Carrara', manufacturer:'Portobello', code:'PTB-CR01', similarity:0.91 },
      { name:'Cosentino Calacatta',manufacturer:'Cosentino',  code:'CST-CC20', similarity:0.87 },
    ])
  },
}

// ─── Mock Style Recognition ───────────────────────────────────────────────────

export const MockStyleRecognitionProvider: StyleRecognitionProvider = {
  id: 'mock-style-recognition',
  name: 'Mock Style Recognition',
  async detectStyle(imageUrl): Promise<ProviderResult<StyleProfile>> {
    await delay(500)
    return ok({
      primaryStyle: 'Contemporâneo Minimalista',
      subStyles:    ['Clean lines','Warm tones','Nordic influence'],
      palette:      ['#E8E0D5','#9B6C3C','#2D2D2D','#F5F0EB'],
      keywords:     ['minimal','warm','functional','sophisticated'],
      references:   [],
    })
  },
  async suggestDNA() {
    await delay(700)
    return ok({ architecturalStyle:'Contemporâneo', detailingLevel:'HIGH' as const, realismLevel:9 })
  },
}
