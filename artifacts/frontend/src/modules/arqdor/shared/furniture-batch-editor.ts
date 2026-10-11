import type {PanelPart,EdgeSpec} from "./furniture-engineering-core";
/** Lote 13.31-13.33: immutable selected-piece editing and reversible batch transactions. */
export type PartPatch={materialId?:string;edges?:Partial<Record<"top"|"bottom"|"left"|"right",EdgeSpec|null>>};
export type BatchEditResult={parts:PanelPart[];before:PanelPart[];changedIds:string[]};
export function editSelectedFurnitureParts(args:{
 tenantId:string;projectId:string;parts:readonly PanelPart[];selectedIds:readonly string[];patch:PartPatch;
}):BatchEditResult{
 const {tenantId,projectId,parts,selectedIds,patch}=args;
 if(!tenantId.trim()||!projectId.trim()||!selectedIds.length)throw Error("Missing scope or selection");
 if(patch.materialId!==undefined&&!patch.materialId.trim())throw Error("Invalid material");
 if(!("materialId" in patch)&&!("edges" in patch))throw Error("Empty patch");
 const ids=new Set(selectedIds),known=new Set(parts.map(p=>p.id));
 if(known.size!==parts.length||ids.size!==selectedIds.length||[...ids].some(id=>!known.has(id)))throw Error("Invalid or duplicate selected IDs");
 if(parts.some(p=>p.tenantId!==tenantId||p.projectId!==projectId))throw Error("Cross-scope parts");
 const before=parts.filter(p=>ids.has(p.id)).map(p=>({...p,edges:{...p.edges}}));
 const next=parts.map(p=>{
  if(!ids.has(p.id))return p;
  const edges={...p.edges};
  for(const [side,value] of Object.entries(patch.edges??{})){
   if(!["top","bottom","left","right"].includes(side))throw Error("Unknown edge");
   if(value===null)delete edges[side as keyof typeof edges];
   else if(value){if(!value.materialId||!Number.isFinite(value.thicknessMm)||value.thicknessMm<=0)throw Error("Invalid edge band");edges[side as keyof typeof edges]=value;}
  }
  return {...p,materialId:patch.materialId??p.materialId,edges};
 });
 return {parts:next,before,changedIds:[...ids]};
}
export function undoFurniturePartEdit(parts:readonly PanelPart[],change:BatchEditResult):PanelPart[]{
 const original=new Map(change.before.map(p=>[p.id,p]));
 return parts.map(p=>original.get(p.id)??p);
}
