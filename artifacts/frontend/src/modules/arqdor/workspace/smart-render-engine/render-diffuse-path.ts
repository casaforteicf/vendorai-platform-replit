import { sampleCpuTexture, sampleMeshUv, type CpuTexture } from "./render-texture";
import { sampleDielectric } from "./render-glass";
import { createRenderBvh, type Ray, type Vec3 } from "./render-bvh";
import type { GeometryTransfer } from "./render-geometry-export";
import { normalizePhysicalMaterial, sampleDiffuseHemisphere, samplePerfectReflection, sampleRoughMetalReflection, type PhysicalMaterial } from "./render-physical-material";

const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(a:Vec3,b:Vec3):Vec3=>[a[0]*b[0],a[1]*b[1],a[2]*b[2]];
const scale=(a:Vec3,s:number):Vec3=>[a[0]*s,a[1]*s,a[2]*s];
const normalize=(v:Vec3):Vec3=>{const n=Math.hypot(...v);if(!Number.isFinite(n)||n<1e-10)throw Error("ARQDOR: vetor inválido");return scale(v,1/n);};
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function rand(seed:number) {
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
/** Early diffuse path integrator with ideal mirror-metal branch. No MIS, textures, direct-light sampling, or rough specular BRDF. */
export function traceDiffusePath(input:{
  geometry:GeometryTransfer;
  ray:Ray;
  materials:Readonly<Record<string,Partial<PhysicalMaterial>>>;
  sky:Vec3;
  textures?: Readonly<Record<string,CpuTexture>>;
  maxBounces?:number;
  seed?:number;
  /** Reuse one acceleration tree per render job rather than rebuilding per pixel. */
  prepared?:ReturnType<typeof createRenderBvh>;
}) {
  const maxBounces=input.maxBounces??2;
  if(!Number.isInteger(maxBounces)||maxBounces<0||maxBounces>8)throw Error("ARQDOR: profundidade de raios inválida");
  if(input.sky.some(x=>!Number.isFinite(x)||x<0)||!Number.isSafeInteger(input.seed??1))throw Error("ARQDOR: parâmetros de iluminação inválidos");
  const bvh=input.prepared??createRenderBvh(input.geometry);
  const byMesh=new Map(input.geometry.meshes.map(x=>[x.meshId,x]));
  const random=rand(input.seed??1);
  let ray:Ray={origin:input.ray.origin,direction:normalize(input.ray.direction)};
  let throughput:Vec3=[1,1,1],radiance:Vec3=[0,0,0];
  for(let bounce=0;bounce<=maxBounces;bounce++){
    const hit=bvh.intersect(ray);
    if(!hit){radiance=add(radiance,mul(throughput,input.sky));break;}
    const mesh=byMesh.get(hit.meshId);
    if(!mesh)throw Error("ARQDOR: malha da BVH não encontrada");
    let mat=normalizePhysicalMaterial(input.materials[hit.materialId??""]??{});
    const texture=input.textures?.[hit.materialId??""];
    if(texture) {
      const uv=sampleMeshUv(mesh.uvs,hit.triangle,hit.barycentric);
      mat={...mat,baseColor:mul(mat.baseColor,sampleCpuTexture(texture,uv))};
    }
    radiance=add(radiance,mul(throughput,mat.emissive));
    if(bounce===maxBounces)break;
    const start=hit.triangle*9,p=mesh.positions;
    const a:Vec3=[p[start],p[start+1],p[start+2]],b:Vec3=[p[start+3],p[start+4],p[start+5]],c:Vec3=[p[start+6],p[start+7],p[start+8]];
    const outwardNormal=normalize(cross(sub(b,a),sub(c,a)));
    let normal=outwardNormal;
    if(dot(normal,ray.direction)>0)normal=scale(normal,-1);
    if(mat.transmission>=0.999 && mat.roughness<=0.02){
      const event=sampleDielectric(ray.direction,outwardNormal,mat.ior,random());
      const offset=event.reflected ? normal : scale(normal,-1);
      ray={origin:add(hit.point,scale(offset,1e-4)),direction:event.direction};
      throughput=mul(throughput,mat.baseColor);
      continue;
    }
    const sample=mat.metalness>=0.999
      ? (mat.roughness<=0.02 ? samplePerfectReflection(ray.direction,normal,mat) : sampleRoughMetalReflection(ray.direction,normal,mat,random(),random()))
      : sampleDiffuseHemisphere(normal,random(),random(),mat);
    if(sample.pdf<=0)break;
    throughput=mul(throughput,sample.throughput);
    ray={origin:add(hit.point,scale(normal,1e-4)),direction:sample.direction};
  }
  return radiance;
}
