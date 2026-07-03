// ─── ArchProject → ProjectContext mapper ─────────────────────────────────────
// Converts ArqdorPage's ArchProject domain model to the AIE's ProjectContext.
// Called whenever the real project state changes so AIE scores stay live.

import type { ArchProject, ArchObject } from '../../../../pages/arch/arqdor-types'
import type { ProjectContext, ProjectObject, ProjectMaterial } from './aie-types'

// Visual weight heuristics by object category
const CATEGORY_WEIGHT: Record<string, number> = {
  AMBIENTE:     0,   // environment containers, don't add weight
  ESTRUTURA:    30,
  PISO:         40,
  PAREDE:       35,
  FORRO:        20,
  MARCENARIA:   80,
  PORTA:        30,
  GAVETA:       15,
  PUXADOR:      10,
  FERRAGEM:     10,
  BANCADA:      60,
  PEDRA:        50,
  METAL:        35,
  ESQUADRIA:    40,
  VIDRO:        30,
  ILUMINACAO:   45,
  MOBILIARIO:   70,
  PAISAGISMO:   20,
  DECORACAO:    25,
  EQUIPAMENTOS: 40,
  PERSONALIZADO:40,
}

function mapObject(obj: ArchObject): ProjectObject {
  return {
    id:           obj.id,
    name:         obj.nome,
    category:     obj.categoria,
    material:     obj.material.nome  || undefined,
    finish:       obj.material.acabamento || undefined,
    color:        obj.material.cor   || undefined,
    visualWeight: CATEGORY_WEIGHT[obj.categoria] ?? 40,
    designIntent: [],
    locked:       obj.status === 'BLOQUEADO',
    manufacturerId: obj.material.fabricante || undefined,
  }
}

function extractMaterials(objetos: ArchObject[]): ProjectMaterial[] {
  const seen = new Map<string, ProjectMaterial>()
  let idx = 0

  for (const obj of objetos) {
    const { nome, acabamento, fabricante, cor } = obj.material
    if (!nome) continue
    if (seen.has(nome)) {
      // Add this object to the existing material's usedByObjects list
      seen.get(nome)!.usedByObjects.push(obj.id)
    } else {
      idx++
      seen.set(nome, {
        id:           `mat-auto-${idx}`,
        name:         nome,
        category:     deriveMaterialCategory(obj.categoria),
        manufacturer: fabricante ?? '',
        finish:       acabamento ?? '',
        gloss:        acabamento === 'Polido' ? 90 : acabamento === 'Escovado' ? 45 : acabamento === 'Mate' ? 5 : 20,
        palette:      cor ? [cor] : [],
        usedByObjects: [obj.id],
      })
    }
  }

  return Array.from(seen.values())
}

function deriveMaterialCategory(category: string): string {
  const map: Record<string, string> = {
    MARCENARIA: 'MADEIRAS', PORTA: 'MADEIRAS',
    PEDRA: 'PEDRAS', BANCADA: 'PEDRAS',
    METAL: 'METAIS', FERRAGEM: 'METAIS', PUXADOR: 'METAIS', ESQUADRIA: 'METAIS',
    MOBILIARIO: 'TECIDOS', DECORACAO: 'TECIDOS',
    PAREDE: 'TINTAS', FORRO: 'TINTAS',
    PISO: 'CERÂMICAS',
    ILUMINACAO: 'ILUMINAÇÃO',
  }
  return map[category] ?? 'OUTROS'
}

function deriveLightingType(atmosfera: string): string {
  const a = atmosfera.toLowerCase()
  if (a.includes('natural') || a.includes('luz natural') || a.includes('iluminado')) return 'NATURAL'
  if (a.includes('artificial')) return 'ARTIFICIAL'
  if (a.includes('indiret')) return 'INDIRECT'
  return 'MIXED'
}

export function archProjectToContext(project: ArchProject): ProjectContext {
  const { dna } = project

  // Exclude AMBIENTE containers from objects (they are spatial wrappers, not renderable objects)
  const renderableObjects = project.objetos.filter(o => o.categoria !== 'AMBIENTE')

  return {
    id:          project.id,
    name:        `${project.nome}${project.cliente ? ' — ' + project.cliente : ''}`,
    dna:         [dna.estiloArquitetonico, dna.linguagem, dna.atmosfera]
                   .filter(Boolean).join(' · '),
    renderGoal:  dna.objetivoRender || undefined,
    cameraAngle: dna.tipofotografia  || undefined,
    lightingType: deriveLightingType(dna.atmosfera),
    style: {
      name:         dna.estiloArquitetonico,
      designIntent: [...dna.materiaisPredominantes, ...dna.ferragensPredominantes],
      palette:      dna.paletaCromatica,
      restrictions: [],
    },
    objects:   renderableObjects.map(mapObject),
    materials: extractMaterials(renderableObjects),
  }
}
