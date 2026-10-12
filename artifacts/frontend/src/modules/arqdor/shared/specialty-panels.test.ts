import {describe,it,expect} from "vitest";
import {calculateSpecialtyPanel,buildSpecialtyRfqDraft,type SpecialtyMaterial,type SpecialtyPanel} from "./specialty-panels";
const m:SpecialtyMaterial={id:"stone",tenantId:"t",family:"sintered",manufacturer:"Fornecedor",sku:"REF",thicknessMm:12,sheetWidthMm:1600,sheetLengthMm:3200,grain:"length"};
const p:SpecialtyPanel={id:"top",tenantId:"t",projectId:"p",roomId:"kitchen",materialId:"stone",kind:"countertop",sourceRevision:"R1",outline:[{xMm:0,yMm:0},{xMm:2000,yMm:0},{xMm:2000,yMm:600},{xMm:0,yMm:600}],openings:[{id:"sink",xMm:200,yMm:100,widthMm:500,heightMm:400}]};
describe("specialty panels",()=>{
 it("computes reference areas and perimeter",()=>{
  expect(calculateSpecialtyPanel(p,m)).toMatchObject({grossAreaM2:1.2,netAreaM2:1,perimeterM:5.2,revision:"R1",status:"requires-specialist-review"});
 });
 it("does not send RFQ automatically",()=>{
  expect(buildSpecialtyRfqDraft(p,m)).toMatchObject({sendStatus:"not-sent",approvalRequired:true,requiresSiteMeasurement:true});
 });
 it("rejects mismatched tenant and impossible openings",()=>{
  expect(()=>calculateSpecialtyPanel(p,{...m,tenantId:"another"})).toThrow();
  expect(()=>calculateSpecialtyPanel({...p,openings:[{id:"huge",xMm:0,yMm:0,widthMm:2000,heightMm:1000}]},m)).toThrow();
 });
});