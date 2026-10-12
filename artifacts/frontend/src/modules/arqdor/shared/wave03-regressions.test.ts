import { describe, expect, it } from 'vitest';
import { calculateSpecialtyPanel, type SpecialtyMaterial, type SpecialtyPanel } from './specialty-panels';
import { exportFurnitureBomCsv, type FurnitureBusinessHandoff } from './furniture-business-handoff';
const material: SpecialtyMaterial = { id: 'm', tenantId: 't', family: 'glass', manufacturer: 'f', sku: 's', thicknessMm: 10, sheetWidthMm: 3000, sheetLengthMm: 4000, grain: 'none' };
const panel: SpecialtyPanel = { id: 'p', tenantId: 't', projectId: 'p', roomId: 'r', materialId: 'm', kind: 'glass-panel', sourceRevision: 'R1', openings: [], outline: [{xMm:0,yMm:0},{xMm:2000,yMm:0},{xMm:2000,yMm:600},{xMm:0,yMm:600}] };
describe('wave03 geometry and CSV regressions', () => {
  it('keeps area invariant under translation and reversed winding', () => {
    const translated = panel.outline.map(p => ({ xMm: p.xMm + 10000, yMm: p.yMm - 2000 }));
    for (const outline of [panel.outline, translated, [...translated].reverse()]) {
      expect(calculateSpecialtyPanel({ ...panel, outline }, material).grossAreaM2).toBeCloseTo(1.2);
    }
  });
  it('computes a triangular panel area', () => {
    expect(calculateSpecialtyPanel({ ...panel, outline: [{xMm:0,yMm:0},{xMm:2000,yMm:0},{xMm:0,yMm:600}] }, material).grossAreaM2).toBeCloseTo(0.6);
  });
  it.each(['=1+1', '+SUM(A1)', '-2+1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1'])('preserves and escapes CSV formula prefix %s', sku => {
    const handoff: FurnitureBusinessHandoff = { tenantId:'t', projectId:'p', revision:'R1', context:{}, pieces:[], validation:{status:'engineering-review-required',warnings:[]}, lines:[{materialId:'m',manufacturer:'f',sku,thicknessMm:18,partCount:1,netAreaM2:1}] };
    expect(exportFurnitureBomCsv(handoff)).toContain('"\'' + sku + '"');
  });
});
