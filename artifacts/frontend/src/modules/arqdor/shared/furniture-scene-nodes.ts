import type {PlacedCabinet} from "./placed-cabinet-draft";
import {buildCabinet3DBoxes} from "./furniture-preview-3d";
/** Stable meter-based scene contract shared by the schematic and WebGL renderers.
 * These are provisional cabinet volumes, not BIM wall attachments or production solids.
 */
export type FurnitureSceneNode={
 id:string;projectId:string;roomId:string;furnitureId:string;materialId:string;
 positionM:{x:number;y:number;z:number};sizeM:{x:number;y:number;z:number};
 source:"cabinet-draft";
};
export function buildFurnitureSceneNodes(items:readonly PlacedCabinet[]):FurnitureSceneNode[]{
 const boxes=buildCabinet3DBoxes(items);
 return boxes.map((box,index)=>{
  const item=items[index];
  if(!item.projectId||!item.roomId||item.id!==box.id||item.bounds.roomId!==item.roomId)
   throw Error("Furniture scene identity mismatch");
  return {
   id:"furniture:"+item.projectId+":"+item.roomId+":"+box.id,
   projectId:item.projectId,roomId:item.roomId,furnitureId:item.id,materialId:box.materialId,
   positionM:{x:(box.xMm+box.widthMm/2)/1000,y:box.heightMm/2000,z:(box.yMm+box.depthMm/2)/1000},
   sizeM:{x:box.widthMm/1000,y:box.heightMm/1000,z:box.depthMm/1000},
   source:"cabinet-draft" as const
  };
 });
}
