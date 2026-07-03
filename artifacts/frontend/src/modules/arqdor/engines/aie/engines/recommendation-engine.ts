// ─── Recommendation Engine ────────────────────────────────────────────────────
// Generates human-readable recommendations based on engine results.
// IMPORTANT: autoApply is always false. Recommendations are never applied automatically.

import type {
  ProjectContext, AIEResult, Recommendation, RecommendationSeverity, RecommendationCategory,
} from '../aie-types'

let _id = 0
const rec = (
  category: RecommendationCategory,
  severity: RecommendationSeverity,
  message: string,
  detail?: string,
  action?: string,
): Recommendation => ({
  id: `rec-${++_id}`,
  category, severity, message, detail, action,
  autoApply: false,
})

export function buildRecommendations(ctx: ProjectContext, partial: Omit<AIEResult, 'recommendations'>): Recommendation[] {
  _id = 0
  const recs: Recommendation[] = []
  const { consistency, material, composition, lighting, photography, designIntent, renderReadiness, validation } = partial

  // ── Material recommendations ─────────────────────────────────────────────
  if (consistency.woodCount > 2) {
    recs.push(rec('MATERIAL', 'WARNING',
      `O projeto possui ${consistency.woodCount} madeiras diferentes.`,
      'Paletas coesas utilizam no máximo 2 madeiras. Madeiras adicionais fragmentam a linguagem do projeto.',
      'Unificar madeiras pela família tonal (claras ou escuras)',
    ))
  }

  if (material.missingMaterials.length > 0) {
    const count = material.missingMaterials.length
    recs.push(rec('MATERIAL', count > 3 ? 'CRITICAL' : 'WARNING',
      `${count} objeto${count>1?'s':''} sem material definido: ${material.missingMaterials.slice(0,3).join(', ')}${count>3?'…':''}`,
      'Objetos sem material são renderizados com substitutos padrão, o que prejudica a qualidade.',
      'Atribuir material a todos os objetos antes do render',
    ))
  }

  if (material.paletteConflicts.length > 0) {
    recs.push(rec('MATERIAL', 'WARNING',
      `${material.paletteConflicts.length} conflito(s) de paleta detectado(s) entre materiais.`,
      material.paletteConflicts.map(c => `• ${c.material1} × ${c.material2}: ${c.reason}`).join('\n'),
      'Revisar compatibilidade de materiais',
    ))
  }

  // ── Composition recommendations ───────────────────────────────────────────
  if (composition.symmetry === 'ASYMMETRIC_UNBALANCED') {
    recs.push(rec('COMPOSITION', 'WARNING',
      'O peso visual está desbalanceado. Há concentração excessiva em um lado da composição.',
      `Distribuição: ${composition.weightDistribution.left}% esquerda × ${composition.weightDistribution.right}% direita.`,
      'Redistribuir objetos ou adicionar elementos de contrapeso',
    ))
  }

  if (composition.contrastLevel === 'EXTREME') {
    recs.push(rec('COMPOSITION', 'INFO',
      'Contraste visual extremo entre objetos.',
      'Pode criar drama visual positivo, mas verifique se é intencional.',
    ))
  }

  if (composition.rhythm === 'RANDOM') {
    recs.push(rec('COMPOSITION', 'INFO',
      'Sem ritmo visual claro na composição.',
      'Ritmo regular ou progressivo cria uma experiência mais fluida para o observador.',
    ))
  }

  // ── Lighting recommendations ──────────────────────────────────────────────
  if (!lighting.defined) {
    recs.push(rec('LIGHTING', 'CRITICAL',
      'Perfil de iluminação não definido.',
      'Sem uma definição de iluminação, o render utilizará padrões genéricos com resultado imprevisível.',
      'Definir tipo de luz, temperatura de cor e direção no perfil de iluminação',
    ))
  } else if (lighting.colorTemperature === 'COOL' && ctx.style?.name?.toLowerCase().includes('aconcheg')) {
    recs.push(rec('LIGHTING', 'WARNING',
      'A iluminação está muito fria para um ambiente que busca aconchego.',
      `Temperatura atual: ${lighting.kelvin}K. Para ambientes acolhedores, prefira 2700–3200K.`,
      'Reduzir temperatura de cor da iluminação',
    ))
  }

  // ── Photography recommendations ───────────────────────────────────────────
  if (!photography.defined) {
    recs.push(rec('PHOTOGRAPHY', 'WARNING',
      'Perfil de fotografia não definido.',
      'Definir lens, ângulo e composição antes de renderizar.',
      'Configurar perfil fotográfico no módulo de fotografia',
    ))
  }

  // ── Design Intent recommendations ─────────────────────────────────────────
  if (designIntent.coverageScore < 50) {
    recs.push(rec('DESIGN_INTENT', 'WARNING',
      `Apenas ${designIntent.coverageScore}% dos objetos possuem intenção de design definida.`,
      'Sem intenção, o motor não consegue validar se o render cumpre os objetivos do projeto.',
      'Adicionar design intent a todos os objetos principais',
    ))
  }

  if (designIntent.intentConflicts.length > 0) {
    const highConflicts = designIntent.intentConflicts.filter(c=>c.severity==='HIGH')
    if (highConflicts.length > 0) {
      recs.push(rec('DESIGN_INTENT', 'WARNING',
        `${highConflicts.length} conflito(s) de intenção detectado(s) entre objetos.`,
        highConflicts.map(c=>`• ${c.objectA} × ${c.objectB}: ${c.conflict}`).join('\n'),
      ))
    }
  }

  // ── Render Readiness recommendations ──────────────────────────────────────
  if (renderReadiness.score < 80) {
    const blocking = renderReadiness.missing.filter(m=>m.blocking)
    if (blocking.length > 0) {
      recs.push(rec('RENDER_READINESS', 'CRITICAL',
        `Projeto não está pronto para render. ${blocking.length} item(ns) bloqueante(s).`,
        blocking.map(b=>`• ${b.label}`).join('\n'),
        'Resolver todos os itens bloqueantes antes de renderizar',
      ))
    }
  }

  // ── Consistency recommendations ───────────────────────────────────────────
  for (const issue of consistency.issues.filter(i=>i.severity==='HIGH')) {
    recs.push(rec('CONSISTENCY', 'WARNING', issue.description, undefined, 'Revisar consistência de materiais'))
  }

  // ── Validation ─────────────────────────────────────────────────────────
  const criticalValidations = validation.results.filter(v=>v.status==='FAIL')
  if (criticalValidations.length > 0) {
    for (const v of criticalValidations.slice(0,3)) {
      recs.push(rec('GEOMETRY', 'CRITICAL', v.message, undefined, v.resolution))
    }
  }

  return recs
}
