import {describe,it,expect} from "vitest";
import {assessLamination,compareRevisionFields} from "./furniture-revision-lamination";
describe("laminates and immutable revision comparison",()=>{
 it("aggregates layer thickness and warns on excessive bending",()=>{
  const result=assessLamination([{id:"a",materialId:"wood",thicknessMm:4,grainDirection:"length",minimumBendRadiusMm:300},{id:"b",materialId:"glue",thicknessMm:.3,grainDirection:"none"}],200);
  expect(result.totalThicknessMm).toBeCloseTo(4.3);
  expect(result.warnings.some(x=>x.includes("below minimum"))).toBe(true);
  expect(result.status).toBe("requires-engineering-review");
 });
 it("rejects invalid layer geometry",()=>{
  expect(()=>assessLamination([{id:"a",materialId:"m",thicknessMm:0,grainDirection:"none"}])).toThrow();
 });
 it("detects changes after approved revision",()=>{
  const a={revisionId:"R1",approval:"approved" as const,createdAt:"2026-10-10",payload:{width:1200,material:"MDF"}};
  const b={revisionId:"R2",approval:"draft" as const,createdAt:"2026-10-11",payload:{width:1500,material:"MDF"}};
  expect(compareRevisionFields(a,b)).toEqual({changedKeys:["width"],requiresApproval:true});
  expect(a.payload.width).toBe(1200);
 });
});
