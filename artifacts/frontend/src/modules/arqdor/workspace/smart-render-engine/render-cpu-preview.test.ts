import { describe, expect, it } from "vitest";
import { renderCpuPreview } from "./render-cpu-preview";
import type { GeometryTransfer } from "./render-geometry-export";

const geometry:GeometryTransfer={
  schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
  meshes:[{meshId:"surface",materialId:"white",triangles:1,
    positions:[-2,-2,0,2,-2,0,0,2,0],
    normals:[0,0,1,0,0,1,0,0,1],
    uvs:[0,0,1,0,0.5,1]}],
};
const input={
  geometry,
  camera:{position:[0,0,2] as const,target:[0,0,0] as const,verticalFovDegrees:60},
  light:{directionToLight:[0,0,1] as const,intensity:1,color:[1,1,1] as const},
  materials:{white:"#ffffff"},width:1,height:1,
};
describe("ARQDOR CPU diagnostic render",()=>{
  it("produces a single opaque lit pixel using the BVH",()=>{
    const out=renderCpuPreview(input);
    expect(out.triangleCount).toBe(1);
    expect(Array.from(out.rgba)).toEqual([255,255,255,255]);
  });
  it("uses sky color if camera misses the surface",()=>{
    const out=renderCpuPreview({...input,camera:{...input.camera,target:[4,0,0] as const}});
    expect(Array.from(out.rgba)).toEqual([184,209,242,255]);
  });
  it("does not render incomplete geometry",()=>{
    expect(()=>renderCpuPreview({...input,geometry:{...geometry,truncated:true}})).toThrow();
  });
  it("rejects oversized images",()=>{
    expect(()=>renderCpuPreview({...input,width:1024,height:1024})).toThrow();
  });
});
