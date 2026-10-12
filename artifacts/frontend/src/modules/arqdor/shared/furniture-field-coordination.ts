/** ARQDOR LOTE 13.67–13.70: revision-aware site measurement, supplier handoff
 * and preliminary rectangular clearance checks. No purchasing or execution.
 */
export type AsBuiltDimension={objectId:string;dimension:"width"|"height"|"depth";designMm:number;measuredMm:number;toleranceMm:number;measuredAt:string;measuredBy:string;photoRefs:string[]};
export function checkAsBuilt(measures:readonly AsBuiltDimension[]){
 const seen=new Set<string>();
 return measures.map(m=>{
  const key=m.objectId+":"+m.dimension;
  if(!m.objectId||!m.measuredBy||!Number.isFinite(Date.parse(m.measuredAt))||seen.has(key)||
   ![m.designMm,m.measuredMm].every(n=>Number.isFinite(n)&&n>0)||
   !Number.isFinite(m.toleranceMm)||m.toleranceMm<0)throw Error("Invalid as-built measurement");
  seen.add(key);
  const deltaMm=m.measuredMm-m.designMm;
  return {objectId:m.objectId,dimension:m.dimension,deltaMm,withinTolerance:Math.abs(deltaMm)<=m.toleranceMm,
   requiresReview:Math.abs(deltaMm)>m.toleranceMm};
 });
}
export type SupplierDependency={id:string;upstreamId:string;downstreamId:string;interfaceName:string;confirmed:boolean};
export function inspectSupplierDependencies(deps:readonly SupplierDependency[]){
 const ids=new Set(deps.map(d=>d.id));
 if(ids.size!==deps.length)throw Error("Duplicate dependency ID");
 const adj=new Map<string,string[]>();
 for(const d of deps){
  if(!d.id||!d.upstreamId||!d.downstreamId||d.upstreamId===d.downstreamId||!d.interfaceName.trim())throw Error("Invalid supplier dependency");
  adj.set(d.upstreamId,[...(adj.get(d.upstreamId)??[]),d.downstreamId]);
 }
 const state=new Map<string,number>(),order:string[]=[];
 const visit=(id:string)=>{
  if(state.get(id)===1)throw Error("Circular supplier dependency");
  if(state.get(id)===2)return;
  state.set(id,1);for(const next of adj.get(id)??[])visit(next);
  state.set(id,2);order.unshift(id);
 };
 for(const d of deps){visit(d.upstreamId);visit(d.downstreamId);}
 return {order,unconfirmedInterfaces:deps.filter(d=>!d.confirmed).map(d=>d.id)};
}
export type Box3={id:string;xMm:number;yMm:number;zMm:number;widthMm:number;depthMm:number;heightMm:number};
export function checkRectangularClearances(a:Box3,b:Box3,clearanceMm=0){
 if(a.id===b.id||!Number.isFinite(clearanceMm)||clearanceMm<0||
 [a.xMm,a.yMm,a.zMm,a.widthMm,a.depthMm,a.heightMm,b.xMm,b.yMm,b.zMm,b.widthMm,b.depthMm,b.heightMm].some(n=>!Number.isFinite(n))||
 [a.widthMm,a.depthMm,a.heightMm,b.widthMm,b.depthMm,b.heightMm].some(n=>n<=0))throw Error("Invalid 3D bounds");
 const separations=[
 Math.max(b.xMm-(a.xMm+a.widthMm),a.xMm-(b.xMm+b.widthMm)),
 Math.max(b.yMm-(a.yMm+a.depthMm),a.yMm-(b.yMm+b.depthMm)),
 Math.max(b.zMm-(a.zMm+a.heightMm),a.zMm-(b.zMm+b.heightMm))
 ];
 return {collision:separations.every(g=>g<0),clearanceConcern:separations.every(g=>g<clearanceMm),
  status:"bounding-box-reference" as const};
}
export type ConstructionRule={id:string;tenantId:string;manufacturerId?:string;revision:number;effectiveFrom:string;minimumClearanceMm:number};
export function selectConstructionRule(rules:readonly ConstructionRule[],tenantId:string,manufacturerId:string|undefined,at:string){
 if(!tenantId||!Number.isFinite(Date.parse(at)))throw Error("Invalid rule context");
 const filtered=rules.filter(r=>r.tenantId===tenantId&&(!r.manufacturerId||r.manufacturerId===manufacturerId)&&
  Number.isSafeInteger(r.revision)&&r.revision>=1&&Number.isFinite(Date.parse(r.effectiveFrom))&&Date.parse(r.effectiveFrom)<=Date.parse(at)&&
  Number.isFinite(r.minimumClearanceMm)&&r.minimumClearanceMm>=0);
 filtered.sort((a,b)=>Number(!!b.manufacturerId)-Number(!!a.manufacturerId)||Date.parse(b.effectiveFrom)-Date.parse(a.effectiveFrom)||b.revision-a.revision);
 return filtered[0]??null;
}
