import { describe, it, expect } from 'vitest';
import {
  validateCanonicalGeometry,
  validateDerivedArtifactSource,
  type CanonicalGeometrySnapshot,
} from './arqdor-geometry-invariants';

const sample = (): CanonicalGeometrySnapshot => ({
  tenantId: 'tenant-A', projectId: 'house-1', revisionId: 'R1', unit: 'mm',
  walls: [{ id: 'wall-front', floorId: 'ground', x1Mm: 0, y1Mm: 0,
    x2Mm: 5000, y2Mm: 0, thicknessMm: 150, heightMm: 2800 }],
  openings: [{ id: 'window-1', wallId: 'wall-front', floorId: 'ground',
    type: 'window', offsetMm: 1000, widthMm: 1200,
    heightMm: 1200, sillHeightMm: 900 }],
});
const codes = (snapshot: CanonicalGeometrySnapshot) =>
  validateCanonicalGeometry(snapshot).issues.map((issue) => issue.code);

describe('Arqdor LOT-01: canonical geometry preflight', () => {
  it('accepts a valid anchored window', () => {
    expect(validateCanonicalGeometry(sample()).valid).toBe(true);
  });
  it('does not mutate the source snapshot', () => {
    const project = sample();
    const before = JSON.stringify(project);
    validateCanonicalGeometry(project);
    expect(JSON.stringify(project)).toBe(before);
  });
  it('requires every opening to have a valid host wall', () => {
    const project = sample();
    project.openings[0]!.wallId = 'missing-wall';
    expect(codes(project)).toContain('WALL_NOT_FOUND');
  });
  it('rejects openings on another floor', () => {
    const project = sample();
    project.openings[0]!.floorId = 'upper';
    expect(codes(project)).toContain('FLOOR_MISMATCH');
  });
  it('rejects openings exceeding host bounds', () => {
    const project = sample();
    project.openings[0]!.offsetMm = 4500;
    expect(codes(project)).toContain('OPENING_OUTSIDE_WALL');
  });
  it('rejects windows above the ceiling', () => {
    const project = sample();
    project.openings[0]!.sillHeightMm = 1900;
    expect(codes(project)).toContain('OPENING_ABOVE_WALL');
  });
  it('detects overlapping openings', () => {
    const project = sample();
    project.openings.push({ ...project.openings[0]!, id: 'window-2', offsetMm: 1500 });
    expect(codes(project)).toContain('OPENING_OVERLAP');
  });
  it('rejects duplicate IDs and degenerate walls', () => {
    const project = sample();
    project.walls[0]!.x2Mm = 0;
    project.walls.push({ ...project.walls[0]! });
    expect(codes(project)).toEqual(expect.arrayContaining(['INVALID_WALL', 'DUPLICATE_WALL']));
  });
  it('blocks cross-tenant, cross-project and stale revision artifacts', () => {
    const result = validateDerivedArtifactSource(sample(), {
      tenantId: 'tenant-B', projectId: 'other', revisionId: 'R0',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map(x => x.code)).toEqual([
      'TENANT_MISMATCH', 'PROJECT_MISMATCH', 'REVISION_MISMATCH',
    ]);
  });
  it('accepts provenance for the exact tenant, project and revision', () => {
    const project = sample();
    expect(validateDerivedArtifactSource(project, {
      tenantId: 'tenant-A', projectId: 'house-1', revisionId: 'R1',
    }).valid).toBe(true);
  });
});
