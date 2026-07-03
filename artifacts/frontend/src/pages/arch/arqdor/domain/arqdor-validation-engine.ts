import type { Project, ValidationResult, ValidationItem, RuleSeverity, ArchitecturalObject } from './arqdor-domain-types'
import { getAllObjects } from './arqdor-relationships'

let _vId = 0
function vitem(
  severity: RuleSeverity, message: string,
  objectId?: string, field?: string
): ValidationItem {
  return { id: `v-${++_vId}`, severity, message, objectId, field }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

function checkSourceOfTruth(obj: ArchitecturalObject, result: ValidationResult): void {
  if (obj.sourceOfTruth === 'AI_DETECTION' && obj.confidence < 70) {
    result.warnings.push(vitem('MEDIUM',
      `"${obj.name}" depende de detecção IA com confiança baixa (${obj.confidence}%). Confirme a fonte.`,
      obj.id, 'sourceOfTruth'
    ))
  }
}

function checkMaterial(obj: ArchitecturalObject, result: ValidationResult): void {
  if (
    obj.category !== 'AMBIENTE' &&
    obj.category !== 'CIRCULACAO' &&
    obj.aiPermissions.canChangeMaterial &&
    !obj.material?.name
  ) {
    result.warnings.push(vitem('MEDIUM',
      `"${obj.name}" tem permissão para alterar material mas nenhum material foi especificado.`,
      obj.id, 'material'
    ))
  }
}

function checkLowConfidence(obj: ArchitecturalObject, result: ValidationResult): void {
  if (obj.confidence < 50 && obj.category !== 'AMBIENTE') {
    result.errors.push(vitem('HIGH',
      `"${obj.name}" tem confiança muito baixa (${obj.confidence}%). Risco de interpretação incorreta pela IA.`,
      obj.id, 'confidence'
    ))
  }
}

function checkHighRiskWithoutRestriction(obj: ArchitecturalObject, result: ValidationResult): void {
  if (
    (obj.aiRisk.level === 'VERY_HIGH' || obj.aiRisk.level === 'HIGH') &&
    obj.aiRisk.restrictions.length === 0
  ) {
    result.warnings.push(vitem('HIGH',
      `"${obj.name}" tem risco ${obj.aiRisk.level} mas nenhuma restrição foi definida. Considere bloquear permissões.`,
      obj.id, 'aiRisk'
    ))
  }
}

function checkLockedWithPermissions(obj: ArchitecturalObject, result: ValidationResult): void {
  const p = obj.aiPermissions
  if (obj.status === 'LOCKED') {
    const contradictions: string[] = []
    if (p.canChangeGeometry)    contradictions.push('canChangeGeometry')
    if (p.canChangeMaterial)    contradictions.push('canChangeMaterial')
    if (p.canReplaceObject)     contradictions.push('canReplaceObject')
    if (p.canRemoveObject)      contradictions.push('canRemoveObject')
    if (contradictions.length) {
      result.errors.push(vitem('CRITICAL',
        `"${obj.name}" está LOCKED mas tem permissões ativas: ${contradictions.join(', ')}. Contradição crítica.`,
        obj.id, 'aiPermissions'
      ))
    }
  }
}

function checkNoCategory(obj: ArchitecturalObject, result: ValidationResult): void {
  if (!obj.category) {
    result.errors.push(vitem('HIGH',
      `"${obj.name}" não tem categoria definida. O motor de regras não pode funcionar corretamente.`,
      obj.id, 'category'
    ))
  }
}

function checkVeryHighRiskWithNoRef(obj: ArchitecturalObject, result: ValidationResult): void {
  if (obj.aiRisk.level === 'VERY_HIGH' && obj.referenceImages.length === 0) {
    result.warnings.push(vitem('HIGH',
      `"${obj.name}" tem risco MUITO ALTO e nenhuma imagem de referência. A IA provavelmente não preservará este elemento.`,
      obj.id, 'referenceImages'
    ))
  }
}

function checkProjectCompleteness(project: Project, result: ValidationResult): void {
  if (!project.dna.architecturalStyle) {
    result.suggestions.push(vitem('LOW', 'ArqDNA™ sem estilo arquitetônico definido. O prompt de DNA ficará incompleto.'))
  }
  if (!project.dna.predominantMaterials.length) {
    result.suggestions.push(vitem('LOW', 'Nenhum material predominante definido no ArqDNA™.'))
  }
  if (!project.renderConfig.renderEngineStyle) {
    result.suggestions.push(vitem('LOW', 'Configuração de render incompleta — engine não definido.'))
  }
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateProject(project: Project): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [], suggestions: [] }
  const objs = getAllObjects(project)

  for (const obj of objs) {
    checkNoCategory(obj, result)
    checkLowConfidence(obj, result)
    checkLockedWithPermissions(obj, result)
    checkHighRiskWithoutRestriction(obj, result)
    checkSourceOfTruth(obj, result)
    checkMaterial(obj, result)
    checkVeryHighRiskWithNoRef(obj, result)
  }

  checkProjectCompleteness(project, result)

  return result
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export function validationSummary(result: ValidationResult): string {
  const total = result.errors.length + result.warnings.length + result.suggestions.length
  if (total === 0) return '✅ Projeto sem problemas encontrados.'
  return [
    result.errors.length      ? `🔴 ${result.errors.length} erro(s) crítico(s)` : '',
    result.warnings.length    ? `🟡 ${result.warnings.length} aviso(s)`          : '',
    result.suggestions.length ? `💡 ${result.suggestions.length} sugestão(ões)`  : '',
  ].filter(Boolean).join('  ·  ')
}
