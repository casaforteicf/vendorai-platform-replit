import { describe, expect, it } from "vitest";
import { normalizePhysicalMaterial, sampleDiffuseHemisphere } from "./render-physical-material";
import { traceDiffusePath } from "./render-diffuse-path";
import type { GeometryTransfer } from "./render-geometry-export";
const empty:GeometryTransfer={schemaVersion:1,meshes:[],totalTriangles:0,truncated:false,warnings:[]};
const triangle:GeometryTransfer={schemaVersion:1,truncated:false,warnings:[],totalTriangles:1,
 meshes:[{meshId:"a",materialId:"white",triangles:1,positions:[-2,-2,0,2,-2,0,0,2,0],
 normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1]}]};
const ray={origin:[0,0,2] as const,direction:[0,0,-1] as const};
describe("ARQDOR experimental diffuse transport",()=>{
 it("normalizes material parameters and rejects nonfinite values",()=>{
  const material=normalizePhysicalMaterial({baseColor:[1.2,0.5,-1],roughness:2,metalness:0});
  expect(material.baseColor).toEqual([1,0.5,0]);
  expect(material.roughness).toBe(1);
  expect(()=>normalizePhysicalMaterial({roughness:NaN})).toThrow();
 });
 it("samples hemisphere with a positive pdf and diffuse throughput",()=>{
  const sample=sampleDiffuseHemisphere([0,0,1],0.25,0.5,normalizePhysicalMaterial({baseColor:[0.8,0.7,0.6]}));
  expect(sample.direction[2]).toBeGreaterThan(0);
  expect(sample.pdf).toBeGreaterThan(0);
  expect(sample.throughput).toEqual([0.8,0.7,0.6]);
 });
 it("returns sky when no geometry is hit",()=>{
  expect(traceDiffusePath({geometry:empty,ray,materials:{},sky:[0.2,0.3,0.4]})).toEqual([0.2,0.3,0.4]);
 });
 it("returns emission at first surface for zero bounces",()=>{
  const result=traceDiffusePath({geometry:triangle,ray,materials:{white:{emissive:[0.1,0.2,0.3]}},sky:[1,1,1],maxBounces:0});
  expect(result).toEqual([0.1,0.2,0.3]);
 });
 it("blocks partial geometry and unbounded bounces",()=>{
  expect(()=>traceDiffusePath({geometry:{...triangle,truncated:true},ray,materials:{},sky:[1,1,1]})).toThrow();
  expect(()=>traceDiffusePath({geometry:empty,ray,materials:{},sky:[1,1,1],maxBounces:9})).toThrow();
 });
});
