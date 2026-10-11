import {describe,it,expect} from "vitest";
import {buildCabinet3DBoxes,projectAxonometric} from "./furniture-preview-3d";
describe("3D schematic contracts",()=>{
 it("shows height on vertical projection",()=>{
  expect(projectAxonometric(0,0,100).y).toBeLessThan(projectAxonometric(0,0,0).y);
 });
 it("rejects footprint and parameter mismatch",()=>{
  const item:any={id:"cabinet",bounds:{xMm:0,yMm:0,widthMm:1000,depthMm:500},parameters:{widthMm:1200,depthMm:500,heightMm:2000,materialId:"MDF"}};
  expect(()=>buildCabinet3DBoxes([item])).toThrow();
 });
 it("swaps physical footprint axes for a 90-degree cabinet rotation",()=>{
  const item:any={id:"cab",bounds:{xMm:100,yMm:200,widthMm:1200,depthMm:600,rotationDeg:90},parameters:{widthMm:1200,depthMm:600,heightMm:2100,materialId:"MDF"}};
  expect(buildCabinet3DBoxes([item])[0]).toMatchObject({widthMm:600,depthMm:1200,rotationDeg:90,xMm:100,yMm:200});
 });
});
