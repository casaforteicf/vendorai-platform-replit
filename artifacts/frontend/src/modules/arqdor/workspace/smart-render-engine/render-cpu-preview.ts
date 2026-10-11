import { createRenderBvh, type Vec3 } from "./render-bvh";
import type { GeometryTransfer } from "./render-geometry-export";

export type CpuPreviewCamera = Readonly<{
  position: Vec3; target: Vec3; up?: Vec3; verticalFovDegrees: number;
}>;
export type CpuPreviewLight = Readonly<{ directionToLight: Vec3; intensity: number; color: Vec3 }>;
export type CpuPreviewOptions = Readonly<{
  geometry: GeometryTransfer; camera: CpuPreviewCamera;
  light: CpuPreviewLight; materials: Readonly<Record<string, string>>;
  width: number; height: number; skyColor?: Vec3; ambient?: number;
}>;
export type CpuPreviewResult = Readonly<{ width: number; height: number; rgba: Uint8ClampedArray; triangleCount: number }>;
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a:Vec3):Vec3=>{const len=Math.hypot(...a);if(len<1e-10)throw Error("ARQDOR: vetor de comprimento zero");return [a[0]/len,a[1]/len,a[2]/len];};
const scale=(a:Vec3,v:number):Vec3=>[a[0]*v,a[1]*v,a[2]*v];
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function rgb(hex:string):Vec3 {
  if(!/^#[0-9a-f]{6}$/i.test(hex))return [0.75,0.75,0.75];
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as unknown as Vec3;
}
export type PreparedCpuPreview = ReturnType<typeof createRenderBvh>;
export function prepareCpuPreview(geometry: GeometryTransfer): PreparedCpuPreview {
  return createRenderBvh(geometry);
}
/** Small deterministic CPU raycast diagnostic, not path tracing or final-quality rendering. */
export function renderCpuPreview(o:CpuPreviewOptions, rowStart=0, rowCount=o.height, prepared?:PreparedCpuPreview):CpuPreviewResult {
  const {width,height}=o;
  if(!Number.isInteger(rowStart)||!Number.isInteger(rowCount)||rowStart<0||rowCount<1||rowStart+rowCount>height)throw Error("ARQDOR: faixa de linhas inválida");
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262_144)
    throw Error("ARQDOR: resolução de diagnóstico excedida (262144 pixels)");
  if(!(o.camera.verticalFovDegrees>1&&o.camera.verticalFovDegrees<179))throw Error("ARQDOR: FOV inválido");
  const forward=unit(sub(o.camera.target,o.camera.position));
  const right=unit(cross(forward,o.camera.up||[0,1,0]));
  const up=unit(cross(right,forward));
  const light=unit(o.light.directionToLight);
  const bvh=prepared ?? prepareCpuPreview(o.geometry);
  const rgba=new Uint8ClampedArray(width*rowCount*4);
  const aspect=width/height,spread=Math.tan(o.camera.verticalFovDegrees*Math.PI/360);
  const sky:Vec3=o.skyColor||[0.72,0.82,0.95],ambient=clamp(o.ambient??0.16);
  for(let localY=0;localY<rowCount;localY++)for(let x=0;x<width;x++){
    const y=rowStart+localY;
    const px=(2*(x+0.5)/width-1)*aspect*spread,py=(1-2*(y+0.5)/height)*spread;
    const direction=unit(add(forward,add(scale(right,px),scale(up,py))));
    const hit=bvh.intersect({origin:o.camera.position,direction});
    let color:Vec3=sky;
    if(hit){
      const mesh=o.geometry.meshes.find(m=>m.meshId===hit.meshId);
      const base=rgb(o.materials[hit.materialId||""]||"#bdbdbd");
      const offset=hit.triangle*9,ns=mesh?.normals||[];
      let normal:Vec3=[0,0,1];
      if(ns.length>=offset+9){
        const b=hit.barycentric;
        const interpolated=[0,1,2].map(k=>ns[offset+k]*b[0]+ns[offset+3+k]*b[1]+ns[offset+6+k]*b[2]) as unknown as Vec3;
        if(Math.hypot(...interpolated)>1e-10)normal=unit(interpolated);
      }
      if(dot(normal,direction)>0)normal=scale(normal,-1);
      const shadowOrigin=add(hit.point,scale(normal,1e-4));
      const blocker=bvh.intersect({origin:shadowOrigin,direction:light});
      const diffuse=blocker?0:Math.max(0,dot(normal,light))*Math.max(0,o.light.intensity);
      color=[0,1,2].map(k=>base[k]*clamp(ambient+diffuse*o.light.color[k])) as unknown as Vec3;
    }
    const i=(localY*width+x)*4;
    for(let k=0;k<3;k++)rgba[i+k]=Math.round(clamp(color[k])*255);
    rgba[i+3]=255;
  }
  return {width,height:rowCount,rgba,triangleCount:bvh.triangleCount};
}
