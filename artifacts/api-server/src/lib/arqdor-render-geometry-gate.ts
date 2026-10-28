/**
 * ARQDOR LOT-04 — server-side render gate, opt-in.
 *
 * When disabled, preserves the existing API behavior exactly.
 * When enabled for an Arqdor concept, rejects unverified or stale geometry
 * before a render job is persisted, charged or queued.
 *
 * This is a provenance/geometry preflight, not a substitute for authentication,
 * tenant-scoped database queries, visual fidelity QA or engineering sign-off.
 */
import type { ConceptStructuralState } from '@workspace/vendor-brain/arqdor-geometry-revision';
import {
  gateDerivedArtifact,
  type DerivedArtifactKind,
} from '@workspace/vendor-brain/arqdor-derived-artifact-gate';

export type ConceptRenderGateRequest = {
  enabled: boolean;
  tenantId: string;
  conceptProjectId: string;
  updatedAt: Date | string | null;
  configuration: unknown;
  structuralState?: ConceptStructuralState;
  requestedRevision: string | null | undefined;
  renderView: 'interior' | 'exterior' | undefined;
};

export type ConceptRenderGateDecision =
  | { allowed: true; enforced: boolean; canonicalRevision?: string }
  | {
      allowed: false;
      enforced: true;
      code: 'ARQDOR_GEOMETRY_REVIEW_REQUIRED';
      reasons: string[];
      issueCodes: string[];
    };

export function evaluateConceptRenderGate(
  input: ConceptRenderGateRequest,
): ConceptRenderGateDecision {
  if (!input.enabled) return { allowed: true, enforced: false };

  // Never silently infer a caller's revision from the latest saved state:
  // a render produced from stale browser data must be rejected.
  if (!input.requestedRevision?.trim()) {
    return {
      allowed: false, enforced: true,
      code: 'ARQDOR_GEOMETRY_REVIEW_REQUIRED',
      reasons: ['explicit_project_revision_required'], issueCodes: [],
    };
  }
  const kind: DerivedArtifactKind = input.renderView === 'interior' ? 'interior' : 'facade';
  const result = gateDerivedArtifact({
    tenantId: input.tenantId,
    projectId: input.conceptProjectId,
    configuration: input.configuration,
    structuralState: input.structuralState,
    updatedAt: input.updatedAt,
    kind,
    target: {
      tenantId: input.tenantId,
      projectId: input.conceptProjectId,
      revisionId: input.requestedRevision,
    },
  });
  if (!result.allowed) {
    return {
      allowed: false, enforced: true,
      code: 'ARQDOR_GEOMETRY_REVIEW_REQUIRED',
      reasons: result.reasons,
      issueCodes: result.issues.map(issue => issue.code),
    };
  }
  return { allowed: true, enforced: true, canonicalRevision: result.revisionId };
}
