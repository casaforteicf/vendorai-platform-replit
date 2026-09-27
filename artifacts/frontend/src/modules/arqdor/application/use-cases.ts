// ─── Application Use Cases ────────────────────────────────────────────────────
// Each use case is a pure function or class that orchestrates domain + providers.
// No React. No UI. No AI vendor dependencies.
// All AI is injected via ProviderRegistry.

import type { Project, ArchitecturalObject } from '../../../pages/arch/arqdor/domain/arqdor-domain-types'
import type { ProviderRegistry, BuiltPrompt } from '../providers/interfaces'
import type { RenderJob, RenderReview, CorrectionItem, ExportFormat } from '../shared/platform-types'
import { generateFullPromptStructure } from '../../../pages/arch/arqdor/domain/arqdor-prompt-engine'
import { validateProject } from '../../../pages/arch/arqdor/domain/arqdor-validation-engine'
import { calculateMockRenderScore } from '../../../pages/arch/arqdor/domain/arqdor-score-engine'

// ─── Result type ──────────────────────────────────────────────────────────────

export interface UseCaseResult<T> {
  ok:    boolean
  data?: T
  error?: string
}

function success<T>(data: T): UseCaseResult<T> { return { ok: true, data } }
function failure(error: string): UseCaseResult<never> { return { ok: false, error } }

// ─── 1. Analyze Project ───────────────────────────────────────────────────────

export async function AnalyzeProjectUseCase(
  project: Project,
  imageUrl: string,
  providers: ProviderRegistry
): Promise<UseCaseResult<{ objects: unknown[]; materials: unknown[]; style: string }>> {
  if (!providers.imageAnalysis) return failure('No ImageAnalysisProvider configured')
  const result = await providers.imageAnalysis.analyze(imageUrl)
  if (!result.ok) return failure(result.error ?? 'Analysis failed')
  return success({ objects: result.data!.objects, materials: result.data!.materials, style: result.data!.style })
}

// ─── 2. Build Prompt ─────────────────────────────────────────────────────────

export async function BuildPromptUseCase(
  project: Project,
  providers?: ProviderRegistry
): Promise<UseCaseResult<BuiltPrompt>> {
  if (providers?.prompt) {
    const result = await providers.prompt.buildPrompt(project)
    if (result.ok) return success(result.data!)
  }
  // Fallback to local engines
  const structure = generateFullPromptStructure(project)
  return success({
    sections: {
      core:    structure.corePrompt,
      project: structure.projectPrompt,
      objects: structure.objectPrompt,
      rules:   structure.rulePrompt,
      dna:     structure.dnaPrompt,
      render:  structure.renderPrompt,
    },
    finalPrompt:    structure.finalPrompt,
    negativePrompt: structure.negativePrompt,
    tokenEstimate:  Math.floor(structure.finalPrompt.length / 4),
  })
}

// ─── 3. Review Render ─────────────────────────────────────────────────────────

export async function ReviewRenderUseCase(
  renderJob: RenderJob,
  project: Project,
  providers: ProviderRegistry
): Promise<UseCaseResult<RenderReview>> {
  if (!providers.render) return failure('No RenderProvider configured')
  const result = await providers.render.review(renderJob, project)
  if (!result.ok) return failure(result.error ?? 'Review failed')
  return success(result.data!)
}

// ─── 4. Generate Correction Prompt ───────────────────────────────────────────

export async function GenerateCorrectionPromptUseCase(
  review: RenderReview,
  providers: ProviderRegistry
): Promise<UseCaseResult<CorrectionItem[]>> {
  if (!providers.renderReview) return failure('No RenderReviewProvider configured')
  const result = await providers.renderReview.generateCorrections(review)
  if (!result.ok) return failure(result.error ?? 'Correction generation failed')
  return success(result.data!)
}

// ─── 5. Create Version ────────────────────────────────────────────────────────

export function CreateVersionUseCase(
  project: Project,
  label: string,
  description: string
): UseCaseResult<Project> {
  const newVersion = {
    id:          `v${project.versions.length + 1}`,
    label,
    description,
    createdAt:   new Date().toISOString(),
    current:     true,
  }
  const updated: Project = {
    ...project,
    versions: [...project.versions.map(v => ({ ...v, current: false })), newVersion],
    version:  label,
    updatedAt: new Date().toISOString(),
  }
  return success(updated)
}

// ─── 6. Compare Versions ─────────────────────────────────────────────────────

export function CompareVersionsUseCase(
  v1: Project, v2: Project
): UseCaseResult<{ added: string[]; removed: string[]; modified: string[] }> {
  const ids1 = new Set(v1.environments.flatMap(e => e.architecturalObjects.map(o => o.id)))
  const ids2 = new Set(v2.environments.flatMap(e => e.architecturalObjects.map(o => o.id)))
  return success({
    added:    [...ids2].filter(id => !ids1.has(id)),
    removed:  [...ids1].filter(id => !ids2.has(id)),
    modified: [...ids1].filter(id => ids2.has(id)),
  })
}

// ─── 7. Apply Material ────────────────────────────────────────────────────────

export function ApplyMaterialUseCase(
  project: Project,
  objectId: string,
  material: Partial<ArchitecturalObject['material']>
): UseCaseResult<Project> {
  const updated: Project = {
    ...project,
    environments: project.environments.map(env => ({
      ...env,
      architecturalObjects: env.architecturalObjects.map(o =>
        o.id === objectId ? { ...o, material: { ...o.material, ...material } } : o
      ),
    })),
  }
  return success(updated)
}

// ─── 8. Validate Project ─────────────────────────────────────────────────────

export function ValidateProjectUseCase(project: Project) {
  return success(validateProject(project))
}

// ─── 9. Export Project ───────────────────────────────────────────────────────

export function ExportProjectUseCase(
  project: Project,
  format: ExportFormat
): UseCaseResult<string> {
  switch (format) {
    case 'PROJECT_JSON': return success(JSON.stringify(project, null, 2))
    case 'PROMPT_TXT': {
      const s = generateFullPromptStructure(project)
      return success(s.finalPrompt)
    }
    case 'PROMPT_JSON': {
      const s = generateFullPromptStructure(project)
      return success(JSON.stringify(s, null, 2))
    }
    case 'WORKSPACE': {
      const workspace = {
        projectId: project.id,
        name: project.name,
        version: project.version,
        updatedAt: project.updatedAt,
        environments: project.environments,
        versions: project.versions,
      }
      return success(JSON.stringify(workspace, null, 2))
    }
    case 'MATERIAL_LIBRARY': {
      const materials = project.environments
        .flatMap(env => env.architecturalObjects)
        .map(object => object.material)
        .filter((material): material is NonNullable<ArchitecturalObject['material']> => Boolean(material))

      const unique = Array.from(
        new Map(
          materials.map((material, index) => [
            JSON.stringify(material),
            { id: `material-${index + 1}`, ...material },
          ]),
        ).values(),
      )
      return success(JSON.stringify(unique, null, 2))
    }
  }
}

// ─── 10. Score Project Readiness ──────────────────────────────────────────────

export function ScoreProjectUseCase(project: Project) {
  return success(calculateMockRenderScore(project))
}
