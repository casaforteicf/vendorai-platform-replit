import type { Vec3 } from "./render-bvh";
import { sampleCpuTexture, type CpuTexture } from "./render-texture";
export type CpuMaterialMaps = Readonly<{roughness?:CpuTexture;normal?:CpuTexture;normalStrength?:number}>;
const unit=(v:Vec3):Vec3=>{const l=Math.hypot(...v);if(!Number.isFinite(l)||l<1e-9)throw Error("ARQDOR: normal inválida");return [v[0]/l,v[1]/l,v[2]/l];};
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function sampleRoughnessMap(texture:CpuTexture,uv:readonly [number,number],factor:number):number {
 if(!Number.isFinite(factor))throw Error("ARQDOR: rugosidade inválida");
 if(texture.colorSpace==="srgb")throw Error("ARQDOR: mapa de rugosidade deve usar dados lineares");
 return Math.max(0,Math.min(1,sampleCpuTexture(texture,uv)[0]*factor));
}
/** Tangent-space normal transform from a triangle's actual geometry + UV derivatives.
 * Degenerate UVs fail closed instead of inventing a tangent basis.
 */
export function sampleWorldNormalMap(args:{texture:CpuTexture;uv:readonly [number,number]; strength?:number;
 positions:readonly number[];uvs:readonly number[];triangle:number;faceNormal:Vec3}):Vec3 {
 const {positions,uvs,triangle}=args,idx=triangle*9,ui=triangle*6;
 if(args.texture.colorSpace==="srgb")throw Error("ARQDOR: normal map deve usar dados lineares");
 if(!Number.isSafeInteger(triangle)||triangle<0||idx+8>=positions.length||ui+5>=uvs.length)throw Error("ARQDOR: face sem dados suficientes");
 const strength=args.strength??1;
 if(!Number.isFinite(strength)||strength<0||strength>2)throw Error("ARQDOR: intensidade de normal inválida");
 const p0:Vec3=[positions[idx],positions[idx+1],positions[idx+2]];
 const p1:Vec3=[positions[idx+3],positions[idx+4],positions[idx+5]];
 const p2:Vec3=[positions[idx+6],positions[idx+7],positions[idx+8]];
 if([...p0,...p1,...p2,...args.faceNormal,...uvs.slice(ui,ui+6)].some(x=>!Number.isFinite(x)))
   throw Error("ARQDOR: dados geométricos não finitos");
 const e1=sub(p1,p0),e2=sub(p2,p0),du1=uvs[ui+2]-uvs[ui],dv1=uvs[ui+3]-uvs[ui+1],du2=uvs[ui+4]-uvs[ui],dv2=uvs[ui+5]-uvs[ui+1];
 const determinant=du1*dv2-du2*dv1;
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-10)throw Error("ARQDOR: UV degenerado para normal map");
 const t=unit([(e1[0]*dv2-e2[0]*dv1)/determinant,(e1[1]*dv2-e2[1]*dv1)/determinant,(e1[2]*dv2-e2[2]*dv1)/determinant]);
 const n=unit(args.faceNormal);
 const tangent=unit(sub(t,[n[0]*dot(n,t),n[1]*dot(n,t),n[2]*dot(n,t)]));
 const handedness=determinant<0?-1:1;
 const b=cross(n,tangent).map(x=>x*handedness) as Vec3;
 const tex=sampleCpuTexture(args.texture,args.uv);
 const local=unit([(tex[0]*2-1)*strength,(tex[1]*2-1)*strength,tex[2]*2-1]);
 return unit([tangent[0]*local[0]+b[0]*local[1]+n[0]*local[2],tangent[1]*local[0]+b[1]*local[1]+n[1]*local[2],tangent[2]*local[0]+b[2]*local[1]+n[2]*local[2]]);
}
