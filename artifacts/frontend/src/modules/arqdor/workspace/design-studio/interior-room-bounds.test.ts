import {describe,it,expect} from "vitest";
import {buildRectangularRoom,rectangularFurnitureRoomBounds} from "./interior-environment";
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
});
