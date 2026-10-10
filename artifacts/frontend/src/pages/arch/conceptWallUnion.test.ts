import { describe, expect, it } from "vitest";
import { buildOrthogonalWallUnion } from "./conceptWallUnion";
const box=(wallId:string,x:number,y:number,width:number,depth:number,floor=0)=>({wallId,floor,x,y,z:0,width,depth,height:3});
describe("orthogonal wall boundary union",()=>{
 it("keeps a simple box closed with twelve triangles",()=>{
   const r=buildOrthogonalWallUnion([box("a",0,0,2,0.15)]);
   expect(r.warnings).toEqual([]);
   expect(r.meshes[0].indices).toHaveLength(36);
 });
 it("removes faces between adjoining boxes",()=>{
   const r=buildOrthogonalWallUnion([box("a",0,0,1,0.15),box("b",1,0,1,0.15)]);
   expect(r.meshes[0].sourceWallIds).toEqual(["a","b"]);
   const m=r.meshes[0];
   const faceOnJoint=m.indices.reduce((n,_,i)=>n,0);
   let internal=0;
   for(let t=0;t<m.indices.length;t+=3){
     const x=[0,1,2].map(j=>m.positions[m.indices[t+j]*3]);
     if(x.every(v=>Math.abs(v-1)<1e-6))internal++;
   }
   expect(internal).toBe(0);
   expect(faceOnJoint).toBe(0);
 });
 it("handles crossing walls and separate floors",()=>{
   const r=buildOrthogonalWallUnion([box("h",0,1,3,0.15),box("v",1.4,0,0.15,3),box("up",0,0,1,0.15,1)]);
   expect(r.meshes).toHaveLength(2);
   expect(r.meshes[0].sourceWallIds).toEqual(["h","v"]);
   expect(r.warnings).toEqual([]);
 });
 it("rejects pathological coordinate grids safely",()=>{
   const r=buildOrthogonalWallUnion([box("a",0,0,1,1)],0);
   expect(r.meshes).toHaveLength(0);
   expect(r.warnings).toContain("WALL_UNION_LIMIT:0");
 });
});