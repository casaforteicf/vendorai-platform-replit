import type {PlacedCabinet} from "./placed-cabinet-draft";
import {validateFurniturePlacement,type RoomBounds} from "./furniture-placement-2d";

/** C04 contract for future authenticated project storage.
 * Serialization itself does not persist or authorize access.
 */
export type FurnitureProjectSnapshot={schemaVersion:1;tenantId:string;projectId:string;roomId:string;revision:string;createdAt:string;furniture:PlacedCabinet[]};
export function createFurnitureSnapshot(input:{
 tenantId:string;projectId:string;room:RoomBounds;revision:string;createdAt:string;furniture:readonly PlacedCabinet[];
}):FurnitureProjectSnapshot{
 const {tenantId,projectId,room,revision,createdAt,furniture}=input;
 if(!tenantId||!projectId||!room.id||!revision||!Number.isFinite(Date.parse(createdAt))||furniture.length>2000)throw Error("Invalid snapshot metadata");
 const ids=new Set<string>(),parts=new Set<string>();
 const previous:PlacedCabinet[]=[];
 for(const item of furniture){
  if(ids.has(item.id)||item.tenantId!==tenantId||item.projectId!==projectId||item.roomId!==room.id||item.bounds.id!==item.id||
   item.parameters.furnitureId!==item.id||item.parameters.tenantId!==tenantId||item.parameters.projectId!==projectId||item.parameters.roomId!==room.id||
   item.bounds.roomId!==room.id||item.parameters.widthMm!==item.bounds.widthMm||item.parameters.depthMm!==item.bounds.depthMm||
   item.parts.some(p=>p.furnitureId!==item.id||p.tenantId!==tenantId||p.projectId!==projectId))throw Error("Invalid furniture snapshot scope");
  if(!validateFurniturePlacement(room,item.bounds,previous.map(p=>p.bounds),20).valid)throw Error("Invalid furniture placement");
  ids.add(item.id);
  for(const p of item.parts){if(parts.has(p.id))throw Error("Duplicate part identity");parts.add(p.id);}
  previous.push(item);
 }
 return {schemaVersion:1,tenantId,projectId,roomId:room.id,revision,createdAt,
 furniture:furniture.map(item=>({...item,parameters:{...item.parameters},
 bounds:{...item.bounds},parts:item.parts.map(p=>({...p,edges:{...p.edges}}))}))};
}
export function restoreFurnitureSnapshot(snapshot:FurnitureProjectSnapshot,context:{tenantId:string;projectId:string;room:RoomBounds}):FurnitureProjectSnapshot{
 if(snapshot.schemaVersion!==1||snapshot.tenantId!==context.tenantId||snapshot.projectId!==context.projectId||snapshot.roomId!==context.room.id)throw Error("Snapshot scope mismatch");
 return createFurnitureSnapshot({...snapshot,room:context.room});
}
