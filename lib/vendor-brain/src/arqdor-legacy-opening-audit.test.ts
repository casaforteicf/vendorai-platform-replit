import { describe, expect, it } from 'vitest';
import {
  auditLegacyOpeningAnchors,
  type LegacyReferenceWall,
  type LegacyReferenceOpening,
} from './arqdor-legacy-opening-audit';

const wall = (): LegacyReferenceWall => ({
  id: 'W1', floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.15,
});
const windowMarker = (): LegacyReferenceOpening => ({
  id: 'J1', floor: 0, type: 'window', orientation: 'horizontal',
  x: 2, y: 0, width: 1.2, height: 1.2, sillHeight: 0.9,
});
const audit = (walls: LegacyReferenceWall[], openings: LegacyReferenceOpening[]) =>
  auditLegacyOpeningAnchors({ walls, openings });
const codes = (walls: LegacyReferenceWall[], openings: LegacyReferenceOpening[]) =>
  audit(walls, openings).issues.map(issue => issue.code);

describe('ARQDOR LOT-06: legacy opening association candidates', () => {
  it('returns review-only candidate with exact mm conversion', () => {
    const result = audit([wall()], [windowMarker()]);
    expect(result.status).toBe('candidates_found');
    expect(result.candidates).toEqual([{
      openingId: 'J1', wallId: 'W1', floor: 0, offsetMm: 1400,
      widthMm: 1200, heightMm: 1200, sillHeightMm: 900,
      requiresReview: true, source: 'legacy_marker_geometry',
    }]);
  });
  it('uses wall direction for reversed segments', () => {
    const host = wall();
    host.x1 = 5; host.x2 = 0;
    expect(audit([host], [windowMarker()]).candidates[0]?.offsetMm).toBe(2400);
  });
  it('works with vertical host walls and respects the floor', () => {
    const host: LegacyReferenceWall = {
      id: 'V1', floor: 1, x1: 5, y1: 0, x2: 5, y2: 4, thickness: 0.15,
    };
    const marker = { ...windowMarker(), floor: 1, orientation: 'vertical' as const, x: 5, y: 2 };
    expect(audit([host], [marker]).candidates[0]?.offsetMm).toBe(1400);
  });
  it('rejects no-wall or no-opening projects', () => {
    expect(audit([], []).status).toBe('requires_review');
    expect(audit([wall()], []).status).toBe('requires_review');
  });
  it('rejects missing dimensions without assuming defaults', () => {
    expect(codes([wall()], [{ ...windowMarker(), width: undefined }])).toContain('DIMENSIONS_MISSING');
  });
  it('does not select a wall beyond its geometry', () => {
    expect(codes([wall()], [{ ...windowMarker(), x: 4.8 }])).toContain('WALL_NOT_FOUND');
  });
  it('does not infer walls from a remote marker', () => {
    expect(codes([wall()], [{ ...windowMarker(), y: 1 }])).toContain('WALL_NOT_FOUND');
  });
  it('does not match a wall from another floor', () => {
    expect(codes([wall()], [{ ...windowMarker(), floor: 1 }])).toContain('WALL_NOT_FOUND');
  });
  it('does not choose arbitrarily between overlapping parallel walls', () => {
    const first = wall();
    expect(codes([first, { ...first, id: 'W2' }], [windowMarker()])).toContain('AMBIGUOUS_WALL');
  });
  it('does not accept host wall ID collisions', () => {
    const first = wall();
    const result = audit([first, { ...first }], [windowMarker()]);
    expect(result.issues.map(i => i.code)).toContain('DUPLICATE_WALL_ID');
    expect(result.candidates).toHaveLength(0);
  });
  it('identifies missing wall thickness and keeps candidate unapproved', () => {
    const result = audit([{ ...wall(), thickness: undefined }], [windowMarker()]);
    expect(result.status).toBe('requires_review');
    expect(result.issues.map(i => i.code)).toContain('WALL_THICKNESS_UNKNOWN');
    expect(result.candidates[0]?.requiresReview).toBe(true);
  });
  it('rejects duplicate opening IDs', () => {
    const result = audit([wall()], [windowMarker(), windowMarker()]);
    expect(result.status).toBe('requires_review');
    expect(result.issues.map(i => i.code)).toContain('DUPLICATE_OPENING_ID');
  });
  it('rejects invalid or diagonal walls', () => {
    const result = audit([{ ...wall(), y2: 1 }], [windowMarker()]);
    expect(result.issues.map(i => i.code)).toContain('INVALID_WALL');
    expect(result.candidates).toHaveLength(0);
  });
  it('never changes source coordinates or creates real project writes', () => {
    const walls = [wall()]; const openings = [windowMarker()];
    const before = JSON.stringify({ walls, openings });
    audit(walls, openings);
    expect(JSON.stringify({ walls, openings })).toBe(before);
  });
});
