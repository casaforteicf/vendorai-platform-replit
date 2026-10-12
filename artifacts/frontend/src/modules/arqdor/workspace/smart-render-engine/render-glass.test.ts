import { describe, expect, it } from "vitest";
import { sampleDielectric } from "./render-glass";
import { normalizePhysicalMaterial } from "./render-physical-material";
describe("ARQDOR ideal dielectric",()=>{
 it("transmits at normal incidence when sample exceeds Fresnel",()=>{
  const e=sampleDielectric([0,0,-1],[0,0,1],1.5,0.5);
  expect(e.reflected).toBe(false);
  expect(e.direction[2]).toBeCloseTo(-1);
  expect(e.fresnel).toBeCloseTo(0.04);
 });
 it("reflects when selected by Fresnel",()=>{
  const e=sampleDielectric([0,0,-1],[0,0,1],1.5,0);
  expect(e.reflected).toBe(true);
  expect(e.direction[2]).toBeCloseTo(1);
 });
 it("produces total internal reflection when exiting at grazing angle",()=>{
  const e=sampleDielectric([0.9,0,Math.sqrt(1-0.9*0.9)],[0,0,1],1.5,0.8);
  expect(e.totalInternalReflection).toBe(true);
  expect(e.reflected).toBe(true);
 });
 it("validates optical material parameters",()=>{
  expect(normalizePhysicalMaterial({transmission:1,ior:1.52}).ior).toBeCloseTo(1.52);
  expect(()=>sampleDielectric([0,0,-1],[0,0,1],0.9,0.5)).toThrow();
 });
});
