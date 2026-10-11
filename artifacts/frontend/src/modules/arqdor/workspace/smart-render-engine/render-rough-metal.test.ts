import {describe,expect,it} from "vitest";
import {normalizePhysicalMaterial,sampleRoughMetalReflection} from "./render-physical-material";
describe("ARQDOR rough metal reflection",()=>{
 const metal=normalizePhysicalMaterial({metalness:1,roughness:0.5,baseColor:[0.8,0.7,0.6]});
 it("produces finite direction, pdf and throughput",()=>{
  const s=sampleRoughMetalReflection([0,0,-1],[0,0,1],metal,0.15,0.1);
  expect(s.direction.every(Number.isFinite)).toBe(true);
  expect(Number.isFinite(s.pdf)).toBe(true);
  expect(s.pdf).toBeGreaterThanOrEqual(0);
  expect(s.throughput.every(Number.isFinite)).toBe(true);
 });
 it("rejects invalid samples and back-facing incidence",()=>{
  expect(()=>sampleRoughMetalReflection([0,0,-1],[0,0,1],metal,NaN,0.5)).toThrow();
  expect(()=>sampleRoughMetalReflection([0,0,1],[0,0,1],metal,0.5,0.5)).toThrow();
 });
});
