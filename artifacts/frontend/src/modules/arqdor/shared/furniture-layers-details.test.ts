import {describe,it,expect} from "vitest";
import {calculateLayerAssembly,assessJoinDetail,recordRevisionComment} from "./furniture-layers-details";
describe("layered materials and reusable detail review",()=>{
 it("computes thickness and complete mass and material cost",()=>{
  const r=calculateLayerAssembly([{id:"a",role:"substrate",materialId:"MDF",thicknessMm:18,densityKgM3:700,costPerM2:100},{id:"b",role:"finish",materialId:"veneer",thicknessMm:1,densityKgM3:600,costPerM2:20}],2);
  expect(r).toMatchObject({thicknessMm:19,estimatedMassKg:26.4,estimatedMaterialCost:240,reviewRequired:true});
 });
 it("does not invent unknown weight or price",()=>{
  const r=calculateLayerAssembly([{id:"a",role:"adhesive",materialId:"glue",thicknessMm:0.2}],1);
  expect(r.estimatedMassKg).toBeNull();
  expect(r.estimatedMaterialCost).toBeNull();
 });
 it("checks material, revision and thickness for reusable details",()=>{
  const d={id:"detail",tenantId:"t",revision:1,kind:"joint" as const,compatibleMaterials:["wood"],minimumThicknessMm:18};
  expect(assessJoinDetail(d,"t","wood",18)).toMatchObject({eligibleForReview:true,approvedForFabrication:false});
  expect(assessJoinDetail(d,"t","glass",18).eligibleForReview).toBe(false);
  expect(()=>assessJoinDetail(d,"other","wood",18)).toThrow();
 });
 it("requires revision-scoped author and object identity in comments",()=>{
  expect(recordRevisionComment({id:"c",tenantId:"t",projectId:"p",revision:"R1",authorId:"u",objectId:"part",body:"Conferir medida",state:"open"}).revision).toBe("R1");
  expect(()=>recordRevisionComment({id:"",tenantId:"t",projectId:"p",revision:"R1",authorId:"u",objectId:"part",body:"",state:"open"})).toThrow();
 });
});