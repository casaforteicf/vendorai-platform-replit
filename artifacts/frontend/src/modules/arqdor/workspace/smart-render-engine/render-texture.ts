import type { Vec3 } from "./render-bvh";

export type CpuTexture = Readonly<{
 width:number; height:number; channels:3|4;
 data:readonly number[]; // decoded, normalized RGB(A), row-major
 wrap:"repeat"|"clamp";
}>;
const fract=(v:number)=>v-Math.floor(v);
export function sampleCpuTexture(texture:CpuTexture, uv:readonly [number,number]):Vec3 {
 const {width,height,channels,data,wrap}=texture;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||
    width*height>4_194_304||data.length!==width*height*channels||
    ![uv[0],uv[1]].every(Number.isFinite) ||
    data.some(x=>!Number.isFinite(x)||x<0||x>1))
   throw Error("ARQDOR: textura CPU inválida");
 const u=wrap==="repeat"?fract(uv[0]):Math.max(0,Math.min(1,uv[0]));
 const v=wrap==="repeat"?fract(uv[1]):Math.max(0,Math.min(1,uv[1]));
 // Bottom-left UV origin, CPU buffer stored top-first.
 const x=Math.min(width-1,Math.floor(u*width)),y=Math.min(height-1,Math.floor((1-v)*height));
 const offset=(y*width+x)*channels;
 return [data[offset],data[offset+1],data[offset+2]];
}
export function sampleMeshUv(uvs:readonly number[],triangle:number,barycentric:Vec3):readonly [number,number] {
 const i=triangle*6;
 if(!Number.isSafeInteger(triangle)||triangle<0||i+5>=uvs.length)
   throw Error("ARQDOR: triângulo sem UV");
 return [
  uvs[i]*barycentric[0]+uvs[i+2]*barycentric[1]+uvs[i+4]*barycentric[2],
  uvs[i+1]*barycentric[0]+uvs[i+3]*barycentric[1]+uvs[i+5]*barycentric[2],
 ];
}
