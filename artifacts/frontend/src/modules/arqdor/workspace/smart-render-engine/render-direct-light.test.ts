import {describe,expect,it} from "vitest";
import {evaluateDirectionalLight} from "./render-direct-light";
const args={point:[0,0,0] as const,normal:[0,0,1] as const,albedo:[1,1,1] as const,light:{directionToLight:[0,0,1] as const,color:[1,1,1] as const,intensity:Math.PI}};
describe("ARQDOR direct directional light",()=>{
 it("lights an unobstructed diffuse surface",()=>{
  const result=evaluateDirectionalLight({...args,bvh:{intersect:()=>null}});
  expect(result[0]).toBeCloseTo(1);
 });
 it("casts hard shadows for blocked rays",()=>{
  const result=evaluateDirectionalLight({...args,bvh:{intersect:()=>({})}});
  expect(result).toEqual([0,0,0]);
 });
 it("rejects negative lighting intensity",()=>{
  expect(()=>evaluateDirectionalLight({...args,light:{...args.light,intensity:-1},bvh:{intersect:()=>null}})).toThrow();
 });
});
