import { describe, expect, it } from "vitest";
import { createProgressiveCpuRender } from "./render-progressive";
import { renderCpuPreview } from "./render-cpu-preview";
import type { GeometryTransfer } from "./render-geometry-export";

const geometry: GeometryTransfer = {
 schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
 meshes:[{meshId:"test",materialId:"white",triangles:1,
 positions:[-2,-2,0,2,-2,0,0,2,0],
 normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}],
};
const options = {
 geometry, width:4, height:4,
 camera:{position:[0,0,2] as const,target:[0,0,0] as const,verticalFovDegrees:60},
 light:{directionToLight:[0,0,1] as const,intensity:1,color:[1,1,1] as const},
 materials:{white:"#ffffff"},
};
describe("ARQDOR progressive CPU sampling",()=>{
 it("keeps sample zero identical to the previous centered diagnostic",()=>{
  const p=createProgressiveCpuRender(options);
  const first=p.nextSample();
  expect(first.sampleCount).toBe(1);
  expect(Array.from(first.rgba)).toEqual(Array.from(renderCpuPreview(options).rgba));
 });
 it("accumulates independent deterministic subpixel samples",()=>{
  const p=createProgressiveCpuRender(options);
  const a=p.nextSample();
  const b=p.nextSample();
  const second=renderCpuPreview(options,0,4,undefined,1);
  for(let i=0;i<b.rgba.length;i+=4)for(let c=0;c<3;c++)
    expect(b.rgba[i+c]).toBe(Math.round((a.rgba[i+c]+second.rgba[i+c])/2));
  expect(p.sampleCount).toBe(2);
 });
 it("rejects unsupported geometry",()=>{
  expect(()=>createProgressiveCpuRender({...options,geometry:{...geometry,truncated:true}})).toThrow();
 });
});
