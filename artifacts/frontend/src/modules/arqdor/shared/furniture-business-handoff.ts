import type {PanelPart,PanelMaterial} from "./furniture-engineering-core";

/** Lote 13.11–13.20: structured, revision-bound business handoff.
 * No inventory reservation, CRM write, invoice or machine program is issued by this module.
 */
export type FurnitureBusinessHandoff={
 tenantId:string;projectId:string;revision:string;
 context:{leadId?:string;dealId?:string;proposalId?:string;executionLotId?:string};
 lines:{materialId:string;manufacturer:string;sku:string;thicknessMm:number;partCount:number;netAreaM2:number}[];
 pieces:{partId:string;furnitureId:string;quantity:number;materialId:string;widthMm:number;lengthMm:number}[];
 validation:{status:"engineering-review-required";warnings:string[]};
};
export function buildFurnitureBusinessHandoff(args:{
 tenantId:string;projectId:string;revision:string;parts:readonly PanelPart[];materials:readonly PanelMaterial[];
 context?:FurnitureBusinessHandoff["context"];
}):FurnitureBusinessHandoff{
 const {tenantId,projectId,revision,parts,materials}=args;
 if(!tenantId.trim()||!projectId.trim()||!revision.trim())throw Error("Scope and revision required");
 const catalog=new Map(materials.map(m=>[m.id,m]));
 if(catalog.size!==materials.length)throw Error("Duplicate material IDs");
 const quantities=new Map<string,{materialId:string;manufacturer:string;sku:string;thicknessMm:number;partCount:number;netAreaM2:number}>();
 const ids=new Set<string>();
 const pieces=parts.map(p=>{
  if(ids.has(p.id))throw Error("Duplicate part ID");
  ids.add(p.id);
  if(p.tenantId!==tenantId||p.projectId!==projectId)throw Error("Part outside tenant or project");
  if(!p.furnitureId?.trim()||!p.id?.trim()||!Number.isSafeInteger(p.quantity)||p.quantity<=0||
   !Number.isFinite(p.widthMm)||p.widthMm<=0||!Number.isFinite(p.lengthMm)||p.lengthMm<=0)throw Error("Invalid part");
  const material=catalog.get(p.materialId);
  if(!material||material.tenantId!==tenantId)throw Error("Missing or cross-tenant material");
  const old=quantities.get(material.id)??{materialId:material.id,manufacturer:material.manufacturer,sku:material.sku,thicknessMm:material.thicknessMm,partCount:0,netAreaM2:0};
  old.partCount+=p.quantity;old.netAreaM2+=p.widthMm*p.lengthMm*p.quantity/1_000_000;
  quantities.set(material.id,old);
  return {partId:p.id,furnitureId:p.furnitureId,quantity:p.quantity,materialId:p.materialId,widthMm:p.widthMm,lengthMm:p.lengthMm};
 });
 return {tenantId,projectId,revision,context:{...args.context},lines:[...quantities.values()].sort((a,b)=>a.materialId.localeCompare(b.materialId)),
  pieces,validation:{status:"engineering-review-required",warnings:["Areas are net only; waste, kerf, edge banding, labor, freight, taxes, pricing and stock not calculated.","Do not dispatch purchase orders, CNC output or execution lots without validated engineering and approval."]}};
}
const csv=(value:unknown)=>{
 const text=String(value??"");
 const safe=/^\s*[=+@\-]|^[\t\r\n]/.test(text)?"'"+text:text;
 return '"'+safe.replace(/"/g,'""')+'"';
};
/** Explicit preview export, not an XLSX/PDF or production-ready cutting document. */
export function exportFurnitureBomCsv(handoff:FurnitureBusinessHandoff):string{
 const rows=[["revision","materialId","manufacturer","sku","thicknessMm","partCount","netAreaM2"],
  ...handoff.lines.map(l=>[handoff.revision,l.materialId,l.manufacturer,l.sku,l.thicknessMm,l.partCount,l.netAreaM2.toFixed(4)])];
 return rows.map(r=>r.map(csv).join(",")).join("\r\n");
}
