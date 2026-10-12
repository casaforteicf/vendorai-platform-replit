import type {PanelPart} from "./furniture-engineering-core";

/** Lote 13.06/07/09: deterministic rectangular cabinet core.
 * Measurements in mm. Draft parts only; engineering sign-off and hardware rules pending.
 */
export type CabinetParameters={
 tenantId:string;projectId:string;roomId:string;furnitureId:string;
 widthMm:number;heightMm:number;depthMm:number;panelThicknessMm:number;
 shelfCount:number;doorCount:number;materialId:string;backThicknessMm:number;backMaterialId:string;
};
export type CabinetDraft={parameters:CabinetParameters;parts:PanelPart[];warnings:string[];productionReady:false};
const finitePositive=(n:number)=>Number.isFinite(n)&&n>0;
function part(p:CabinetParameters,id:string,name:string,widthMm:number,lengthMm:number,materialId=p.materialId,quantity=1):PanelPart{
 if(!finitePositive(widthMm)||!finitePositive(lengthMm))throw Error("Nonphysical cabinet part "+id);
 return {id:p.furnitureId+":"+id,tenantId:p.tenantId,projectId:p.projectId,
 furnitureId:p.furnitureId,parentItemId:p.roomId,name,quantity,widthMm,lengthMm,
 materialId,grainDirection:"along-length",edges:{}};
}
export function generateCabinetDraft(p:CabinetParameters):CabinetDraft{
 for(const k of ["tenantId","projectId","roomId","furnitureId","materialId","backMaterialId"] as const)
  if(!p[k]?.trim())throw Error("Missing "+k);
 for(const k of ["widthMm","heightMm","depthMm","panelThicknessMm","backThicknessMm"] as const)
  if(!finitePositive(p[k]))throw Error("Invalid "+k);
 if(!Number.isSafeInteger(p.shelfCount)||p.shelfCount<0||p.shelfCount>50)throw Error("Invalid shelf count");
 if(!Number.isSafeInteger(p.doorCount)||p.doorCount<0||p.doorCount>12)throw Error("Invalid door count");
 if(p.widthMm<=2*p.panelThicknessMm||p.heightMm<=2*p.panelThicknessMm||
    p.depthMm<=p.backThicknessMm+40||p.panelThicknessMm>=100)throw Error("Cabinet dimensions cannot hold panels");
 const internalWidth=p.widthMm-2*p.panelThicknessMm;
 const usableDepth=p.depthMm-p.backThicknessMm;
 const parts=[
  part(p,"side-l","Lateral esquerda",usableDepth,p.heightMm),
  part(p,"side-r","Lateral direita",usableDepth,p.heightMm),
  part(p,"base","Base",usableDepth,internalWidth),
  part(p,"top","Tampo",usableDepth,internalWidth),
  part(p,"back","Fundo",p.widthMm,p.heightMm,p.backMaterialId),
 ];
 if(p.shelfCount)parts.push(part(p,"shelf","Prateleira",usableDepth,internalWidth,p.materialId,p.shelfCount));
 if(p.doorCount){
  const doorWidth=(p.widthMm-(p.doorCount+1)*2)/p.doorCount;
  if(doorWidth<=0)throw Error("Invalid door gap");
  parts.push(part(p,"door","Porta",doorWidth,p.heightMm-4,p.materialId,p.doorCount));
 }
 return {parameters:{...p},parts,warnings:[
  "Draft only: back panel mounting, joinery, doors, hardware, clearances, grain and cutting rules require technical validation",
  "Shelves have no drilling or fixation operations assigned"
 ],productionReady:false};
}
