import type {FurnitureBounds} from "./furniture-placement-2d";
export type InteriorObstacle={id:string;kind:"pillar"|"shaft"|"fixed-installation"|"opening-clearance";xMm:number;yMm:number;widthMm:number;depthMm:number;heightMm?:number};
/** Conservative AABB clash detection; coordinates are environment-relative millimeters. */
export function findFurnitureObstacleClashes(bounds:FurnitureBounds,obstacles:readonly InteriorObstacle[]):string[]{
 const rotated=bounds.rotationDeg===90||bounds.rotationDeg===270;
 const w=rotated?bounds.depthMm:bounds.widthMm,d=rotated?bounds.widthMm:bounds.depthMm;
 if(![bounds.xMm,bounds.yMm,w,d].every(Number.isFinite)||w<=0||d<=0)throw Error("Invalid furniture bounds");
 return obstacles.filter(o=>{
  if(!o.id||![o.xMm,o.yMm,o.widthMm,o.depthMm].every(Number.isFinite)||o.widthMm<=0||o.depthMm<=0)throw Error("Invalid obstacle");
  return bounds.xMm<o.xMm+o.widthMm&&bounds.xMm+w>o.xMm&&bounds.yMm<o.yMm+o.depthMm&&bounds.yMm+d>o.yMm;
 }).map(o=>o.id);
}
