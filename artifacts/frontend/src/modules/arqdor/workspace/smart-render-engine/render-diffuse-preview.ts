import type { CpuPreviewOptions, PreparedCpuPreview } from "./render-cpu-preview";
import { traceDiffusePath } from "./render-diffuse-path";
import type { PhysicalMaterial } from "./render-physical-material";
import type { Vec3 } from "./render-bvh";

export type DiffusePreviewOptions = CpuPreviewOptions & Readonly<{
  physicalMaterials?: Readonly<Record<string,Partial<PhysicalMaterial>>>;
  maxBounces?: number;
}>;
const unit=(v:Vec3):Vec3=>{const d=Math.hypot(...v);if(!Number.isFinite(d)||d<1e-12)throw Error("ARQDOR: câmera inválida");return [v[0]/d,v[1]/d,v[2]/d];};
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const fract=(v:number)=>v-Math.floor(v);
/** Experimental diffuse-transport strips; not a validated production path tracer. */
export function renderDiffusePreviewStrip(o:DiffusePreviewOptions,rowStart:number,rowCount:number,
 prepared:PreparedCpuPreview,sample:number) {
 const {width,height}=o;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262144)
   throw Error("ARQDOR: resolução excedida");
 if(!Number.isInteger(rowStart)||!Number.isInteger(rowCount)||rowStart<0||rowCount<1||rowStart+rowCount>height)
   throw Error("ARQDOR: faixa inválida");
 if(!Number.isSafeInteger(sample)||sample<0||sample>=4096)throw Error("ARQDOR: amostra inválida");
 if(!(o.camera.verticalFovDegrees>1&&o.camera.verticalFovDegrees<179))throw Error("ARQDOR: campo de visão inválido");
 const forward=unit(sub(o.camera.target,o.camera.position));
 const right=unit(cross(forward,o.camera.up||[0,1,0]));
 const up=unit(cross(right,forward));
 const ratio=width/height,scale=Math.tan(o.camera.verticalFovDegrees*Math.PI/360);
 const rgba=new Uint8ClampedArray(width*rowCount*4);
 const mats:Record<string,Partial<PhysicalMaterial>>={...(o.physicalMaterials||{})};
 for(const [id,hex] of Object.entries(o.materials)){
   if(mats[id])continue;
   const baseColor:Vec3=/^#[0-9a-f]{6}$/i.test(hex)
      ? [1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255) as unknown as Vec3
      : [0.75,0.75,0.75];
   mats[id]={baseColor};
 }
 for(let row=0;row<rowCount;row++)for(let x=0;x<width;x++){
   const y=rowStart+row,jx=sample===0?0.5:fract((sample+1)*0.754877666+x*0.017);
   const jy=sample===0?0.5:fract((sample+1)*0.569840291+y*0.019);
   const dx=(2*(x+jx)/width-1)*ratio*scale,dy=(1-2*(y+jy)/height)*scale;
   const direction=unit([forward[0]+right[0]*dx+up[0]*dy,forward[1]+right[1]*dx+up[1]*dy,forward[2]+right[2]*dx+up[2]*dy]);
   const color=traceDiffusePath({
     geometry:o.geometry,prepared,ray:{origin:o.camera.position,direction},materials:mats,
     sky:o.skyColor||[0.72,0.82,0.95],maxBounces:o.maxBounces??2,
     seed:(Math.imul(sample+1,2654435761)^Math.imul(y+1,2246822519)^Math.imul(x+1,3266489917))>>>0,
   });
   const at=(row*width+x)*4;
   for(let k=0;k<3;k++)rgba[at+k]=Math.round(clamp(color[k])*255);
   rgba[at+3]=255;
 }
 return rgba;
}
