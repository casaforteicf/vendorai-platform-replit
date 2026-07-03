import type {
  AIPermissions, AIRisk, Material, RenderConfig, ProjectDNA,
  ArchitecturalObject, Environment, ObjectCategory,
} from './arqdor-domain-types'

// ─── AI Permission presets ────────────────────────────────────────────────────

export const LOCKED_PERMISSIONS: AIPermissions = {
  canChangeGeometry: false, canChangeMaterial: false, canChangeFinish: false,
  canChangeColor: false, canChangeLighting: false, canChangeDecoration: false,
  canMoveObject: false, canReplaceObject: false, canRemoveObject: false,
  canAddRelatedObjects: false,
}

export const DEFAULT_PERMISSIONS: AIPermissions = {
  canChangeGeometry: false, canChangeMaterial: true, canChangeFinish: true,
  canChangeColor: true, canChangeLighting: true, canChangeDecoration: true,
  canMoveObject: false, canReplaceObject: false, canRemoveObject: false,
  canAddRelatedObjects: false,
}

export const FREE_PERMISSIONS: AIPermissions = {
  canChangeGeometry: true, canChangeMaterial: true, canChangeFinish: true,
  canChangeColor: true, canChangeLighting: true, canChangeDecoration: true,
  canMoveObject: true, canReplaceObject: true, canRemoveObject: true,
  canAddRelatedObjects: true,
}

export const CIRCULATION_PERMISSIONS: AIPermissions = {
  ...LOCKED_PERMISSIONS,
  canChangeLighting: true,
}

// ─── Risk presets ─────────────────────────────────────────────────────────────

export const DEFAULT_RISK: AIRisk = {
  level: 'LOW', reason: '', restrictions: [],
}

export const LOW_RISK: AIRisk   = { level: 'LOW',   reason: 'Elemento estável, bem definido.', restrictions: [] }
export const MED_RISK: AIRisk   = { level: 'MEDIUM', reason: 'Pode haver reinterpretação.', restrictions: [] }
export const HIGH_RISK: AIRisk  = { level: 'HIGH',  reason: 'Alto risco de alteração não intencional.', restrictions: ['Forneça referência'] }
export const VHIGH_RISK: AIRisk = { level: 'VERY_HIGH', reason: 'A IA normalmente ignora ou substitui.', restrictions: ['Bloquear categoria','Forneça referência completa'] }

// ─── Material default ─────────────────────────────────────────────────────────

export const EMPTY_MATERIAL: Material = {
  id: '', name: '', category: '', manufacturer: '', line: '', code: '',
  color: '', finish: '', texture: '', grainDirection: false, glossLevel: 0,
  pbrMaps: {}, tags: [], referenceImages: [], notes: '',
}

// ─── Render Config default ────────────────────────────────────────────────────

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  renderEngineStyle: 'Photorealistic PBR',
  resolution:        '8K (7680×4320)',
  lens:              '35mm',
  cameraHeight:      '0.9m (câmera baixa)',
  lightingMood:      'Warm natural + artificial accent',
  hdri:              'Interior studio warm',
  whiteBalance:      '3200K',
  toneMapping:       'ACES Filmic',
  depthOfField:      true,
}

// ─── DNA default ─────────────────────────────────────────────────────────────

export const DEFAULT_DNA: ProjectDNA = {
  architecturalStyle:   'Contemporâneo',
  designLanguage:       'Minimalismo funcional',
  colorPalette:         ['#E8E0D5','#C8A87A','#2D2D2D','#F5F0EB'],
  predominantMaterials: ['Carvalho natural','Mármore Calacatta'],
  predominantHardware:  ['Inox escovado','Preto fosco'],
  detailingLevel:       'HIGH',
  atmosphere:           'Aconchegante e sofisticado',
  targetUse:            'Apresentação ao cliente',
  renderObjective:      'Alta fidelidade ao projeto executivo',
  photographyStyle:     'Perspectiva 45° — câmera baixa',
  realismLevel:         9,
}

// ─── Factory functions ────────────────────────────────────────────────────────

let _idCounter = 1000

export function nextId(prefix = 'obj'): string {
  return `${prefix}-${++_idCounter}`
}

export function createObject(
  id: string,
  parentId: string | null,
  environmentId: string,
  name: string,
  category: ObjectCategory,
  overrides: Partial<ArchitecturalObject> = {}
): ArchitecturalObject {
  return {
    id, parentId, environmentId, name, category,
    type:          category,
    description:   '',
    status:        'ACTIVE',
    confidence:    80,
    sourceOfTruth: 'AI_DETECTION',
    material:      { ...EMPTY_MATERIAL },
    finish:        '',
    color:         '',
    texture:       '',
    grainDirection: false,
    thickness:     '',
    dimensions:    { width: '', height: '', depth: '' },
    position:      { x: '', y: '', z: '' },
    referenceImages: [],
    aiPermissions: { ...DEFAULT_PERMISSIONS },
    aiRisk:        { ...DEFAULT_RISK },
    relationships: [],
    rules:         [],
    promptNotes:   '',
    history:       [],
    ...overrides,
  }
}

export function createEnvironment(
  id: string, name: string, category = 'INTERIOR',
  description = '',
  objects: ArchitecturalObject[] = []
): Environment {
  return { id, name, category, description, architecturalObjects: objects }
}
