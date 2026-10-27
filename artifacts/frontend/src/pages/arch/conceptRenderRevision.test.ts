import { describe, expect, it } from 'vitest';
import { conceptRenderRevision } from './conceptRenderRevision';

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
