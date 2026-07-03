// ─── Correction Engine ────────────────────────────────────────────────────────
// Generates correction prompts from review differences.
// Only corrects what changed — preserves the rest.

import type { ReviewComparison, CorrectionPrompt } from '../aie-types'

const DIFF_TO_CORRECTION: Record<string, string> = {
  MATERIAL: 'correct the material finish to match the specification exactly',
  GEOMETRY: 'fix the geometry proportions to match the original dimensions',
  LIGHTING: 'adjust the lighting to be softer and more diffuse as specified',
  COMPOSITION: 'recompose the scene maintaining the original camera angle and framing',
}

export function runCorrectionEngine(review: ReviewComparison): CorrectionPrompt {
  const { projectId, differences } = review

  const focusAreas: string[] = []
  const preserveAreas: string[] = []
  const correctionParts: string[] = []

  for (const diff of differences) {
    const correction = DIFF_TO_CORRECTION[diff.type] ?? 'correct the identified issue'
    correctionParts.push(`${correction} — ${diff.description}`)
    focusAreas.push(`${diff.type}: ${diff.description}`)
    if (diff.object) focusAreas.push(`Object: ${diff.object}`)
  }

  // Everything not mentioned in differences should be preserved
  const diffTypes = new Set(differences.map(d => d.type))
  if (!diffTypes.has('MATERIAL'))    preserveAreas.push('all material finishes not mentioned')
  if (!diffTypes.has('GEOMETRY'))    preserveAreas.push('all geometry and proportions')
  if (!diffTypes.has('LIGHTING'))    preserveAreas.push('overall lighting mood and warmth')
  if (!diffTypes.has('COMPOSITION')) preserveAreas.push('camera angle, composition and framing')
  preserveAreas.push('all colors and palette', 'all objects positions', 'overall architectural style')

  const correctionText = [
    'CORRECTION PROMPT — apply only the following changes:',
    '',
    ...correctionParts.map((p,i) => `${i+1}. ${p}`),
    '',
    'PRESERVE: ' + preserveAreas.join(', ') + '.',
    '',
    'Do NOT change anything not explicitly mentioned above.',
  ].join('\n')

  const maxSeverity = differences.reduce((max, d) => {
    const s = d.severity === 'CRITICAL' ? 3 : d.severity === 'MAJOR' ? 2 : 1
    return Math.max(max, s)
  }, 1)

  return {
    projectId,
    differences,
    correctionText,
    focusAreas,
    preserveAreas,
    estimatedImpact: maxSeverity === 3 ? 'HIGH' : maxSeverity === 2 ? 'MEDIUM' : 'LOW',
  }
}
