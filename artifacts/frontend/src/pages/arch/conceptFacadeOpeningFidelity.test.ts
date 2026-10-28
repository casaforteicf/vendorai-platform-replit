import { describe, expect, it } from 'vitest';
import { buildDerivedFacadeModel } from './conceptFacadeGeometry';
import { compareFacadeOpeningFidelity, type FacadeOpeningForFidelity } from './conceptFacadeOpeningFidelity';

const opening = (): FacadeOpeningForFidelity => ({
  id: 'J1', floor: 0, type: 'window',
  axis: 2, width: 1.2, height: 1.2, sillHeight: 0.9,
});
const run = (source: FacadeOpeningForFidelity[], result: FacadeOpeningForFidelity[]) =>
  compareFacadeOpeningFidelity({ openings: source }, { openings: result });

describe('ARQDOR LOT-06 facade fidelity gate', () => {
  it('accepts exact geometry from the same source', () => {
    expect(run([opening()], [{ ...opening() }]).valid).toBe(true);
  });
  it('rejects shifted windows', () => {
    expect(run([opening()], [{ ...opening(), axis: 2.15 }]).issues[0]).toMatchObject({
      openingId: 'J1', reason: 'CHANGED',
    });
  });
  it('rejects windows resized for aesthetics', () => {
    expect(run([opening()], [{ ...opening(), width: 0.85 }]).valid).toBe(false);
  });
  it('rejects disappearing and invented openings', () => {
    expect(run([opening()], []).issues).toContainEqual({ openingId: 'J1', reason: 'MISSING' });
    expect(run([], [opening()]).issues).toContainEqual({ openingId: 'J1', reason: 'NEW' });
  });
  it('rejects duplicate opening IDs', () => {
    expect(run([opening()], [opening(), opening()]).issues)
      .toContainEqual({ openingId: 'J1', reason: 'DUPLICATE' });
  });
  it('detects existing facade overlap correction that silently hides a window', () => {
    const rooms = [{ id: 'sala', kind: 'sala', label: 'Sala', floor: 0,
      x: 0, y: 0, width: 10, depth: 4 }] as any;
    const levels = [{ floor: 0,
      walls: [{ id: 'front', x1: 0, y1: 0, x2: 10, y2: 0, exterior: true, roomIds: ['sala'] }],
      customWalls: [], closedSpaces: [], labels: {}, stairs: [],
      openings: [
        { id: 'P1', type: 'door', orientation: 'horizontal',
          x: 5, y: 0, width: 2, height: 2.1, sillHeight: 0, roomId: 'sala' },
        { id: 'J1', type: 'window', orientation: 'horizontal',
          x: 5.9, y: 0, width: 1.4, height: 1.2, sillHeight: 0.9, roomId: 'sala' },
      ],
    }] as any;
    const site = { frontSide: 'top', setbacks: { front: 4, rear: 2, left: 1, right: 1 } } as any;
    const preserved = buildDerivedFacadeModel(levels, rooms, site, { preserveOpeningGeometry: true });
    const legacy = buildDerivedFacadeModel(levels, rooms, site);
    expect(preserved.openings.find(o => o.id === 'J1')).toMatchObject({ axis: 5.9, width: 1.4 });
    expect(compareFacadeOpeningFidelity(preserved, legacy)).toMatchObject({ valid: false });
  });
});
