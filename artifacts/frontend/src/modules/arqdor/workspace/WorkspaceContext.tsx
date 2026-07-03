import { createContext, useContext } from 'react'
import type { Project } from '../../../pages/arch/arqdor/domain/arqdor-domain-types'
import type { ArchProject } from '../../../pages/arch/arqdor-types'
import type { ProjectContext, ProjectObject, ProjectMaterial } from '../engines/aie/aie-types'

// ─── Adapter: domain Project → ProjectContext (AIE) ───────────────────────────
// Used when the workspace is initialized from the persisted domain project.

function parseLightingType(lightingMood: string): string {
  const m = lightingMood.toLowerCase()
  if (m.includes('natural')) return 'NATURAL'
  if (m.includes('artificial') || m.includes('led') || m.includes('track')) return 'ARTIFICIAL'
  if (m.includes('indirect') || m.includes('accent') || m.includes('embutid')) return 'INDIRECT'
  return 'MIXED'
}

export function adaptProjectToContext(project: Project): ProjectContext {
  const allObjects = project.environments.flatMap(env => env.architecturalObjects)

  const objects: ProjectObject[] = allObjects.map(obj => ({
    id:           obj.id,
    name:         obj.name,
    category:     obj.category,
    material:     obj.material?.name ?? undefined,
    finish:       obj.material?.finish ?? obj.finish ?? undefined,
    color:        obj.material?.color ?? obj.color ?? undefined,
    visualWeight: obj.confidence,
    designIntent: obj.description ? [obj.description] : undefined,
    componentId:  obj.componentId,
  }))

  const seenMaterials = new Set<string>()
  const materials: ProjectMaterial[] = []
  allObjects.forEach(obj => {
    const matName = obj.material?.name
    if (!matName || seenMaterials.has(matName)) return
    seenMaterials.add(matName)
    const usedBy = allObjects.filter(o => o.material?.name === matName).map(o => o.id)
    materials.push({
      id:            `mat-${matName.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`,
      name:          matName,
      category:      obj.category,
      manufacturer:  obj.material?.manufacturer ?? '',
      finish:        obj.material?.finish ?? obj.finish ?? '',
      gloss:         obj.material?.glossLevel ?? 20,
      palette:       obj.material?.color ? [obj.material.color] : [],
      usedByObjects: usedBy,
    })
  })

  const { dna, renderConfig } = project
  return {
    id:           project.id,
    name:         project.name,
    objects,
    materials,
    renderGoal:   dna.renderObjective || undefined,
    cameraAngle:  renderConfig.lens   || undefined,
    lightingType: parseLightingType(renderConfig.lightingMood),
    dna:          [dna.architecturalStyle, dna.designLanguage, dna.atmosphere].filter(Boolean).join(', ') || undefined,
    style: {
      name:         dna.architecturalStyle,
      designIntent: [dna.designLanguage, dna.atmosphere].filter(Boolean),
      palette:      dna.colorPalette,
      restrictions: [],
    },
  }
}

// ─── Adapter: ArchProject (page-level state) → ProjectContext (AIE) ───────────
// Used when ArqdorPage updates its internal project state. ArchProject uses
// Portuguese field names (nome, objetos, dna.estiloArquitetonico, etc.).

export function adaptArchProjectToContext(project: ArchProject): ProjectContext {
  const objects: ProjectObject[] = project.objetos.map(obj => ({
    id:           obj.id,
    name:         obj.nome,
    category:     obj.categoria,
    material:     obj.material?.nome || undefined,
    finish:       obj.material?.acabamento || undefined,
    color:        obj.material?.cor || undefined,
    visualWeight: obj.confianca,
    designIntent: obj.descricao ? [obj.descricao] : undefined,
  }))

  const seenMaterials = new Set<string>()
  const materials: ProjectMaterial[] = []
  project.objetos.forEach(obj => {
    const matName = obj.material?.nome
    if (!matName || seenMaterials.has(matName)) return
    seenMaterials.add(matName)
    const usedBy = project.objetos.filter(o => o.material?.nome === matName).map(o => o.id)
    materials.push({
      id:            `mat-${matName.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`,
      name:          matName,
      category:      obj.categoria,
      manufacturer:  obj.material?.fabricante ?? '',
      finish:        obj.material?.acabamento ?? '',
      gloss:         20,
      palette:       obj.material?.cor ? [obj.material.cor] : [],
      usedByObjects: usedBy,
    })
  })

  const { dna } = project
  return {
    id:        project.id,
    name:      project.nome,
    objects,
    materials,
    renderGoal: dna.objetivoRender || undefined,
    dna:        [dna.estiloArquitetonico, dna.linguagem, dna.atmosfera].filter(Boolean).join(', ') || undefined,
    style: {
      name:         dna.estiloArquitetonico,
      designIntent: [dna.linguagem, dna.atmosfera].filter(Boolean),
      palette:      dna.paletaCromatica,
      restrictions: [],
    },
  }
}

// ─── Context definition ───────────────────────────────────────────────────────

export interface WorkspaceState {
  projectContext: ProjectContext | null
  setProjectContext: (ctx: ProjectContext | null) => void
}

export const WorkspaceContext = createContext<WorkspaceState>({
  projectContext:    null,
  setProjectContext: () => undefined,
})

export function useWorkspaceContext() {
  return useContext(WorkspaceContext)
}
