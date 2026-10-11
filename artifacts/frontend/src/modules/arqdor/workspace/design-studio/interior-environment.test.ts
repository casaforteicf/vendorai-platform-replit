import {describe,expect,it} from "vitest";
import {buildRectangularRoom,fromPreProjectRoom} from "./interior-environment";
describe("interior environment entry",()=>{
 it("creates four measured draft walls",()=>{
  const r=buildRectangularRoom({name:"Sala",widthM:5,depthM:4,heightM:2.8,thicknessM:.15,projectId:"p1"});
  expect(r.walls).toHaveLength(4);
  expect(r.walls[0]).toMatchObject({x1:0,y1:0,x2:5,y2:0,heightM:2.8});
  expect(r.projectId).toBe("p1");
  expect(r.persistStatus).toBe("draft-only");
 });
 it("links to existing preproject room without guessing geometry",()=>{
  const r=fromPreProjectRoom("project-1",{id:"room-2",nome:"Cozinha"},"r2");
  expect(r).toMatchObject({source:"preproject",projectId:"project-1",roomId:"room-2",sourceRevision:"r2"});
  expect(r.walls).toEqual([]);
 });
 it("rejects nonphysical dimensions",()=>{
  expect(()=>buildRectangularRoom({name:"Teste",widthM:1,depthM:1,heightM:2.7,thicknessM:.6})).toThrow();
  expect(()=>buildRectangularRoom({name:" ",widthM:4,depthM:3,heightM:2.7,thicknessM:.12})).toThrow();
 });
});
