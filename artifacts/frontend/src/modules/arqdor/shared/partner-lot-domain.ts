/** Partner lot technical snapshot: validation and versioning without database writes.
 * Coordinates are a local survey plane in METERS, not longitude/latitude.
 * Survey/legal boundaries must be professionally verified.
 */
export type LotPoint={xM:number;yM:number};
export type LotStatus="available"|"reserved"|"sold"|"unavailable";
export type PartnerLotDraft={
 tenantId:string;partnerId:string;developmentId:string;lotId:string;block:string;lotNumber:string;
 name:string;revision:number;coordinates:readonly LotPoint[];surveySource:string;surveyDate:string;
 crs:string;status:LotStatus;urbanRulesSource?:string;
};
export type VerifiedLotSnapshot=PartnerLotDraft&{
 geometry:{areaM2:number;perimeterM:number;winding:"clockwise"|"counterclockwise"};
 verifiedAt:string;versionKey:string;verification:"geometry-validated-survey-unverified";
};
function lineIntersection(a:LotPoint,b:LotPoint,c:LotPoint,d:LotPoint){
 const cross=(p:LotPoint,q:LotPoint,r:LotPoint)=>(q.xM-p.xM)*(r.yM-p.yM)-(q.yM-p.yM)*(r.xM-p.xM);
 const ab=cross(a,b,c),abb=cross(a,b,d),cd=cross(c,d,a),cdd=cross(c,d,b);
 return ((ab>1e-9&&abb < -1e-9)||(ab < -1e-9&&abb>1e-9))&&((cd>1e-9&&cdd < -1e-9)||(cd < -1e-9&&cdd>1e-9));
}
export function validatePartnerLot(input:PartnerLotDraft,verifiedAt:string):VerifiedLotSnapshot{
 for(const key of ["tenantId","partnerId","developmentId","lotId","block","lotNumber","name","surveySource","surveyDate","crs"] as const)
  if(typeof input[key]!=="string"||!input[key].trim())throw Error("Missing "+key);
 if(!Number.isSafeInteger(input.revision)||input.revision<1)throw Error("Invalid revision");
 if(!["available","reserved","sold","unavailable"].includes(input.status))throw Error("Invalid lot status");
 if(!Number.isFinite(Date.parse(verifiedAt)))throw Error("Invalid verification date");
 const p=[...input.coordinates];
 if(p.length<3||p.length>10000)throw Error("Invalid polygon vertex count");
 for(const v of p)if(!Number.isFinite(v.xM)||!Number.isFinite(v.yM))throw Error("Invalid point coordinate");
 if(p.length>3&&p[0].xM===p[p.length-1].xM&&p[0].yM===p[p.length-1].yM)p.pop();
 let twice=0,perimeter=0;
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];
  if(a.xM===b.xM&&a.yM===b.yM)throw Error("Duplicate adjacent polygon point");
  twice+=a.xM*b.yM-b.xM*a.yM;perimeter+=Math.hypot(b.xM-a.xM,b.yM-a.yM);
  for(let j=i+1;j<p.length;j++){
    if(j===i+1||(i===0&&j===p.length-1))continue;
    if(lineIntersection(a,b,p[j],p[(j+1)%p.length]))throw Error("Self-intersecting lot geometry");
  }
 }
 if(Math.abs(twice)<1e-7)throw Error("Degenerate lot polygon");
 return {...input,coordinates:p,verifiedAt,versionKey:input.lotId+":"+input.revision,
 geometry:{areaM2:Math.abs(twice)/2,perimeterM:perimeter,winding:twice<0?"clockwise":"counterclockwise"},
 verification:"geometry-validated-survey-unverified"};
}
export type PartnerLotProjectOrigin={
 source:"partner-lot";tenantId:string;partnerId:string;lotId:string;lotRevision:number;
 projectId:string;sourceGeometry:readonly LotPoint[];commercialStatus:LotStatus;
 technicalVerification:"geometry-validated-survey-unverified";
};
export function buildPreProjectLotOrigin(lot:VerifiedLotSnapshot,projectId:string,tenantId:string):PartnerLotProjectOrigin{
 if(!projectId.trim()||tenantId!==lot.tenantId)throw Error("Invalid project or tenant scope");
 return {source:"partner-lot",tenantId,partnerId:lot.partnerId,lotId:lot.lotId,lotRevision:lot.revision,
 projectId,sourceGeometry:lot.coordinates.map(p=>({...p})),commercialStatus:lot.status,technicalVerification:lot.verification};
}
