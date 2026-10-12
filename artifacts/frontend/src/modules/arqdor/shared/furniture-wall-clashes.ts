import type {FurnitureBounds} from "./furniture-placement-2d";
import type {InteriorWall} from "../workspace/design-studio/interior-environment";
export function furnitureWallClashes(bounds:FurnitureBounds,walls:readonly InteriorWall[],originMm:{x:number;y:number}):string[]{
 const rotated=bounds.rotationDeg===90||bounds.rotationDeg===270;
 const width=rotated?bounds.depthMm:bounds.widthMm,depth=rotated?bounds.widthMm:bounds.depthMm;
 if(![bounds.xMm,bounds.yMm,width,depth].every(Number.isFinite)||width<=0||depth<=0)throw Error("Invalid furniture geometry");
 const left=bounds.xMm,right=left+width,top=bounds.yMm,bottom=top+depth;
 return walls.filter(w=>{
  const x1=Math.round(w.x1*1000)-originMm.x,y1=Math.round(w.y1*1000)-originMm.y;
  const x2=Math.round(w.x2*1000)-originMm.x,y2=Math.round(w.y2*1000)-originMm.y;
  const radius=w.thicknessM*500;
  if(![x1,y1,x2,y2,radius].every(Number.isFinite)||radius<=0)throw Error("Invalid wall geometry");
  // Conservative minimum distance: segment to expanded cabinet rectangle.
  const l=left-radius,r=right+radius,t=top-radius,b=bottom+radius;
  if((x1>=l&&x1<=r&&y1>=t&&y1<=b)||(x2>=l&&x2<=r&&y2>=t&&y2<=b))return true;
  const dx=x2-x1,dy=y2-y1;
  let low=0,high=1;
  for(const [p,q] of [[-dx,x1-l],[dx,r-x1],[-dy,y1-t],[dy,b-y1]]){
   if(p===0){if(q<0)return false;continue;}
   const v=q/p;
   if(p<0)low=Math.max(low,v);else high=Math.min(high,v);
   if(low>high)return false;
  }
  return true;
 }).map(w=>w.id);
}
