/** ARQDOR LOTE 13.62–13.66: finishing and parametric decorative assemblies.
 * Dimensional units mm. Reference design only; supplier validation required.
 */
export type FaceFinish={faceId:string;visualMaterialId:string;physicalLayerIds:string[];uv:{scaleU:number;scaleV:number;rotationDeg:number}};
export function applyFaceFinish(current:readonly FaceFinish[],faceId:string,finish:Omit<FaceFinish,"faceId">):FaceFinish[]{
 if(!faceId.trim()||!finish.visualMaterialId.trim()||![finish.uv.scaleU,finish.uv.scaleV,finish.uv.rotationDeg].every(Number.isFinite)||finish.uv.scaleU<=0||finish.uv.scaleV<=0)throw Error("Invalid face finish");
 const updated={faceId,...finish,physicalLayerIds:[...finish.physicalLayerIds],uv:{...finish.uv}};
 return current.some(f=>f.faceId===faceId)?current.map(f=>f.faceId===faceId?updated:f):[...current,updated];
}
export type SlatPanel={id:string;tenantId:string;projectId:string;roomId:string;widthMm:number;heightMm:number;slatWidthMm:number;spacingMm:number;slatDepthMm:number;materialId:string};
export function buildSlatPanel(p:SlatPanel){
 if(!p.id||!p.tenantId||!p.projectId||!p.roomId||!p.materialId||![p.widthMm,p.heightMm,p.slatWidthMm,p.slatDepthMm,p.spacingMm].every(Number.isFinite)||p.widthMm<=0||p.heightMm<=0||p.slatWidthMm<=0||p.slatDepthMm<=0||p.spacingMm<0)throw Error("Invalid decorative panel");
 const count=Math.floor((p.widthMm+p.spacingMm)/(p.slatWidthMm+p.spacingMm));
 if(count<1||count>10000)throw Error("Slat geometry incompatible with panel");
 return {id:p.id,slatCount:count,totalLinearMeters:count*p.heightMm/1000,
  slatVolumeM3:count*p.slatWidthMm*p.slatDepthMm*p.heightMm/1e9,
  occupiedWidthMm:count*p.slatWidthMm+(count-1)*p.spacingMm,
  status:"preliminary" as const,warnings:["Supports, adhesives, fixings, fire/acoustic performance and actual stock require validation."]};
}
export type MetalProfile={id:string;tenantId:string;materialId:string;sku:string;sectionAreaMm2:number;densityKgM3:number;lengthMm:number;quantity:number};
export function quantifyMetalProfile(p:MetalProfile){
 if(!p.id||!p.tenantId||!p.materialId||!p.sku||![p.sectionAreaMm2,p.densityKgM3,p.lengthMm].every(n=>Number.isFinite(n)&&n>0)||!Number.isSafeInteger(p.quantity)||p.quantity<=0)throw Error("Invalid metal profile");
 return {id:p.id,linearMeters:p.lengthMm*p.quantity/1000,estimatedMassKg:p.sectionAreaMm2*p.lengthMm*p.quantity*p.densityKgM3/1e9,approvalRequired:true};
}
