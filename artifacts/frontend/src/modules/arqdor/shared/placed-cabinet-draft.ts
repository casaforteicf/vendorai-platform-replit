import type {CabinetDraft} from "./parametric-cabinet-core";
import type {FurnitureBounds,RoomBounds} from "./furniture-placement-2d";
import {validateFurniturePlacement} from "./furniture-placement-2d";

/** C03: immutable identity link between a cabinet part set and its footprint.
 * Client-only contract; server authorization/persistence still required.
 */
export type PlacedCabinet={id:string;tenantId:string;projectId:string;roomId:string;parameters:CabinetDraft["parameters"];parts:CabinetDraft["parts"];bounds:FurnitureBounds;status:"local-draft"};
export function insertCabinetDraft(input:{
 tenantId:string;projectId:string;room:RoomBounds;draft:CabinetDraft;
 xMm:number;yMm:number;id:string;existing:readonly PlacedCabinet[];
}):PlacedCabinet[]{
 const {tenantId,projectId,room,draft,xMm,yMm,id,existing}=input;
 if(!tenantId||!projectId||!id||existing.some(p=>p.id===id)||draft.parameters.tenantId!==tenantId||
 draft.parameters.projectId!==projectId||draft.parameters.roomId!==room.id)throw Error("Cabinet scope or identity mismatch");
 if(draft.parts.some(p=>p.tenantId!==tenantId||p.projectId!==projectId||p.furnitureId!==draft.parameters.furnitureId))throw Error("Cabinet parts mismatch");
 const bounds:FurnitureBounds={id,roomId:room.id,xMm,yMm,widthMm:draft.parameters.widthMm,depthMm:draft.parameters.depthMm,rotationDeg:0};
 const check=validateFurniturePlacement(room,bounds,existing.map(p=>p.bounds),20);
 if(!check.valid)throw Error("Cabinet placement rejected: "+check.reason);
 return [...existing,{id,tenantId,projectId,roomId:room.id,parameters:{...draft.parameters,furnitureId:id},
 parts:draft.parts.map(p=>({...p,id:id+":"+p.id,furnitureId:id,edges:{...p.edges}})),bounds,status:"local-draft"}];
}

/** Update only the selected cabinet's footprint, retaining its part identity and materials. */
export function repositionPlacedCabinet(input:{room:RoomBounds;items:readonly PlacedCabinet[];id:string;xMm:number;yMm:number}):PlacedCabinet[]{
 const found=input.items.find(item=>item.id===input.id&&item.roomId===input.room.id);
 if(!found)throw Error("Furniture not found in room");
 const bounds={...found.bounds,xMm:input.xMm,yMm:input.yMm};
 const check=validateFurniturePlacement(input.room,bounds,input.items.filter(item=>item.id!==input.id).map(item=>item.bounds),20);
 if(!check.valid)throw Error("Furniture reposition rejected: "+check.reason);
 return input.items.map(item=>item.id===input.id?{...item,bounds}:item);
}
/** Local draft removal; persisted removal requires an explicit subsequent Save. */
export function removePlacedCabinet(items:readonly PlacedCabinet[],id:string):PlacedCabinet[]{
 if(!items.some(item=>item.id===id))throw Error("Furniture not found");
 return items.filter(item=>item.id!==id);
}
