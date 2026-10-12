import {describe,it,expect} from "vitest";
import {closedRoomPolygon,furnitureInsidePolygon} from "./furniture-room-polygon";
const pts=[[0,0],[4000,0],[4000,2000],[2000,2000],[2000,4000],[0,4000]];
const walls=pts.map((p,i)=>({a:{x:p[0],y:p[1]},b:{x:pts[(i+1)%6][0],y:pts[(i+1)%6][1]}}));
describe("L shaped rooms",()=>{
 it("checks actual footprint, not bounding rectangle",()=>{
  const polygon=closedRoomPolygon(walls)!;
  expect(polygon.length).toBe(6);
  expect(furnitureInsidePolygon({id:"a",roomId:"r",xMm:100,yMm:2500,widthMm:500,depthMm:500,rotationDeg:0},polygon)).toBe(true);
  expect(furnitureInsidePolygon({id:"b",roomId:"r",xMm:3000,yMm:3000,widthMm:500,depthMm:500,rotationDeg:0},polygon)).toBe(false);
 });
 it("rejects missing walls",()=>expect(closedRoomPolygon(walls.slice(1))).toBeNull());
});
