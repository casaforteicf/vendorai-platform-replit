import {describe,it,expect} from "vitest";
import {conceptRoomFurnitureGeometry} from "./arqdor_concept_furniture_geometry.js";
const room={id:"r",x:5,y:10,width:4,depth:3};
const wall={id:"w",floor:0,x1:5,y1:10,x2:9,y2:10,thickness:.15};
describe("Concept furniture geometry publisher",()=>{
 it("preserves room-local footprint and wall thickness",()=>{
  const g=conceptRoomFurnitureGeometry(room,[wall],[]);
  expect(g.outline[2]).toEqual({xMm:4000,yMm:3000});
  expect(g.exclusions).toContainEqual({id:"wall:w",xMm:0,yMm:0,widthMm:4000,depthMm:75});
 });
 it("reserves clearance on both sides of a hinged doorway",()=>{
  const g=conceptRoomFurnitureGeometry(room,[wall],[{id:"d",floor:0,wallId:"w",type:"door",offset:1,width:.9}]);
  expect(g.exclusions.find(x=>x.id==="opening:d")).toMatchObject({xMm:100,yMm:0,widthMm:2700,depthMm:900});
 });
 it("rejects missing wall references or incomplete openings",()=>{
  expect(()=>conceptRoomFurnitureGeometry(room,[],[{id:"d",floor:0,wallId:"missing",type:"door",offset:1,width:.9}])).toThrow();
 });
 it("rejects diagonal walls rather than guessing their clearance",()=>{
  expect(()=>conceptRoomFurnitureGeometry(room,[{...wall,y2:12}],[])).toThrow();
 });
});
