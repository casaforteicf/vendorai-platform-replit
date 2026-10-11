import {describe,it,expect} from "vitest";
import {findFurnitureObstacleClashes} from "./furniture-obstacle-clashes";
const base={id:"cab",roomId:"room",xMm:100,yMm:200,widthMm:1200,depthMm:600,rotationDeg:0 as const};
describe("Architectural obstacle clash checks",()=>{
 it("reports intersecting fixed features and ignores separate ones",()=>{
  const obstacles=[{id:"pillar",kind:"pillar" as const,xMm:500,yMm:500,widthMm:250,depthMm:250},{id:"shaft",kind:"shaft" as const,xMm:3000,yMm:3000,widthMm:200,depthMm:200}];
  expect(findFurnitureObstacleClashes(base,obstacles)).toEqual(["pillar"]);
 });
 it("uses rotated footprint axes",()=>{
  const obstacle={id:"installation",kind:"fixed-installation" as const,xMm:300,yMm:1000,widthMm:100,depthMm:100};
  expect(findFurnitureObstacleClashes(base,[obstacle])).toEqual([]);
  expect(findFurnitureObstacleClashes({...base,rotationDeg:90},[obstacle])).toEqual(["installation"]);
 });
});
