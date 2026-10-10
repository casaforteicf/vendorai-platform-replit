/** Lote 13.22, 13.27, 13.28: preliminary revision + layered material validation.
 * No structural design or manufacturer approval implied.
 */
export type LayerSpec={id:string;materialId:string;thicknessMm:number;grainDirection:"length"|"width"|"none";minimumBendRadiusMm?:number};
export type LaminationCheck={totalThicknessMm:number;status:"requires-engineering-review";warnings:string[]};
export function assessLamination(layers:readonly LayerSpec[],designBendRadiusMm?:number):LaminationCheck{
 if(!layers.length||layers.length>100)throw Error("Invalid laminate stack");
 if(designBendRadiusMm!==undefined&&(!Number.isFinite(designBendRadiusMm)||designBendRadiusMm<=0))throw Error("Invalid bend radius");
 const seen=new Set<string>(),warnings:string[]=[];
 let totalThicknessMm=0;
 for(const l of layers){
  if(!l.id||!l.materialId||seen.has(l.id)||!Number.isFinite(l.thicknessMm)||l.thicknessMm<=0)throw Error("Invalid laminate layer");
  if(l.minimumBendRadiusMm!==undefined&&(!Number.isFinite(l.minimumBendRadiusMm)||l.minimumBendRadiusMm<=0))throw Error("Invalid layer bend requirement");
  seen.add(l.id);totalThicknessMm+=l.thicknessMm;
  if(designBendRadiusMm!==undefined&&l.minimumBendRadiusMm!==undefined&&designBendRadiusMm<l.minimumBendRadiusMm)
   warnings.push("Layer "+l.id+" below minimum specified bend radius");
 }
 warnings.push("Check adhesive, curing, grain, supports, movement, structure and manufacturer instructions");
 return {totalThicknessMm,status:"requires-engineering-review",warnings};
}
export type RevisionSnapshot<T>={revisionId:string;parentRevisionId?:string;createdAt:string;approval:"draft"|"submitted"|"approved";payload:T};
export function compareRevisionFields<T extends Record<string,unknown>>(a:RevisionSnapshot<T>,b:RevisionSnapshot<T>):{changedKeys:string[];requiresApproval:boolean}{
 if(a.revisionId===b.revisionId)throw Error("Cannot compare same revision");
 const keys=new Set([...Object.keys(a.payload),...Object.keys(b.payload)]);
 const changedKeys=[...keys].filter(k=>JSON.stringify(a.payload[k])!==JSON.stringify(b.payload[k])).sort();
 return {changedKeys,requiresApproval:a.approval==="approved"&&changedKeys.length>0};
}
