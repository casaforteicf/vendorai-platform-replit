import { describe, expect, it } from "vitest";
import { sampleCpuTexture, sampleMeshUv } from "./render-texture";
import { traceDiffusePath } from "./render-diffuse-path";
import type { GeometryTransfer } from "./render-geometry-export";
const texture={width:1,height:1,channels:3 as const,wrap:"clamp" as const,data:[0.2,0.5,0.8]};
const geometry:GeometryTransfer={schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
 meshes:[{meshId:"panel",materialId:"wood",triangles:1,
 positions:[-2,-2,0,2,-2,0,0,2,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}]};
describe("ARQDOR CPU textures",()=>{
 it("samples colors and interpolates barycentric UV",()=>{
  expect(sampleCpuTexture(texture,[0.3,0.4])).toEqual([0.2,0.5,0.8]);
  expect(sampleMeshUv([0,0,1,0,0,1],0,[0.5,0.25,0.25])).toEqual([0.25,0.25]);
 });
 it("bilinearly blends adjacent texels in linear space",()=>{
  const t={width:2,height:1,channels:3 as const,wrap:"clamp" as const,filter:"bilinear" as const,data:[1,0,0,0,0,1]};
  expect(sampleCpuTexture(t,[0.5,0.5])).toEqual([0.5,0,0.5]);
 });
 it("converts sRGB texels into linear radiance values",()=>{
  const t={width:1,height:1,channels:3 as const,wrap:"clamp" as const,colorSpace:"srgb" as const,data:[0.5,0.5,0.5]};
  const sampled=sampleCpuTexture(t,[0.5,0.5]);
  expect(sampled[0]).toBeCloseTo(0.21404114,6);
  expect(sampled[1]).toBeCloseTo(sampled[0],8);
 });
 it("rejects malformed pixel buffers",()=>{
  expect(()=>sampleCpuTexture({...texture,data:[0.2]},[0,0])).toThrow();
 });
 it("applies texture to reflected sky through a diffuse bounce",()=>{
  const c=traceDiffusePath({geometry,ray:{origin:[0,0,2],direction:[0,0,-1]},
   materials:{wood:{baseColor:[1,1,1]}},textures:{wood:texture},sky:[1,1,1],maxBounces:1,seed:1});
  expect(c[0]).toBeCloseTo(0.2);
  expect(c[1]).toBeCloseTo(0.5);
  expect(c[2]).toBeCloseTo(0.8);
 });
});
