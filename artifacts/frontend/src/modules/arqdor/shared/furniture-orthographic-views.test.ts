import {describe,it,expect} from "vitest";
import {generateCabinetDraft} from "./parametric-cabinet-core";
import {buildCabinetTechnicalViews} from "./furniture-orthographic-views";
const p={tenantId:"t",projectId:"p",roomId:"r",furnitureId:"f",widthMm:1000,heightMm:2000,depthMm:500,panelThicknessMm:18,shelfCount:2,doorCount:2,materialId:"m",backThicknessMm:6,backMaterialId:"b"};
describe("cabinet orthographic reference views",()=>{
 it("generates three revision-bound orthographic envelopes",()=>{
  const views=buildCabinetTechnicalViews(generateCabinetDraft(p),"R1");
  expect(views.map(v=>v.kind)).toEqual(["front","side","top"]);
  expect(views[0]).toMatchObject({revision:"R1",widthMm:1000,heightMm:2000});
  expect(views[1]).toMatchObject({widthMm:500,heightMm:2000});
  expect(views[2]).toMatchObject({widthMm:1000,heightMm:500});
  expect(views.every(v=>v.lines.length===4)).toBe(true);
 });
 it("rejects missing revision",()=>{
  expect(()=>buildCabinetTechnicalViews(generateCabinetDraft(p),"")).toThrow();
 });
});