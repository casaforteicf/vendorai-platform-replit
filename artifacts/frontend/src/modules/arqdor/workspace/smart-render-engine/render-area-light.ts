import type { Ray, Vec3 } from "./render-bvh";
export type RectAreaLight=Readonly<{center:Vec3;axisU:Vec3;axisV:Vec3;color:Vec3;radiance:number;twoSided?:boolean}>;
type Intersector=Readonly<{intersect:(ray:Ray)=>{distance:number}|null}>;
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const norm=(v:Vec3)=>Math.hypot(...v);
const scale=(v:Vec3,s:number):Vec3=>[v[0]*s,v[1]*s,v[2]*s];
/** Monte Carlo sample of a rectangular emitter, without multiple importance sampling. */
export function sampleRectAreaLight(args:{light:RectAreaLight;bvh:Intersector;point:Vec3;normal:Vec3;albedo:Vec3;u:number;v:number}):Vec3{
 const {light,point,albedo,bvh,u,v}=args;
 if(![...point,...albedo,...light.center,...light.axisU,...light.axisV,...light.color,u,v,light.radiance].every(Number.isFinite)||
   u<0||u>=1||v<0||v>=1||light.radiance<0||light.radiance>10000||albedo.some(x=>x<0)||light.color.some(x=>x<0))
   throw Error("ARQDOR: parâmetros inválidos de luz de área");
 const nlen=norm(args.normal),crossAxes=cross(light.axisU,light.axisV),area=norm(crossAxes);
 if(!Number.isFinite(nlen)||nlen<1e-10||!Number.isFinite(area)||area<1e-10)throw Error("ARQDOR: área de luz degenerada");
 const n=scale(args.normal,1/nlen),sourceNormal=scale(crossAxes,1/area);
 const source:Vec3=[0,1,2].map(k=>light.center[k]+(u-0.5)*light.axisU[k]+(v-0.5)*light.axisV[k]) as unknown as Vec3;
 const delta=sub(source,point),distance=norm(delta);
 if(distance<=1e-4)return [0,0,0];
 const direction=scale(delta,1/distance),cosSurface=Math.max(0,dot(n,direction));
 const facing=dot(sourceNormal,direction);
 const cosLight=light.twoSided?Math.abs(facing):Math.max(0,-facing);
 if(cosSurface<=0||cosLight<=0)return [0,0,0];
 const origin:Vec3=[point[0]+n[0]*1e-4,point[1]+n[1]*1e-4,point[2]+n[2]*1e-4];
 const hit=bvh.intersect({origin,direction});
 if(hit&&hit.distance<distance-2e-4)return [0,0,0];
 const factor=light.radiance*area*cosSurface*cosLight/(Math.PI*distance*distance);
 return [0,1,2].map(k=>albedo[k]*light.color[k]*factor) as unknown as Vec3;
}
