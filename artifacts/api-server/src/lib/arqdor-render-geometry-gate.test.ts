import { describe, expect, it } from 'vitest';
import { evaluateConceptRenderGate, type ConceptRenderGateRequest } from './arqdor-render-geometry-gate.js';

const makeInput = (): ConceptRenderGateRequest => ({
  enabled: true,
  tenantId: 'tenant-A',
  conceptProjectId: 'concept-7',
  updatedAt: '2026-10-27T19:00:00.000Z',
  requestedRevision: 'draft:r7:updated:2026-10-27T19:00:00.000Z',
  renderView: 'exterior',
  configuration: {
    revisionNumber: 7,
    customWalls: [
      { id: 'wall-1', floor: 0, x1: 0, y1: 0, x2: 5, y2: 0,
        thickness: 0.15, height: 2.8 },
    ],
    customOpenings: [
      { id: 'window-1', wallId: 'wall-1', floor: 0,
        type: 'window', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 },
    ],
  },
});

describe('ARQDOR LOT-04 server render geometry feature gate', () => {
  it('leaves legacy flow unchanged when flag is off', () => {
    const input = makeInput();
    input.enabled = false;
    input.configuration = null;
    input.requestedRevision = null;
    expect(evaluateConceptRenderGate(input)).toEqual({ allowed: true, enforced: false });
  });
  it.each(['interior', 'exterior'] as const)(
    'allows only verified %s concepts with explicit matching revision',
    (renderView) => {
      const decision = evaluateConceptRenderGate({ ...makeInput(), renderView });
      expect(decision).toMatchObject({ allowed: true, enforced: true });
    },
  );
  it('does not manufacture a revision for older clients', () => {
    const decision = evaluateConceptRenderGate({ ...makeInput(), requestedRevision: null });
    expect(decision).toMatchObject({
      allowed: false, code: 'ARQDOR_GEOMETRY_REVIEW_REQUIRED',
      reasons: ['explicit_project_revision_required'],
    });
  });
  it('rejects stale browser renders after a save', () => {
    const decision = evaluateConceptRenderGate({
      ...makeInput(), updatedAt: '2026-10-27T19:01:00.000Z',
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.issueCodes).toContain('REVISION_MISMATCH');
  });
  it('blocks unanchored openings', () => {
    const request = makeInput();
    (request.configuration as any).customOpenings[0].wallId = 'missing';
    const decision = evaluateConceptRenderGate(request);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.issueCodes).toContain('WALL_NOT_FOUND');
  });
  it('rejects derived room-only geometry without verifiable host identities', () => {
    const request = makeInput();
    (request.configuration as any).customWalls = [];
    const decision = evaluateConceptRenderGate(request);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reasons).toContain('no_explicit_walls_room_derived_geometry_not_verified');
  });
  it('never changes the input geometry', () => {
    const request = makeInput();
    const before = JSON.stringify(request);
    evaluateConceptRenderGate(request);
    expect(JSON.stringify(request)).toBe(before);
  });
});
