import { describe, expect, it } from 'vitest';
import { conceptStructuralRevision } from '@workspace/vendor-brain/arqdor-geometry-revision';
import { evaluateConceptRenderGate, type ConceptRenderGateRequest } from './arqdor-render-geometry-gate.js';

const makeInput = (): ConceptRenderGateRequest => {
  const configuration = {
    // Legacy projects commonly have no revisionNumber; geometry token still works.
    customWalls: [{ id: 'wall-1', floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.15, height: 2.8 }],
    customOpenings: [{ id: 'window-1', wallId: 'wall-1', floor: 0,
      type: 'window', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 }],
  };
  const structuralState = {
    lot: { width: 12, depth: 30 },
    rooms: [{ id: 'room-1', floor: 0, x: 0, y: 0, width: 5, depth: 4 }],
    openingOverrides: {},
    facadePreferences: { roof: 'platibanda' },
    configuration,
  };
  return {
    enabled: true,
    tenantId: 'tenant-A',
    conceptProjectId: 'concept-7',
    updatedAt: '2026-10-27T19:00:00.000Z',
    requestedRevision: conceptStructuralRevision(structuralState),
    renderView: 'exterior',
    configuration,
    structuralState,
  };
};

describe('ARQDOR LOT-04/05 server render geometry feature gate', () => {
  it('preserves legacy flow when gate flag is off', () => {
    const input = makeInput();
    input.enabled = false; input.configuration = null; input.requestedRevision = null;
    expect(evaluateConceptRenderGate(input)).toEqual({ allowed: true, enforced: false });
  });
  it.each(['interior', 'exterior'] as const)('accepts current anchored %s geometry', renderView => {
    expect(evaluateConceptRenderGate({ ...makeInput(), renderView }))
      .toMatchObject({ allowed: true, enforced: true });
  });
  it('does not invent a revision for an older client', () => {
    expect(evaluateConceptRenderGate({ ...makeInput(), requestedRevision: null })).toMatchObject({
      allowed: false, reasons: ['explicit_project_revision_required'],
    });
  });
  it('ignores render metadata saves that advance updatedAt', () => {
    const input = makeInput();
    input.updatedAt = '2026-10-27T19:45:00.000Z';
    expect(evaluateConceptRenderGate(input).allowed).toBe(true);
  });
  it('rejects an old source token after changing the room layout', () => {
    const input = makeInput();
    ((input.structuralState!.rooms as any[])[0]).width = 6;
    const decision = evaluateConceptRenderGate(input);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.issueCodes).toContain('REVISION_MISMATCH');
  });
  it('rejects an old source token after changing an opening', () => {
    const input = makeInput();
    ((input.configuration as any).customOpenings[0]).offset = 2;
    const decision = evaluateConceptRenderGate(input);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.issueCodes).toContain('REVISION_MISMATCH');
  });
  it('blocks unanchored windows even when the token is newly recalculated', () => {
    const input = makeInput();
    ((input.configuration as any).customOpenings[0]).wallId = 'missing';
    input.requestedRevision = conceptStructuralRevision(input.structuralState!);
    const decision = evaluateConceptRenderGate(input);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.issueCodes).toContain('WALL_NOT_FOUND');
  });
  it('rejects room-derived geometry without explicit verified wall identity', () => {
    const input = makeInput();
    (input.configuration as any).customWalls = [];
    input.requestedRevision = conceptStructuralRevision(input.structuralState!);
    const decision = evaluateConceptRenderGate(input);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reasons)
      .toContain('no_explicit_walls_room_derived_geometry_not_verified');
  });
  it('does not mutate persisted input while evaluating', () => {
    const input = makeInput(); const old = JSON.stringify(input);
    evaluateConceptRenderGate(input);
    expect(JSON.stringify(input)).toBe(old);
  });
});
