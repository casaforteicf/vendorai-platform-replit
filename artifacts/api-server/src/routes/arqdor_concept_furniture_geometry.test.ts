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
 it("rejects zero-length walls before normalizing openings",()=>{
  expect(()=>conceptRoomFurnitureGeometry(room,[{...wall,x2:wall.x1}],[])).toThrow("Parede sem comprimento");
 });
 it("rejects duplicate openings and openings attached to a different floor",()=>{
  const door={id:"door",floor:0,wallId:"w",type:"door" as const,offset:1,width:.9};
  expect(()=>conceptRoomFurnitureGeometry(room,[wall],[door,door])).toThrow("Abertura incompleta");
  expect(()=>conceptRoomFurnitureGeometry(room,[wall],[{...door,floor:1}])).toThrow("Abertura incompleta");
 });

 it("rejects walls collapsing to zero millimeters and invalid floor indices",()=>{
  expect(()=>conceptRoomFurnitureGeometry(room,[{...wall,x1:5.00001,x2:5.00002,y1:10,y2:10.00001}],[])).toThrow("Parede sem comprimento");
  expect(()=>conceptRoomFurnitureGeometry(room,[{...wall,floor:-1}],[])).toThrow("Pavimento inválido");
 });

});
