import {describe,it,expect} from "vitest";
import {furnitureWallClashes} from "./furniture-wall-clashes";
const walls=[{id:"left",x1:0,y1:0,x2:0,y2:3,thicknessM:.2,heightM:2.7},{id:"top",x1:0,y1:0,x2:4,y2:0,thicknessM:.2,heightM:2.7}];
const cabinet=(xMm:number,yMm:number)=>({id:"cab",roomId:"room",xMm,yMm,widthMm:600,depthMm:600,rotationDeg:0 as const});
describe("wall thickness furniture clearance",()=>{
 it("rejects furniture intersecting wall material",()=>{
  expect(furnitureWallClashes(cabinet(50,300),walls,{x:0,y:0})).toContain("left");
  expect(furnitureWallClashes(cabinet(300,50),walls,{x:0,y:0})).toContain("top");
 });
 it("allows furniture outside wall material",()=>expect(furnitureWallClashes(cabinet(300,300),walls,{x:0,y:0})).toEqual([]));
 it("uses local origin for shifted BIM geometry",()=>{
  const shifted=walls.map(w=>({...w,x1:w.x1+10,x2:w.x2+10,y1:w.y1-5,y2:w.y2-5}));
  expect(furnitureWallClashes(cabinet(50,300),shifted,{x:10000,y:-5000})).toContain("left");
 });
});
