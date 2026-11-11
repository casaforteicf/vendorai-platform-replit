import { describe, expect, it } from 'vitest';
import { buildRoofPlan } from './conceptRoofPlan';
const cells = [{ x: 0, y: 0, width: 4, height: 3 }];
describe('roof input resource safety', () => {
  it.each([0, -1, NaN, Infinity])('rejects unsafe step %s before sampling', step => {
    expect(() => buildRoofPlan([{ floor: 0, cells }], step)).toThrow('ROOF_STEP_INVALID');
  });
  it.each(['x', 'y', 'width', 'height'])('rejects non-finite %s', key => {
    expect(() => buildRoofPlan([{ floor: 0, cells: [{ ...cells[0], [key]: Infinity }] }])).toThrow('ROOF_CELL_INVALID');
  });
  it('rejects a grid that would exhaust resources', () => {
    expect(() => buildRoofPlan([{ floor: 0, cells }], 0.00001)).toThrow('ROOF_GRID_LIMIT');
  });
  it('accepts a basement and does not mutate input', () => {
    const frozen = [Object.freeze({ ...cells[0] })];
    const result = buildRoofPlan([{ floor: -1, cells: frozen }]);
    expect(result.slabs).toEqual([{ floor: -1, ...cells[0] }]);
  });
  it('rejects a non-finite floor', () => {
    expect(() => buildRoofPlan([{ floor: NaN, cells }])).toThrow('ROOF_FLOOR_INVALID');
  });
});
