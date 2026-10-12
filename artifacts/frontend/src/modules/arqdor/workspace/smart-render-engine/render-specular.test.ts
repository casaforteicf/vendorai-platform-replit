import { describe, expect, it } from "vitest";
import { normalizePhysicalMaterial, samplePerfectReflection } from "./render-physical-material";
import { traceDiffusePath } from "./render-diffuse-path";
import type { GeometryTransfer } from "./render-geometry-export";
const triangle:GeometryTransfer={schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
 meshes:[{meshId:"mirror",materialId:"metal",triangles:1,
 positions:[-2,-2,0,2,-2,0,0,2,0],normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}]};
describe("ARQDOR ideal metal reflection",()=>{
 it("reflects a normal incidence ray exactly",()=>{
  const m=normalizePhysicalMaterial({metalness:1,roughness:0,baseColor:[0.8,0.7,0.6]});
  const r=samplePerfectReflection([0,0,-1],[0,0,1],m);
  expect(r.direction).toEqual([0,0,1]);
  expect(r.throughput).toEqual([0.8,0.7,0.6]);
  expect(r.pdf).toBe(1);
 });
 it("bounces to the sky through a flat polished metal triangle",()=>{
  const color=traceDiffusePath({
    geometry:triangle,ray:{origin:[0,0,2],direction:[0,0,-1]},
    materials:{metal:{metalness:1,roughness:0,baseColor:[0.8,0.7,0.6]}},
    sky:[1,1,1],maxBounces:1,seed:7,
  });
  expect(color[0]).toBeCloseTo(0.8);
  expect(color[1]).toBeCloseTo(0.7);
  expect(color[2]).toBeCloseTo(0.6);
 });
});
