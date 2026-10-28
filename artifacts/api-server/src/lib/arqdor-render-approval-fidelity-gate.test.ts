import { describe, expect, it } from 'vitest';
import { evaluateFidelityApproval, type FidelityApprovalInput } from './arqdor-render-approval-fidelity-gate.js';

function fixture(): FidelityApprovalInput {
  const dimension = () => ({ score: 95, confidence: 0.96, evidence: ['Sem alterações geométricas visíveis'] });
  return {
    enabled: true, isConceptRender: true, geometryVerified: true,
    renderImageUrl: '/objects/arqdor/result-R1.png',
    latestReview: {
      renderImageUrl: '/objects/arqdor/result-R1.png',
      overallScore: 96,
      requiresHumanReview: false,
      review: {
        overallScore: 96,
        camera: dimension(), geometry: dimension(), openings: dimension(), volumetry: dimension(),
        materials: dimension(), lighting: dimension(),
        unsolicitedChanges: [], acceptedChanges: [],
        requiresHumanReview: false, summary: 'Sem alterações visíveis.',
      },
    },
  };
}
const reasons = (input: FidelityApprovalInput) => {
  const decision = evaluateFidelityApproval(input);
  return decision.allowed ? [] : decision.reasons;
};

describe('ARQDOR LOT-07 render approval evidence gate', () => {
  it('preserves legacy approvals when feature flag is disabled', () => {
    expect(evaluateFidelityApproval({ ...fixture(), enabled: false, latestReview: null }))
      .toEqual({ allowed: true, enforced: false });
  });
  it('does not apply to projects without concept geometry contract', () => {
    expect(evaluateFidelityApproval({ ...fixture(), isConceptRender: false, latestReview: null }))
      .toEqual({ allowed: true, enforced: false });
  });
  it('allows current geometry with sufficiently strong persisted review evidence', () => {
    expect(evaluateFidelityApproval(fixture())).toEqual({ allowed: true, enforced: true });
  });
  it('rejects stale geometric provenance', () => {
    expect(reasons({ ...fixture(), geometryVerified: false })).toContain('GEOMETRY_UNVERIFIED');
  });
  it('requires an existing fidelity review but never calls AI automatically', () => {
    expect(reasons({ ...fixture(), latestReview: null })).toContain('FIDELITY_REVIEW_REQUIRED');
  });
  it('rejects review of a different output image', () => {
    const input = fixture();
    input.latestReview!.renderImageUrl = '/objects/arqdor/other.png';
    expect(reasons(input)).toContain('FIDELITY_REVIEW_STALE');
  });
  it('rejects weak overall scores', () => {
    const input = fixture();
    input.latestReview!.overallScore = 68;
    expect(reasons(input)).toContain('FIDELITY_SCORE_BELOW_THRESHOLD');
  });
  it('rejects low openings quality or low visual confidence', () => {
    const input = fixture();
    (input.latestReview!.review as any).openings.confidence = 0.3;
    expect(reasons(input)).toContain('STRUCTURAL_FIDELITY_LOW');
  });
  it('does not allow high overall score to conceal critical unsolicited window relocation', () => {
    const input = fixture();
    (input.latestReview!.review as any).unsolicitedChanges = [{
      category: 'OPENINGS', severity: 'CRITICAL',
      description: 'Janela foi deslocada', evidence: 'Comparação visual', unsolicited: true,
    }];
    expect(reasons(input)).toContain('STRUCTURAL_ISSUE_REPORTED');
  });
  it('escalates review with explicit human concerns instead of silently approving', () => {
    const input = fixture();
    input.latestReview!.requiresHumanReview = true;
    expect(reasons(input)).toContain('FIDELITY_REVIEW_REQUIRES_HUMAN');
  });
  it('rejects invalid or incomplete evidence rather than inventing missing scores', () => {
    const input = fixture();
    input.latestReview!.review = { camera: { score: 90 } };
    expect(reasons(input)).toContain('STRUCTURAL_FIDELITY_LOW');
  });
  it('does not modify any review, image or project values', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    evaluateFidelityApproval(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
