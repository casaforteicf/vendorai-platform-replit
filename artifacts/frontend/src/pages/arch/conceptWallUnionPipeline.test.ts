import { describe, expect, it } from "vitest";
import { buildWallUnionPipeline } from "./conceptWallMeshPipeline";

const wall=(id:string,x1:number,y1:number,x2:number,y2:number)=>({
 id,floor:0,x1,y1,x2,y2,thickness:0.15,height:2.8,
});
describe("Arqdor wall union pipeline safeguards",()=>{
 it("preserves an opening void and contributing wall IDs",()=>{
  const result=buildWallUnionPipeline(
   [wall("main",0,0,4,0),wall("tee",2,0,2,2)],
   [{id:"door",wallId:"main",floor:0,offset:0.2,width:0.8,height:2.1}],
  );
  expect(result.warnings).toEqual([]);
  expect(result.meshes).toHaveLength(1);
  expect(result.meshes[0].sourceWallIds).toEqual(["main","tee"]);
  expect(result.meshes[0].triangleWallIds.length).toBe(result.meshes[0].indices.length/3);
 });
 it("rejects orphan openings without returning deceptively complete union geometry",()=>{
  const result=buildWallUnionPipeline([wall("main",0,0,4,0)],
   [{id:"orphan",wallId:"missing",floor:0,offset:0.5,width:1,height:2}],
  );
  expect(result.meshes).toEqual([]);
  expect(result.warnings).toContain("OPENING_ORPHAN:orphan");
 });
});
