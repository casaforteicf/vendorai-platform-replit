// ─── Plugin Registry ──────────────────────────────────────────────────────────
// Central registry for all AI provider plugins.
// Swap providers here without touching any domain or UI code.

import type { ProviderRegistry } from '../providers/interfaces'
import type { PluginRegistration, ProviderType } from '../shared/platform-types'
import {
  MockImageAnalysisProvider,
  MockPromptProvider,
  MockRenderProvider,
  MockMaterialRecognitionProvider,
  MockStyleRecognitionProvider,
} from '../providers/mock-providers'

// ─── Available plugins ────────────────────────────────────────────────────────

export const AVAILABLE_PLUGINS: PluginRegistration[] = [
  { id:'mock-image-analysis',       name:'Mock Image Analysis',         version:'1.0.0', providerType:'IMAGE_ANALYSIS',       enabled:true,  config:{} },
  { id:'mock-prompt',               name:'Mock Prompt Engine',          version:'1.0.0', providerType:'PROMPT',               enabled:true,  config:{} },
  { id:'mock-render',               name:'Mock Render Engine',          version:'1.0.0', providerType:'RENDER',               enabled:true,  config:{} },
  { id:'mock-material-recognition', name:'Mock Material Recognition',   version:'1.0.0', providerType:'MATERIAL_RECOGNITION', enabled:true,  config:{} },
  { id:'mock-style-recognition',    name:'Mock Style Recognition',      version:'1.0.0', providerType:'STYLE_RECOGNITION',    enabled:true,  config:{} },
  // Future plugins — disabled until implemented
  { id:'nano-banana-render',        name:'Nano Banana',                  version:'0.0.1', providerType:'RENDER',               enabled:false, config:{ apiKey:'', endpoint:'' } },
  { id:'openai-images',             name:'OpenAI gpt-image-1',           version:'0.0.1', providerType:'RENDER',               enabled:false, config:{ apiKey:'' } },
  { id:'flux-render',               name:'Flux (Replicate)',             version:'0.0.1', providerType:'RENDER',               enabled:false, config:{ apiToken:'' } },
  { id:'gemini-vision',             name:'Gemini Vision',                version:'0.0.1', providerType:'IMAGE_ANALYSIS',       enabled:false, config:{ apiKey:'' } },
  { id:'krea-ai',                   name:'Krea AI',                      version:'0.0.1', providerType:'RENDER',               enabled:false, config:{} },
  { id:'d5-ai',                     name:'D5 AI Render',                 version:'0.0.1', providerType:'RENDER',               enabled:false, config:{} },
]

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  IMAGE_ANALYSIS:       'Análise de Imagem',
  PROMPT:               'Gerador de Prompt',
  RENDER:               'Renderização',
  RENDER_REVIEW:        'Revisão de Render',
  MATERIAL_RECOGNITION: 'Reconhecimento de Material',
  STYLE_RECOGNITION:    'Reconhecimento de Estilo',
}

export const PROVIDER_TYPE_ICONS: Record<ProviderType, string> = {
  IMAGE_ANALYSIS:       '🔍',
  PROMPT:               '⚡',
  RENDER:               '🎬',
  RENDER_REVIEW:        '📊',
  MATERIAL_RECOGNITION: '🎨',
  STYLE_RECOGNITION:    '✨',
}

// ─── Active registry (singleton for dev) ─────────────────────────────────────

export const ACTIVE_REGISTRY: ProviderRegistry = {
  imageAnalysis:       MockImageAnalysisProvider,
  prompt:              MockPromptProvider,
  render:              MockRenderProvider,
  materialRecognition: MockMaterialRecognitionProvider,
  styleRecognition:    MockStyleRecognitionProvider,
}

// ─── Registry builder ─────────────────────────────────────────────────────────

export function buildRegistry(plugins: PluginRegistration[]): ProviderRegistry {
  const enabled = plugins.filter(p => p.enabled)
  const registry: ProviderRegistry = {}
  for (const plugin of enabled) {
    switch (plugin.id) {
      case 'mock-image-analysis':       registry.imageAnalysis       = MockImageAnalysisProvider; break
      case 'mock-prompt':               registry.prompt              = MockPromptProvider; break
      case 'mock-render':               registry.render              = MockRenderProvider; break
      case 'mock-material-recognition': registry.materialRecognition = MockMaterialRecognitionProvider; break
      case 'mock-style-recognition':    registry.styleRecognition    = MockStyleRecognitionProvider; break
    }
  }
  return registry
}
