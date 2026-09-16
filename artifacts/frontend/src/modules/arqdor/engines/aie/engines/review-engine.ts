// ─── Review Engine ────────────────────────────────────────────────────────────
// Real visual review is not implemented in this pure frontend engine.
//
// IMPORTANT: never fabricate visual differences or a fidelity/match score from
// project metadata. Until a backend visual comparison exists with image-based
// evidence, review must be absent/undefined.

import type { ProjectContext, ReviewComparison } from '../aie-types'

export function runReviewEngine(_ctx: ProjectContext): ReviewComparison | undefined {
  return undefined
}
