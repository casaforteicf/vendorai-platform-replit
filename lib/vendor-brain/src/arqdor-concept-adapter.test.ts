import { describe, expect, it } from 'vitest';
import { adaptPersistedConceptGeometry } from './arqdor-concept-adapter';

const wall = () => ({
  id: 'wall-1', floor: 0, x1: 0, y1: 0, x2: 5, y2: 0,
  thickness: 0.15, height: 2.8,
});
const opening = () => ({
  id: 'window-1', wallId: 'wall-1', floor: 0, type: 'window',
  offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9,
});
const input = () => ({
  tenantId: 'tenant-A', projectId: 'concept-1', updatedAt: '2026-10-27T17:00:00.000Z',
  configuration: { revisionNumber: 2, customWalls: [wall()], customOpenings: [opening()] },
});

describe('Arqdor LOT-02: persisted concept geometry adapter', () => {
  it('converts explicit wall/opening dimensions from m to mm', () => {
    const result = adaptPersistedConceptGeometry(input());
    expect(result.status).toBe('valid');
    expect(result.snapshot?.unit).toBe('mm');
    expect(result.snapshot?.walls[0]).toMatchObject({
      id: 'wall-1', floorId: 'floor:0', x2Mm: 5000, thicknessMm: 150, heightMm: 2800,
    });
    expect(result.snapshot?.openings[0]).toMatchObject({
      wallId: 'wall-1', offsetMm: 1000, widthMm: 1200, sillHeightMm: 900,
    });
  });
  it('generates a new draft provenance value when persisted updatedAt changes', () => {
    const a = adaptPersistedConceptGeometry(input()).snapshot?.revisionId;
    const newer = input();
    newer.updatedAt = '2026-10-27T17:05:00.000Z';
    const b = adaptPersistedConceptGeometry(newer).snapshot?.revisionId;
    expect(a).not.toBe(b);
  });
  it('rejects draft geometry without the persisted updatedAt', () => {
    const { updatedAt: _omitted, ...source } = input();
    const result = adaptPersistedConceptGeometry(source);
    expect(result.status).toBe('requires_review');
    expect(result.reasons).toContain('draft_updated_at_missing');
  });
  it('rejects default room-derived geometry without explicit wall identities', () => {
    const source = input();
    source.configuration.customWalls = [];
    const result = adaptPersistedConceptGeometry(source);
    expect(result.status).toBe('requires_review');
    expect(result.reasons).toContain('no_explicit_walls_room_derived_geometry_not_verified');
  });
  it('rejects unanchored imported openings', () => {
    const source = input();
    source.configuration.customOpenings[0] = { ...opening(), wallId: 'missing-wall' };
    const result = adaptPersistedConceptGeometry(source);
    expect(result.status).toBe('requires_review');
    expect(result.issues.map(x => x.code)).toContain('WALL_NOT_FOUND');
  });
  it('rejects legacy missing heights and dimensions instead of inventing them', () => {
    const source = input();
    source.configuration.customOpenings[0] = { ...opening(), height: undefined as unknown as number };
    const result = adaptPersistedConceptGeometry(source);
    expect(result.status).toBe('requires_review');
    expect(result.issues.map(x => x.code)).toContain('INVALID_DIMENSION');
  });
  it('rejects opening beyond wall edge', () => {
    const source = input();
    source.configuration.customOpenings[0] = { ...opening(), offset: 4.5 };
    const result = adaptPersistedConceptGeometry(source);
    expect(result.issues.map(x => x.code)).toContain('OPENING_OUTSIDE_WALL');
  });
  it('does not mutate the original configuration', () => {
    const source = input();
    const before = JSON.stringify(source);
    adaptPersistedConceptGeometry(source);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('accepts a matching, approved immutable master revision', () => {
    const source = input();
    const master = {
      version: 3, sourceConceptId: 'concept-1', geometryVersion: 'master_facade_v1',
      acceptanceProof: { status: 'approved' },
      customWalls: [wall()], customOpenings: [opening()],
    };
    const result = adaptPersistedConceptGeometry({
      ...source, configuration: { projectMaster: master },
    });
    expect(result.status).toBe('valid');
    expect(result.source).toBe('project_master');
    expect(result.snapshot?.revisionId).toBe('master:v3');
  });
  it('does not fall back to draft when a master is unapproved', () => {
    const source = input();
    const result = adaptPersistedConceptGeometry({
      ...source, configuration: { ...source.configuration, projectMaster: {
        version: 2, sourceConceptId: 'concept-1', geometryVersion: 'master_facade_v1',
        acceptanceProof: { status: 'review' },
        customWalls: [wall()], customOpenings: [opening()],
      } },
    });
    expect(result.status).toBe('requires_review');
    expect(result.reasons).toContain('master_not_approved');
  });
  it('rejects an unsupported master version and mismatched origin', () => {
    const result = adaptPersistedConceptGeometry({
      ...input(), configuration: { projectMaster: {
        version: 5, sourceConceptId: 'another',
        geometryVersion: 'future_format', acceptanceProof: { status: 'approved' },
        customWalls: [wall()], customOpenings: [opening()],
      } },
    });
    expect(result.status).toBe('requires_review');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'unsupported_master_geometry_version', 'master_source_mismatch',
    ]));
  });
  it('rejects invalid opening types rather than treating them as valid windows', () => {
    const result = adaptPersistedConceptGeometry({
      ...input(), configuration: { revisionNumber: 1, customWalls: [wall()],
        customOpenings: [{ ...opening(), type: 'skylight' }] },
    });
    expect(result.status).toBe('requires_review');
    expect(result.reasons).toContain('unknown_opening_type');
  });
});
