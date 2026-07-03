// ─── Component Engine — Business Rules ───────────────────────────────────────
// Regras de compatibilidade e substituição entre objeto arquitetônico e componente.
// Nenhuma chamada de API. Puro domínio.

import type { ComponentItem, ReplacementBehavior, ReplacementCheckResult } from './component-types'
import type { ArchitecturalObject } from '../../../../pages/arch/arqdor/domain/arqdor-domain-types'

// ─── Category compatibility map ───────────────────────────────────────────────
// Maps ArchitecturalObject.category (ObjectCategory) → ComponentCategory[]

const OBJECT_TO_COMPONENT_CAT: Record<string, string[]> = {
  MARCENARIA:   ['KITCHEN','CABINETRY'],
  EQUIPAMENTOS: ['APPLIANCE','REFRIGERATOR','OVEN','MICROWAVE','WASHER','COOKTOP'],
  METAL:        ['SINK','FAUCET','HANDLE','HARDWARE'],
  BANCADA:      ['STONE','SINK','FAUCET'],
  PISO:         ['FLOORING','STONE','WALL_COVERING'],
  FORRO:        ['LIGHTING','WALL_COVERING'],
  ESQUADRIA:    ['DOOR','WINDOW','FRAME'],
  FERRAGEM:     ['HANDLE','HARDWARE'],
  PUXADOR:      ['HANDLE','HARDWARE'],
  MOBILIARIO:   ['SOFA','ARMCHAIR','CHAIR','TABLE','BED'],
  DECORACAO:    ['DECOR','PLANT','LIGHTING'],
  CIRCULACAO:   ['FLOORING'],
  ESTRUTURA:    ['CUSTOM'],
  ILUMINACAO:   ['LIGHTING'],
}

// ─── Check replacement ────────────────────────────────────────────────────────

export function canReplaceWithComponent(
  obj: ArchitecturalObject,
  component: ComponentItem
): ReplacementCheckResult {
  // Rule 1: if canReplaceObject is false, deny full replacement
  const fullReplace = component.replacementBehavior === 'REPLACE_OBJECT'
  if (fullReplace && !obj.aiPermissions.canReplaceObject) {
    return {
      allowed: false,
      compatibilityScore: 20,
      reason: `${obj.name} tem canReplaceObject = false. Substituição total bloqueada.`,
      suggestion: 'Use comportamento MATERIAL_ONLY ou KEEP_GEOMETRY.',
      behaviorOverride: 'MATERIAL_ONLY',
    }
  }

  // Rule 2: Material only behavior always allowed (if canChangeMaterial)
  if (component.replacementBehavior === 'MATERIAL_ONLY') {
    if (!obj.aiPermissions.canChangeMaterial) {
      return {
        allowed: false, compatibilityScore: 10,
        reason: 'canChangeMaterial = false. Material bloqueado pela permissão.',
      }
    }
    return { allowed: true, compatibilityScore: 90 }
  }

  // Rule 3: Check category compatibility
  const compatCats = OBJECT_TO_COMPONENT_CAT[obj.category] ?? []
  const catMatch = component.compatibleObjectCategories.some(c => compatCats.includes(c))
  const baseScore = catMatch ? 85 : 45

  // Rule 4: dimension hint
  let dimBonus = 0
  if (component.dimensions && obj.dimensions.width && obj.dimensions.height) {
    dimBonus = 10
  }

  const score = Math.min(100, baseScore + dimBonus)

  // Rule 5: locked object
  if (obj.aiPermissions.canChangeMaterial === false && obj.aiPermissions.canChangeGeometry === false) {
    return {
      allowed: false, compatibilityScore: 5,
      reason: `${obj.name} está totalmente bloqueado (LOCKED). Nenhuma alteração permitida.`,
    }
  }

  return {
    allowed: true,
    compatibilityScore: score,
    reason: catMatch
      ? `Categoria compatível: ${component.category}`
      : `Compatibilidade indireta: ${component.name} pode ser aplicado como referência`,
    behaviorOverride: !catMatch ? 'REFERENCE_STYLE_ONLY' : undefined,
  }
}

// ─── Get compatibility score ──────────────────────────────────────────────────

export function getCompatibilityScore(obj: ArchitecturalObject, component: ComponentItem): number {
  return canReplaceWithComponent(obj, component).compatibilityScore
}

// ─── Score color ──────────────────────────────────────────────────────────────

export function compatibilityColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 50) return '#fbbf24'
  return '#f87171'
}

// ─── Generate prompt fragment with component ──────────────────────────────────

export function generateComponentPromptFragment(
  obj: ArchitecturalObject,
  component: ComponentItem,
  behavior: ReplacementBehavior
): string {
  const id   = `[${obj.name}]`
  const comp = `${component.brand} ${component.name} (${component.code ?? component.model ?? component.manufacturer})`

  const behaviorMap: Record<ReplacementBehavior, string> = {
    MATERIAL_ONLY:
      `${id} Apply materials and finishes of ${comp} to existing geometry. Keep shape and position exactly.`,
    KEEP_GEOMETRY:
      `${id} Maintain position and proportion of original ${obj.name}. Use visual appearance, finish, and design details of ${comp}.`,
    MATCH_DIMENSIONS:
      `${id} Find geometry proportions matching dimensions of ${comp}. Reference product specifications.`,
    REPLACE_OBJECT:
      `${id} Replace entirely with ${comp}. Follow manufacturer product images for exact visual representation.`,
    SCALE_TO_FIT:
      `${id} Scale ${comp} to fit existing volume and spatial allocation of ${obj.name}.`,
    REFERENCE_STYLE_ONLY:
      `${id} Use ${comp} as aesthetic reference only — do not copy exactly. Capture style, finish, and atmosphere.`,
  }

  return behaviorMap[behavior] ?? behaviorMap.KEEP_GEOMETRY
}

// ─── Get replacement instruction (human-readable) ─────────────────────────────

export function getReplacementInstruction(
  behavior: ReplacementBehavior,
  objName: string,
  componentName: string
): string {
  const map: Record<ReplacementBehavior, string> = {
    MATERIAL_ONLY:       `Aplicar materiais de "${componentName}" em "${objName}" sem alterar geometria`,
    KEEP_GEOMETRY:       `Manter proporções de "${objName}" e aplicar aparência de "${componentName}"`,
    MATCH_DIMENSIONS:    `Buscar dimensões de "${componentName}" para adequar "${objName}"`,
    REPLACE_OBJECT:      `Substituir "${objName}" inteiramente por "${componentName}"`,
    SCALE_TO_FIT:        `Escalar "${componentName}" para preencher o volume de "${objName}"`,
    REFERENCE_STYLE_ONLY:`Usar "${componentName}" como referência estética para "${objName}"`,
  }
  return map[behavior]
}

// ─── Filter components ────────────────────────────────────────────────────────

export function filterComponents(
  components: ComponentItem[],
  filter: { category?: string; manufacturer?: string; brand?: string; query?: string }
): ComponentItem[] {
  return components.filter(c => {
    if (filter.category     && c.category     !== filter.category)     return false
    if (filter.manufacturer && c.manufacturer !== filter.manufacturer) return false
    if (filter.brand        && c.brand        !== filter.brand)        return false
    if (filter.query) {
      const q = filter.query.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        c.manufacturer.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some(t => t.includes(q))
      )
    }
    return true
  })
}
