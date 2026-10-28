/**
 * ARQDOR LOT-07 — deterministic approval preflight for a completed render.
 * Image interpretation belongs to the existing Fidelity Review service.
 * This guard consumes that persisted evidence; it never calls a model, incurs
 * token charges, approves a render, or grants permissions by itself.
 */
export type FidelityApprovalReview = {
  renderImageUrl: string;
  overallScore: number;
  requiresHumanReview: boolean;
  review: unknown;
};
export type FidelityApprovalInput = {
  enabled: boolean;
  isConceptRender: boolean;
  geometryVerified: boolean;
  renderImageUrl: string | null | undefined;
  latestReview: FidelityApprovalReview | null;
};
export type FidelityApprovalReason =
  | 'GEOMETRY_UNVERIFIED'
  | 'FIDELITY_REVIEW_REQUIRED'
  | 'FIDELITY_REVIEW_STALE'
  | 'FIDELITY_REVIEW_INVALID'
  | 'FIDELITY_SCORE_BELOW_THRESHOLD'
  | 'FIDELITY_REVIEW_REQUIRES_HUMAN'
  | 'STRUCTURAL_FIDELITY_LOW'
  | 'STRUCTURAL_ISSUE_REPORTED';

export type FidelityApprovalDecision =
  | { allowed: true; enforced: boolean }
  | { allowed: false; enforced: true; reasons: FidelityApprovalReason[] };
const MIN_SCORE = 80;
const MIN_CONFIDENCE = 0.7;
const STRUCTURAL_DIMENSIONS = ['camera', 'geometry', 'openings', 'volumetry'] as const;
const STRUCTURAL_ISSUE_CATEGORIES = new Set(['CAMERA', 'GEOMETRY', 'OPENINGS', 'VOLUMETRY']);

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const adequate = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Report all blocking reasons instead of guessing from a score alone. */
export function evaluateFidelityApproval(input: FidelityApprovalInput): FidelityApprovalDecision {
  if (!input.enabled || !input.isConceptRender) return { allowed: true, enforced: false };

  const reasons: FidelityApprovalReason[] = [];
  if (!input.geometryVerified) reasons.push('GEOMETRY_UNVERIFIED');
  if (!input.latestReview) {
    reasons.push('FIDELITY_REVIEW_REQUIRED');
    return { allowed: false, enforced: true, reasons };
  }
  const latest = input.latestReview;
  if (!input.renderImageUrl || latest.renderImageUrl !== input.renderImageUrl) {
    reasons.push('FIDELITY_REVIEW_STALE');
  }
  const review = object(latest.review);
  const validScore = adequate(latest.overallScore, 0, 100);
  if (!validScore || !review) {
    reasons.push('FIDELITY_REVIEW_INVALID');
    return { allowed: false, enforced: true, reasons };
  }
  if (latest.overallScore < MIN_SCORE) reasons.push('FIDELITY_SCORE_BELOW_THRESHOLD');
  if (latest.requiresHumanReview || review.requiresHumanReview === true) {
    // A flag means the automatic evidence did not clear the concerns.
    // Approving the render still requires a deliberate human action elsewhere.
    reasons.push('FIDELITY_REVIEW_REQUIRES_HUMAN');
  }
  const dimensionsValid = STRUCTURAL_DIMENSIONS.every(dim => {
    const evidence = object(review[dim]);
    return evidence && adequate(evidence.score, MIN_SCORE, 100)
      && adequate(evidence.confidence, MIN_CONFIDENCE, 1);
  });
  if (!dimensionsValid) reasons.push('STRUCTURAL_FIDELITY_LOW');

  const unsolicited = review.unsolicitedChanges;
  if (!Array.isArray(unsolicited)) {
    reasons.push('FIDELITY_REVIEW_INVALID');
  } else {
    if (unsolicited.some(issue => {
      const item = object(issue);
      return item && STRUCTURAL_ISSUE_CATEGORIES.has(String(item.category)) &&
        (item.severity === 'MAJOR' || item.severity === 'CRITICAL');
    })) reasons.push('STRUCTURAL_ISSUE_REPORTED');
  }

  return reasons.length > 0
    ? { allowed: false, enforced: true, reasons }
    : { allowed: true, enforced: true };
}
