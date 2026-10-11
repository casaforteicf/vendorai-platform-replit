import type { Vec3 } from "./render-bvh";

export type PhysicalMaterial = Readonly<{
  baseColor: Vec3;
  roughness: number;
  metalness: number;
  emissive: Vec3;
  transmission: number;
  ior: number;
}>;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function normalizePhysicalMaterial(input: Partial<PhysicalMaterial>): PhysicalMaterial {
  const channels = (value: Vec3 | undefined, fallback: Vec3): Vec3 => {
    const v = value ?? fallback;
    if (v.length !== 3 || v.some(x => !Number.isFinite(x)))
      throw new Error("ARQDOR: canal de material inválido");
    return [clamp(v[0]), clamp(v[1]), clamp(v[2])];
  };
  if ((input.roughness !== undefined && !Number.isFinite(input.roughness)) ||
      (input.metalness !== undefined && !Number.isFinite(input.metalness)) ||
      (input.transmission !== undefined && !Number.isFinite(input.transmission)) ||
      (input.ior !== undefined && (!Number.isFinite(input.ior) || input.ior <= 1 || input.ior > 3)))
    throw new Error("ARQDOR: parâmetro físico inválido");
  return {
    baseColor: channels(input.baseColor, [0.75, 0.75, 0.75]),
    roughness: clamp(input.roughness ?? 0.8),
    metalness: clamp(input.metalness ?? 0),
    emissive: channels(input.emissive, [0, 0, 0]),
    transmission: clamp(input.transmission ?? 0),
    ior: input.ior ?? 1.5,
  };
}
export type BsdfSample = Readonly<{ direction: Vec3; throughput: Vec3; pdf: number }>;
const dot = (a: Vec3,b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Vec3,b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (v: Vec3): Vec3 => {
 const n=Math.hypot(...v);if(n<1e-10)throw new Error("ARQDOR: normal inválida");
 return [v[0]/n,v[1]/n,v[2]/n];
};
/** Cosine-weighted Lambert sampling. Microfacet specular lobes remain unimplemented. */
export function sampleDiffuseHemisphere(normal: Vec3, u: number, v: number, material: PhysicalMaterial): BsdfSample {
  if (![u,v].every(x=>Number.isFinite(x)&&x>=0&&x<1))
    throw new Error("ARQDOR: amostra aleatória inválida");
  const n=unit(normal);
  const reference: Vec3 = Math.abs(n[1])<0.95?[0,1,0]:[1,0,0];
  const tangent=unit(cross(reference,n)),bitangent=cross(n,tangent);
  const phi=2*Math.PI*u,r=Math.sqrt(v),z=Math.sqrt(1-v);
  const direction=unit([
    tangent[0]*r*Math.cos(phi)+bitangent[0]*r*Math.sin(phi)+n[0]*z,
    tangent[1]*r*Math.cos(phi)+bitangent[1]*r*Math.sin(phi)+n[1]*z,
    tangent[2]*r*Math.cos(phi)+bitangent[2]*r*Math.sin(phi)+n[2]*z,
  ]);
  const cosTheta=Math.max(0,dot(n,direction));
  return {direction, pdf:cosTheta/Math.PI,
    throughput:[material.baseColor[0]*(1-material.metalness),material.baseColor[1]*(1-material.metalness),material.baseColor[2]*(1-material.metalness)]};
}

/** Ideal delta specular reflection. Rough metals require a future microfacet BRDF. */
export function samplePerfectReflection(incident: Vec3, normal: Vec3, material: PhysicalMaterial): BsdfSample {
 const i=unit(incident),n=unit(normal), d=dot(i,n);
 const direction=unit([i[0]-2*d*n[0],i[1]-2*d*n[1],i[2]-2*d*n[2]]);
 const f0:Vec3=[0,1,2].map(k=>0.04*(1-material.metalness)+material.baseColor[k]*material.metalness) as unknown as Vec3;
 const cosine=Math.min(1,Math.max(0,-d));
 const fresnel=Math.pow(1-cosine,5);
 return {direction,throughput:[0,1,2].map(k=>f0[k]+(1-f0[k])*fresnel) as unknown as Vec3,pdf:1};
}

/** Experimental GGX VNDF-free half-vector importance sampling for reflection only.
 * This uses the GGX NDF distribution, not visible normals / full MIS.
 */
export function sampleRoughMetalReflection(
 incident: Vec3, normal: Vec3, material: PhysicalMaterial, u: number, v: number,
): BsdfSample {
 if (![u,v].every(x=>Number.isFinite(x)&&x>=0&&x<1))throw Error("ARQDOR: amostra GGX inválida");
 const n=unit(normal),i=unit(incident);
 if(dot(i,n)>=0)throw Error("ARQDOR: incidência inválida para reflexão GGX");
 const alpha=Math.max(0.001,material.roughness*material.roughness);
 const a2=alpha*alpha;
 const phi=2*Math.PI*u;
 const cosTheta=Math.sqrt((1-v)/(1+(a2-1)*v));
 const sinTheta=Math.sqrt(Math.max(0,1-cosTheta*cosTheta));
 const ref:Vec3=Math.abs(n[1])<0.95?[0,1,0]:[1,0,0];
 const tangent=unit(cross(ref,n)),bitangent=cross(n,tangent);
 const h=unit([
  tangent[0]*sinTheta*Math.cos(phi)+bitangent[0]*sinTheta*Math.sin(phi)+n[0]*cosTheta,
  tangent[1]*sinTheta*Math.cos(phi)+bitangent[1]*sinTheta*Math.sin(phi)+n[1]*cosTheta,
  tangent[2]*sinTheta*Math.cos(phi)+bitangent[2]*sinTheta*Math.sin(phi)+n[2]*cosTheta,
 ]);
 const ih=dot(i,h);
 const reflected=unit([i[0]-2*ih*h[0],i[1]-2*ih*h[1],i[2]-2*ih*h[2]]);
 const noL=dot(n,reflected),noV=-dot(n,i),noH=Math.max(0,dot(n,h)),voH=Math.abs(ih);
 if(noL<=0 || noV<=0 || voH<1e-8)return {direction:reflected,throughput:[0,0,0],pdf:0};
 const denom=noH*noH*(a2-1)+1;
 const D=a2/(Math.PI*denom*denom);
 const smith=(no:number)=>2*no/(no+Math.sqrt(a2+(1-a2)*no*no));
 const G=smith(noL)*smith(noV);
 const f0:[number,number,number]=[0,1,2].map(k=>0.04*(1-material.metalness)+material.baseColor[k]*material.metalness) as [number,number,number];
 const fresnel=Math.pow(1-voH,5);
 const pdf=D*noH/(4*voH);
 const weight=G*voH/Math.max(1e-8,noV*noH);
 return {direction:reflected,throughput:[0,1,2].map(k=>Math.min(1e4,(f0[k]+(1-f0[k])*fresnel)*weight)) as unknown as Vec3,pdf};
}
