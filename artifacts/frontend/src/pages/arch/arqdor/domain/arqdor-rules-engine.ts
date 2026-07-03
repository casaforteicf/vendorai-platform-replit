import type {
  ArchitecturalObject, ObjectRule, RuleEvaluationResult, ObjectCategory, RuleSeverity,
} from './arqdor-domain-types'

// ─── Rule builders ────────────────────────────────────────────────────────────

function rule(
  objectId: string, type: string, condition: string,
  restriction: string, message: string, severity: RuleSeverity
): ObjectRule {
  return { id: `rule-${objectId}-${type}`, objectId, type, condition, restriction, message, severity }
}

// ─── Default rules per category ───────────────────────────────────────────────

export function getDefaultRulesForCategory(category: ObjectCategory, objectId: string): ObjectRule[] {
  switch (category) {
    case 'PUXADOR':
      return [
        rule(objectId,'no-replace','canReplaceObject === false','Não trocar por tipo diferente','Puxadores têm identidade visual crítica no projeto','HIGH'),
        rule(objectId,'no-remove', 'canRemoveObject === false', 'Não remover',                 'Remoção de puxador altera silhueta da marcenaria',  'HIGH'),
      ]
    case 'FERRAGEM':
      return [
        rule(objectId,'no-replace','canReplaceObject === false','Não trocar tipo de ferragem','Ferragens definem o sistema construtivo','MEDIUM'),
      ]
    case 'MARCENARIA':
      return [
        rule(objectId,'no-geometry',  'canChangeGeometry === false', 'Não alterar geometria',  'Geometria da marcenaria é precisa e não pode ser interpretada','CRITICAL'),
        rule(objectId,'no-thickness', 'canChangeGeometry === false', 'Não alterar espessura', 'Espessura do MDF é definida no projeto executivo',           'HIGH'),
      ]
    case 'ESQUADRIA':
      return [
        rule(objectId,'no-profile',  'canChangeGeometry === false', 'Não engrossar perfil',     'Perfil de esquadria tem dimensão técnica',  'CRITICAL'),
        rule(objectId,'no-aperture', 'canChangeGeometry === false', 'Não alterar abertura',      'Abertura definida no projeto',              'CRITICAL'),
        rule(objectId,'no-glass',    'canChangeMaterial === false', 'Não trocar vidro sem permissão','Especificação de vidro tem impacto térmico','HIGH'),
      ]
    case 'BANCADA':
      return [
        rule(objectId,'no-thickness','canChangeGeometry === false','Não alterar espessura','Espessura da bancada é especificada','CRITICAL'),
        rule(objectId,'no-height',   'canChangeGeometry === false','Não alterar altura',   'Altura ergonômica definida no projeto', 'HIGH'),
        rule(objectId,'mat-only-with-perm','canChangeMaterial === true','Alterar material somente com permissão','Material da bancada tem custo e fornecedor definidos','MEDIUM'),
      ]
    case 'CIRCULACAO':
      return [
        rule(objectId,'no-furniture', 'always','Não adicionar móveis na circulação', 'Circulação deve ser mantida livre','CRITICAL'),
        rule(objectId,'no-deco',      'always','Não preencher com decoração',         'Decoração bloqueia fluxo',          'HIGH'),
        rule(objectId,'no-block',     'always','Não bloquear fluxo',                  'Área de circulação técnica',         'CRITICAL'),
      ]
    case 'PISO':
      return [
        rule(objectId,'no-joint-change','canChangeGeometry === false','Não alterar juntas ou formato do assentamento','Padrão de assentamento é parte do projeto','MEDIUM'),
      ]
    case 'FORRO':
      return [
        rule(objectId,'no-height-change','canChangeGeometry === false','Não alterar pé-direito','Pé-direito é dado estrutural','CRITICAL'),
      ]
    case 'ESTRUTURA':
      return [
        rule(objectId,'no-change','always','Não alterar estrutura','Elemento estrutural — não modificável','CRITICAL'),
      ]
    default:
      return []
  }
}

// ─── Evaluate ─────────────────────────────────────────────────────────────────

export function evaluateObjectRules(object: ArchitecturalObject): RuleEvaluationResult {
  const p = object.aiPermissions
  const allRules = [
    ...object.rules,
    ...getDefaultRulesForCategory(object.category, object.id),
  ]

  const allowedActions:       string[] = []
  const blockedActions:       string[] = []
  const warnings:             string[] = []
  const criticalRestrictions: string[] = []

  // Derive allowed/blocked from permissions
  if (p.canChangeMaterial)    allowedActions.push('Alterar material')
  else                        blockedActions.push('Alterar material')
  if (p.canChangeGeometry)    allowedActions.push('Alterar geometria')
  else                        blockedActions.push('Alterar geometria')
  if (p.canChangeFinish)      allowedActions.push('Alterar acabamento')
  else                        blockedActions.push('Alterar acabamento')
  if (p.canChangeColor)       allowedActions.push('Alterar cor')
  else                        blockedActions.push('Alterar cor')
  if (p.canReplaceObject)     allowedActions.push('Substituir objeto')
  else                        blockedActions.push('Substituir objeto')
  if (p.canRemoveObject)      allowedActions.push('Remover objeto')
  else                        blockedActions.push('Remover objeto')
  if (p.canMoveObject)        allowedActions.push('Mover objeto')
  else                        blockedActions.push('Mover objeto')
  if (p.canAddRelatedObjects) allowedActions.push('Adicionar objetos relacionados')
  else                        blockedActions.push('Adicionar objetos relacionados')

  // Process explicit rules
  for (const r of allRules) {
    if (r.severity === 'CRITICAL') {
      criticalRestrictions.push(r.message)
    } else if (r.severity === 'HIGH') {
      blockedActions.push(r.restriction)
    } else {
      warnings.push(r.message)
    }
  }

  // Risk warnings
  if (object.aiRisk.level === 'VERY_HIGH') {
    criticalRestrictions.push(...object.aiRisk.restrictions)
    warnings.push(`Risco MUITO ALTO: ${object.aiRisk.reason}`)
  } else if (object.aiRisk.level === 'HIGH') {
    warnings.push(`Risco ALTO: ${object.aiRisk.reason}`)
  }

  return {
    allowedActions:       [...new Set(allowedActions)],
    blockedActions:       [...new Set(blockedActions)],
    warnings:             warnings.filter(Boolean),
    criticalRestrictions: criticalRestrictions.filter(Boolean),
  }
}

// ─── Bulk evaluation ──────────────────────────────────────────────────────────

export function evaluateAllObjects(objects: ArchitecturalObject[]): Map<string, RuleEvaluationResult> {
  const map = new Map<string, RuleEvaluationResult>()
  for (const obj of objects) {
    map.set(obj.id, evaluateObjectRules(obj))
  }
  return map
}
