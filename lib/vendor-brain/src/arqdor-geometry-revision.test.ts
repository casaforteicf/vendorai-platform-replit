import { describe, it, expect } from 'vitest';
import { conceptStructuralRevision, type ConceptStructuralState } from './arqdor-geometry-revision';

const state = (): ConceptStructuralState => ({
  lot: { width: 12, depth: 30 },
  rooms: [{ id: 'living', floor: 0, x: 0, y: 0, width: 5, depth: 4 }],
  openingOverrides: {},
  facadePreferences: { roof: 'platibanda' },
  configuration: {
    floors: 1,
    revisionNumber: 1,
    customWalls: [{ id: 'wall', floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.15, height: 2.8 }],
    customOpenings: [{ id: 'window', wallId: 'wall', floor: 0, offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9, type: 'window' }],
    objects: [],
    publicTourToken: 'invisible',
    conceptRender: { status: 'idle' },
  },
});

describe('ARQDOR LOT-05 structural provenance', () => {
  it('returns a stable, nonempty token', () => {
    expect(conceptStructuralRevision(state())).toMatch(/^geometry:v1:[a-f0-9-]+$/);
  });
  it('ignores metadata-only changes and legacy revisionNumber', () => {
    const before = state();
    const after = state();
    const config = after.configuration as Record<string, unknown>;
    config.publicTourToken = 'changed';
    config.conceptRender = { status: 'processing', renderId: 'any' };
    config.revisionNumber = 123;
    expect(conceptStructuralRevision(after)).toBe(conceptStructuralRevision(before));
  });
  it('ignores key ordering differences between JSONB and client', () => {
    const original = state();
    const reordered = state();
    reordered.lot = { depth: 30, width: 12 };
    reordered.facadePreferences = { roof: 'platibanda' };
    expect(conceptStructuralRevision(reordered)).toBe(conceptStructuralRevision(original));
  });
  it('invalidates when a window is moved', () => {
    const original = state(); const changed = state();
    ((changed.configuration as any).customOpenings[0]).offset = 2;
    expect(conceptStructuralRevision(changed)).not.toBe(conceptStructuralRevision(original));
  });
  it('invalidates when room geometry changes', () => {
    const original = state(); const changed = state();
    (changed.rooms as any[])[0].width = 6;
    expect(conceptStructuralRevision(changed)).not.toBe(conceptStructuralRevision(original));
  });
  it('invalidates when facade style or lot geometry changes', () => {
    const original = state(); const changed = state();
    changed.facadePreferences = { roof: 'aparente' };
    expect(conceptStructuralRevision(changed)).not.toBe(conceptStructuralRevision(original));
    changed.facadePreferences = original.facadePreferences;
    changed.lot = { width: 13, depth: 30 };
    expect(conceptStructuralRevision(changed)).not.toBe(conceptStructuralRevision(original));
  });
  it('fails closed on missing persisted structural fields', () => {
    expect(conceptStructuralRevision({ ...state(), rooms: undefined })).toBeNull();
    expect(conceptStructuralRevision({ ...state(), configuration: null })).toBeNull();
  });
  it('does not mutate the source project', () => {
    const value = state(); const prior = JSON.stringify(value);
    conceptStructuralRevision(value);
    expect(JSON.stringify(value)).toBe(prior);
  });
});
