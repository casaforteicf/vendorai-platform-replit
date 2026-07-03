// ─── ArchProject → ProjectContext adapter ─────────────────────────────────────
// Converts the UI-centric ArchProject (arqdor-types.ts) into the AIE-ready
// ProjectContext (aie-types.ts) consumed by runAIE, buildPrompt, etc.

import type { ArchProject, ArchObject, MaterialSpec } from '../../../../pages/arch/arqdor-types'
import type { ProjectContext, ProjectObject, ProjectMaterial, ProjectStyle } from '../../engines/aie/aie-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLocked(obj: ArchObject): boolean {
  const p = obj.permissoesIA
  return (
    !p.alterarGeometria &&
    !p.alterarMaterial &&
    !p.alterarAcabamento &&
    !p.alterarCor
  )
}

function hasMaterial(spec: MaterialSpec): boolean {
  return Boolean(spec.nome && spec.nome.trim())
}

// ─── Object mapping ───────────────────────────────────────────────────────────

function toProjectObject(obj: ArchObject): ProjectObject {
  const mat = obj.material
  return {
    id:       obj.id,
    name:     obj.nome,
    category: obj.categoria,
    ...(hasMaterial(mat) && { material: mat.nome }),
    ...(mat.acabamento   && { finish:   mat.acabamento }),
    ...(mat.cor          && { color:    mat.cor }),
    ...(obj.dimensoes    && {
      dimensions: {
        width:  parseFloat(obj.dimensoes.largura)  || 0,
        height: parseFloat(obj.dimensoes.altura)   || 0,
        depth:  parseFloat(obj.dimensoes.profundidade) || 0,
        unit:   'cm',
      },
    }),
    locked: isLocked(obj),
  }
}

// ─── Material deduplication ───────────────────────────────────────────────────

function extractMaterials(objects: ArchObject[]): ProjectMaterial[] {
  const seen = new Map<string, ProjectMaterial>()

  for (const obj of objects) {
    const spec = obj.material
    if (!hasMaterial(spec)) continue
    const key = `${spec.nome}|${spec.fabricante}|${spec.acabamento}`
    if (seen.has(key)) {
      const existing = seen.get(key)!
      if (!existing.usedByObjects.includes(obj.id)) {
        existing.usedByObjects.push(obj.id)
      }
    } else {
      seen.set(key, {
        id:           `mat-${key.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
        name:         spec.nome,
        category:     obj.categoria,
        manufacturer: spec.fabricante || '',
        finish:       spec.acabamento || '',
        gloss:        0,
        palette:      spec.cor ? [spec.cor] : [],
        usedByObjects: [obj.id],
      })
    }
  }

  return Array.from(seen.values())
}

// ─── Style mapping ────────────────────────────────────────────────────────────

function toProjectStyle(project: ArchProject): ProjectStyle {
  const dna = project.dna
  return {
    name:         dna.estiloArquitetonico,
    designIntent: [dna.linguagem, dna.atmosfera].filter(Boolean),
    palette:      dna.paletaCromatica,
    restrictions: dna.materiaisPredominantes.length
      ? [`Materiais predominantes: ${dna.materiaisPredominantes.join(', ')}`]
      : [],
  }
}

// ─── Main converter ───────────────────────────────────────────────────────────

export function archProjectToProjectContext(project: ArchProject): ProjectContext {
  const nonAmbiente = project.objetos.filter(o => o.categoria !== 'AMBIENTE')
  return {
    id:           project.id,
    name:         project.nome,
    style:        toProjectStyle(project),
    objects:      project.objetos.map(toProjectObject),
    materials:    extractMaterials(nonAmbiente),
    renderGoal:   project.dna.objetivoRender || undefined,
    cameraAngle:  project.dna.tipofotografia || undefined,
    dna:          [project.dna.estiloArquitetonico, project.dna.linguagem, project.dna.atmosfera]
                    .filter(Boolean).join(', ') || undefined,
  }
}
