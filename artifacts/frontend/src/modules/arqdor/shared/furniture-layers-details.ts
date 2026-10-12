/** Lote 13.72/13.73/13.77: layered materials, reusable joining details and revision comments.
 * Cost estimation only; structural/adhesive/manufacturer sign-off required.
 */
export type PhysicalLayer={id:string;role:"substrate"|"adhesive"|"finish"|"core";materialId:string;thicknessMm:number;densityKgM3?:number;costPerM2?:number};
export function calculateLayerAssembly(layers:readonly PhysicalLayer[],areaM2:number){
 if(!Number.isFinite(areaM2)||areaM2<=0||!layers.length||layers.length>100)throw Error("Invalid layer area/count");
 const ids=new Set<string>();let thicknessMm=0,estimatedMassKg=0,estimatedCost=0;let massComplete=true,costComplete=true;
 for(const l of layers){
  if(!l.id||ids.has(l.id)||!l.materialId||!Number.isFinite(l.thicknessMm)||l.thicknessMm<=0)throw Error("Invalid physical layer");
  ids.add(l.id);thicknessMm+=l.thicknessMm;
  if(l.densityKgM3===undefined)massComplete=false;else {if(!Number.isFinite(l.densityKgM3)||l.densityKgM3<=0)throw Error("Invalid density");estimatedMassKg+=areaM2*l.thicknessMm/1000*l.densityKgM3;}
  if(l.costPerM2===undefined)costComplete=false;else {if(!Number.isFinite(l.costPerM2)||l.costPerM2<0)throw Error("Invalid layer cost");estimatedCost+=areaM2*l.costPerM2;}
 }
 return {thicknessMm,estimatedMassKg:massComplete?estimatedMassKg:null,estimatedMaterialCost:costComplete?estimatedCost:null,reviewRequired:true};
}
export type ReusableJoinDetail={id:string;tenantId:string;revision:number;kind:"joint"|"fastener"|"interface";compatibleMaterials:string[];minimumThicknessMm:number;manufacturerRef?:string};
export function assessJoinDetail(detail:ReusableJoinDetail,tenantId:string,materialId:string,thicknessMm:number){
 if(detail.tenantId!==tenantId||!Number.isSafeInteger(detail.revision)||detail.revision<1||!Number.isFinite(thicknessMm)||thicknessMm<=0)throw Error("Invalid joint request");
 return {detailId:detail.id,revision:detail.revision,eligibleForReview:detail.compatibleMaterials.includes(materialId)&&thicknessMm>=detail.minimumThicknessMm,approvedForFabrication:false};
}
export type RevisionComment={id:string;tenantId:string;projectId:string;revision:string;authorId:string;objectId:string;body:string;state:"open"|"resolved"};
export function recordRevisionComment(input:RevisionComment):RevisionComment{
 if(!input.id||!input.tenantId||!input.projectId||!input.revision||!input.authorId||!input.objectId||!input.body.trim()||input.body.length>4000)throw Error("Invalid revision comment");
 return {...input};
}
