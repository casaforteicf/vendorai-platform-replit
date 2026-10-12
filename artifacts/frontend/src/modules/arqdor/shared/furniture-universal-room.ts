/** Lote 13.41, 13.45-13.50: universal room composition reference model.
 * This is not a manufacturing or RFQ submission system.
 */
export type Specialty="cabinetry"|"metalwork"|"upholstery"|"stone"|"glass"|"decor"|"appliance";
export type ComponentKind="panel"|"linear"|"solid"|"purchased"|"hybrid";
export type RoomObject={id:string;tenantId:string;projectId:string;roomId:string;specialty:Specialty;kind:ComponentKind;
 label:string;xMm:number;yMm:number;widthMm:number;depthMm:number;rotationDeg:number;
 manufacturer?:string;sku?:string;catalogId?:string;sourceRevision?:string;
 manufacturingMode:"custom"|"purchased"|"mixed"};
const physical=(o:RoomObject)=>[o.xMm,o.yMm,o.widthMm,o.depthMm,o.rotationDeg].every(Number.isFinite)&&o.widthMm>0&&o.depthMm>0;
export function validateRoomObjects(items:readonly RoomObject[],tenantId:string,projectId:string,roomId:string){
 if(!tenantId||!projectId||!roomId)throw Error("Missing context");
 const ids=new Set<string>();
 for(const o of items){
  if(!o.id||ids.has(o.id)||o.tenantId!==tenantId||o.projectId!==projectId||o.roomId!==roomId||!physical(o))throw Error("Invalid or cross-scope room object");
  if(o.manufacturingMode==="purchased"&&(!o.manufacturer?.trim()||!o.sku?.trim()))throw Error("Purchased item requires commercial identity");
  ids.add(o.id);
 }
 return {objectCount:items.length,specialties:[...new Set(items.map(x=>x.specialty))],
 purchasedCount:items.filter(x=>x.manufacturingMode==="purchased").length,
 status:"design-reference" as const};
}
export function duplicateRoomObject(items:readonly RoomObject[],id:string,newId:string,deltaXmm:number,deltaYmm:number):RoomObject[]{
 if(!newId||items.some(i=>i.id===newId)||!Number.isFinite(deltaXmm)||!Number.isFinite(deltaYmm))throw Error("Invalid duplicate");
 const source=items.find(i=>i.id===id);
 if(!source)throw Error("Object not found");
 return [...items,{...source,id:newId,xMm:source.xMm+deltaXmm,yMm:source.yMm+deltaYmm}];
}
export function mirrorRoomObject(items:readonly RoomObject[],id:string,axisXmm:number):RoomObject[]{
 if(!Number.isFinite(axisXmm))throw Error("Invalid mirror axis");
 return items.map(o=>o.id===id?{...o,xMm:2*axisXmm-o.xMm-o.widthMm,rotationDeg:((360-o.rotationDeg)%360+360)%360}:o);
}
export type QuoteReference={tenantId:string;projectId:string;roomId:string;revision:string;items:{objectId:string;specialty:Specialty;manufacturer?:string;sku?:string;requestedQuantity:1}[];status:"draft-needs-approval"};
export function prepareRoomQuoteReference(items:readonly RoomObject[],tenantId:string,projectId:string,roomId:string,revision:string):QuoteReference{
 validateRoomObjects(items,tenantId,projectId,roomId);
 if(!revision.trim())throw Error("Revision required");
 return {tenantId,projectId,roomId,revision,items:items.map(o=>({objectId:o.id,specialty:o.specialty,manufacturer:o.manufacturer,sku:o.sku,requestedQuantity:1})),status:"draft-needs-approval"};
}
