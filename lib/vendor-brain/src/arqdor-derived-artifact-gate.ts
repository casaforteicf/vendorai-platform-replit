/**
 * ARQDOR LOT-03: deterministic gate for facade/interior/render generation.
 * Pure, read-only; backend must authenticate and authorize the caller separately.
 */
import { adaptPersistedConceptGeometry, type PersistedConceptGeometryInput } from './arqdor-concept-adapter';
import { validateDerivedArtifactSource, type GeometryIssue } from './arqdor-geometry-preflight';

export type DerivedArtifactKind = 'facade' | 'interior' | 'render';
export type DerivedArtifactGateInput = PersistedConceptGeometryInput & {
  kind: DerivedArtifactKind;
  // The requesting caller must supply the identity of its target project and
  // source revision. Never silently adopt a newer revision.
  target: { tenantId: string; projectId: string; revisionId: string };
};
export type DerivedArtifactGateResult =
  | { allowed: true; kind: DerivedArtifactKind; source: 'project_master' | 'draft';
      revisionId: string; wallCount: number; openingCount: number }
  | { allowed: false; kind: DerivedArtifactKind; reasons: string[]; issues: GeometryIssue[] };

export function gateDerivedArtifact(input: DerivedArtifactGateInput): DerivedArtifactGateResult {
  const adaptation = adaptPersistedConceptGeometry(input);
  if (adaptation.status !== 'valid' || !adaptation.snapshot) {
    return {
      allowed: false, kind: input.kind,
      reasons: adaptation.reasons.length ? adaptation.reasons : ['source_geometry_invalid'],
      issues: adaptation.issues,
    };
  }
  const match = validateDerivedArtifactSource(adaptation.snapshot, input.target);
  if (!match.valid) {
    return { allowed: false, kind: input.kind, reasons: ['source_provenance_mismatch'], issues: match.issues };
  }
  return {
    allowed: true, kind: input.kind, source: adaptation.source,
    revisionId: adaptation.snapshot.revisionId,
    wallCount: adaptation.snapshot.walls.length,
    openingCount: adaptation.snapshot.openings.length,
  };
}
