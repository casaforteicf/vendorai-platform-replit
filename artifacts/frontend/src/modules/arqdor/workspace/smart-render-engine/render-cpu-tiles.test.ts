import { describe, expect, it } from "vitest";
import { renderCpuPreview } from "./render-cpu-preview";
import type { GeometryTransfer } from "./render-geometry-export";
const geometry:GeometryTransfer={schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,meshes:[{meshId:"m",materialId:"white",triangles:1,positions:[-2,-2,0,2,-2,0,0,2,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}]};
const options={geometry,camera:{position:[0,0,2] as const,target:[0,0,0] as const,verticalFovDegrees:60},light:{directionToLight:[0,0,1] as const,intensity:1,color:[1,1,1] as const},materials:{white:"#ffffff"},width:4,height:4};
describe("ARQDOR CPU tile rendering",()=>{
 it("matches full-frame pixel output for concatenated strips",()=>{
  const whole=renderCpuPreview(options);
  const top=renderCpuPreview(options,0,2),bottom=renderCpuPreview(options,2,2);
  expect(Array.from([...top.rgba,...bottom.rgba])).toEqual(Array.from(whole.rgba));
 });
 it("rejects rows outside the frame",()=>expect(()=>renderCpuPreview(options,3,2)).toThrow());
});
