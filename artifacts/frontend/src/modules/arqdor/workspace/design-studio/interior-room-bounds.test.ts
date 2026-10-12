import {describe,it,expect} from "vitest";
import {buildRectangularRoom,rectangularFurnitureRoomBounds,fromPreProjectRoom,wallOpeningClearances} from "./interior-environment";
describe("verified BIM room footprint for cabinet placement",()=>{
 it("accepts a genuine four-wall rectangular environment",()=>{
  const room=buildRectangularRoom({name:"Sala",widthM:4,depthM:3,heightM:2.7,thicknessM:.14});
  expect(rectangularFurnitureRoomBounds(room)).toEqual({id:room.roomId,widthMm:4000,depthMm:3000});
 });
 it("rejects rooms with missing, diagonal or shifted walls",()=>{
  const room=buildRectangularRoom({name:"Sala",widthM:4,depthM:3,heightM:2.7,thicknessM:.14});
  expect(rectangularFurnitureRoomBounds({...room,walls:room.walls.slice(0,3)})).toBeNull();
  expect(rectangularFurnitureRoomBounds({...room,walls:room.walls.map(w=>({...w,x1:w.x1+1,x2:w.x2+1}))})).toBeNull();
  expect(rectangularFurnitureRoomBounds({...room,walls:[{...room.walls[0],x2:3},...room.walls.slice(1)]})).toBeNull();
 });
 it("carries an explicit door clearance into furniture obstacles",()=>{
  const env=fromPreProjectRoom("p",{id:"room",widthM:4,depthM:3,heightM:2.7,openingClearances:[{id:"door-1",xMm:0,yMm:500,widthMm:900,depthMm:900}]});
  expect(env.obstacles).toEqual([{id:"door-1",kind:"opening-clearance",xMm:0,yMm:500,widthMm:900,depthMm:900}]);
 });
 it("rejects invalid architectural opening clearances",()=>{
  expect(()=>fromPreProjectRoom("p",{id:"room",widthM:4,depthM:3,heightM:2.7,openingClearances:[{id:"door-1",xMm:0,yMm:0,widthMm:-1,depthMm:900}]})).toThrow();
 });
 it("derives a door clearance from an identified wall",()=>{
  const env=fromPreProjectRoom("project",{id:"room",widthM:4,depthM:3,heightM:2.7,wallOpenings:[{id:"door",wallId:"preview-wall-1",offsetM:1,widthM:.9,clearanceM:.9}]});
  expect(env.obstacles?.find(o=>o.id==="door")).toMatchObject({kind:"opening-clearance",xMm:1000,widthMm:900});
 });
 it("rejects openings whose offsets exceed the wall length",()=>{
  expect(()=>fromPreProjectRoom("project",{id:"room",widthM:4,depthM:3,heightM:2.7,wallOpenings:[{id:"door",wallId:"preview-wall-1",offsetM:3.8,widthM:.9,clearanceM:.9}]})).toThrow();
 });
 it("distinguishes left and right door swing envelopes",()=>{
  const room=buildRectangularRoom({name:"Sala",widthM:4,depthM:3,heightM:2.7,thicknessM:.14});
  const base={id:"door",wallId:"wall-1",offsetM:1,widthM:.9,clearanceM:.9,kind:"door" as const,hinge:"start" as const};
  const left=wallOpeningClearances(room.walls,[{...base,swing:"left"}])[0];
  const right=wallOpeningClearances(room.walls,[{...base,swing:"right"}])[0];
  expect(left.yMm).toBeGreaterThan(right.yMm);
  expect(left.depthMm).toBe(right.depthMm);
 });
 it("requires explicit door swing metadata",()=>{
  const room=buildRectangularRoom({name:"Sala",widthM:4,depthM:3,heightM:2.7,thicknessM:.14});
  expect(()=>wallOpeningClearances(room.walls,[{id:"door",wallId:"wall-1",offsetM:1,widthM:.9,clearanceM:.9,kind:"door"}])).toThrow();
 });
});
