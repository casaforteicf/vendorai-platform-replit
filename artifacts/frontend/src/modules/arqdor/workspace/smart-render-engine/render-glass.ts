import type { Vec3 } from "./render-bvh";
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(v:Vec3):Vec3=>{const m=Math.hypot(...v);if(!Number.isFinite(m)||m<1e-10)throw Error("ARQDOR: vetor inválido");return [v[0]/m,v[1]/m,v[2]/m];};
export type DielectricEvent=Readonly<{direction:Vec3;reflected:boolean;fresnel:number;totalInternalReflection:boolean}>;
/** Ideal smooth dielectric event (air ↔ homogeneous IOR), no absorption, nested media or dispersion. */
export function sampleDielectric(incident:Vec3,outwardNormal:Vec3,ior:number,choice:number):DielectricEvent {
 if(!Number.isFinite(ior)||ior<=1||ior>3)throw Error("ARQDOR: índice de refração inválido");
 if(!Number.isFinite(choice)||choice<0||choice>=1)throw Error("ARQDOR: amostra inválida");
 const i=unit(incident),out=unit(outwardNormal);
 const entering=dot(i,out)<0;
 const n:Vec3=entering?out:[-out[0],-out[1],-out[2]];
 const eta=entering?1/ior:ior;
 const cosI=Math.min(1,Math.max(0,-dot(i,n)));
 const sin2T=eta*eta*(1-cosI*cosI);
 const tir=sin2T>1;
 const f0=Math.pow((ior-1)/(ior+1),2);
 const fresnel=tir?1:f0+(1-f0)*Math.pow(1-cosI,5);
 if(tir||choice<fresnel){
  const d=dot(i,n);
  return {direction:unit([i[0]-2*d*n[0],i[1]-2*d*n[1],i[2]-2*d*n[2]]),reflected:true,fresnel,totalInternalReflection:tir};
 }
 const cosT=Math.sqrt(Math.max(0,1-sin2T));
 return {direction:unit([eta*i[0]+(eta*cosI-cosT)*n[0],eta*i[1]+(eta*cosI-cosT)*n[1],eta*i[2]+(eta*cosI-cosT)*n[2]]),
  reflected:false,fresnel,totalInternalReflection:false};
}
