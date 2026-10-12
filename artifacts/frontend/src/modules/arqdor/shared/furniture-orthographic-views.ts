import type {CabinetDraft} from "./parametric-cabinet-core";
export type CabinetView={
 id:string;kind:"front"|"side"|"top";revision:string;
 widthMm:number;heightMm:number;
 dimensions:{label:string;valueMm:number}[];
 lines:{x1:number;y1:number;x2:number;y2:number;style:"solid"|"dashed"}[];
};
const edge=(x1:number,y1:number,x2:number,y2:number)=>({x1,y1,x2,y2,style:"solid" as const});
/** Preliminary orthographic envelope and dimension references, not shop drawings. */
export function buildCabinetTechnicalViews(draft:CabinetDraft,revision:string):CabinetView[]{
 if(!revision.trim())throw Error("Revision required");
 const p=draft.parameters;
 const rect=(w:number,h:number)=>[edge(0,0,w,0),edge(w,0,w,h),edge(w,h,0,h),edge(0,h,0,0)];
 return [
  {id:p.furnitureId+":front",kind:"front",revision,widthMm:p.widthMm,heightMm:p.heightMm,
   dimensions:[{label:"Largura",valueMm:p.widthMm},{label:"Altura",valueMm:p.heightMm}],lines:rect(p.widthMm,p.heightMm)},
  {id:p.furnitureId+":side",kind:"side",revision,widthMm:p.depthMm,heightMm:p.heightMm,
   dimensions:[{label:"Profundidade",valueMm:p.depthMm},{label:"Altura",valueMm:p.heightMm}],lines:rect(p.depthMm,p.heightMm)},
  {id:p.furnitureId+":top",kind:"top",revision,widthMm:p.widthMm,heightMm:p.depthMm,
   dimensions:[{label:"Largura",valueMm:p.widthMm},{label:"Profundidade",valueMm:p.depthMm}],lines:rect(p.widthMm,p.depthMm)}
 ];
}
