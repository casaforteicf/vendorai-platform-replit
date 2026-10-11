import {describe,it,expect} from "vitest";
import {moveFurnitureInRoom,validateFurniturePlacement,type FurnitureBounds} from "./furniture-placement-2d";
const room={id:"r",widthMm:4000,depthMm:3000};
const a:FurnitureBounds={id:"a",roomId:"r",xMm:0,yMm:0,widthMm:1000,depthMm:500,rotationDeg:0};
describe("measured 2D furniture placement",()=>{
 it("allows non-overlapping placement and applies moving immutably",()=>{
  const b={...a,id:"b",xMm:1500};
  const v=validateFurniturePlacement(room,b,[a]);
  expect(v.valid).toBe(true);
  const moved=moveFurnitureInRoom({room,items:[a,b],id:"b",xMm:2000,yMm:1000});
  expect(moved.items[1]).toMatchObject({xMm:2000,yMm:1000});
  expect(b.xMm).toBe(1500);
 });
 it("flags collision and does not move item",()=>{
  const b={...a,id:"b",xMm:1500};
  const moved=moveFurnitureInRoom({room,items:[a,b],id:"b",xMm:500,yMm:0});
  expect(moved.validation).toMatchObject({valid:false,reason:"collision",collidingIds:["a"]});
  expect(moved.items[1].xMm).toBe(1500);
 });
 it("detects rotated bounds and room limits",()=>{
  const b={...a,id:"b",xMm:3500,yMm:0,rotationDeg:90 as const};
  expect(validateFurniturePlacement(room,b,[a]).valid).toBe(true);
  expect(validateFurniturePlacement(room,{...b,xMm:3900},[a]).reason).toBe("out-of-room");
 });
});
