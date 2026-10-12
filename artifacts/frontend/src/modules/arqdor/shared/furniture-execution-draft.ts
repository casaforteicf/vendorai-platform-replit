import type {FurnitureBusinessHandoff} from "./furniture-business-handoff";

/** Lote 13.19–20: deterministic planning only.
 * Produces no inventory movements, purchase orders, production jobs or installation tasks.
 */
export type FurnitureExecutionSelection={
 partId:string;requestedUnits:number;
};
export type FurnitureExecutionDraft={
 tenantId:string;projectId:string;revision:string;executionBatchId:string;
 pieces:{partId:string;furnitureId:string;materialId:string;requestedUnits:number;totalUnits:number;remainingUnits:number}[];
 materialDemand:{materialId:string;netAreaM2:number;units:number}[];
 status:"pending-engineering-and-approval";
 warnings:string[];
};
export function buildFurnitureExecutionDraft(args:{
 handoff:FurnitureBusinessHandoff;executionBatchId:string;
 selection:readonly FurnitureExecutionSelection[];
 alreadyAllocated?:Readonly<Record<string,number>>;
}):FurnitureExecutionDraft{
 const {handoff,executionBatchId,selection,alreadyAllocated={}}=args;
 if(!executionBatchId.trim()||!handoff.revision.trim())throw Error("Revision and batch ID required");
 if(handoff.validation.status!=="engineering-review-required")throw Error("Unsupported handoff");
 const parts=new Map(handoff.pieces.map(p=>[p.partId,p]));
 if(parts.size!==handoff.pieces.length)throw Error("Duplicate part ID in handoff");
 const seen=new Set<string>();
 const materials=new Map<string,{materialId:string;netAreaM2:number;units:number}>();
 const pieces=selection.map(s=>{
  if(seen.has(s.partId))throw Error("Duplicate selection");
  seen.add(s.partId);
  const part=parts.get(s.partId);
  if(!part)throw Error("Part not in revision");
  if(!Number.isSafeInteger(s.requestedUnits)||s.requestedUnits<=0)throw Error("Invalid requested quantity");
  const allocated=alreadyAllocated[s.partId]??0;
  if(!Number.isSafeInteger(allocated)||allocated<0||s.requestedUnits+allocated>part.quantity)throw Error("Requested quantity exceeds available units");
  const old=materials.get(part.materialId)??{materialId:part.materialId,netAreaM2:0,units:0};
  old.units+=s.requestedUnits;
  old.netAreaM2+=part.widthMm*part.lengthMm*s.requestedUnits/1_000_000;
  materials.set(part.materialId,old);
  return {partId:part.partId,furnitureId:part.furnitureId,materialId:part.materialId,requestedUnits:s.requestedUnits,totalUnits:part.quantity,remainingUnits:part.quantity-allocated-s.requestedUnits};
 });
 if(!pieces.length)throw Error("At least one part is required");
 return {tenantId:handoff.tenantId,projectId:handoff.projectId,revision:handoff.revision,executionBatchId,pieces,
 materialDemand:[...materials.values()],status:"pending-engineering-and-approval",
 warnings:["Preliminary net material demand; validate nesting, waste, stock and replacement authorization.","No purchase order, stock reservation, installation checklist or execution lot has been created."]};
}
