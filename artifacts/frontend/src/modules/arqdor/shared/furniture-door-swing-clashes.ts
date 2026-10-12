import type {FurnitureBounds} from "./furniture-placement-2d";
import {doorSwingFootprint,type InteriorWall,type WallOpening} from "../workspace/design-studio/interior-environment";
function segmentCrossesRect(ax:number,ay:number,bx:number,by:number,l:number,t:number,r:number,b:number){
 let lo=0,hi=1;
 const dx=bx-ax,dy=by-ay;
 for(const [p,q] of [[-dx,ax-l],[dx,r-ax],[-dy,ay-t],[dy,b-ay]]){
  if(p===0){if(q<0)return false;continue;}
  const v=q/p;
  if(p<0)lo=Math.max(lo,v);else hi=Math.min(hi,v);
  if(lo>hi)return false;
 }
 return true;
}
/** Conservative sampled swept-leaf collision; all coordinates room local, millimeters. */
export function furnitureDoorSwingClashes(bounds:FurnitureBounds,walls:readonly InteriorWall[],openings:readonly WallOpening[],leafThicknessMm=40):string[]{
 if(!Number.isFinite(leafThicknessMm)||leafThicknessMm<=0)throw Error("Invalid door leaf thickness");
 const rotated=bounds.rotationDeg===90||bounds.rotationDeg===270;
 const width=rotated?bounds.depthMm:bounds.widthMm,depth=rotated?bounds.widthMm:bounds.depthMm;
 if(![bounds.xMm,bounds.yMm,width,depth].every(Number.isFinite)||width<=0||depth<=0)throw Error("Invalid furniture footprint");
 const margin=leafThicknessMm/2;
 const l=bounds.xMm-margin,t=bounds.yMm-margin,r=bounds.xMm+width+margin,b=bounds.yMm+depth+margin;
 return openings.filter(o=>{
  if(o.kind!=="door")return false;
  const arc=doorSwingFootprint(walls,o,90);
  const wall=walls.find(w=>w.id===o.wallId)!;
  const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1,len=Math.hypot(dx,dy);
  const minX=Math.min(...walls.flatMap(w=>[w.x1,w.x2])),minY=Math.min(...walls.flatMap(w=>[w.y1,w.y2]));
  const hingeDistance=o.offsetM+(o.hinge==="end"?o.widthM:0);
  const hx=(wall.x1+dx/len*hingeDistance-minX)*1000,hy=(wall.y1+dy/len*hingeDistance-minY)*1000;
  return arc.some(p=>segmentCrossesRect(hx,hy,p.x,p.y,l,t,r,b));
 }).map(o=>o.id);
}
