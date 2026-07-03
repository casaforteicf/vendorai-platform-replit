// ─── Consistency Engine ───────────────────────────────────────────────────────
// Checks material, palette and style coherence across the project.

import type { ProjectContext, ConsistencyResult, ConsistencyIssue } from '../aie-types'

const WOOD_KEYWORDS    = ['madeira','mdf','freijó','carvalho','nogal','pinho','cedro','mogno','teca','bambú']
const METAL_KEYWORDS   = ['inox','alumínio','cobre','latão','ferro','aço','bronze','cromado','dourado']
const STONE_KEYWORDS   = ['mármore','granito','quartzito','porcelanato','ardósia','calcário','basalto']

function countMatches(name: string, keywords: string[]): boolean {
  const n = name.toLowerCase()
  return keywords.some(k => n.includes(k))
}

export function runConsistencyEngine(ctx: ProjectContext): ConsistencyResult {
  const issues: ConsistencyIssue[] = []

  const woodMats  = ctx.materials.filter(m => countMatches(m.name, WOOD_KEYWORDS))
  const metalMats = ctx.materials.filter(m => countMatches(m.name, METAL_KEYWORDS))
  const stoneMats = ctx.materials.filter(m => countMatches(m.name, STONE_KEYWORDS))

  // Too many woods rule
  if (woodMats.length > 2) {
    issues.push({
      type:'TOO_MANY_WOODS',
      description:`Projeto utiliza ${woodMats.length} madeiras diferentes (${woodMats.map(m=>m.name).join(', ')}). Recomendado: máximo 2.`,
      objects: woodMats.map(m => m.name),
      severity: woodMats.length > 3 ? 'HIGH' : 'MEDIUM',
    })
  }

  // Metal inconsistency — more than 2 different metals
  if (metalMats.length > 2) {
    issues.push({
      type:'HARDWARE_INCONSISTENCY',
      description:`${metalMats.length} acabamentos metálicos diferentes detectados. Isso fragmenta a linguagem do projeto.`,
      objects: metalMats.map(m => m.name),
      severity: 'MEDIUM',
    })
  }

  // Palette analysis
  const allPaletteColors = ctx.materials.flatMap(m => m.palette)
  const uniqueColorFamilies = new Set(
    allPaletteColors.map(c => {
      // Simplified: group by first 3 chars of hex or color name
      return c.startsWith('#') ? c.substring(0, 4) : c.split(' ')[0]
    })
  )
  const paletteRange = uniqueColorFamilies.size

  if (paletteRange > 6) {
    issues.push({
      type:'PALETTE_MISMATCH',
      description:`Paleta com ${paletteRange} famílias de cor distintas. Paletas coesas geralmente têm 3–5 famílias.`,
      objects:[],
      severity: paletteRange > 9 ? 'HIGH' : 'MEDIUM',
    })
  }

  // Style consistency — check if style restrictions are violated
  if (ctx.style) {
    const restrictions = ctx.style.restrictions ?? []
    for (const restriction of restrictions) {
      const lowerR = restriction.toLowerCase()
      if (lowerR.includes('sem estampas') || lowerR.includes('sem padrão')) {
        const patternMats = ctx.materials.filter(m => m.name.toLowerCase().includes('estampa') || m.name.toLowerCase().includes('padrão'))
        if (patternMats.length > 0) {
          issues.push({
            type:'STYLE_BREAK',
            description:`Restrição de estilo violada: "${restriction}" — materiais com padrão detectados.`,
            objects: patternMats.map(m=>m.name),
            severity:'HIGH',
          })
        }
      }
    }
  }

  // Hardware consistency — check if objects with handles use consistent metals
  const hardwareObjs = ctx.objects.filter(o => o.category === 'HANDLE' || o.category === 'HARDWARE')
  const hardwareFinishes = [...new Set(hardwareObjs.map(o => o.finish).filter(Boolean))]
  const hardwareConsistent = hardwareFinishes.length <= 1

  if (!hardwareConsistent) {
    issues.push({
      type:'HARDWARE_INCONSISTENCY',
      description:`Ferragens com ${hardwareFinishes.length} acabamentos diferentes: ${hardwareFinishes.join(', ')}.`,
      objects: hardwareObjs.map(o=>o.name),
      severity:'MEDIUM',
    })
  }

  // Score
  const deductions = issues.reduce((s, i) => s + (i.severity==='HIGH'?20:i.severity==='MEDIUM'?10:5), 0)
  const score = Math.max(0, Math.min(100, 100 - deductions))

  const langScore = Math.max(0, 100 - (woodMats.length > 2 ? 15 : 0) - (metalMats.length > 2 ? 10 : 0) - (paletteRange > 6 ? 15 : 0))

  return {
    score, woodCount:woodMats.length, metalCount:metalMats.length, stoneCount:stoneMats.length,
    hardwareConsistent, paletteRange, languageScore:langScore, issues,
  }
}
