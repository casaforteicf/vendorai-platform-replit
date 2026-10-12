import {describe,it,expect} from "vitest";
import {furnitureDoorSwingClashes} from "./furniture-door-swing-clashes";
const walls=[{id:"top",x1:0,y1:0,x2:4,y2:0,thicknessM:.14,heightM:2.7}];
const opening={id:"door",wallId:"top",kind:"door" as const,offsetM:1,widthM:.9,clearanceM:.9,hinge:"start" as const,swing:"left" as const};
const furniture=(xMm:number,yMm:number)=>({id:"cab",roomId:"room",xMm,yMm,widthMm:400,depthMm:400,rotationDeg:0 as const});
describe("door sweep clash detection",()=>{
 it("detects cabinet under an opening door leaf",()=>{
  expect(furnitureDoorSwingClashes(furniture(1100,400),walls,[opening])).toContain("door");
 });
 it("does not block furniture beyond swing radius",()=>{
  expect(furnitureDoorSwingClashes(furniture(2700,1500),walls,[opening])).toEqual([]);
 });
 it("ignores fixed window openings when evaluating door sweep",()=>{
  expect(furnitureDoorSwingClashes(furniture(1100,400),walls,[{...opening,kind:"window"}])).toEqual([]);
 });
});
