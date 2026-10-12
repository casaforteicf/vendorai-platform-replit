/** ARQDOR LOTE 13.21-13.30: deterministic preliminary organic furniture tools.
 * Does not authorize manufacturing or replace structural engineering.
 */
export type Point2={xMm:number;yMm:number};
export type Polyline2={points:Point2[];closed:boolean};
export type OrganicProfile={id:string;sectionWidthMm:number;sectionHeightMm:number;path:Polyline2;materialId:string};
export type TransportModule={id:string;startMm:number;endMm:number;lengthMm:number;requiresJoint:boolean};
const valid=(n:number)=>Number.isFinite(n)&&n>=0;
export function pathLengthMm(path:Polyline2):number{
 if(path.points.length<2||path.points.length>10000)throw Error("Invalid path size");
 for(const p of path.points)if(!Number.isFinite(p.xMm)||!Number.isFinite(p.yMm))throw Error("Nonfinite point");
 let length=0;
 for(let i=1;i<path.points.length;i++)length+=Math.hypot(path.points[i].xMm-path.points[i-1].xMm,path.points[i].yMm-path.points[i-1].yMm);
 if(path.closed)length+=Math.hypot(path.points[0].xMm-path.points.at(-1)!.xMm,path.points[0].yMm-path.points.at(-1)!.yMm);
 if(length<=0)throw Error("Degenerate path");
 return Math.round(length*1000)/1000;
}
export function sampleCircularArc(center:Point2,radiusMm:number,startDeg:number,sweepDeg:number,segments=32):Polyline2{
 if(!Number.isFinite(center.xMm)||!Number.isFinite(center.yMm)||!Number.isFinite(radiusMm)||radiusMm<=0||
 !Number.isFinite(startDeg)||!Number.isFinite(sweepDeg)||Math.abs(sweepDeg)>360||
 !Number.isSafeInteger(segments)||segments<2||segments>2048)throw Error("Invalid arc");
 return {closed:false,points:Array.from({length:segments+1},(_,i)=>{
 const a=(startDeg+sweepDeg*i/segments)*Math.PI/180;
 return {xMm:center.xMm+radiusMm*Math.cos(a),yMm:center.yMm+radiusMm*Math.sin(a)};
 })};
}
export function planProfile(profile:OrganicProfile){
 if(!profile.id||!profile.materialId||!Number.isFinite(profile.sectionWidthMm)||profile.sectionWidthMm<=0||
 !Number.isFinite(profile.sectionHeightMm)||profile.sectionHeightMm<=0)throw Error("Invalid profile");
 const lengthMm=pathLengthMm(profile.path);
 return {profileId:profile.id,materialId:profile.materialId,lengthMm,
  netVolumeMm3:lengthMm*profile.sectionWidthMm*profile.sectionHeightMm,
  validation:"reference-only" as const,
  warnings:["Path length approximated from segments. Bends, joints, kerf, stock and engineering need validation."]};
}
export function partitionTransportLength(totalLengthMm:number,maxModuleLengthMm:number,jointAllowanceMm=0):TransportModule[]{
 if(!Number.isFinite(totalLengthMm)||totalLengthMm<=0||!Number.isFinite(maxModuleLengthMm)||maxModuleLengthMm<=0||
 !valid(jointAllowanceMm)||jointAllowanceMm>=maxModuleLengthMm)throw Error("Invalid transport limits");
 const count=Math.ceil(totalLengthMm/maxModuleLengthMm);
 if(count>10000)throw Error("Too many modules");
 const length=totalLengthMm/count;
 return Array.from({length:count},(_,i)=>({id:"module-"+(i+1),startMm:i*length,endMm:(i+1)*length,
 lengthMm:length,requiresJoint:i>0||i<count-1}));
}
export function assessSurfaceFlattening(kind:"planar"|"cylindrical"|"conical"|"freeform",widthMm:number,lengthMm:number){
 if(!Number.isFinite(widthMm)||widthMm<=0||!Number.isFinite(lengthMm)||lengthMm<=0)throw Error("Invalid surface dimensions");
 if(kind==="planar")return {status:"supported-reference" as const,areaMm2:widthMm*lengthMm,warnings:["Check tolerances and material cutting allowances."]};
 if(kind==="cylindrical")return {status:"requires-unrolling" as const,areaMm2:null,warnings:["Surface must be unrolled with real cylinder radius and seam position."]};
 return {status:"not-supported" as const,areaMm2:null,warnings:["No automatic flattening for this surface type. Professional fabrication review required."]};
}
