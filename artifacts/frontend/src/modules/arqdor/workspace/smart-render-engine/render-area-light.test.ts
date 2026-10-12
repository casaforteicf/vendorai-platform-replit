import {describe,expect,it} from "vitest";
import {sampleRectAreaLight} from "./render-area-light";
const light={center:[0,0,2] as const,axisU:[1,0,0] as const,axisV:[0,-1,0] as const,color:[1,1,1] as const,radiance:5};
const base={light,point:[0,0,0] as const,normal:[0,0,1] as const,albedo:[1,1,1] as const,u:0.5,v:0.5};
describe("ARQDOR rectangular area light",()=>{
 it("illuminates visible surface with finite energy",()=>{
   const c=sampleRectAreaLight({...base,bvh:{intersect:()=>null}});
   expect(c[0]).toBeGreaterThan(0);expect(c.every(Number.isFinite)).toBe(true);
 });
 it("returns zero for shadow blocker before the emitter",()=>{
   expect(sampleRectAreaLight({...base,bvh:{intersect:()=>({distance:1})}})).toEqual([0,0,0]);
 });
 it("does not treat the emitter surface as an occluder",()=>{
   const c=sampleRectAreaLight({...base,bvh:{intersect:()=>({distance:2})}});
   expect(c[0]).toBeGreaterThan(0);
 });
 it("rejects degenerate emitter and invalid samples",()=>{
   expect(()=>sampleRectAreaLight({...base,light:{...light,axisV:[2,0,0]},bvh:{intersect:()=>null}})).toThrow();
   expect(()=>sampleRectAreaLight({...base,u:NaN,bvh:{intersect:()=>null}})).toThrow();
 });
});
