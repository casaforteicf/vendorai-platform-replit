import type { Project, ArchitecturalObject, PromptStructure } from './arqdor-domain-types'
import { getAllObjects } from './arqdor-relationships'
import { getDefaultRulesForCategory } from './arqdor-rules-engine'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function objName(o: ArchitecturalObject): string { return o.name }

function matDesc(o: ArchitecturalObject): string {
  const m = o.material
  if (!m?.name) return ''
  const parts = [m.name, m.finish, m.color].filter(Boolean)
  return parts.join(', ')
}

// ─── Individual generators ────────────────────────────────────────────────────

export function generateCorePrompt(project: Project): string {
  const dna  = project.dna
  const objs = getAllObjects(project)
  const locked = objs.filter(o =>
    !o.aiPermissions.canChangeGeometry &&
    !o.aiPermissions.canChangeMaterial &&
    o.category !== 'AMBIENTE' && o.category !== 'CIRCULACAO'
  )
  const lockList = locked.length ? ` PRESERVE without any modification: ${locked.map(objName).join(', ')}.` : ''
  return `Photorealistic architectural render — ${dna.photographyStyle.toLowerCase()}. ` +
    `${dna.architecturalStyle} interior, ${dna.atmosphere.toLowerCase()}. ` +
    `Professional architectural photography, 8K resolution, physically-based rendering.${lockList}`
}

export function generateProjectPrompt(project: Project): string {
  const objs   = getAllObjects(project).filter(o => o.category !== 'AMBIENTE')
  const parts: string[] = []

  const matObjs  = objs.filter(o => o.aiPermissions.canChangeMaterial && o.material?.name)
  const replObjs = objs.filter(o => o.aiPermissions.canReplaceObject)
  const addObjs  = objs.filter(o => o.aiPermissions.canAddRelatedObjects)
  const remObjs  = objs.filter(o => o.aiPermissions.canRemoveObject)

  if (matObjs.length)  parts.push(`APPLY specified materials: ${matObjs.map(o => `${objName(o)} → ${matDesc(o)}`).join('; ')}.`)
  if (replObjs.length) parts.push(`REPLACE completely: ${replObjs.map(o => `${objName(o)}${o.material?.name ? ` → ${o.material.name}` : ''}`).join(', ')}.`)
  if (addObjs.length)  parts.push(`ADD related elements to: ${addObjs.map(objName).join(', ')}.`)
  if (remObjs.length)  parts.push(`REMOVE cleanly with inpainting: ${remObjs.map(objName).join(', ')}.`)

  return parts.join('\n') || 'No project-level modifications requested.'
}

export function generateObjectPrompt(project: Project): string {
  const objs = getAllObjects(project).filter(o =>
    o.category !== 'AMBIENTE' && o.promptNotes
  )
  if (!objs.length) return ''
  return objs.map(o => `[${o.name}] ${o.promptNotes}`).join('\n')
}

export function generateRulePrompt(project: Project): string {
  const objs  = getAllObjects(project).filter(o => o.category !== 'AMBIENTE')
  const lines: string[] = []
  for (const obj of objs) {
    const rules = [...obj.rules, ...getDefaultRulesForCategory(obj.category, obj.id)]
    const critical = rules.filter(r => r.severity === 'CRITICAL')
    for (const r of critical) {
      lines.push(`[RULE — ${obj.name}] ${r.restriction}: ${r.message}.`)
    }
  }
  return lines.join('\n') || ''
}

export function generateDNAPrompt(project: Project): string {
  const dna = project.dna
  return [
    `Style: ${dna.architecturalStyle} — ${dna.designLanguage}.`,
    `Materials: ${dna.predominantMaterials.join(', ')}.`,
    `Hardware: ${dna.predominantHardware.join(', ')}.`,
    `Atmosphere: ${dna.atmosphere}.`,
    `Detailing: ${dna.detailingLevel}. Realism: ${dna.realismLevel}/10.`,
    `Target: ${dna.renderObjective}.`,
  ].join(' ')
}

export function generateRenderPrompt(project: Project): string {
  const rc = project.renderConfig
  return [
    `Engine: ${rc.renderEngineStyle}.`,
    `Resolution: ${rc.resolution}.`,
    `Lens: ${rc.lens}.`,
    `Camera height: ${rc.cameraHeight}.`,
    `Lighting: ${rc.lightingMood}.`,
    `HDRI: ${rc.hdri}.`,
    `White balance: ${rc.whiteBalance}.`,
    `Tone mapping: ${rc.toneMapping}.`,
    rc.depthOfField ? 'Depth of field: enabled.' : '',
  ].filter(Boolean).join(' ')
}

export function generateNegativePrompt(project: Project): string {
  const objs  = getAllObjects(project)
  const highRiskObjs = objs.filter(o => o.aiRisk.level === 'VERY_HIGH' || o.aiRisk.level === 'HIGH')
  const locked       = objs.filter(o => !o.aiPermissions.canChangeMaterial && !o.aiPermissions.canChangeGeometry && o.category !== 'AMBIENTE')

  const neg: string[] = [
    'Do not modify any LOCKED or PRESERVED elements.',
    'No distorted proportions, floating objects, or structural deformations.',
    'No unrealistic reflections, light leaks, or rendering artifacts.',
    'No watermarks, people, animals, or cartoon style.',
    'No overexposed areas or inconsistent shadow direction.',
    'No low-resolution textures or visible seams.',
  ]

  if (locked.length)       neg.push(`Do not alter: ${locked.map(objName).join(', ')}.`)
  if (highRiskObjs.length) neg.push(`Extra caution: ${highRiskObjs.map(o => `${objName(o)} (${o.aiRisk.restrictions.join('; ')})`).join(', ')}.`)

  return neg.join(' ')
}

export function generateFinalPrompt(project: Project): string {
  const parts = [
    generateCorePrompt(project),
    generateProjectPrompt(project),
    generateObjectPrompt(project),
    generateRulePrompt(project),
    generateDNAPrompt(project),
    generateRenderPrompt(project),
  ].filter(p => p && p.trim())
  return parts.join('\n\n')
}

// ─── Full structure ───────────────────────────────────────────────────────────

export function generateFullPromptStructure(project: Project): PromptStructure {
  return {
    corePrompt:    generateCorePrompt(project),
    projectPrompt: generateProjectPrompt(project),
    objectPrompt:  generateObjectPrompt(project),
    rulePrompt:    generateRulePrompt(project),
    dnaPrompt:     generateDNAPrompt(project),
    renderPrompt:  generateRenderPrompt(project),
    negativePrompt:generateNegativePrompt(project),
    finalPrompt:   generateFinalPrompt(project),
  }
}

/** Per-object prompt fragment */
export function generateObjectFragment(obj: ArchitecturalObject): string {
  const p = obj.aiPermissions
  if (!p.canChangeGeometry && !p.canChangeMaterial) return `PRESERVE ${obj.name} exactly — do not modify.`
  if (p.canReplaceObject && obj.material?.name)     return `REPLACE ${obj.name} with ${obj.material.name}${obj.color ? ` (${obj.color})` : ''}.`
  if (obj.material?.name)                           return `APPLY ${matDesc(obj)} to ${obj.name}.`
  if (obj.promptNotes)                              return `[${obj.name}] ${obj.promptNotes}`
  return `${obj.name}: AI interprets within project style.`
}
