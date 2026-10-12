import {describe,expect,it} from "vitest";
import {assessSurfaceFlattening,partitionTransportLength,pathLengthMm,planProfile,sampleCircularArc} from "./organic-furniture-planning";
describe("organic furniture preliminary tools",()=>{
 it("measures open and closed paths in mm",()=>{
  expect(pathLengthMm({closed:false,points:[{xMm:0,yMm:0},{xMm:300,yMm:400}]})).toBe(500);
  expect(pathLengthMm({closed:true,points:[{xMm:0,yMm:0},{xMm:300,yMm:0},{xMm:300,yMm:400}]})).toBe(1200);
 });
 it("samples a quarter circle without treating it as precise milling data",()=>{
  const p=sampleCircularArc({xMm:0,yMm:0},100,0,90,16);
  expect(p.points).toHaveLength(17);
  expect(pathLengthMm(p)).toBeGreaterThan(156);
  expect(pathLengthMm(p)).toBeLessThan(158);
 });
 it("calculates approximate reference volume of an extruded profile",()=>{
  expect(planProfile({id:"profile-1",materialId:"metal",sectionWidthMm:20,sectionHeightMm:30,
   path:{closed:false,points:[{xMm:0,yMm:0},{xMm:1000,yMm:0}]}})).toMatchObject({lengthMm:1000,netVolumeMm3:600000,validation:"reference-only"});
 });
 it("splits oversized furniture into feasible transport sections",()=>{
  const modules=partitionTransportLength(5000,2000);
  expect(modules).toHaveLength(3);
  expect(modules[2].endMm).toBeCloseTo(5000);
  expect(modules.every(m=>m.lengthMm<=2000)).toBe(true);
 });
 it("does not claim industrial flattening for nonplanar surfaces",()=>{
  expect(assessSurfaceFlattening("planar",1000,500).status).toBe("supported-reference");
  expect(assessSurfaceFlattening("freeform",1000,500).areaMm2).toBeNull();
 });
});
