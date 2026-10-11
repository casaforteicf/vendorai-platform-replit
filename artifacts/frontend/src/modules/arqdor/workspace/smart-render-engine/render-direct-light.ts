import type { Ray, Vec3 } from "./render-bvh";
export type DirectionalLight = Readonly<{directionToLight:Vec3;color:Vec3;intensity:number}>;
type Intersector = Readonly<{intersect:(ray:Ray)=>unknown}>;
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(v:Vec3):Vec3=>{const len=Math.hypot(...v);if(!Number.isFinite(len)||len<1e-10)throw Error("ARQDOR: direção de luz inválida");return [v[0]/len,v[1]/len,v[2]/len];};
/** Deterministic shadow-tested Lambert direct lighting; no MIS or area lights yet. */
export function evaluateDirectionalLight(args:{
  bvh:Intersector;point:Vec3;normal:Vec3;albedo:Vec3;light:DirectionalLight;
}):Vec3 {
 const {bvh,point,albedo,light}=args,n=unit(args.normal),l=unit(light.directionToLight);
 if([...point,...albedo,...light.color].some(x=>!Number.isFinite(x)||x<0)||
   !Number.isFinite(light.intensity)||light.intensity<0||light.intensity>10000)
   throw Error("ARQDOR: parâmetros de iluminação inválidos");
 const cosine=Math.max(0,dot(n,l));
 if(cosine===0 || light.intensity===0)return [0,0,0];
 const origin:Vec3=[point[0]+n[0]*1e-4,point[1]+n[1]*1e-4,point[2]+n[2]*1e-4];
 if(bvh.intersect({origin,direction:l}))return [0,0,0];
 return [0,1,2].map(k=>albedo[k]*light.color[k]*light.intensity*cosine/Math.PI) as unknown as Vec3;
}
