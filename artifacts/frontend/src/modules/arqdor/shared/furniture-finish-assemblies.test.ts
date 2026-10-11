import {describe,it,expect} from "vitest";
import {applyFaceFinish,buildSlatPanel,quantifyMetalProfile} from "./furniture-finish-assemblies";
describe("finishes and mixed specialty reference assemblies",()=>{
 it("applies visual and physical layers to one stable face",()=>{
  const a=applyFaceFinish([],"face-a",{visualMaterialId:"oak",physicalLayerIds:["veneer"],uv:{scaleU:1,scaleV:1,rotationDeg:0}});
  const b=applyFaceFinish(a,"face-b",{visualMaterialId:"metal",physicalLayerIds:["coating"],uv:{scaleU:2,scaleV:2,rotationDeg:90}});
  expect(b).toHaveLength(2);
  expect(b[0].visualMaterialId).toBe("oak");
  expect(a).toHaveLength(1);
 });
 it("counts slats and linear usage deterministically",()=>{
  const a=buildSlatPanel({id:"slat1",tenantId:"t",projectId:"p",roomId:"r",widthMm:1000,heightMm:2500,slatWidthMm:40,spacingMm:10,slatDepthMm:20,materialId:"wood"});
  expect(a).toMatchObject({slatCount:20,totalLinearMeters:50,status:"preliminary"});
  expect(a.occupiedWidthMm).toBe(990);
 });
 it("calculates reference metal profile weight",()=>{
  const result=quantifyMetalProfile({id:"tube",tenantId:"t",materialId:"steel",sku:"tube1",sectionAreaMm2:200,densityKgM3:7850,lengthMm:2000,quantity:2});
  expect(result.linearMeters).toBe(4);
  expect(result.estimatedMassKg).toBeCloseTo(6.28);
 });
});
