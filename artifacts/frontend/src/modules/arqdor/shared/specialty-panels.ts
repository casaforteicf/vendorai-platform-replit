/** Arqdor 13.51–13.58: specialty fabrication reference, not approved shop drawing. Units: mm. */
export type SpecialtyMaterial={id:string;tenantId:string;family:"natural-stone"|"quartz"|"sintered"|"glass"|"mirror";manufacturer:string;sku:string;thicknessMm:number;sheetWidthMm:number;sheetLengthMm:number;grain:"none"|"length"|"width";};
export type SpecialtyPanel={id:string;tenantId:string;projectId:string;roomId:string;materialId:string;kind:"countertop"|"backsplash"|"glass-panel"|"mirror-panel";outline:{xMm:number;yMm:number}[];openings:{id:string;xMm:number;yMm:number;widthMm:number;heightMm:number}[];edgeTreatment?:string;sourceRevision:string};
export function calculateSpecialtyPanel(p:SpecialtyPanel,m:SpecialtyMaterial){
 if(p.tenantId!==m.tenantId||p.materialId!==m.id||!p.projectId||!p.roomId||!p.sourceRevision)throw Error("Invalid specialty scope");
 const a=p.outline;
 if(a.length<3||a.length>2000||a.some(v=>!Number.isFinite(v.xMm)||!Number.isFinite(v.yMm)))throw Error("Invalid outline");
 let twice=0,perimeter=0;
 for(let i=0;i<a.length;i++){const x=a[i],y=a[(i+1)%a.length];twice+=x.xMm*y.yMm-y.xMm*x.yMm;perimeter+=Math.hypot(x.xMm-y.xMm,x.yMm-y.yMm);}
 const gross=Math.abs(twice)/2;
 if(gross<=0)throw Error("Degenerate outline");
 let openingsArea=0;
 for(const o of p.openings){if(!o.id||![o.xMm,o.yMm,o.widthMm,o.heightMm].every(Number.isFinite)||o.widthMm<=0||o.heightMm<=0)throw Error("Invalid opening");openingsArea+=o.widthMm*o.heightMm;}
 if(openingsArea>=gross)throw Error("Openings exceed outline");
 const xs=a.map(x=>x.xMm),ys=a.map(x=>x.yMm);
 const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
 return {panelId:p.id,materialId:m.id,revision:p.sourceRevision,grossAreaM2:gross/1e6,netAreaM2:(gross-openingsArea)/1e6,perimeterM:perimeter/1000,
  boundingWidthMm:w,boundingHeightMm:h,fitsNominalSheet:(w<=m.sheetWidthMm&&h<=m.sheetLengthMm)||(h<=m.sheetWidthMm&&w<=m.sheetLengthMm),
  status:"requires-specialist-review" as const,
  warnings:["Openings are not spatially validated; verify position, edge distance, grain, slab defects, supports, tolerances, transport and fixing with supplier."]};
}
export function buildSpecialtyRfqDraft(p:SpecialtyPanel,m:SpecialtyMaterial){
 const q=calculateSpecialtyPanel(p,m);
 return {tenantId:p.tenantId,projectId:p.projectId,roomId:p.roomId,sourceRevision:p.sourceRevision,discipline:m.family,manufacturer:m.manufacturer,sku:m.sku,
  panelId:p.id,quantity:1,estimatedNetAreaM2:q.netAreaM2,requiresSiteMeasurement:true,approvalRequired:true,sendStatus:"not-sent" as const};
}
