import { describe, expect, it } from 'vitest';
import { conceptRenderRevision, conceptRenderStructuralRevision } from './conceptRenderRevision';

describe('Arqdor persisted concept revision for render', () => {
  it('derives an exact canonical revision from saved data', () => {
    expect(conceptRenderRevision({
      configuration: { revisionNumber: 2 },
      updatedAt: '2026-10-27T17:05:00.000Z',
    })).toBe('draft:r2:updated:2026-10-27T17:05:00.000Z');
  });
  it('never fabricates a revision number', () => {
    expect(conceptRenderRevision({ updatedAt: '2026-10-27T17:05:00.000Z', configuration: {} })).toBeNull();
  });
  it('rejects timestamps from unsaved/invalid records', () => {
    expect(conceptRenderRevision({ configuration: { revisionNumber: 1 } })).toBeNull();
    expect(conceptRenderRevision({ configuration: { revisionNumber: 1 }, updatedAt: 'invalid' })).toBeNull();
  });
  it('rejects invalid revision numbers', () => {
    expect(conceptRenderRevision({ configuration: { revisionNumber: 0 }, updatedAt: '2026-10-27' })).toBeNull();
  });
  it('normalizes equivalent ISO timestamps', () => {
    expect(conceptRenderRevision({ configuration: { revisionNumber: 1 }, updatedAt: '2026-10-27T14:05:00-03:00' }))
      .toBe('draft:r1:updated:2026-10-27T17:05:00.000Z');
  });
});


describe('Arqdor editor persisted geometry token', () => {
  const saved = () => ({
    lot: { width: 12, depth: 30 },
    rooms: [{ id: 'kitchen', floor: 0, x: 0, y: 0, width: 4, depth: 3 }],
    openingOverrides: {},
    facadePreferences: { roof: 'platibanda' },
    configuration: {
      customWalls: [{ id: 'W', floor: 0, x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.15, height: 2.8 }],
      customOpenings: [{ id: 'J', floor: 0, wallId: 'W', type: 'window', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 }],
      conceptRender: { status: 'idle' },
    },
  });
  it('works for drafts without legacy revisionNumber', () => {
    expect(conceptRenderStructuralRevision(saved())).toMatch(/^geometry:v1:/);
  });
  it('keeps the token stable across render status changes', () => {
    const first = saved(); const next = saved();
    next.configuration.conceptRender.status = 'processing';
    expect(conceptRenderStructuralRevision(next)).toBe(conceptRenderStructuralRevision(first));
  });
  it('changes the token when an architectural opening moves', () => {
    const first = saved(); const next = saved();
    next.configuration.customOpenings[0]!.offset = 1.4;
    expect(conceptRenderStructuralRevision(next)).not.toBe(conceptRenderStructuralRevision(first));
  });
});
