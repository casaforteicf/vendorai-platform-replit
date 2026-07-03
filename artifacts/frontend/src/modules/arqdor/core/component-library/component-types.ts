// ─── Component Library — Core Types ──────────────────────────────────────────
// Tipos canônicos da Component Library.
// Estrutura preparada para importação futura de catálogos de fabricantes.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ComponentCategory =
  | 'KITCHEN'        | 'CABINETRY'      | 'BED'           | 'MATTRESS'
  | 'SOFA'           | 'ARMCHAIR'       | 'CHAIR'         | 'TABLE'
  | 'APPLIANCE'      | 'COOKTOP'        | 'OVEN'          | 'MICROWAVE'
  | 'REFRIGERATOR'   | 'WASHER'         | 'SINK'          | 'FAUCET'
  | 'HANDLE'         | 'HARDWARE'       | 'LIGHTING'      | 'FLOORING'
  | 'WALL_COVERING'  | 'STONE'          | 'DOOR'          | 'WINDOW'
  | 'FRAME'          | 'DECOR'          | 'PLANT'         | 'CUSTOM'

export type ReplacementBehavior =
  | 'MATERIAL_ONLY'      // Trocar apenas material/acabamento
  | 'KEEP_GEOMETRY'      // Manter medidas e aplicar aparência do componente
  | 'MATCH_DIMENSIONS'   // Buscar componente com dimensões compatíveis
  | 'REPLACE_OBJECT'     // Substituir o objeto inteiro
  | 'SCALE_TO_FIT'       // Ajustar componente ao volume existente
  | 'REFERENCE_STYLE_ONLY' // Usar como referência estética sem copiar exatamente

export type ComponentSource =
  | 'USER_UPLOAD'    // Importado pelo usuário
  | 'MANUAL_INPUT'   // Cadastrado manualmente
  | 'CATALOG'        // Importado de catálogo
  | 'MANUFACTURER'   // Direto do fabricante
  | 'AI_DETECTION'   // Detectado por IA
  | 'MARKETPLACE'    // Importado do marketplace

// ─── Component Dimensions ─────────────────────────────────────────────────────

export interface ComponentDimensions {
  width:  string   // mm ou cm
  height: string
  depth:  string
  unit:   'mm' | 'cm' | 'm'
}

// ─── Component Material Spec ──────────────────────────────────────────────────

export interface ComponentMaterialSpec {
  name:    string
  finish:  string
  color?:  string
  texture?: string
}

// ─── Component Item ───────────────────────────────────────────────────────────

export interface ComponentItem {
  id:          string
  name:        string
  category:    ComponentCategory
  subcategory?: string
  manufacturer: string
  brand:        string
  line?:        string
  model?:       string
  code?:        string
  description:  string
  dimensions?:  ComponentDimensions
  materials:    ComponentMaterialSpec[]
  finishes:     string[]
  colors:       string[]
  textures:     string[]
  referenceImages: string[]
  productImages:   string[]
  technicalFiles:  string[]
  tags:            string[]
  compatibleObjectCategories: ComponentCategory[]
  replacementBehavior:        ReplacementBehavior
  source:      ComponentSource
  notes?:      string
  createdAt:   string
  updatedAt:   string
}

// ─── Component Assignment (stored on ArchitecturalObject) ────────────────────

export interface ComponentAssignment {
  componentId:   string
  componentName: string
  manufacturer:  string
  brand:         string
  model?:        string
  behavior:      ReplacementBehavior
  locked:        boolean
  allowedReplacementCategories: ComponentCategory[]
  assignedAt:    string
}

// ─── Replacement rule check result ───────────────────────────────────────────

export interface ReplacementCheckResult {
  allowed:        boolean
  compatibilityScore: number   // 0–100
  reason?:        string
  suggestion?:    string
  behaviorOverride?: ReplacementBehavior
}

// ─── Catalog filter ───────────────────────────────────────────────────────────

export interface ComponentFilter {
  category?:     ComponentCategory
  manufacturer?: string
  brand?:        string
  tags?:         string[]
  query?:        string
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  KITCHEN:'Cozinha Planejada', CABINETRY:'Marcenaria', BED:'Cama', MATTRESS:'Colchão',
  SOFA:'Sofá', ARMCHAIR:'Poltrona', CHAIR:'Cadeira', TABLE:'Mesa',
  APPLIANCE:'Eletrodoméstico', COOKTOP:'Cooktop', OVEN:'Forno', MICROWAVE:'Micro-ondas',
  REFRIGERATOR:'Geladeira', WASHER:'Lava e Seca', SINK:'Cuba', FAUCET:'Torneira',
  HANDLE:'Puxador', HARDWARE:'Ferragem', LIGHTING:'Luminária', FLOORING:'Piso',
  WALL_COVERING:'Revestimento', STONE:'Pedra', DOOR:'Porta', WINDOW:'Janela',
  FRAME:'Esquadria', DECOR:'Decoração', PLANT:'Planta', CUSTOM:'Personalizado',
}

export const REPLACEMENT_BEHAVIOR_LABELS: Record<ReplacementBehavior, string> = {
  MATERIAL_ONLY:       'Apenas material/acabamento',
  KEEP_GEOMETRY:       'Manter geometria, aplicar aparência',
  MATCH_DIMENSIONS:    'Buscar dimensões compatíveis',
  REPLACE_OBJECT:      'Substituir objeto inteiro',
  SCALE_TO_FIT:        'Escalar para encaixar',
  REFERENCE_STYLE_ONLY:'Somente referência estética',
}

export const REPLACEMENT_BEHAVIOR_ICONS: Record<ReplacementBehavior, string> = {
  MATERIAL_ONLY:       '🎨',
  KEEP_GEOMETRY:       '📐',
  MATCH_DIMENSIONS:    '📏',
  REPLACE_OBJECT:      '🔄',
  SCALE_TO_FIT:        '↔️',
  REFERENCE_STYLE_ONLY:'✨',
}
