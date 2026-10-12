/** Arqdor Lote 13.71-77: conservative reference reconstruction and revision impact.
 * No geometry is certified, no production or supplier action is performed.
 */
export type ImportMeasurement={source:string;rawLength:number;declaredUnit:"mm"|"cm"|"m"|"in"|"unknown";verifiedLengthMm?:number};
const factors={mm:1,cm:10,m:1000,in:25.4} as const;
export function assessImportedScale(m:ImportMeasurement){
 if(!m.source.trim()||!Number.isFinite(m.rawLength)||m.rawLength<=0)throw Error("Invalid source measurement");
 if(m.verifiedLengthMm!==undefined&&(!Number.isFinite(m.verifiedLengthMm)||m.verifiedLengthMm<=0))throw Error("Invalid calibration");
 const declared=m.declaredUnit==="unknown"?null:factors[m.declaredUnit];
 const inferred=m.verifiedLengthMm!==undefined?m.verifiedLengthMm/m.rawLength:null;
 const scaleMm=inferred??declared;
 const disagrees=declared!==null&&inferred!==null&&Math.abs(declared-inferred)>Math.max(.001,declared*.01);
 return {source:m.source,scaleMm,confidence:inferred!==null&&!disagrees?"measured-reference":declared!==null&&!disagrees?"declared-unit":"needs-review",
  requiresApproval:inferred===null||disagrees,warning:disagrees?"Measured reference conflicts with file unit":"Imported geometry requires technical verification"};
}
export type RevisionDependency={upstreamId:string;downstreamId:string;reason:string};
export function computeRevisionImpact(changedIds:readonly string[],edges:readonly RevisionDependency[]){
 const affected=new Set(changedIds),queue=[...changedIds];
 const graph=new Map<string,string[]>();
 for(const e of edges){
  if(!e.upstreamId||!e.downstreamId||e.upstreamId===e.downstreamId)throw Error("Invalid dependency");
  graph.set(e.upstreamId,[...(graph.get(e.upstreamId)??[]),e.downstreamId]);
 }
 while(queue.length){
  const id=queue.shift()!;
  for(const next of graph.get(id)??[])if(!affected.has(next)){affected.add(next);queue.push(next);}
  if(affected.size>100000)throw Error("Dependency graph too large");
 }
 return {changedIds:[...new Set(changedIds)],affectedIds:[...affected],invalidatedIds:[...affected].filter(id=>!changedIds.includes(id)),requiresNewRevision:true};
}
export type Offcut={id:string;tenantId:string;materialId:string;widthMm:number;lengthMm:number;reserved:boolean;qualityApproved:boolean};
export function findEligibleOffcuts(input:{tenantId:string;materialId:string;widthMm:number;lengthMm:number;offcuts:readonly Offcut[];allowRotation:boolean}){
 if(!input.tenantId||!input.materialId||![input.widthMm,input.lengthMm].every(n=>Number.isFinite(n)&&n>0))throw Error("Invalid offcut request");
 return input.offcuts.filter(o=>o.tenantId===input.tenantId&&o.materialId===input.materialId&&!o.reserved&&o.qualityApproved&&
  ((o.widthMm>=input.widthMm&&o.lengthMm>=input.lengthMm)||(input.allowRotation&&o.widthMm>=input.lengthMm&&o.lengthMm>=input.widthMm)))
  .sort((a,b)=>a.widthMm*a.lengthMm-b.widthMm*b.lengthMm).map(o=>({id:o.id,areaMm2:o.widthMm*o.lengthMm,status:"candidate-only" as const}));
}
export type QualityCheck={id:string;revision:string;partId:string;result:"pass"|"fail"|"pending";inspectorId?:string;recordedAt?:string};
export function assessQualityRelease(checks:readonly QualityCheck[],revision:string){
 if(!revision||!checks.length||checks.some(x=>!x.id||x.revision!==revision||!x.partId))throw Error("Invalid production checks");
 const failed=checks.filter(x=>x.result==="fail").map(x=>x.id);
 const pending=checks.filter(x=>x.result==="pending"||x.result==="pass"&&(!x.inspectorId||!x.recordedAt)).map(x=>x.id);
 return {failed,pending,status:failed.length||pending.length?"blocked":"checks-recorded" as const,manufacturingApprovalGranted:false};
}
