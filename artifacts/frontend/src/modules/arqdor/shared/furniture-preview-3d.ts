import type {PlacedCabinet} from "./placed-cabinet-draft";
/** Axonometric cabinet previews sharing the exact saved footprint and height. Millimeters. */
export type Cabinet3DBox={id:string;xMm:number;yMm:number;zMm:number;widthMm:number;depthMm:number;heightMm:number;materialId:string};
export function buildCabinet3DBoxes(items:readonly PlacedCabinet[]):Cabinet3DBox[]{
 return items.map(item=>{
  const b=item.bounds,p=item.parameters;
  if(![b.xMm,b.yMm,b.widthMm,b.depthMm,p.heightMm].every(Number.isFinite)||p.heightMm<=0||b.widthMm<=0||b.depthMm<=0||
     b.widthMm!==p.widthMm||b.depthMm!==p.depthMm)throw Error("Invalid 3D cabinet dimensions");
  return {id:item.id,xMm:b.xMm,yMm:b.yMm,zMm:0,widthMm:b.widthMm,depthMm:b.depthMm,heightMm:p.heightMm,materialId:p.materialId};
 });
}
export function projectAxonometric(x:number,y:number,z:number){
 return {x:(x-y)*0.866025403784,y:(x+y)*0.5-z};
}
