import { describe, expect, it } from 'vitest';
import { gateDerivedArtifact, type DerivedArtifactGateInput } from './arqdor-derived-artifact-gate';

function input(): DerivedArtifactGateInput {
  return {
    tenantId: 'company-A', projectId: 'house-01',
    updatedAt: '2026-10-27T18:00:00.000Z',
    configuration: {
      revisionNumber: 7,
      customWalls: [{ id: 'W1', floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.15, height: 2.8 }],
      customOpenings: [{ id: 'J1', wallId: 'W1', floor: 0, type: 'window',
        offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 }],
    },
    kind: 'facade',
    target: { tenantId: 'company-A', projectId: 'house-01',
      revisionId: 'draft:r7:updated:2026-10-27T18:00:00.000Z' },
  };
}

describe('Arqdor derived artifact gate', () => {
  it.each(['facade', 'interior', 'render'] as const)('allows valid anchored %s source', (kind) => {
    const request = input(); request.kind = kind;
    const result = gateDerivedArtifact(request);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.openingCount).toBe(1);
  });
  it('blocks a different tenant, despite a matching geometry', () => {
    const request = input(); request.target.tenantId = 'company-B';
    const result = gateDerivedArtifact(request);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.issues.map(i => i.code)).toContain('TENANT_MISMATCH');
  });
  it('blocks a different project', () => {
    const request = input(); request.target.projectId = 'house-02';
    const result = gateDerivedArtifact(request);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.issues.map(i => i.code)).toContain('PROJECT_MISMATCH');
  });
  it('blocks stale revision after a new save', () => {
    const request = input(); request.updatedAt = '2026-10-27T18:01:00.000Z';
    const result = gateDerivedArtifact(request);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.issues.map(i => i.code)).toContain('REVISION_MISMATCH');
  });
  it('blocks unanchored windows and preserves the input', () => {
    const request = input();
    (request.configuration as any).customOpenings[0].wallId = 'missing';
    const before = JSON.stringify(request);
    const result = gateDerivedArtifact(request);
    expect(result.allowed).toBe(false);
    expect(JSON.stringify(request)).toBe(before);
  });
  it('blocks room-derived-only unverified geometry', () => {
    const request = input();
    (request.configuration as any).customWalls = [];
    expect(gateDerivedArtifact(request).allowed).toBe(false);
  });
  it('blocks missing revision even when wall coordinates are valid', () => {
    const request = input(); request.target.revisionId = '';
    expect(gateDerivedArtifact(request).allowed).toBe(false);
  });
});
